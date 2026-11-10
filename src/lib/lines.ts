import type { Item, LineItemDraft, Package } from '../types'

const blank = {
  discount_pct: 0,
  supplier: null,
  area: null,
  order_status: null,
  out_qty: 0,
  in_qty: 0,
  damaged_qty: 0,
  return_note: null,
  parent_line_id: null,
} as const

/** A catalogue item as a kit-list line, followed by its accessory rows. */
export function buildItemLines(item: Item, qty: number, days: number, projectId: string, baseOrder: number): LineItemDraft[] {
  const category = item.category?.name || ''
  const main: LineItemDraft = {
    ...blank,
    project_id: projectId,
    item_id: item.id,
    package_id: null,
    description: item.name,
    line_type: 'rental',
    category,
    quantity: qty,
    days,
    // Rates and cost are snapshotted so later catalogue edits can't rewrite a quote.
    unit_price: item.day_price,
    week_price: item.week_price,
    month_price: item.month_price,
    unit_cost: item.is_subhire ? (item.subhire_cost ?? 0) : 0,
    supplier: item.is_subhire ? (item.subhire_owner ?? null) : null,
    sort_order: baseOrder,
    is_component: false,
  }
  const components: LineItemDraft[] = (item.components || []).map((c, ci) => ({
    ...blank,
    project_id: projectId,
    item_id: item.id,
    package_id: null,
    description: `${c.name} (component)`,
    line_type: 'rental',
    category,
    quantity: c.quantity * qty,
    days,
    unit_price: 0,
    week_price: null,
    month_price: null,
    unit_cost: 0,
    sort_order: baseOrder + ci + 1,
    is_component: true,
  }))
  return [main, ...components]
}

/** A package as one priced line, with its contents expanded as zero-priced rows for picking. */
export function buildPackageLines(pkg: Package, qty: number, days: number, projectId: string, baseOrder: number): LineItemDraft[] {
  const category = pkg.category?.name || ''
  const main: LineItemDraft = {
    ...blank,
    project_id: projectId,
    item_id: null,
    package_id: pkg.id,
    description: pkg.name,
    line_type: 'rental',
    category,
    quantity: qty,
    days,
    unit_price: pkg.day_price,
    week_price: pkg.week_price,
    month_price: pkg.month_price,
    unit_cost: 0,
    sort_order: baseOrder,
    is_component: false,
  }
  const contents: LineItemDraft[] = (pkg.package_items || []).flatMap((pi, piIdx) => {
    const item = pi.item
    if (!item) return []
    const row = (description: string, quantity: number, order: number): LineItemDraft => ({
      ...blank,
      project_id: projectId,
      item_id: item.id,
      package_id: pkg.id,
      description,
      line_type: 'rental',
      category,
      quantity,
      days,
      unit_price: 0,
      week_price: null,
      month_price: null,
      unit_cost: 0,
      sort_order: order,
      is_component: true,
    })
    return [
      row(`${item.name} (component)`, pi.quantity * qty, baseOrder + piIdx * 10 + 1),
      ...(item.components || []).map((c, ci) =>
        row(`${c.name} (accessory)`, c.quantity * pi.quantity * qty, baseOrder + piIdx * 10 + ci + 2)),
    ]
  })
  return [main, ...contents]
}

export function buildServiceLine(
  description: string, qty: number, days: number, price: number, cost: number,
  projectId: string, order: number,
): LineItemDraft {
  return {
    ...blank,
    project_id: projectId,
    item_id: null,
    package_id: null,
    description,
    line_type: 'service',
    category: 'Crewing and Services',
    quantity: qty,
    days,
    unit_price: price,
    week_price: null,
    month_price: null,
    unit_cost: cost,
    sort_order: order,
    is_component: false,
  }
}

/** The physical things on a job: every rental row, accessories included. Services don't get picked. */
export function pickableLines<T extends { line_type: string }>(lines: T[]): T[] {
  return lines.filter(l => l.line_type === 'rental')
}

export interface CheckProgress { total: number; out: number; back: number; damaged: number }

export function checkProgress(lines: { line_type: string; quantity: number; out_qty?: number; in_qty?: number; damaged_qty?: number }[]): CheckProgress {
  return pickableLines(lines).reduce<CheckProgress>((acc, l) => ({
    total: acc.total + l.quantity,
    out: acc.out + Math.min(l.out_qty ?? 0, l.quantity),
    back: acc.back + Math.min(l.in_qty ?? 0, l.quantity),
    damaged: acc.damaged + (l.damaged_qty ?? 0),
  }), { total: 0, out: 0, back: 0, damaged: 0 })
}
