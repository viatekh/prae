import { describe, it, expect } from 'vitest'
import { rateForDuration } from './pricing'

const DAY = 100
const WEEK = 300   // a typical AV "3-day week"
const MONTH = 900

describe('rateForDuration', () => {
  it('charges straight days when only a day rate is set', () => {
    const r = rateForDuration({ day_price: DAY }, 14)
    expect(r.unitTotal).toBe(1400)
    expect(r.basis).toBe('day')
    expect(r.label).toBe('14 days')
  })

  it('is unchanged from day-only pricing for short hires', () => {
    for (const days of [1, 2, 3]) {
      const withWeek = rateForDuration({ day_price: DAY, week_price: WEEK }, days)
      expect(withWeek.unitTotal).toBe(days * DAY)
    }
  })

  it('uses the week rate once it beats counting days', () => {
    // 4 days at 100 = 400, which is more than a 300 week.
    const r = rateForDuration({ day_price: DAY, week_price: WEEK }, 4)
    expect(r.unitTotal).toBe(WEEK)
    expect(r.basis).toBe('week')
    expect(r.weeks).toBe(1)
  })

  it('charges exactly one week for seven days', () => {
    const r = rateForDuration({ day_price: DAY, week_price: WEEK }, 7)
    expect(r.unitTotal).toBe(WEEK)
    expect(r.weeks).toBe(1)
    expect(r.days).toBe(0)
  })

  it('mixes whole weeks with leftover days when that is cheapest', () => {
    // 9 days: 1wk + 2d = 500, vs 2wk = 600, vs 9d = 900.
    const r = rateForDuration({ day_price: DAY, week_price: WEEK }, 9)
    expect(r.unitTotal).toBe(500)
    expect(r.basis).toBe('mixed')
    expect(r.weeks).toBe(1)
    expect(r.days).toBe(2)
    expect(r.label).toBe('1 wk + 2 days')
  })

  it('rounds up to a whole week when the remainder costs more than a week', () => {
    // 12 days: 1wk + 5d = 800, vs 2wk = 600.
    const r = rateForDuration({ day_price: DAY, week_price: WEEK }, 12)
    expect(r.unitTotal).toBe(600)
    expect(r.weeks).toBe(2)
    expect(r.days).toBe(0)
  })

  it('uses the month rate for long hires', () => {
    const r = rateForDuration({ day_price: DAY, week_price: WEEK, month_price: MONTH }, 28)
    expect(r.unitTotal).toBe(MONTH)
    expect(r.months).toBe(1)
  })

  it('mixes months, weeks and days', () => {
    // 38 days: 1mth(28) + 1wk(7) + 3d = 900 + 300 + 300 = 1500
    const r = rateForDuration({ day_price: DAY, week_price: WEEK, month_price: MONTH }, 38)
    expect(r.unitTotal).toBe(1500)
    expect(r.months).toBe(1)
    expect(r.weeks).toBe(1)
    expect(r.days).toBe(3)
  })

  it('never charges more than the straight-day price', () => {
    const rates = { day_price: DAY, week_price: WEEK, month_price: MONTH }
    for (let days = 1; days <= 120; days++) {
      expect(rateForDuration(rates, days).unitTotal).toBeLessThanOrEqual(days * DAY)
    }
  })

  it('never charges less for a longer hire', () => {
    const rates = { day_price: DAY, week_price: WEEK, month_price: MONTH }
    let previous = 0
    for (let days = 1; days <= 120; days++) {
      const total = rateForDuration(rates, days).unitTotal
      expect(total).toBeGreaterThanOrEqual(previous)
      previous = total
    }
  })

  it('ignores zero, negative and non-finite rates', () => {
    expect(rateForDuration({ day_price: DAY, week_price: 0 }, 10).unitTotal).toBe(1000)
    expect(rateForDuration({ day_price: DAY, week_price: -50 }, 10).unitTotal).toBe(1000)
    expect(rateForDuration({ day_price: DAY, week_price: NaN }, 10).unitTotal).toBe(1000)
    expect(rateForDuration({ day_price: NaN }, 10).unitTotal).toBe(0)
  })

  it('handles zero and fractional durations', () => {
    expect(rateForDuration({ day_price: DAY }, 0).unitTotal).toBe(0)
    expect(rateForDuration({ day_price: DAY }, 2.7).unitTotal).toBe(200)
    expect(rateForDuration({ day_price: DAY }, -3).unitTotal).toBe(0)
  })
})
