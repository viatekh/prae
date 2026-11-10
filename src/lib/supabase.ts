import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

// Trimmed: a trailing space or slash pasted into the host's settings is a common slip.
export const supabase = createClient(supabaseUrl.trim().replace(/\/+$/, ''), supabaseAnonKey.trim())
