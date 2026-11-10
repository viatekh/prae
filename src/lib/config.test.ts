import { describe, it, expect } from 'vitest'
import { configProblems } from './config'

const KEY = 'sb_publishable_abcdefghijklmnopqrstuvwxyz'

describe('configProblems', () => {
  it('accepts a normal Supabase URL and key', () => {
    expect(configProblems({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: KEY })).toEqual([])
    expect(configProblems({ VITE_SUPABASE_URL: ' https://abc.supabase.co/ ', VITE_SUPABASE_ANON_KEY: KEY })).toEqual([])
  })
  it('names each missing value', () => {
    expect(configProblems({})).toEqual(['VITE_SUPABASE_URL is missing.', 'VITE_SUPABASE_ANON_KEY is missing.'])
  })
  it('catches a URL without https or with a path pasted on', () => {
    expect(configProblems({ VITE_SUPABASE_URL: 'abc.supabase.co', VITE_SUPABASE_ANON_KEY: KEY })).toHaveLength(1)
    expect(configProblems({ VITE_SUPABASE_URL: 'https://supabase.com/dashboard/project/abc', VITE_SUPABASE_ANON_KEY: KEY })).toHaveLength(1)
  })
  it('catches a truncated or broken key', () => {
    expect(configProblems({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'abc' })).toHaveLength(1)
    expect(configProblems({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: `${KEY}\n${KEY}` })).toHaveLength(1)
  })
  it('refuses a secret key, new or legacy format', () => {
    const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role, iss: 'supabase' }))}.signaturesignature`
    const url = 'https://abc.supabase.co'
    expect(configProblems({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz' })[0]).toContain('SECRET')
    expect(configProblems({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt('service_role') })[0]).toContain('SECRET')
    expect(configProblems({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt('anon') })).toEqual([])
  })
})
