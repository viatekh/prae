import type { Project, ProjectStatus } from '../types'

/**
 * A project's lifecycle as the user experiences it. Commercial status and the
 * warehouse check-out/check-in timestamps are stored separately; this folds
 * them into the one line of progress people actually think in.
 */
export const WORKFLOW_STAGES = [
  { key: 'draft',     label: 'Draft' },
  { key: 'sent',      label: 'Quoted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'out',       label: 'Out' },
  { key: 'returned',  label: 'Returned' },
  { key: 'invoiced',  label: 'Invoiced' },
  { key: 'completed', label: 'Paid' },
] as const

export type WorkflowStageKey = typeof WORKFLOW_STAGES[number]['key']

type WorkflowFields = Pick<Project, 'status' | 'check_out_at' | 'check_in_at'>

export interface WorkflowAction {
  label: string
  /** 'check_out' / 'check_in' also move every kit line; 'status' only changes the job. */
  kind: 'status' | 'check_out' | 'check_in'
  updates: Partial<Pick<Project, 'status' | 'check_out_at' | 'check_in_at' | 'quote_sent_at' | 'invoiced_at' | 'paid_at'>>
}

export function workflowStageIndex(p: WorkflowFields): number {
  if (p.status === 'completed') return 6
  if (p.status === 'invoiced') return 5
  if (p.check_in_at) return 4
  if (p.check_out_at) return 3
  if (p.status === 'confirmed') return 2
  if (p.status === 'sent') return 1
  return 0
}

/** The single most likely next step, or null once the project is completed. */
export function nextWorkflowAction(p: WorkflowFields, now: Date = new Date()): WorkflowAction | null {
  const at = now.toISOString()
  const status = (label: string, s: ProjectStatus, extra: WorkflowAction['updates'] = {}): WorkflowAction =>
    ({ label, kind: 'status', updates: { status: s, ...extra } })
  switch (workflowStageIndex(p)) {
    case 0: return status('Mark quote sent', 'sent', { quote_sent_at: at })
    case 1: return status('Confirm booking', 'confirmed')
    case 2: return { label: 'Check out all kit', kind: 'check_out', updates: { check_out_at: at } }
    case 3: return { label: 'Check in all kit', kind: 'check_in', updates: { check_in_at: at } }
    case 4: return status('Mark invoiced', 'invoiced', { invoiced_at: at })
    case 5: return status('Mark paid', 'completed', { paid_at: at })
    default: return null
  }
}

/** Default hire length for a new line: event → collection, at least one day. */
export function defaultHireDays(eventDate: string | null, collectionDate: string | null): number {
  if (!eventDate || !collectionDate) return 1
  const ms = new Date(collectionDate).getTime() - new Date(eventDate).getTime()
  if (Number.isNaN(ms)) return 1
  return Math.max(1, Math.ceil(ms / 86400000))
}
