import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CloudSun, FileUp, MapPin, Phone, Droplets, ChevronLeft, Pencil, X, Save, Plus, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { getSiteDocumentsPublicUrl, SITE_DOCUMENTS_BUCKET } from '../lib/siteDocumentsStorage'

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

type ProfileRow = {
  id: string
  role?: unknown
}

type SiteFileInsert = {
  site_id: string
  file_name: string
  file_path: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [editSeal, setEditSeal] = useState(false)
  const [editInfo, setEditInfo] = useState(false)
  const [sealDraft, setSealDraft] = useState('')
  const [infoDraft, setInfoDraft] = useState({
    site_manager_name: '',
    site_manager_phone: '',
    access_notes: '',
    location_description: '',
    postcode: '',
  })

  const [addingTask, setAddingTask] = useState(false)
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    category: 'Snagging',
    due_date: '',
    notes: '',
  })

  // Keep a small "recent uploads" list for this page (optional, best-effort UX).
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])

  const sealBullets = useMemo(() => bulletsFromText(site?.sealing_specs), [site?.sealing_specs])

  const refreshTasks = async (s: SiteRow) => {
    const { data: tRows, error: taskErr } = await supabase
      .from('tasks')
      .select('id,title,status,due_date,site_id,location,assigned_to')
      .or(`site_id.eq.${s.id},and(site_id.is.null,location.ilike.%${s.name.replace(/%/g, '')}%)`)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!taskErr) setTasks((tRows ?? []) as TaskRow[])
  }

  useEffect(() => {
    let cancelled = false
    if (!id) return

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
        setCurrentUserId(user.id)

        // Determine admin role for edit controls.
        const { data: profile } = await supabase.from('profiles').select('id,role').eq('id', user.id).single()
        const p = (profile ?? null) as ProfileRow | null
        const role = typeof p?.role === 'string' ? p.role.toLowerCase() : ''
        setIsAdmin(role === 'admin')

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
        setSealDraft(s.sealing_specs ?? '')
        setInfoDraft({
          site_manager_name: s.site_manager_name ?? '',
          site_manager_phone: s.site_manager_phone ?? '',
          access_notes: s.access_notes ?? '',
          location_description: s.location_description ?? '',
          postcode: s.postcode ?? '',
        })

        // Active tasks for this site. Prefer site_id; fallback to location match (older data).
        if (!cancelled) await refreshTasks(s)
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
      const { error: upErr } = await supabase.storage.from(SITE_DOCUMENTS_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (upErr) throw upErr

      // Persist metadata row.
      const row: SiteFileInsert = {
        site_id: site.id,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size || null,
        uploaded_by: currentUserId,
      }
      const { error: insErr } = await supabase.from('site_files').insert(row)
      if (insErr) throw insErr

      const url = getSiteDocumentsPublicUrl(path)
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

  const subtleEditBtnClass =
    'inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-full px-4 py-2.5 hover:bg-slate-50 transition'

  const saveSeal = async () => {
    if (!site) return
    setError('')
    try {
      const { error: upErr } = await supabase.from('sites').update({ sealing_specs: sealDraft }).eq('id', site.id)
      if (upErr) throw upErr
      setSite({ ...site, sealing_specs: sealDraft })
      setEditSeal(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to save')
    }
  }

  const saveInfo = async () => {
    if (!site) return
    setError('')
    try {
      const payload = {
        site_manager_name: infoDraft.site_manager_name || null,
        site_manager_phone: infoDraft.site_manager_phone || null,
        access_notes: infoDraft.access_notes || null,
        location_description: infoDraft.location_description || null,
        postcode: infoDraft.postcode || null,
      }
      const { error: upErr } = await supabase.from('sites').update(payload).eq('id', site.id)
      if (upErr) throw upErr
      setSite({ ...site, ...payload })
      setEditInfo(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to save')
    }
  }

  const createTask = async () => {
    if (!site || !currentUserId) return
    setError('')
    try {
      if (!taskDraft.title.trim()) throw new Error('Task title is required')
      if (!taskDraft.due_date) throw new Error('Due date is required')

      const { error: insErr } = await supabase.from('tasks').insert([
        {
          title: taskDraft.title.trim(),
          category: taskDraft.category,
          location: site.name,
          notes: taskDraft.notes.trim() || null,
          due_date: taskDraft.due_date,
          status: 'Open',
          created_by: currentUserId,
          site_id: site.id,
        },
      ])
      if (insErr) throw insErr

      setTaskDraft({ title: '', category: 'Snagging', due_date: '', notes: '' })
      setAddingTask(false)
      await refreshTasks(site)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to create task')
    }
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
          <p className="text-xs font-bold tracking-widest text-slate-500 mt-3">SITE DETAILS</p>
          <div className="text-3xl font-bold text-slate-950 tracking-tight mt-1 break-words">
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
            disabled={uploading || !isAdmin}
            title={isAdmin ? 'Upload file/photo' : 'Admin only'}
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Droplets size={18} className="text-purple-600" />
              <div className="text-lg font-semibold text-slate-950">What to Seal</div>
            </div>
            {isAdmin && !editSeal && (
              <button type="button" className={subtleEditBtnClass} onClick={() => setEditSeal(true)}>
                <Pencil size={16} />
                Edit
              </button>
            )}
          </div>

          {!editSeal ? (
            sealBullets.length === 0 ? (
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
            )
          ) : (
            <div className="mt-4 space-y-3">
              <label className="label">Sealing specs (one item per line)</label>
              <textarea
                className="input min-h-[140px]"
                value={sealDraft}
                onChange={(e) => setSealDraft(e.target.value)}
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" className="btn-primary w-full py-3" onClick={saveSeal}>
                  <Save size={18} />
                  Save
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full py-3"
                  onClick={() => {
                    setSealDraft(site?.sealing_specs ?? '')
                    setEditSeal(false)
                  }}
                >
                  <X size={18} />
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full py-3"
                  onClick={handlePickUpload}
                  disabled={uploading}
                >
                  <FileUp size={18} />
                  Upload doc/photo
                </button>
              </div>
              <div className="helper-text">
                Uploads are saved to the <span className="font-semibold">site-documents</span> bucket and recorded in <span className="font-semibold">site_files</span>.
              </div>
            </div>
          )}
        </div>

        <div className="card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-slate-950">Site Info</div>
            {isAdmin && !editInfo && (
              <button type="button" className={subtleEditBtnClass} onClick={() => setEditInfo(true)}>
                <Pencil size={16} />
                Edit
              </button>
            )}
          </div>

          {!editInfo ? (
            <>
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
                <div className="text-sm font-medium text-slate-700">Postcode</div>
                <div className="text-slate-950 font-semibold mt-1">
                  {site?.postcode || '—'}
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm font-medium text-slate-700">Description</div>
                <div className="text-slate-600 mt-1 whitespace-pre-line">
                  {site?.location_description || '—'}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Manager name</label>
                  <input
                    className="input"
                    value={infoDraft.site_manager_name}
                    onChange={(e) => setInfoDraft((p) => ({ ...p, site_manager_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Manager phone</label>
                  <input
                    className="input"
                    value={infoDraft.site_manager_phone}
                    onChange={(e) => setInfoDraft((p) => ({ ...p, site_manager_phone: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">Postcode</label>
                <input
                  className="input"
                  value={infoDraft.postcode}
                  onChange={(e) => setInfoDraft((p) => ({ ...p, postcode: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Access notes</label>
                <textarea
                  className="input min-h-[110px]"
                  value={infoDraft.access_notes}
                  onChange={(e) => setInfoDraft((p) => ({ ...p, access_notes: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Site description</label>
                <textarea
                  className="input min-h-[110px]"
                  value={infoDraft.location_description}
                  onChange={(e) => setInfoDraft((p) => ({ ...p, location_description: e.target.value }))}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" className="btn-primary w-full py-3" onClick={saveInfo}>
                  <Save size={18} />
                  Save
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full py-3"
                  onClick={() => {
                    setInfoDraft({
                      site_manager_name: site?.site_manager_name ?? '',
                      site_manager_phone: site?.site_manager_phone ?? '',
                      access_notes: site?.access_notes ?? '',
                      location_description: site?.location_description ?? '',
                      postcode: site?.postcode ?? '',
                    })
                    setEditInfo(false)
                  }}
                >
                  <X size={18} />
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full py-3"
                  onClick={handlePickUpload}
                  disabled={uploading}
                >
                  <FileUp size={18} />
                  Upload doc/photo
                </button>
              </div>
            </div>
          )}
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
              View documents
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
              {uploadedUrls.map((u: string) => (
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
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-slate-950">Active Tasks</div>
            {isAdmin && (
              <button
                type="button"
                className="btn-secondary rounded-full px-5 py-2.5"
                onClick={() => setAddingTask((v) => !v)}
              >
                <Plus size={18} />
                Add Task
              </button>
            )}
          </div>
          <div className="helper-text mt-2">Tasks linked to this site.</div>

          {isAdmin && addingTask && (
            <div className="mt-4 border border-slate-200 rounded-2xl p-4 bg-white shadow-sm space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Title</label>
                  <input
                    className="input"
                    value={taskDraft.title}
                    onChange={(e) => setTaskDraft((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Task title…"
                  />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select
                    className="input"
                    value={taskDraft.category}
                    onChange={(e) => setTaskDraft((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="Snagging">Snagging</option>
                    <option value="Remedials">Remedials</option>
                    <option value="Domestic">Domestic</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Additional Works">Additional Works</option>
                    <option value="Warranty / Defects">Warranty / Defects</option>
                    <option value="Inspection">Inspection</option>
                    <option value="Emergency / Callout">Emergency / Callout</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Due date</label>
                  <input
                    type="date"
                    className="input"
                    value={taskDraft.due_date}
                    onChange={(e) => setTaskDraft((p) => ({ ...p, due_date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input min-h-[110px]"
                  value={taskDraft.notes}
                  onChange={(e) => setTaskDraft((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes…"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" className="btn-primary w-full py-3" onClick={createTask}>
                  <Save size={18} />
                  Create task
                </button>
                <button
                  type="button"
                  className="btn-secondary w-full py-3"
                  onClick={() => setAddingTask(false)}
                >
                  <X size={18} />
                  Cancel
                </button>
              </div>
            </div>
          )}

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

