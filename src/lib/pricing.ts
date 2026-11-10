/**
 * Rate ladder for hire pricing.
 *
 * Items carry an optional weekly and monthly rate alongside the daily one.
 * Those rates existed in the schema and in the item form but nothing ever
 * applied them, so a 14-day hire was billed at 14x the day rate.
 *
 * The charge for a hire is the cheapest of the sensible ways to make up its
 * duration from the rates that are actually set:
 *
 *   - straight days                       5 days  -> 5 x day
 *   - whole blocks, rounded up            9 days  -> 2 x week
 *   - blocks plus leftover days           9 days  -> 1 x week + 2 x day
 *
 * When no weekly or monthly rate is set this reduces to `days x day_price`,
 * which is exactly the previous behaviour.
 */

export const DAYS_PER_WEEK = 7
export const DAYS_PER_MONTH = 28

export type RateBasis = 'day' | 'week' | 'month' | 'mixed'

export interface Rates {
  day_price: number
  week_price?: number | null
  month_price?: number | null
}

export interface RateBreakdown {
  /** Charge for a single unit for the whole duration, before discount. */
  unitTotal: number
  basis: RateBasis
  months: number
  weeks: number
  days: number
  /** e.g. "1 wk + 2 days" — for showing the customer how the figure was reached. */
  label: string
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function describe(months: number, weeks: number, days: number): string {
  const parts: string[] = []
  if (months) parts.push(`${months} mth`)
  if (weeks) parts.push(`${weeks} wk`)
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  return parts.join(' + ') || '0 days'
}

function basisFor(months: number, weeks: number, days: number): RateBasis {
  const used = [months > 0, weeks > 0, days > 0].filter(Boolean).length
  if (used > 1) return 'mixed'
  if (months) return 'month'
  if (weeks) return 'week'
  return 'day'
}

function candidate(months: number, weeks: number, days: number, rates: Rates): RateBreakdown {
  const unitTotal =
    months * (rates.month_price ?? 0) +
    weeks * (rates.week_price ?? 0) +
    days * (rates.day_price || 0)
  return {
    unitTotal,
    basis: basisFor(months, weeks, days),
    months,
    weeks,
    days,
    label: describe(months, weeks, days),
  }
}

/**
 * Cheapest charge for one unit over `totalDays`, and how it was made up.
 *
 * Enumerates every combination of whole months and whole weeks that covers the
 * duration, with any shortfall charged as days, and keeps the cheapest. That
 * covers straight days, rounding up to a whole block, and block-plus-remainder
 * in one pass.
 */
export function rateForDuration(rates: Rates, totalDays: number): RateBreakdown {
  const days = Math.max(0, Math.floor(totalDays) || 0)
  const day = Number.isFinite(rates.day_price) ? rates.day_price : 0
  const week = positive(rates.week_price)
  const month = positive(rates.month_price)
  const normalised: Rates = { day_price: day, week_price: week, month_price: month }

  if (days === 0) return candidate(0, 0, 0, normalised)

  const maxMonths = month ? Math.ceil(days / DAYS_PER_MONTH) : 0
  let best: RateBreakdown | null = null

  for (let months = 0; months <= maxMonths; months++) {
    const afterMonths = Math.max(0, days - months * DAYS_PER_MONTH)
    const maxWeeks = week ? Math.ceil(afterMonths / DAYS_PER_WEEK) : 0
    for (let weeks = 0; weeks <= maxWeeks; weeks++) {
      const remainder = Math.max(0, afterMonths - weeks * DAYS_PER_WEEK)
      const option = candidate(months, weeks, remainder, normalised)
      if (!best || option.unitTotal < best.unitTotal) best = option
    }
  }

  return best ?? candidate(0, 0, days, normalised)
}
