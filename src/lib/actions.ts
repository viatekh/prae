import type { Project } from '../types'
import { format } from 'date-fns'

/** Day precision; project dates are a mix of plain dates and timestamps. */
const toDay = (value: string) => value.slice(0, 10)

export type ActionKind =
  | 'overdue_return' | 'check_out' | 'check_in' | 'to_invoice'
  | 'unpaid' | 'chase_quote' | 'quote_expired' | 'finish_draft'

export interface ProjectAction {
  kind: ActionKind
  projectId: string
  /** Lower sorts first. */
  priority: number
  title: string
  detail: string
}

type ActionProject = Pick<Project,
  'id' | 'name' | 'status' | 'event_date' | 'delivery_date' | 'collection_date' | 'expiry_date' |
  'check_out_at' | 'check_in_at' | 'quote_sent_at' | 'invoiced_at' | 'created_at'>

export interface ActionOptions {
  chaseQuoteDays: number
  paymentDays: number
  /** How far ahead a job shows up as needing to go out. */
  lookaheadDays?: number
}

const DAY = 86400000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Everything that needs a human, worked out from the data rather than kept as
 * a to-do list someone has to maintain. Each job yields at most one action:
 * its most pressing one.
 */
export function deriveActions(projects: ActionProject[], now: Date, opts: ActionOptions): ProjectAction[] {
  const today = format(now, 'yyyy-MM-dd')
  const lookahead = opts.lookaheadDays ?? 1
  const actions: ProjectAction[] = []

  for (const p of projects) {
    const add = (kind: ActionKind, priority: number, title: string, detail: string) =>
      actions.push({ kind, projectId: p.id, priority, title, detail })
    const outDay = p.delivery_date || p.event_date ? toDay((p.delivery_date || p.event_date)!) : null
    const backDay = p.collection_date ? toDay(p.collection_date) : null

    if (p.status === 'confirmed') {
      if (p.check_out_at && !p.check_in_at) {
        if (backDay && backDay < today) add('overdue_return', 0, 'Overdue back', `Was due ${plural(daysBetween(backDay, today), 'day')} ago`)
        else if (backDay === today) add('check_in', 2, 'Due back today', 'Check the kit in when it returns')
      } else if (!p.check_out_at) {
        if (outDay && outDay <= today) add('check_out', 1, outDay < today ? 'Should have gone out' : 'Goes out today', 'Check the kit out')
        else if (outDay && daysBetween(today, outDay) <= lookahead) add('check_out', 3, 'Goes out tomorrow', 'Prep and check the kit out')
      } else {
        add('to_invoice', 4, 'Ready to invoice', 'Kit is back — raise the invoice')
      }
    } else if (p.status === 'invoiced') {
      const since = p.invoiced_at ? daysBetween(toDay(p.invoiced_at), today) : null
      if (since !== null && since >= opts.paymentDays) add('unpaid', 5, 'Invoice unpaid', `Invoiced ${plural(since, 'day')} ago`)
    } else if (p.status === 'sent') {
      const expiry = p.expiry_date ? toDay(p.expiry_date) : null
      const since = daysBetween(toDay(p.quote_sent_at || p.created_at), today)
      if (expiry && expiry < today) add('quote_expired', 7, 'Quote expired', 'Re-send with a new date or close it')
      else if (since >= opts.chaseQuoteDays) add('chase_quote', 6, 'Chase quote', `Sent ${plural(since, 'day')} ago, no answer yet`)
    } else if (p.status === 'draft') {
      if (outDay && outDay >= today && daysBetween(today, outDay) <= 7) add('finish_draft', 8, 'Draft for an upcoming job', `Starts in ${plural(daysBetween(today, outDay), 'day')}`)
    }
  }
  return actions.sort((a, b) => a.priority - b.priority)
}
