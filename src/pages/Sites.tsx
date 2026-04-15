import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

type SiteRow = {
  id: string
  name: string
}

type TaskSiteRow = {
  location?: string | null
  status?: string | null
}

function uniqNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => (v ?? '').trim()).filter(Boolean)))
}

export default function Sites() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sites, setSites] = useState<SiteRow[]>([])
  const [source, setSource] = useState<'sites_table' | 'tasks_fallback' | null>(null)

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

        // Preferred: read from `sites` table (new infrastructure).
        const { data: sitesRows, error: sitesErr } = await supabase
          .from('sites')
          .select('id,name')
          .order('name', { ascending: true })

        if (!sitesErr && (sitesRows ?? []).length > 0) {
          if (!cancelled) {
            setSites((sitesRows as SiteRow[]).filter((s) => Boolean(s?.id && s?.name)))
            setSource('sites_table')
          }
          return
        }

        // Fallback: derive sites from tasks (older behavior), useful before SQL/RLS is applied.
        const { data: taskRows, error: tasksErr } = await supabase
          .from('tasks')
          .select('location,status')
          .order('created_at', { ascending: false })
          .limit(500)
        if (tasksErr) throw tasksErr

        const rows = (taskRows ?? []) as TaskSiteRow[]
        const openTasks = rows.filter((t) => String(t.status ?? '').toLowerCase() === 'open')
        const pool = openTasks.length > 0 ? openTasks : rows
        const derived = uniqNonEmpty(pool.map((t) => t.location)).map((name) => ({ id: name, name }))

        if (!cancelled) {
          setSites(derived)
          setSource('tasks_fallback')
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setError(msg || 'Failed to load sites')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sites
    return sites.filter((s) => s.name.toLowerCase().includes(q))
  }, [sites, search])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="page-title">Sites</h2>
          <div className="helper-text mt-1">Select a site to view safety documents (RAMS).</div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard')}>
          Back
        </button>
      </div>

      {error && (
        <div className="mb-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="card p-4 sm:p-6">
        <label className="label">Search</label>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sites…"
        />
        {source === 'tasks_fallback' && (
          <div className="helper-text mt-2">
            Showing sites derived from tasks (run `supabase/sites.sql` to enable the sites table).
          </div>
        )}

        <div className="mt-4">
          {loading ? (
            <div className="text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">No sites found.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <li key={s.id} className="py-1">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <button
                      type="button"
                      className="min-w-0 text-left flex-1 rounded-lg px-3 py-3 hover:bg-slate-50 transition"
                      onClick={() => navigate(`/sites/${encodeURIComponent(s.id)}`)}
                    >
                      <span className="font-semibold text-slate-950 break-words">{s.name}</span>
                    </button>
                    {source === 'sites_table' ? (
                      <button
                        type="button"
                        className="btn-secondary whitespace-nowrap"
                        onClick={() => navigate(`/sites/${encodeURIComponent(s.id)}/documents`)}
                      >
                        View docs
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary whitespace-nowrap"
                        onClick={() => navigate(`/safety-documents?site=${encodeURIComponent(s.name)}`)}
                      >
                        View docs
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

