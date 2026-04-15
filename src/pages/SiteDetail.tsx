import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CloudSun, ExternalLink, FileUp, MapPin, Phone, Droplets, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

type SiteRow = {
  id: string
  name: string
  location_description: string | null
  sealing_specs: string | null
  postcode: string | null
  latitude: number | null
  longitude: number | null
  site_manager_name: string | null
  site_manager_phone: string | null
  access_notes: string | null
}

type TaskRow = {
  id: string
  title: string | null
  status: string | null
  due_date: string | null
  site_id: string | null
  location: string | null
  assigned_to: string | null
}

function bulletsFromText(text: string | null | undefined) {
  const t = (text ?? '').trim()
  if (!t) return []
  // Split on newlines or bullets, keep it simple.
  return t
    .split(/\r?\n|•|\u2022|-/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatPhoneForTel(phone: string) {
  return phone.replace(/[^\d+]/g, '')
}

export default function SiteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [site, setSite] = useState<SiteRow | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])

  const sealBullets = useMemo(() => bulletsFromText(site?.sealing_specs), [site?.sealing_specs])

  useEffect(() => {
    let cancelled = false
    if (!id) return

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth?.user) {
          navigate('/login')
          return
        }

        const { data: row, error: siteErr } = await supabase
          .from('sites')
          .select('*')
          .eq('id', id)
          .single()
        if (siteErr) throw siteErr
        const s = (row ?? null) as SiteRow | null
        if (!s) throw new Error('Site not found')
        if (cancelled) return
        setSite(s)

        // Active tasks for this site. Prefer site_id; fallback to location match (older data).
        const { data: tRows, error: taskErr } = await supabase
          .from('tasks')
          .select('id,title,status,due_date,site_id,location,assigned_to')
          .or(`site_id.eq.${s.id},and(site_id.is.null,location.ilike.%${s.name.replace(/%/g, '')}%)`)
          .order('created_at', { ascending: false })
          .limit(50)
        if (!taskErr && !cancelled) setTasks((tRows ?? []) as TaskRow[])

        // Storage listing (best-effort): we can’t list without storage policies. So we only show uploads done in-session.
        setUploadedUrls([])
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setError(msg || 'Failed to load site')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const directionsHref = useMemo(() => {
    if (!site) return '#'
    if (site.latitude != null && site.longitude != null) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.latitude},${site.longitude}`)}`
    }
    // Fallback to name/postcode search
    const q = [site.name, site.postcode].filter(Boolean).join(' ')
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  }, [site])

  const managerTelHref = useMemo(() => {
    const phone = (site?.site_manager_phone ?? '').trim()
    if (!phone) return ''
    return `tel:${formatPhoneForTel(phone)}`
  }, [site?.site_manager_phone])

  const handlePickUpload = () => fileInputRef.current?.click()

  const handleUpload = async (file: File) => {
    if (!site) return
    setUploading(true)
    setError('')
    try {
      const path = `${site.id}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('site-documents').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (upErr) throw upErr

      const { data: publicUrlData } = supabase.storage.from('site-documents').getPublicUrl(path)
      const url = publicUrlData?.publicUrl
      if (url) setUploadedUrls((prev) => [url, ...prev])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    await handleUpload(f)
  }

  return (
    <div className="max-w-3xl mx-auto">
      {error && (
        <div className="mb-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate('/sites')}
            className="btn-ghost px-0"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <div className="text-3xl font-bold text-slate-950 tracking-tight mt-2 break-words">
            {loading ? 'Loading…' : site?.name ?? 'Site'}
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <CloudSun size={18} className="text-purple-600" />
            <span className="font-medium text-slate-700">Weather</span>
            <span className="text-slate-600">
              {site?.postcode ? `for ${site.postcode}` : '(add postcode to enable)'}
            </span>
            <span className="badge-status-unknown ml-2">Mock</span>
          </div>
        </div>
      </div>

      {/* Quick action bar */}
      <div className="card p-4 sm:p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 border border-slate-200 bg-white shadow-sm hover:bg-slate-50 font-semibold text-slate-950"
            href={directionsHref}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin size={18} className="text-purple-600" />
            Get Directions
          </a>

          <a
            className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 border shadow-sm font-semibold ${
              managerTelHref
                ? 'border-purple-200 text-purple-800 hover:bg-purple-50 bg-white'
                : 'border-slate-200 text-slate-400 bg-slate-50 pointer-events-none'
            }`}
            href={managerTelHref || undefined}
          >
            <Phone size={18} className={managerTelHref ? 'text-purple-600' : 'text-slate-400'} />
            Call Manager
          </a>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 border border-purple-200 bg-white shadow-sm hover:bg-purple-50 font-semibold text-purple-800 disabled:opacity-60"
            onClick={handlePickUpload}
            disabled={uploading}
          >
            <FileUp size={18} className="text-purple-600" />
            {uploading ? 'Uploading…' : 'Upload File/Photo'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={onFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4">
        <div className="card p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Droplets size={18} className="text-purple-600" />
            <div className="text-lg font-semibold text-slate-950">What to Seal</div>
          </div>
          {sealBullets.length === 0 ? (
            <div className="text-slate-600 mt-3">
              Add sealing specs in the `sites` table to show a bulleted checklist here.
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {sealBullets.map((b, idx) => (
                <li key={idx} className="flex items-start gap-2 text-slate-800">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-purple-600 flex-none" />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4 sm:p-6">
          <div className="text-lg font-semibold text-slate-950">Site Info</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-slate-700">Manager</div>
              <div className="text-slate-950 font-semibold mt-1">
                {site?.site_manager_name || '—'}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {site?.site_manager_phone || '—'}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">Access Notes</div>
              <div className="text-slate-600 mt-1 whitespace-pre-line">
                {site?.access_notes || '—'}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-sm font-medium text-slate-700">Description</div>
            <div className="text-slate-600 mt-1 whitespace-pre-line">
              {site?.location_description || '—'}
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-lg font-semibold text-slate-950">Documents</div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(`/sites/${encodeURIComponent(site?.id ?? '')}/documents`)}
              disabled={!site?.id}
            >
              View docs
            </button>
          </div>
          <div className="helper-text mt-2">
            View and search documents uploaded for this site.
          </div>

          {uploadedUrls.length === 0 ? (
            <div className="text-slate-600 mt-3">
              No files uploaded in this session yet.
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {uploadedUrls.map((u) => (
                <li key={u} className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-slate-900 font-semibold truncate">{u.split('/').pop()}</div>
                    <div className="text-xs text-slate-500 truncate">{u}</div>
                  </div>
                  <a className="btn-secondary" href={u} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    View
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active tasks */}
        <div className="card p-4 sm:p-6">
          <div className="text-lg font-semibold text-slate-950">Active Tasks</div>
          <div className="helper-text mt-2">Tasks linked to this site.</div>

          {tasks.length === 0 ? (
            <div className="text-slate-600 mt-3">No tasks found.</div>
          ) : (
            <ul className="mt-3 space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="border border-slate-200 rounded-lg px-3 py-3 hover:bg-slate-50 transition">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => navigate(`/task/${t.id}`)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-slate-950 font-semibold break-words">{t.title ?? 'Untitled task'}</div>
                        <div className="text-sm text-slate-600 mt-1">
                          {t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString()}` : 'No due date'}
                        </div>
                      </div>
                      <div className="flex-none">
                        {(t.status ?? '').toLowerCase() === 'completed' ? (
                          <span className="badge-status-completed">Completed</span>
                        ) : (
                          <span className="badge-status-open">Open</span>
                        )}
                      </div>
                    </div>
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

