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

export interface AreaBreakdown { area: string; cost: number; price: number; profit: number; marginPct: number | null }

/** Price, cost and margin per area of a job — the "by area" block of a job spec. */
export function breakdownByArea(lines: (PricedLine & { area?: string | null })[]): AreaBreakdown[] {
  const map = new Map<string, { cost: number; price: number }>()
  for (const l of lines) {
    if (l.is_component) continue
    const key = l.area?.trim() || 'Unassigned'
    const row = map.get(key) ?? { cost: 0, price: 0 }
    row.cost += calcLineCost(l)
    row.price += calcLineTotal(l)
    map.set(key, row)
  }
  return [...map].map(([area, { cost, price }]) => ({
    area, cost, price, profit: price - cost, marginPct: price > 0 ? ((price - cost) / price) * 100 : null,
  }))
}

export interface SupplierOrder {
  supplier: string
  total: number
  lines: { description: string; quantity: number; cost: number; status: string | null; area: string | null }[]
}

/** Everything bought in for a job, grouped by who it comes from. */
export function ordersBySupplier(
  lines: (PricedLine & { supplier?: string | null; order_status?: string | null; area?: string | null })[],
): SupplierOrder[] {
  const map = new Map<string, SupplierOrder>()
  for (const l of lines) {
    const supplier = l.supplier?.trim()
    if (l.is_component || !supplier) continue
    const order = map.get(supplier) ?? { supplier, total: 0, lines: [] }
    const cost = calcLineCost(l)
    order.total += cost
    order.lines.push({ description: l.description ?? '', quantity: l.quantity, cost, status: l.order_status ?? null, area: l.area ?? null })
    map.set(supplier, order)
  }
  return [...map.values()].sort((a, b) => a.supplier.localeCompare(b.supplier))
}
