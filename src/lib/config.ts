/**
 * Checks the two build-time settings the app cannot run without, and says in
 * plain words what is wrong. Without this a missing value threw during startup
 * and the deployed site was a blank page.
 */
export function configProblems(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }): string[] {
  const problems: string[] = []
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url) {
    problems.push('VITE_SUPABASE_URL is missing.')
  } else if (!/^https:\/\/[^\s/]+$/.test(url.replace(/\/+$/, ''))) {
    problems.push(`VITE_SUPABASE_URL should look like https://abcdefgh.supabase.co — it is currently "${url.slice(0, 60)}".`)
  }

  if (!key) {
    problems.push('VITE_SUPABASE_ANON_KEY is missing.')
  } else if (isSecretKey(key)) {
    problems.push('VITE_SUPABASE_ANON_KEY holds a SECRET key. Everything in this setting is public, so that key is now exposed: delete it in Supabase (Project Settings → API Keys), then put the publishable / anon key here instead.')
  } else if (/\s/.test(key) || key.length < 20) {
    problems.push('VITE_SUPABASE_ANON_KEY does not look like a Supabase key — copy the anon / publishable key again, with no spaces or line breaks.')
  }
  return problems
}

/** True for Supabase keys that bypass row-level security and must never reach a browser. */
function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  // Legacy keys are JWTs; the role is in the payload.
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'
  } catch {
    return false
  }
}
