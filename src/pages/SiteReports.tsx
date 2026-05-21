import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ClipboardList, ExternalLink, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { getSiteDocumentsPublicUrl, SITE_DOCUMENTS_BUCKET } from '../lib/siteDocumentsStorage'

type SiteRow = {
  id: string
  name: string
}

type ProfileRow = {
  id: string
  role?: unknown
  full_name?: unknown
}

type SiteReportRow = {
  id: string
  site_id: string
  title: string
  report_date: string
  notes: string | null
  file_name: string | null
  file_path: string | null
  created_by: string | null
  created_at: string
  profiles?: { full_name?: string | null } | null
}

function authorLabel(row: SiteReportRow) {
  const name = row.profiles?.full_name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return 'Unknown'
}

function formatReportDate(value: string) {
  const d = new Date(`${value}T12:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SiteReports() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [site, setSite] = useState<SiteRow | null>(null)
  const [reports, setReports] = useState<SiteReportRow[]>([])
  const [search, setSearch] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    title: '',
    report_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = !q
      ? reports
      : reports.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.notes ?? '').toLowerCase().includes(q)
        )
    return [...list].sort((a, b) => {
      const da = a.report_date || a.created_at
      const db = b.report_date || b.created_at
      return db.localeCompare(da)
    })
  }, [reports, search])

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user ?? null
      if (!user) {
        navigate('/login')
        return
      }
      setCurrentUserId(user.id)

      const { data: profile } = await supabase.from('profiles').select('id,role,full_name').eq('id', user.id).single()
      const p = (profile ?? null) as ProfileRow | null
      const role = typeof p?.role === 'string' ? p.role.toLowerCase() : ''
      setIsAdmin(role === 'admin')

      const { data: siteRow, error: siteErr } = await supabase.from('sites').select('id,name').eq('id', id).single()
      if (siteErr) throw siteErr
      setSite((siteRow ?? null) as SiteRow | null)

      const { data: reportRows, error: reportsErr } = await supabase
        .from('site_reports')
        .select('*, profiles:created_by(full_name)')
        .eq('site_id', id)
        .order('report_date', { ascending: false })
      if (reportsErr) throw reportsErr
      setReports((reportRows ?? []) as SiteReportRow[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    load().then(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const resetForm = () => {
    setDraft({
      title: '',
      report_date: new Date().toISOString().slice(0, 10),
      notes: '',
    })
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !currentUserId) return
    if (!draft.title.trim()) {
      setError('Report title is required')
      return
    }
    if (!draft.report_date) {
      setError('Report date is required')
      return
    }

    setSubmitting(true)
    setError('')
    let uploadedPath: string | null = null

    try {
      let fileName: string | null = null
      let filePath: string | null = null

      if (pendingFile) {
        uploadedPath = `${id}/reports/${Date.now()}-${pendingFile.name}`
        const { error: upErr } = await supabase.storage.from(SITE_DOCUMENTS_BUCKET).upload(uploadedPath, pendingFile, {
          cacheControl: '3600',
          upsert: false,
        })
        if (upErr) throw upErr
        fileName = pendingFile.name
        filePath = uploadedPath
      }

      const { error: insErr } = await supabase.from('site_reports').insert({
        site_id: id,
        title: draft.title.trim(),
        report_date: draft.report_date,
        notes: draft.notes.trim() || null,
        file_name: fileName,
        file_path: filePath,
        created_by: currentUserId,
      })
      if (insErr) {
        if (uploadedPath) {
          await supabase.storage.from(SITE_DOCUMENTS_BUCKET).remove([uploadedPath])
        }
        throw insErr
      }

      resetForm()
      setShowForm(false)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (reportId: string) => {
    if (!window.confirm('Delete this report? This cannot be undone.')) return
    setDeletingId(reportId)
    setError('')
    try {
      const row = reports.find((r) => r.id === reportId)
      const { error: delErr } = await supabase.from('site_reports').delete().eq('id', reportId)
      if (delErr) throw delErr
      if (row?.file_path) {
        await supabase.storage.from(SITE_DOCUMENTS_BUCKET).remove([row.file_path])
      }
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to delete report')
    } finally {
      setDeletingId(null)
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setPendingFile(f)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <button
            type="button"
            className="btn-ghost px-0"
            onClick={() => navigate(`/sites/${encodeURIComponent(id ?? '')}`)}
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <p className="text-xs font-bold tracking-widest text-slate-500 mt-3">SITE REPORTS</p>
          <div className="text-3xl font-bold text-slate-950 tracking-tight mt-1 break-words">
            {site?.name ?? (loading ? 'Loading…' : 'Site')}
          </div>
        </div>

        <button
          type="button"
          className="btn-primary rounded-full px-5"
          onClick={() => {
            setShowForm((v) => !v)
            if (showForm) resetForm()
          }}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? 'Cancel' : 'New report'}
        </button>
      </div>

      {error && (
        <div className="mb-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 sm:p-6 mb-6 space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-purple-600" />
            <div className="text-lg font-semibold text-slate-950">Submit a report</div>
          </div>

          <div>
            <label className="label" htmlFor="report-title">
              Title
            </label>
            <input
              id="report-title"
              className="input"
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Week 12 progress visit"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="report-date">
              Report date
            </label>
            <input
              id="report-date"
              type="date"
              className="input"
              value={draft.report_date}
              onChange={(e) => setDraft((p) => ({ ...p, report_date: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="report-notes">
              Notes
            </label>
            <textarea
              id="report-notes"
              className="input min-h-[120px]"
              value={draft.notes}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Summary of work completed, issues found, next steps…"
            />
          </div>

          <div>
            <label className="label">Attachment (optional)</label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <button
                type="button"
                className="btn-secondary rounded-full px-5"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
              >
                <Upload size={18} />
                {pendingFile ? 'Change file' : 'Attach file/photo'}
              </button>
              {pendingFile && (
                <span className="text-sm text-slate-600 truncate">{pendingFile.name}</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={onFileChange}
              className="hidden"
            />
          </div>

          <button type="submit" className="btn-primary w-full sm:w-auto rounded-full px-6" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </form>
      )}

      <div className="card p-4 sm:p-6">
        <label className="label">Search</label>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports…"
        />

        <div className="mt-4">
          {loading ? (
            <div className="text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">No reports submitted yet.</div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((r) => {
                const attachmentUrl = r.file_path ? getSiteDocumentsPublicUrl(r.file_path) : ''
                return (
                  <li key={r.id} className="border border-slate-200 rounded-2xl p-4 shadow-sm bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <ClipboardList size={18} className="text-purple-600 shrink-0" />
                          <div className="text-slate-950 font-semibold break-words">{r.title}</div>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                          <div>Report date: {formatReportDate(r.report_date)}</div>
                          <div>Submitted by {authorLabel(r)} · {new Date(r.created_at).toLocaleString()}</div>
                        </div>
                        {r.notes && (
                          <p className="text-sm text-slate-700 mt-3 whitespace-pre-line leading-relaxed">{r.notes}</p>
                        )}
                        {r.file_name && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                            <FileText size={16} className="text-purple-600" />
                            <span className="truncate">{r.file_name}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        {attachmentUrl && (
                          <a
                            className="btn-secondary rounded-full px-4 min-h-[44px] inline-flex items-center justify-center gap-1"
                            href={attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={16} />
                            View
                          </a>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            className="btn-danger rounded-full px-4 min-h-[44px] inline-flex items-center justify-center gap-1"
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                          >
                            <Trash2 size={16} />
                            {deletingId === r.id ? '…' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
