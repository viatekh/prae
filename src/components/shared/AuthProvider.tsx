import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthState, type Profile } from '../../lib/auth-context'

/**
 * Holds the single auth subscription for the app. Previously every component
 * calling useAuth() opened its own onAuthStateChange subscription and re-fetched
 * the profile row.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined) // undefined = still loading
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const userId = session?.user?.id

  // Drop a profile belonging to a previous user during render, so no view ever
  // sees another account's role.
  const activeProfile = userId && profile?.id === userId ? profile : null

  useEffect(() => {
    if (!userId) return
    let active = true
    supabase.from('profiles').select('*').eq('id', userId).single()
      .then(({ data }) => {
        if (active) setProfile((data as Profile) ?? null)
      })
    return () => { active = false }
  }, [userId])

  // Derived, not stored: the profile is "loading" until the row we hold matches
  // the signed-in user.
  const profileLoading = session === undefined || (!!userId && profile?.id !== userId)

  const signIn = useCallback(
    (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }).then(({ error }) => ({ error })),
    [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const updateProfile = useCallback(async (updates: Partial<Pick<Profile, 'full_name'>>) => {
    if (!userId) return
    const { data } = await supabase.from('profiles').update(updates).eq('id', userId).select().single()
    if (data) setProfile(data as Profile)
  }, [userId])

  const value = useMemo<AuthState>(() => ({
    session: session ?? null,
    user: session?.user ?? null,
    profile: activeProfile,
    loading: session === undefined,
    profileLoading,
    isAdmin: activeProfile?.role === 'admin',
    signIn,
    signOut,
    updateProfile,
  }), [session, activeProfile, profileLoading, signIn, signOut, updateProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
