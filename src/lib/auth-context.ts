import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { AuthError } from '@supabase/supabase-js'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'staff'
  created_at: string
}

export interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True until the initial session lookup resolves. */
  loading: boolean
  /** True until the profile row for the signed-in user has been fetched. */
  profileLoading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Pick<Profile, 'full_name'>>) => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
