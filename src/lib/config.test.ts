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
})
