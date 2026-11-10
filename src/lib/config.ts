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
  } else if (/\s/.test(key) || key.length < 20) {
    problems.push('VITE_SUPABASE_ANON_KEY does not look like a Supabase key — copy the anon / publishable key again, with no spaces or line breaks.')
  }
  return problems
}
