import { supabase } from './supabaseClient'

/**
 * Must match the Storage bucket id in Supabase exactly (Dashboard → Storage).
 * Public URL shape:
 * https://<project-ref>.supabase.co/storage/v1/object/public/site-documents/<file_path>
 */
export const SITE_DOCUMENTS_BUCKET = 'site-documents'

/**
 * If `file_path` in the DB accidentally contains a full public URL, recover the object key
 * so we do not generate invalid nested URLs.
 */
function normalizeToObjectPath(stored: string): string {
  const raw = stored.trim()
  if (!raw) return ''
  if (!raw.startsWith('http')) {
    return raw.replace(/^\/+/, '')
  }
  try {
    const u = new URL(raw)
    const token = `/object/public/${SITE_DOCUMENTS_BUCKET}/`
    const i = u.pathname.indexOf(token)
    if (i >= 0) return u.pathname.slice(i + token.length).replace(/^\/+/, '')
    const m = u.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/)
    if (m?.[1]) return m[1].replace(/^\/+/, '')
  } catch {
    /* ignore */
  }
  return raw.replace(/^\/+/, '')
}

/**
 * Public URL for an object in the `site-documents` bucket (bucket should be public
 * for anonymous read via this URL).
 */
export function getSiteDocumentsPublicUrl(filePath: string | null | undefined): string {
  const path = normalizeToObjectPath(filePath ?? '')
  if (!path) return ''
  const { data } = supabase.storage.from(SITE_DOCUMENTS_BUCKET).getPublicUrl(path)
  return data.publicUrl ?? ''
}
