export function getFirstName(params: { fullName?: string | null; email?: string | null }) {
  const fullName = (params.fullName ?? '').trim()
  if (fullName) return capitalize(fullName.split(/\s+/)[0] ?? '')

  const email = (params.email ?? '').trim().toLowerCase()
  const local = email.split('@')[0] ?? ''
  const firstPart = local.split('.')[0] ?? local
  return capitalize(firstPart)
}

function capitalize(s: string) {
  const v = (s ?? '').trim()
  if (!v) return 'User'
  return v.charAt(0).toUpperCase() + v.slice(1)
}

