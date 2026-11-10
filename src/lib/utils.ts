import { type ClassValue, clsx } from 'clsx'
import type { PricedLine } from '../types'
import { rateForDuration } from './pricing'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export function formatCurrency(amount: number): string {
  // A missing or malformed price should read as £0.00, never "£NaN".
  return GBP.format(Number.isFinite(amount) ? amount : 0)
}

/**
 * Charge for one line. Applies the item's weekly/monthly rates when they are
 * set and work out cheaper than counting days; falls back to days x day rate
 * otherwise, which is what every line without those rates does.
 */
export function calcLineTotal(line: PricedLine): number {
  const { unitTotal } = rateForDuration(
    { day_price: line.unit_price || 0, week_price: line.week_price, month_price: line.month_price },
    line.days,
  )
  const gross = unitTotal * (line.quantity || 0)
  const total = gross * (1 - (line.discount_pct || 0) / 100)
  return Number.isFinite(total) ? total : 0
}

/** How a line's duration was charged, for display next to the total. */
export function lineRateBasis(line: PricedLine) {
  return rateForDuration(
    { day_price: line.unit_price || 0, week_price: line.week_price, month_price: line.month_price },
    line.days,
  )
}

export function calcProjectTotals(
  lineItems: PricedLine[],
  overallDiscountPct = 0
) {
  const linesSubtotal = lineItems
    .filter(l => !l.is_component)
    .reduce((sum, l) => sum + calcLineTotal(l), 0)
  const overallDiscount = linesSubtotal * (overallDiscountPct / 100)
  const subtotal = linesSubtotal - overallDiscount
  return { subtotal, linesSubtotal, overallDiscount }
}

/** What a line costs us: unit cost × quantity × days. Component rows carry no cost. */
export function calcLineCost(line: PricedLine): number {
  if (line.is_component) return 0
  const cost = (line.unit_cost || 0) * (line.quantity || 0) * (line.days || 0)
  return Number.isFinite(cost) ? cost : 0
}

/** Revenue (after discounts, before VAT), cost, profit and margin for a job. */
export function calcProjectMargin(lineItems: PricedLine[], overallDiscountPct = 0) {
  const { subtotal } = calcProjectTotals(lineItems, overallDiscountPct)
  const cost = lineItems.reduce((sum, l) => sum + calcLineCost(l), 0)
  const profit = subtotal - cost
  // Margin is profit as a share of the price, so a free job has no meaningful margin.
  const marginPct = subtotal > 0 ? (profit / subtotal) * 100 : null
  return { revenue: subtotal, cost, profit, marginPct }
}
