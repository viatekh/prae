import type { PricedLine, Project } from '../types'
import { calcLineTotal, calcProjectTotals } from './utils'

type InvoiceLine = PricedLine & { description: string }

const money = (n: number) => n.toFixed(2)

/**
 * The invoice as plain text, laid out to paste straight into FreeAgent's
 * invoice lines: one row per chargeable line — quantity, description, net total.
 */
export function invoiceText(
  project: Pick<Project, 'name' | 'project_number' | 'po_number' | 'overall_discount_pct'>,
  lines: InvoiceLine[],
): string {
  const chargeable = lines.filter(l => !l.is_component)
  const { subtotal, overallDiscount } = calcProjectTotals(chargeable, project.overall_discount_pct ?? 0)
  const rows = chargeable.map(l => {
    const period = l.days > 1 ? ` (${l.days} days)` : ''
    return `${l.quantity} x ${l.description}${period}\t${money(calcLineTotal(l))}`
  })
  return [
    `${project.name} — ${project.project_number}${project.po_number ? ` — PO ${project.po_number}` : ''}`,
    '',
    ...rows,
    ...(overallDiscount > 0 ? [`Discount (${project.overall_discount_pct}%)\t-${money(overallDiscount)}`] : []),
    '',
    `Net total\t${money(subtotal)}`,
  ].join('\n')
}
