// Admin-only user management for the Users page.
// Runs with the service role key, so every action first checks the caller is an admin.
//
// Deploy:  supabase functions deploy admin-users
// Actions (POST JSON body):
//   { action: 'list' }
//   { action: 'invite', email, fullName, role, redirectTo? }
//   { action: 'resend', userId, redirectTo? }   (emails a fresh password-setup link)
//   { action: 'set_role', userId, role }
import { createClient } from 'npm:@supabase/supabase-js@2'

type Role = 'admin' | 'operative'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null
  const r = value.trim().toLowerCase()
  return r === 'admin' || r === 'operative' ? r : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Function is missing Supabase env vars' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Identify the caller from their JWT and require the admin role.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Not authenticated' }, 401)
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user) return json({ error: 'Not authenticated' }, 401)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle()
  if (normalizeRole(callerProfile?.role) !== 'admin') return json({ error: 'Admins only' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = asString(body.action)

  try {
    if (action === 'list') {
      const { data: authData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (listErr) throw listErr

      const { data: profiles, error: profilesErr } = await admin.from('profiles').select('*')
      if (profilesErr) throw profilesErr
      const byId = new Map<string, Record<string, unknown>>()
      for (const p of profiles ?? []) byId.set(String(p.id), p)

      const users = authData.users.map((u) => {
        const p = byId.get(u.id) ?? {}
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        return {
          id: u.id,
          email: u.email ?? '',
          full_name: asString(p.full_name) || asString(meta.full_name),
          role: normalizeRole(p.role),
          invited_at: u.invited_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
          created_at: u.created_at,
          // Invited users who never set a password have not signed in yet.
          pending: !u.last_sign_in_at,
        }
      })
      return json({ users })
    }

    if (action === 'invite') {
      const email = asString(body.email).toLowerCase()
      const fullName = asString(body.fullName)
      const role = normalizeRole(body.role)
      const redirectTo = asString(body.redirectTo) || undefined
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400)
      if (fullName.length < 2) return json({ error: 'Enter the person’s name' }, 400)
      if (!role) return json({ error: 'Role must be admin or operative' }, 400)

      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role },
        redirectTo,
      })
      if (inviteErr) throw inviteErr
      const userId = invited.user?.id
      if (!userId) throw new Error('Invite created but the user id is missing')

      const { error: upsertErr } = await admin
        .from('profiles')
        .upsert({ id: userId, role, full_name: fullName }, { onConflict: 'id' })
      if (upsertErr) throw upsertErr

      // Best-effort: keep the invites table in sync for the /register flow.
      const { error: inviteRowErr } = await admin
        .from('invites')
        .upsert({ email, accepted: false }, { onConflict: 'email' })
      if (inviteRowErr) console.warn('invites upsert failed:', inviteRowErr.message)

      return json({ ok: true, userId })
    }

    if (action === 'resend') {
      const userId = asString(body.userId)
      const redirectTo = asString(body.redirectTo) || undefined
      if (!userId) return json({ error: 'userId is required' }, 400)

      const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId)
      if (getErr) throw getErr
      const email = target.user?.email
      if (!email) return json({ error: 'User has no email address' }, 400)
      if (target.user?.last_sign_in_at) return json({ error: 'This user has already signed in' }, 400)

      // Re-inviting an existing auth user fails, so send a password-setup (recovery) link.
      // The app routes `type=recovery` links to /register, same as invites.
      const { error: resendErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
      if (resendErr) throw resendErr
      return json({ ok: true })
    }

    if (action === 'set_role') {
      const userId = asString(body.userId)
      const role = normalizeRole(body.role)
      if (!userId) return json({ error: 'userId is required' }, 400)
      if (!role) return json({ error: 'Role must be admin or operative' }, 400)
      if (userId === caller.user.id && role !== 'admin') {
        return json({ error: 'You cannot remove your own admin role' }, 400)
      }

      const { error: updateErr } = await admin
        .from('profiles')
        .upsert({ id: userId, role }, { onConflict: 'id' })
      if (updateErr) throw updateErr
      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action || '(none)'}` }, 400)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg || 'Request failed' }, 500)
  }
})
