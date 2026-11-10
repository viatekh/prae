import { describe, it, expect } from 'vitest'
import { generateItemCode, formatItemId } from './generateId'

describe('generateItemCode', () => {
  // The examples the module documents as its contract.
  it.each([
    ['Pioneer CDJ3000', 'CDJ3000'],
    ['Pioneer DJM900NXS2', 'DJM900N'],
    ['Shure SM58', 'SM58'],
  ])('condenses %s to %s', (name, expected) => {
    expect(generateItemCode(name)).toBe(expected)
  })

  it('never exceeds seven characters', () => {
    for (const name of [
      'Pioneer CDJ3000', 'Martin Audio XP12', 'Allen & Heath SQ5',
      'A very long descriptive item name without a model number',
    ]) {
      expect(generateItemCode(name).length).toBeLessThanOrEqual(7)
    }
  })

  it('is uppercase and free of spaces', () => {
    const code = generateItemCode('martin audio xp12')
    expect(code).toBe(code.toUpperCase())
    expect(code).not.toMatch(/\s/)
  })

  it('is stable for the same input', () => {
    expect(generateItemCode('Pioneer CDJ3000')).toBe(generateItemCode('Pioneer CDJ3000'))
  })

  it('copes with empty and symbol-only names', () => {
    expect(() => generateItemCode('')).not.toThrow()
    expect(() => generateItemCode('---')).not.toThrow()
  })
})

describe('formatItemId', () => {
  it('zero-pads the counter to three digits', () => {
    expect(formatItemId('CDJ3000', 1)).toBe('CDJ3000-001')
    expect(formatItemId('CDJ3000', 42)).toBe('CDJ3000-042')
  })
  it('does not truncate counters past 999', () => {
    expect(formatItemId('CDJ3000', 1234)).toBe('CDJ3000-1234')
  })
})
