import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

type TaskSiteRow = {
  location?: string | null
  site?: string | null
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
  const [sites, setSites] = useState<string[]>([])

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

        // "Current sites" are derived from tasks. We bias toward Open jobs.
        const { data, error: tasksErr } = await supabase
          .from('tasks')
          .select('location,site,status')
          .order('created_at', { ascending: false })
          .limit(500)
        if (tasksErr) throw tasksErr

        const rows = (data ?? []) as TaskSiteRow[]
        const openTasks = rows.filter((t) => String(t.status ?? '').toLowerCase() === 'open')
        const pool = openTasks.length > 0 ? openTasks : rows
        const derived = uniqNonEmpty(pool.map((t) => t.location || t.site))

        if (!cancelled) setSites(derived)
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load sites')
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
    return sites.filter((s) => s.toLowerCase().includes(q))
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

        <div className="mt-4">
          {loading ? (
            <div className="text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">No sites found.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-3 rounded-lg hover:bg-slate-50 transition flex items-center justify-between gap-3"
                    onClick={() => navigate(`/safety-documents?site=${encodeURIComponent(s)}`)}
                  >
                    <span className="font-semibold text-slate-900 break-words">{s}</span>
                    <span className="text-sm text-slate-500">View RAMS</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

