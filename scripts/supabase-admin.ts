import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'node:fs'

// `npm run ...` does NOT automatically load `.env.local`.
// Load it explicitly so non-dev usage is copy/paste friendly.
dotenv.config({ path: '.env.local', override: true })
dotenv.config({ override: true })

// In some environments `dotenv` can be prevented from injecting certain keys.
// Fall back to a tiny `.env.local` parser so the script remains reliable.
try {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && fs.existsSync('.env.local')) {
    const raw = fs.readFileSync('.env.local', 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1)
      if (!process.env[key]) process.env[key] = value
    }
  }
} catch {
  // Ignore env loading errors; requireEnv will throw if needed.
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable: ${name}`)
  return v
}

function usage(): never {
  // Keep output short and copy/pasteable for non-dev users.
  console.log(`
Supabase admin runner (service role)

Required env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Examples:
  npx tsx scripts/supabase-admin.ts health
  npx tsx scripts/supabase-admin.ts list-tasks
  npx tsx scripts/supabase-admin.ts list-profiles
  npx tsx scripts/supabase-admin.ts set-role --email someone@company.com --role admin
  npx tsx scripts/supabase-admin.ts set-name --email someone@company.com --name "Jane Doe"

Commands:
  health
  list-tasks
  list-profiles
  set-role --email <email> --role <admin|operative>
  set-name --email <email> --name <full name>
`.trim())
  process.exit(1)
}

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name)
  if (idx === -1) return undefined
  return argv[idx + 1]
}

async function main() {
  const cmd = process.argv[2]
  if (!cmd) usage()

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new Error('Missing environment variable: SUPABASE_URL (or VITE_SUPABASE_URL)')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  if (cmd === 'health') {
    // Basic connectivity + permission check.
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error) throw error
    console.log('OK')
    return
  }

  if (cmd === 'list-tasks') {
    const { data, error } = await supabase
      .from('tasks')
      .select('id,title,status,location,category,due_date,assigned_to,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (cmd === 'list-profiles') {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .limit(100)
    if (error) throw error
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (cmd === 'set-role') {
    const email = parseFlag(process.argv, '--email')
    const role = parseFlag(process.argv, '--role')
    if (!email || !role) usage()
    if (role !== 'admin' && role !== 'operative') {
      throw new Error(`Invalid --role "${role}". Expected "admin" or "operative".`)
    }

    const { data: users, error: usersErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (usersErr) throw usersErr

    const match = users.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
    if (!match?.id) throw new Error(`No auth user found for email: ${email}`)

    const { error: upsertErr } = await supabase.from('profiles').upsert(
      { id: match.id, role },
      { onConflict: 'id' },
    )
    if (upsertErr) throw upsertErr

    console.log(`Updated role for ${email} -> ${role}`)
    return
  }

  if (cmd === 'set-name') {
    const email = parseFlag(process.argv, '--email')
    const name = parseFlag(process.argv, '--name')
    if (!email || !name) usage()

    const { data: users, error: usersErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (usersErr) throw usersErr

    const match = users.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
    if (!match?.id) throw new Error(`No auth user found for email: ${email}`)

    const fullName = name.trim()
    if (!fullName) throw new Error('Name cannot be empty.')

    const { error: upsertErr } = await supabase.from('profiles').upsert(
      { id: match.id, full_name: fullName },
      { onConflict: 'id' },
    )
    if (upsertErr) throw upsertErr

    console.log(`Updated name for ${email} -> ${fullName}`)
    return
  }

  usage()
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exit(1)
})

