import { describe, it, expect } from 'vitest'
import { packageAvailability } from './packages'
import type { Package } from '../types'
import type { ItemAvailability } from '../hooks/useAvailability'

const pkg = (contents: [string, number][]): Package => ({
  id: 'p', package_id: 'PKG', name: 'DJ booth', category_id: 'c', day_price: 100,
  week_price: null, month_price: null, notes: null, created_at: '',
  package_items: contents.map(([item_id, quantity], i) => ({ id: String(i), package_id: 'p', item_id, quantity })),
})
const avail = (rows: [string, number][]) =>
  new Map<string, ItemAvailability>(rows.map(([id, available]) => [id, { total: available, booked: 0, available, max: available } as ItemAvailability]))

describe('packageAvailability', () => {
  it('is limited by the scarcest item for the quantity the package needs', () => {
    // 4 decks at 2 per package → 2; 3 mixers at 1 → 3
    expect(packageAvailability(pkg([['deck', 2], ['mixer', 1]]), avail([['deck', 4], ['mixer', 3]]))).toBe(2)
  })

  it('rounds down when there is not enough for a whole package', () => {
    expect(packageAvailability(pkg([['deck', 2]]), avail([['deck', 3]]))).toBe(1)
    expect(packageAvailability(pkg([['deck', 2]]), avail([['deck', 1]]))).toBe(0)
  })

  it('makes no claim when nothing in it is tracked', () => {
    expect(packageAvailability(pkg([['deck', 2]]), avail([]))).toBeNull()
    expect(packageAvailability(pkg([]), avail([['deck', 3]]))).toBeNull()
  })

  it('never goes negative when stock is overbooked', () => {
    expect(packageAvailability(pkg([['deck', 1]]), avail([['deck', -2]]))).toBe(0)
  })
})
