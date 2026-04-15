import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Image as ImageIcon, Upload } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { getSiteDocumentsPublicUrl, SITE_DOCUMENTS_BUCKET } from '../lib/siteDocumentsStorage'

type SiteRow = {
  id: string
  name: string
}

type SiteFileRow = {
  id: string
  site_id: string
  file_name: string
  file_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

type ProfileRow = {
  id: string
  role?: unknown
}

function fileIcon(row: SiteFileRow) {
  const name = row.file_name.toLowerCase()
  const mime = (row.mime_type ?? '').toLowerCase()
  const isPdf = mime.includes('pdf') || name.endsWith('.pdf')
  return isPdf ? <FileText size={18} className="text-purple-600" /> : <ImageIcon size={18} className="text-purple-600" />
}

export default function SiteDocuments() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [site, setSite] = useState<SiteRow | null>(null)
  const [files, setFiles] = useState<SiteFileRow[]>([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [canUpload, setCanUpload] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = !q ? files : files.filter((f) => f.file_name.toLowerCase().includes(q))
    return [...list].sort((a, b) =>
      a.file_name.localeCompare(b.file_name, undefined, { sensitivity: 'base' })
    )
  }, [files, search])

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

      const { data: profile } = await supabase.from('profiles').select('id,role').eq('id', user.id).single()
      const p = (profile ?? null) as ProfileRow | null
      const role = typeof p?.role === 'string' ? p.role.toLowerCase() : ''
      setCanUpload(role === 'admin')

      const { data: siteRow, error: siteErr } = await supabase.from('sites').select('id,name').eq('id', id).single()
      if (siteErr) throw siteErr
      setSite((siteRow ?? null) as SiteRow | null)

      const { data: fileRows, error: filesErr } = await supabase
        .from('site_files')
        .select('*')
        .eq('site_id', id)
        .order('file_name', { ascending: true })
      if (filesErr) throw filesErr
      setFiles((fileRows ?? []) as SiteFileRow[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const openPicker = () => fileInputRef.current?.click()

  const handleUpload = async (file: File) => {
    if (!id) return
    setUploading(true)
    setError('')
    try {
      const path = `${id}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from(SITE_DOCUMENTS_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (upErr) throw upErr

      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user ?? null

      const { error: insErr } = await supabase.from('site_files').insert({
        site_id: id,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size || null,
        uploaded_by: user?.id ?? null,
      })
      if (insErr) throw insErr

      await load()
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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <button type="button" className="btn-ghost px-0" onClick={() => navigate(`/sites/${encodeURIComponent(id ?? '')}`)}>
            <ChevronLeft size={18} />
            Back
          </button>
          <p className="text-xs font-bold tracking-widest text-slate-500 mt-3">SITE DOCUMENTS</p>
          <div className="text-3xl font-bold text-slate-950 tracking-tight mt-1 break-words">
            {site?.name ?? (loading ? 'Loading…' : 'Site')}
          </div>
        </div>

        <button
          type="button"
          className="btn-primary rounded-full px-5"
          onClick={openPicker}
          disabled={!canUpload || uploading}
          title={canUpload ? 'Upload file/photo' : 'Admin only'}
        >
          <Upload size={18} />
          {uploading ? 'Uploading…' : 'Upload'}
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

      {error && (
        <div className="mb-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="card p-4 sm:p-6">
        <label className="label">Search</label>
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files…" />

        <div className="mt-4">
          {loading ? (
            <div className="text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">No documents uploaded yet.</div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((f) => {
                const url = getSiteDocumentsPublicUrl(f.file_path)
                return (
                  <li key={f.id} className="border border-slate-200 rounded-2xl p-4 shadow-sm bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {fileIcon(f)}
                          <div className="text-slate-950 font-semibold break-words">{f.file_name}</div>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Uploaded {f.created_at ? new Date(f.created_at).toLocaleString() : ''}
                        </div>
                      </div>
                      {url ? (
                        <a
                          className="btn-secondary rounded-full px-5 shrink-0 min-h-[44px] inline-flex items-center justify-center"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        <span
                          className="btn-secondary rounded-full px-5 shrink-0 min-h-[44px] inline-flex items-center justify-center opacity-50 cursor-not-allowed"
                          title="Missing file path in database"
                        >
                          View
                        </span>
                      )}
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

