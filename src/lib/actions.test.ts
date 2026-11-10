import { describe, it, expect } from 'vitest'
import { deriveActions } from './actions'

const NOW = new Date(2026, 10, 10, 9, 0)
const opts = { chaseQuoteDays: 3, paymentDays: 14 }
const job = (over: Record<string, unknown>) => ({
  id: 'p', name: 'Job', status: 'confirmed', event_date: null, delivery_date: null, collection_date: null,
  expiry_date: null, check_out_at: null, check_in_at: null, quote_sent_at: null, invoiced_at: null,
  created_at: '2026-11-01T10:00:00Z', ...over,
}) as Parameters<typeof deriveActions>[0][number]
const kinds = (over: Record<string, unknown>) => deriveActions([job(over)], NOW, opts).map(a => a.kind)

describe('deriveActions', () => {
  it('prompts check-out on the day and the day before, not earlier', () => {
    expect(kinds({ event_date: '2026-11-10' })).toEqual(['check_out'])
    expect(kinds({ event_date: '2026-11-11T08:00:00Z' })).toEqual(['check_out'])
    expect(kinds({ event_date: '2026-11-14' })).toEqual([])
  })
  it('prefers the delivery date over the event date', () => {
    expect(kinds({ event_date: '2026-11-20', delivery_date: '2026-11-10' })).toEqual(['check_out'])
  })
  it('flags kit due back today and overdue kit', () => {
    expect(kinds({ check_out_at: '2026-11-08', collection_date: '2026-11-10' })).toEqual(['check_in'])
    const [late] = deriveActions([job({ check_out_at: '2026-11-01', collection_date: '2026-11-07' })], NOW, opts)
    expect(late.kind).toBe('overdue_return')
    expect(late.detail).toContain('3 days')
  })
  it('asks for an invoice once kit is back', () => {
    expect(kinds({ check_out_at: '2026-11-01', check_in_at: '2026-11-09' })).toEqual(['to_invoice'])
  })
  it('chases unpaid invoices only after the payment window', () => {
    expect(kinds({ status: 'invoiced', invoiced_at: '2026-11-01T00:00:00Z' })).toEqual([])
    expect(kinds({ status: 'invoiced', invoiced_at: '2026-10-20T00:00:00Z' })).toEqual(['unpaid'])
  })
  it('chases quiet quotes and reports expired ones', () => {
    expect(kinds({ status: 'sent', quote_sent_at: '2026-11-09T00:00:00Z' })).toEqual([])
    expect(kinds({ status: 'sent', quote_sent_at: '2026-11-05T00:00:00Z' })).toEqual(['chase_quote'])
    expect(kinds({ status: 'sent', quote_sent_at: '2026-11-05T00:00:00Z', expiry_date: '2026-11-08' })).toEqual(['quote_expired'])
  })
  it('surfaces drafts for jobs starting within a week', () => {
    expect(kinds({ status: 'draft', event_date: '2026-11-13' })).toEqual(['finish_draft'])
    expect(kinds({ status: 'draft', event_date: '2026-12-25' })).toEqual([])
  })
  it('leaves finished jobs alone and sorts the most urgent first', () => {
    expect(kinds({ status: 'completed', check_out_at: '2026-11-01', collection_date: '2026-11-02' })).toEqual([])
    const sorted = deriveActions([
      job({ id: 'a', status: 'sent', quote_sent_at: '2026-11-01T00:00:00Z' }),
      job({ id: 'b', check_out_at: '2026-11-01', collection_date: '2026-11-05' }),
      job({ id: 'c', event_date: '2026-11-10' }),
    ], NOW, opts)
    expect(sorted.map(a => a.projectId)).toEqual(['b', 'c', 'a'])
  })
})
