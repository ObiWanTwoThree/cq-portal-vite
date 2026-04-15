import { supabase } from './supabaseClient'

export type NotificationRow = {
  id: string
  created_at: string
  user_id: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  type: string | null
}

export async function notifyUsers(params: {
  userIds: string[]
  title: string
  body?: string
  link?: string
  type?: string
}) {
  const userIds = Array.from(new Set(params.userIds.filter(Boolean)))
  if (userIds.length === 0) return

  try {
    const rows = userIds.map((user_id) => ({
      user_id,
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
      type: params.type ?? null,
    }))

    const { error } = await supabase.from('notifications').insert(rows)
    // If notifications table/policies aren't set up yet, don't break the app.
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('notifyUsers failed:', error.message)
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('notifyUsers failed:', e?.message ?? e)
  }
}

