import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Create a new auth user without affecting the currently-logged-in admin's session.
 * We spin up a temporary Supabase client, sign up, then destroy it.
 */
export async function createAuthUser(email: string, password: string) {
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await tempClient.auth.signUp({ email, password })
  return { data, error }
}

export async function sendPasswordReset(email: string) {
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })
  return tempClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
}
