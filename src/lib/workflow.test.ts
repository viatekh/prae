import { describe, it, expect } from 'vitest'
import { workflowStageIndex, nextWorkflowAction, defaultHireDays, WORKFLOW_STAGES } from './workflow'

const p = (status: string, out: string | null = null, back: string | null = null) =>
  ({ status, check_out_at: out, check_in_at: back }) as Parameters<typeof workflowStageIndex>[0]

describe('workflowStageIndex', () => {
  it('follows status before any kit movement', () => {
    expect(workflowStageIndex(p('draft'))).toBe(0)
    expect(workflowStageIndex(p('sent'))).toBe(1)
    expect(workflowStageIndex(p('confirmed'))).toBe(2)
  })
  it('follows kit movement once confirmed', () => {
    expect(workflowStageIndex(p('confirmed', '2026-01-01'))).toBe(3)
    expect(workflowStageIndex(p('confirmed', '2026-01-01', '2026-01-03'))).toBe(4)
  })
  it('lets invoiced/completed win over kit movement', () => {
    expect(workflowStageIndex(p('invoiced'))).toBe(5)
    expect(workflowStageIndex(p('completed', '2026-01-01'))).toBe(6)
  })
})

describe('nextWorkflowAction', () => {
  it('walks every stage to completion', () => {
    let project = p('draft')
    const seen: number[] = []
    for (let i = 0; i < 10; i++) {
      seen.push(workflowStageIndex(project))
      const next = nextWorkflowAction(project, new Date('2026-01-01T10:00:00Z'))
      if (!next) break
      project = { ...project, ...next.updates }
    }
    expect(seen).toEqual(WORKFLOW_STAGES.map((_, i) => i))
  })
  it('has nothing to offer a completed project', () => {
    expect(nextWorkflowAction(p('completed'))).toBeNull()
  })
})

describe('defaultHireDays', () => {
  it('is 1 without both dates', () => {
    expect(defaultHireDays(null, '2026-01-05')).toBe(1)
    expect(defaultHireDays('2026-01-05', null)).toBe(1)
  })
  it('counts event to collection', () => {
    expect(defaultHireDays('2026-01-01', '2026-01-04')).toBe(3)
  })
  it('never goes below 1', () => {
    expect(defaultHireDays('2026-01-04', '2026-01-01')).toBe(1)
    expect(defaultHireDays('2026-01-01', '2026-01-01')).toBe(1)
  })
})
