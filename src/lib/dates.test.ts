import { describe, it, expect } from 'vitest'
import { toDay, overlaps } from './dates'

describe('toDay', () => {
  it('trims timestamps to a date', () => {
    expect(toDay('2026-09-20T18:00:00Z')).toBe('2026-09-20')
  })
  it('leaves plain dates alone', () => {
    expect(toDay('2026-09-20')).toBe('2026-09-20')
  })
  it('passes through nullish values', () => {
    expect(toDay(null)).toBeNull()
    expect(toDay(undefined)).toBeNull()
    expect(toDay('')).toBeNull()
  })
})

describe('overlaps', () => {
  const a = ['2026-09-10', '2026-09-15'] as const

  it('detects a contained range', () => {
    expect(overlaps(a[0], a[1], '2026-09-12', '2026-09-13')).toBe(true)
  })
  it('detects a straddling range', () => {
    expect(overlaps(a[0], a[1], '2026-09-01', '2026-09-30')).toBe(true)
  })
  it('counts touching boundaries as overlapping', () => {
    expect(overlaps(a[0], a[1], '2026-09-15', '2026-09-20')).toBe(true)
    expect(overlaps(a[0], a[1], '2026-09-05', '2026-09-10')).toBe(true)
  })
  it('rejects ranges that do not meet', () => {
    expect(overlaps(a[0], a[1], '2026-09-16', '2026-09-20')).toBe(false)
    expect(overlaps(a[0], a[1], '2026-09-01', '2026-09-09')).toBe(false)
  })
  it('treats a missing bound as no overlap', () => {
    expect(overlaps(a[0], a[1], null, '2026-09-12')).toBe(false)
    expect(overlaps(null, null, '2026-09-12', '2026-09-13')).toBe(false)
  })

  // The regression this module exists for.
  it('matches a same-day booking across mixed date formats', () => {
    const start = toDay('2026-09-20T09:00:00Z')
    const end = toDay('2026-09-20T18:00:00Z')
    expect(overlaps(start, end, toDay('2026-09-20'), toDay('2026-09-22'))).toBe(true)
  })
})
