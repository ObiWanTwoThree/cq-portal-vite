import { supabase } from './supabaseClient'

// Client for the `admin-users` Edge Function (supabase/functions/admin-users).
// Privileged actions (listing auth users, inviting, changing roles) run server-side
// with the service role; the browser only ever uses the anon key.

export type UserRole = 'admin' | 'operative'

export type AdminUserRow = {
  id: string
  email: string
  full_name: string
  role: UserRole | null
  invited_at: string | null
  last_sign_in_at: string | null
  created_at: string
  pending: boolean
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // FunctionsHttpError carries the Response; surface the function's own error message.
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      const payload = await ctx.json().catch(() => null)
      if (payload && typeof payload.error === 'string') throw new Error(payload.error)
    }
    throw error
  }
  return data as T
}

const redirectTo = () => `${window.location.origin}/register`

export async function listUsers() {
  const res = await call<{ users: AdminUserRow[] }>({ action: 'list' })
  return res.users ?? []
}

export async function inviteUser(params: { email: string; fullName: string; role: UserRole }) {
  await call({ action: 'invite', ...params, redirectTo: redirectTo() })
}

export async function resendInvite(userId: string) {
  await call({ action: 'resend', userId, redirectTo: redirectTo() })
}

export async function setUserRole(userId: string, role: UserRole) {
  await call({ action: 'set_role', userId, role })
}
