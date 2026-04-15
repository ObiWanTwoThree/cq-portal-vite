import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ChevronRight } from 'lucide-react'

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
          <p className="text-xs font-bold tracking-widest text-slate-500">SITES</p>
          <h2 className="page-title mt-1">Sites</h2>
          <div className="helper-text mt-1">Select a site to open its overview, documents, and tasks.</div>
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
              {filtered.map((s) => {
                const detailPath = `/sites/${encodeURIComponent(s.id)}`
                return (
                  <li key={s.id} className="py-1">
                    <div className="flex items-center justify-between gap-3 px-1 rounded-lg hover:bg-slate-50 transition">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left px-3 py-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                        onClick={() => navigate(detailPath)}
                      >
                        <span className="font-semibold text-slate-950 break-words">{s.name}</span>
                      </button>
                      <div className="flex items-center gap-2 pr-2 sm:pr-3 shrink-0">
                        <button
                          type="button"
                          className="btn-secondary px-3 py-2.5 text-sm whitespace-nowrap"
                          onClick={() => navigate(detailPath)}
                        >
                          Site Details
                        </button>
                        <span className="text-slate-400 hidden sm:inline-flex" aria-hidden>
                          <ChevronRight size={20} />
                        </span>
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

