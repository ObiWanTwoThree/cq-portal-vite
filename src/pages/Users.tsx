import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, UserPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import {
  inviteUser,
  listUsers,
  resendInvite,
  setUserRole,
  type AdminUserRow,
  type UserRole,
} from '../lib/adminUsers'

type ProfileRow = {
  id: string
  role?: unknown
  full_name?: unknown
  email?: unknown
  created_at?: unknown
}

type Filter = 'all' | 'admin' | 'operative' | 'pending'

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'admin', label: 'Admins' },
  { value: 'operative', label: 'Operatives' },
  { value: 'pending', label: 'Pending' },
]

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter their name'),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(['operative', 'admin']),
})

type InviteValues = z.infer<typeof inviteSchema>

function normalizeRole(role: unknown): UserRole | null {
  if (typeof role !== 'string') return null
  const r = role.trim().toLowerCase()
  if (r === 'admin') return 'admin'
  if (r === 'operative') return 'operative'
  return null
}

function formatDate(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Used when the admin-users function isn't deployed: read-only list straight from `profiles`.
function profileToRow(p: ProfileRow): AdminUserRow {
  return {
    id: p.id,
    email: typeof p.email === 'string' ? p.email : '',
    full_name: typeof p.full_name === 'string' ? p.full_name : '',
    role: normalizeRole(p.role),
    invited_at: null,
    last_sign_in_at: null,
    created_at: typeof p.created_at === 'string' ? p.created_at : '',
    pending: false,
  }
}

export default function Users() {
  const navigate = useNavigate()
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [readOnly, setReadOnly] = useState(false)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { fullName: '', email: '', role: 'operative' },
  })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listUsers()
      setUsers(rows)
      setReadOnly(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const { data: profiles, error: profilesErr } = await supabase.from('profiles').select('*')
      if (profilesErr) {
        setError(msg || 'Failed to load users')
      } else {
        setUsers(((profiles ?? []) as ProfileRow[]).map(profileToRow))
        setReadOnly(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user ?? null
      if (!user) {
        navigate('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      const admin = normalizeRole((profile as ProfileRow | null)?.role) === 'admin'
      setCurrentUserId(user.id)
      setIsAdmin(admin)
      setAuthChecked(true)
      if (admin) await loadUsers()
    }

    init()
    return () => {
      cancelled = true
    }
  }, [navigate, loadUsers])

  const counts = useMemo(
    () => ({
      all: users.length,
      admin: users.filter((u) => u.role === 'admin').length,
      operative: users.filter((u) => u.role === 'operative').length,
      pending: users.filter((u) => u.pending).length,
    }),
    [users],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users
      .filter((u) => {
        if (filter === 'pending') return u.pending
        if (filter === 'admin' || filter === 'operative') return u.role === filter
        return true
      })
      .filter((u) => !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email))
  }, [users, search, filter])

  const onInvite = async (values: InviteValues) => {
    setError('')
    setNotice('')
    try {
      await inviteUser({ email: values.email.toLowerCase(), fullName: values.fullName, role: values.role })
      setNotice(`Invite sent to ${values.email}.`)
      reset()
      setInviteOpen(false)
      await loadUsers()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send invite')
    }
  }

  const onRoleChange = async (user: AdminUserRow, role: UserRole) => {
    if (role === user.role) return
    const name = user.full_name || user.email
    if (!window.confirm(`Change ${name} to ${role === 'admin' ? 'Admin' : 'Operative'}?`)) return
    setBusyUserId(user.id)
    setError('')
    setNotice('')
    try {
      await setUserRole(user.id, role)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)))
      setNotice(`${name} is now ${role === 'admin' ? 'an Admin' : 'an Operative'}.`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update role')
    } finally {
      setBusyUserId(null)
    }
  }

  const onResend = async (user: AdminUserRow) => {
    setBusyUserId(user.id)
    setError('')
    setNotice('')
    try {
      await resendInvite(user.id)
      setNotice(`Sent a new set-up link to ${user.email}.`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to resend invite')
    } finally {
      setBusyUserId(null)
    }
  }

  if (!authChecked) {
    return <div className="text-slate-500">Loading…</div>
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto text-center py-8">
        <h2 className="page-title">Admins only</h2>
        <p className="helper-text mt-2">You need an admin account to manage users.</p>
        <button type="button" className="btn-secondary mt-6" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold tracking-widest text-slate-500">USERS</p>
          <h2 className="page-title mt-1">Users</h2>
          <div className="helper-text mt-1">Invite people to the portal and manage their roles.</div>
        </div>
        {!readOnly && (
          <button type="button" className="btn-primary whitespace-nowrap" onClick={() => setInviteOpen((v) => !v)}>
            {inviteOpen ? <X size={18} /> : <UserPlus size={18} />}
            <span>{inviteOpen ? 'Close' : 'Invite user'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      {notice && (
        <div className="mb-4 text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">{notice}</div>
      )}
      {readOnly && (
        <div className="mb-4 text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Read-only view. Deploy the <code>admin-users</code> Edge Function to invite users and change roles.
        </div>
      )}

      {inviteOpen && (
        <form onSubmit={handleSubmit(onInvite)} className="card p-4 sm:p-6 mb-6 space-y-4">
          <div className="section-title">Invite a new user</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="label" htmlFor="invite-name">Full name</label>
              <input id="invite-name" className="input" {...register('fullName')} />
              {errors.fullName && <p className="text-red-500 text-sm mt-1">{errors.fullName.message}</p>}
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor="invite-email">Email</label>
              <input id="invite-email" type="email" className="input" {...register('email')} />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>
          </div>
          <div className="sm:max-w-xs">
            <label className="label" htmlFor="invite-role">Role</label>
            <select id="invite-role" className="input" {...register('role')}>
              <option value="operative">Operative</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="helper-text">They’ll get an email with a link to set their password.</div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send invite'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card p-4 sm:p-6">
        <label className="label" htmlFor="users-search">Search</label>
        <input
          id="users-search"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
        />

        <div className="flex flex-wrap gap-2 mt-4">
          {filters
            .filter((f) => !(readOnly && f.value === 'pending'))
            .map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`badge px-3 py-1.5 transition ${
                  filter === f.value
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label} ({counts[f.value]})
              </button>
            ))}
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">No users found.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((u) => {
                const isSelf = u.id === currentUserId
                const busy = busyUserId === u.id
                return (
                  <li key={u.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950 break-words">
                          {u.full_name || u.email || 'Unnamed user'}
                        </span>
                        {isSelf && <span className="badge bg-slate-50 text-slate-600 border-slate-200">You</span>}
                        {u.pending && (
                          <span className="badge bg-amber-50 text-amber-800 border-amber-200">Invite pending</span>
                        )}
                        {!u.role && <span className="badge bg-red-50 text-red-700 border-red-200">No role</span>}
                      </div>
                      {u.full_name && u.email && <div className="text-sm text-slate-600 break-all">{u.email}</div>}
                      {!readOnly && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {u.pending
                            ? `Invited ${formatDate(u.invited_at || u.created_at)}`
                            : `Last signed in ${formatDate(u.last_sign_in_at)}`}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {u.pending && !readOnly && (
                        <button
                          type="button"
                          className="btn-secondary px-3 py-2 text-sm whitespace-nowrap"
                          onClick={() => onResend(u)}
                          disabled={busy}
                        >
                          <Mail size={16} />
                          <span>Resend</span>
                        </button>
                      )}
                      <select
                        aria-label={`Role for ${u.full_name || u.email}`}
                        className="input py-2 w-36"
                        value={u.role ?? ''}
                        disabled={readOnly || isSelf || busy}
                        title={isSelf ? 'You can’t change your own role' : undefined}
                        onChange={(e) => onRoleChange(u, e.target.value as UserRole)}
                      >
                        {!u.role && <option value="">No role</option>}
                        <option value="operative">Operative</option>
                        <option value="admin">Admin</option>
                      </select>
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
