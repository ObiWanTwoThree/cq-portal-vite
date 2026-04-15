import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

type DocumentType = 'RAMS' | 'Induction' | 'Certificate'

type SiteDocumentRow = {
  id: string
  site_name: string
  document_url: string
  document_type: DocumentType
  created_at?: string
}

type SignatureRow = {
  user_id: string
  document_id: string
  signed_at: string
}

type TaskSiteRow = {
  location?: string | null
  status?: string | null
  assigned_to?: string | null
  created_at?: string | null
}

function uniqNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => (v ?? '').trim()).filter(Boolean)))
}

export default function SafetyDocuments() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const [sites, setSites] = useState<string[]>([])
  const [selectedSite, setSelectedSite] = useState('')

  const [docs, setDocs] = useState<SiteDocumentRow[]>([])
  const [signedDocIds, setSignedDocIds] = useState<Set<string>>(new Set())
  const [signingDocId, setSigningDocId] = useState<string | null>(null)

  const visibleDocs = useMemo(() => {
    return docs.filter((d) => d.document_type === 'RAMS')
  }, [docs])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user ?? null
        if (!user) {
          navigate('/login')
          return
        }
        setUserId(user.id)

        // Prefer `sites` table if available.
        const { data: sitesRows, error: sitesErr } = await supabase
          .from('sites')
          .select('name')
          .order('name', { ascending: true })

        const derivedSites =
          !sitesErr && (sitesRows ?? []).length > 0
            ? uniqNonEmpty((sitesRows ?? []).map((s: { name?: string | null }) => s.name ?? null))
            : await (async () => {
                // Fallback: derive sites from tasks. Prefer Open tasks; fall back to recent assigned tasks.
                const { data: allTasks, error: tasksErr } = await supabase
                  .from('tasks')
                  .select('location,status,assigned_to,created_at')
                  .order('created_at', { ascending: false })
                  .limit(500)
                if (tasksErr) throw tasksErr

                const rows = (allTasks ?? []) as TaskSiteRow[]
                const openTasks = rows.filter((t) => String(t.status ?? '').toLowerCase() === 'open')
                const pool =
                  openTasks.length > 0 ? openTasks : rows.filter((t) => t.assigned_to === user.id)
                return uniqNonEmpty(pool.map((t) => t.location))
              })()

        const siteFromUrl = (searchParams.get('site') ?? '').trim()
        const initial =
          (siteFromUrl && derivedSites.includes(siteFromUrl) ? siteFromUrl : '') ||
          derivedSites[0] ||
          ''

        if (!cancelled) {
          setSites(derivedSites)
          setSelectedSite((prev) => prev || initial)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setError(msg || 'Failed to load safety documents')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  useEffect(() => {
    // Keep URL in sync (so Sites -> SafetyDocuments deep links work).
    if (!selectedSite) return
    const current = (searchParams.get('site') ?? '').trim()
    if (current === selectedSite) return
    setSearchParams({ site: selectedSite }, { replace: true })
  }, [selectedSite, searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    if (!selectedSite) {
      setDocs([])
      return
    }

    const loadDocs = async () => {
      setError('')
      try {
        const { data, error: docsErr } = await supabase
          .from('site_documents')
          .select('*')
          .eq('site_name', selectedSite)
          .order('document_type', { ascending: true })
          .order('created_at', { ascending: false })
        if (docsErr) throw docsErr
        if (!cancelled) setDocs((data ?? []) as SiteDocumentRow[])
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load documents')
      }
    }

    loadDocs()
    return () => {
      cancelled = true
    }
  }, [selectedSite])

  useEffect(() => {
    let cancelled = false
    if (!userId || visibleDocs.length === 0) {
      setSignedDocIds(new Set())
      return
    }

    const loadSigs = async () => {
      try {
        const ids = visibleDocs.map((d) => d.id)
        const { data, error: sigErr } = await supabase
          .from('document_signatures')
          .select('document_id')
          .eq('user_id', userId)
          .in('document_id', ids)
        if (sigErr) throw sigErr
        const set = new Set((data ?? []).map((r: { document_id: string }) => String(r.document_id)))
        if (!cancelled) setSignedDocIds(set)
      } catch {
        // If table/policies are not set up yet, don't break the page.
        if (!cancelled) setSignedDocIds(new Set())
      }
    }

    loadSigs()
    return () => {
      cancelled = true
    }
  }, [userId, visibleDocs])

  const signDocument = async (doc: SiteDocumentRow) => {
    if (!userId) return
    if (signedDocIds.has(doc.id)) return
    setSigningDocId(doc.id)
    setError('')
    try {
      const row: SignatureRow = {
        user_id: userId,
        document_id: doc.id,
        signed_at: new Date().toISOString(),
      }
      const { error: signErr } = await supabase.from('document_signatures').insert(row)
      if (signErr) throw signErr
      setSignedDocIds((prev) => new Set(prev).add(doc.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to sign document')
    } finally {
      setSigningDocId(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="page-title">Safety Documents</h2>
          <div className="helper-text mt-1">RAMS for a selected site.</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate('/sites')}>
            Sites
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard')}>
            Dashboard
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="card p-4 sm:p-6 mb-6">
        <label className="label">Site</label>
        {loading ? (
          <div className="text-slate-500">Loading…</div>
        ) : sites.length === 0 ? (
          <div className="text-slate-600">
            We couldn’t determine your current site yet. Assign yourself to a job first, then come back here.
          </div>
        ) : (
          <select
            className="input"
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-4">
        {selectedSite && !loading && visibleDocs.length === 0 && (
          <div className="card p-4 sm:p-6 text-slate-600">
            No RAMS documents found for <span className="font-semibold text-slate-900">{selectedSite}</span>.
          </div>
        )}

        {visibleDocs.map((doc) => {
          const signed = signedDocIds.has(doc.id)
          const signing = signingDocId === doc.id
          return (
            <div key={doc.id} className="card p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="badge-status-open">RAMS</span>
                    {signed && <span className="badge-status-completed">Signed</span>}
                  </div>
                  <div className="text-slate-900 font-semibold mt-2 break-words">{doc.site_name}</div>
                  <a
                    className="text-purple-700 font-semibold hover:text-purple-800 underline underline-offset-4 mt-2 inline-block break-all"
                    href={doc.document_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open document
                  </a>
                </div>

                <button
                  type="button"
                  className="btn-primary w-full sm:w-auto"
                  onClick={() => signDocument(doc)}
                  disabled={!userId || signed || signing}
                >
                  {signed ? 'Signed' : signing ? 'Signing…' : 'Sign to Confirm'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

