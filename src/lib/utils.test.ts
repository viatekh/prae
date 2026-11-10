import { describe, it, expect } from 'vitest'
import { formatCurrency, calcLineTotal, calcProjectTotals } from './utils'
import type { PricedLine } from '../types'

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  unit_price: 100, quantity: 1, days: 1, discount_pct: 0, is_component: false, ...over,
})

describe('formatCurrency', () => {
  it('formats sterling', () => {
    expect(formatCurrency(1234.5)).toBe('£1,234.50')
  })
  it('renders £0.00 rather than £NaN for bad input', () => {
    expect(formatCurrency(NaN)).toBe('£0.00')
    expect(formatCurrency(Infinity)).toBe('£0.00')
    expect(formatCurrency(undefined as unknown as number)).toBe('£0.00')
  })
})

describe('calcLineTotal', () => {
  it('multiplies rate, quantity and days', () => {
    expect(calcLineTotal(line({ quantity: 2, days: 3 }))).toBe(600)
  })
  it('applies the line discount', () => {
    expect(calcLineTotal(line({ quantity: 2, days: 3, discount_pct: 10 }))).toBe(540)
  })
  it('uses the weekly rate when it is cheaper', () => {
    expect(calcLineTotal(line({ days: 7, week_price: 300 }))).toBe(300)
  })
  it('is unaffected by a weekly rate on a short hire', () => {
    expect(calcLineTotal(line({ days: 2, week_price: 300 }))).toBe(200)
  })
  it('survives missing numbers without producing NaN', () => {
    expect(calcLineTotal(line({ unit_price: NaN }))).toBe(0)
    expect(calcLineTotal(line({ quantity: undefined as unknown as number }))).toBe(0)
  })
})

describe('calcProjectTotals', () => {
  it('excludes component lines from the subtotal', () => {
    const totals = calcProjectTotals([
      line({ unit_price: 100, days: 2 }),
      line({ unit_price: 999, is_component: true }),
    ])
    expect(totals.linesSubtotal).toBe(200)
    expect(totals.subtotal).toBe(200)
  })

  it('applies the overall discount on top of line totals', () => {
    const totals = calcProjectTotals([line({ unit_price: 100, days: 10 })], 10)
    expect(totals.linesSubtotal).toBe(1000)
    expect(totals.overallDiscount).toBe(100)
    expect(totals.subtotal).toBe(900)
  })

  it('applies block rates before the overall discount', () => {
    // 7 days at a 300 week rate = 300, less 10% = 270.
    const totals = calcProjectTotals([line({ unit_price: 100, days: 7, week_price: 300 })], 10)
    expect(totals.linesSubtotal).toBe(300)
    expect(totals.subtotal).toBe(270)
  })

  it('returns zeroes for an empty kit list', () => {
    expect(calcProjectTotals([])).toEqual({ subtotal: 0, linesSubtotal: 0, overallDiscount: 0 })
  })
})
