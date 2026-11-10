import { describe, it, expect } from 'vitest'
import { calcLineCost, calcProjectMargin, breakdownByArea, ordersBySupplier } from './utils'
import { invoiceText } from './invoice'
import { buildEmail, composeUrl, renderTemplate } from './email'
import { buildItemLines, checkProgress } from './lines'
import type { Item } from '../types'

const line = (over: Record<string, unknown> = {}) => ({
  description: 'Speaker', unit_price: 100, quantity: 2, days: 3, discount_pct: 0, is_component: false, unit_cost: 0, ...over,
})

describe('margins', () => {
  it('costs a line as unit cost × quantity × days', () => {
    expect(calcLineCost(line({ unit_cost: 20 }))).toBe(120)
    expect(calcLineCost(line({ unit_cost: 20, is_component: true }))).toBe(0)
  })
  it('reports profit and margin after discounts', () => {
    const m = calcProjectMargin([line({ unit_cost: 25 })], 50)
    expect(m).toMatchObject({ revenue: 300, cost: 150, profit: 150, marginPct: 50 })
  })
  it('has no margin on a job with no price', () => {
    expect(calcProjectMargin([], 0).marginPct).toBeNull()
  })
})

describe('invoiceText', () => {
  it('lists chargeable lines, the discount and the net total', () => {
    const text = invoiceText(
      { name: 'Party', project_number: 'P-00001', po_number: 'PO9', overall_discount_pct: 10 },
      [line(), line({ description: 'Cable', is_component: true })],
    )
    expect(text).toContain('Party — P-00001 — PO PO9')
    expect(text).toContain('2 x Speaker (3 days)\t600.00')
    expect(text).not.toContain('Cable')
    expect(text).toContain('Discount (10%)\t-60.00')
    expect(text).toContain('Net total\t540.00')
  })
})

describe('emails', () => {
  const project = {
    name: 'Party', project_number: 'P-00001', event_date: '2026-12-01', delivery_date: null,
    collection_date: '2026-12-03T10:00:00', delivery_mode: 'client_collects', collection_mode: 'client_returns',
    delivery_address: null, invoice_number: 'INV-7', invoice_url: 'https://fa.test/i/7', expiry_date: null,
    client: { name: 'Jo Smith', email: 'jo@example.com' },
  }
  const settings = { company_name: 'Prae', email_signature: '', payment_terms: 'Payment within 14 days.' }

  it('greets by first name and signs off with the company', () => {
    const d = buildEmail('confirmation', project, settings, 120)
    expect(d.to).toBe('jo@example.com')
    expect(d.body.startsWith('Hi Jo,')).toBe(true)
    expect(d.body).toContain('Collection from us: Tuesday 1 December')
    expect(d.body).toContain('Return to us by: Thursday 3 December at 10:00')
    expect(d.body.endsWith('Thanks,\nPrae')).toBe(true)
  })
  it('puts the invoice number and link in invoice emails', () => {
    const d = buildEmail('invoice', project, settings, 120)
    expect(d.subject).toBe('Invoice INV-7 — Party')
    expect(d.body).toContain('https://fa.test/i/7')
    expect(d.body).toContain('Payment within 14 days.')
  })
  it('builds Gmail and mailto links with everything encoded', () => {
    const d = { to: 'a@b.c', subject: 'Q & A', body: 'line 1\nline 2' }
    expect(composeUrl(d)).toBe('https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.c&su=Q%20%26%20A&body=line%201%0Aline%202')
    expect(composeUrl(d, 'default')).toBe('mailto:a%40b.c?subject=Q%20%26%20A&body=line%201%0Aline%202')
  })
})

describe('lines', () => {
  const item = {
    id: 'i1', name: 'Projector', day_price: 80, week_price: 240, month_price: null, is_subhire: true,
    subhire_owner: 'AV Co', subhire_cost: 30, category: { name: 'Video' }, components: [{ name: 'Remote', quantity: 1 }],
  } as unknown as Item

  it('snapshots rates, cost and supplier, and expands accessories', () => {
    const [main, accessory] = buildItemLines(item, 2, 3, 'p1', 0)
    expect(main).toMatchObject({ unit_price: 80, week_price: 240, unit_cost: 30, supplier: 'AV Co', quantity: 2, out_qty: 0 })
    expect(accessory).toMatchObject({ is_component: true, quantity: 2, unit_price: 0, unit_cost: 0 })
  })
  it('counts kit movement across rental lines only', () => {
    expect(checkProgress([
      { line_type: 'rental', quantity: 4, out_qty: 4, in_qty: 3, damaged_qty: 1 },
      { line_type: 'rental', quantity: 2, out_qty: 9, in_qty: 0 },
      { line_type: 'service', quantity: 1, out_qty: 0, in_qty: 0 },
    ])).toEqual({ total: 6, out: 6, back: 3, damaged: 1 })
  })
})

describe('big jobs', () => {
  const lines = [
    line({ description: 'Neon', area: 'Courtyard', unit_cost: 50, supplier: 'Halo', order_status: 'Ordered' }),
    line({ description: 'Haze', area: 'Courtyard', supplier: 'Halo' }),
    line({ description: 'Crew', unit_cost: 80, supplier: 'Dave' }),
    line({ description: 'Cable', area: 'Courtyard', is_component: true, unit_cost: 999, supplier: 'Halo' }),
  ]
  it('totals cost, price and margin per area', () => {
    const [courtyard, rest] = breakdownByArea(lines)
    expect(courtyard).toMatchObject({ area: 'Courtyard', cost: 300, price: 1200, profit: 900, marginPct: 75 })
    expect(rest).toMatchObject({ area: 'Unassigned', cost: 480, price: 600 })
  })
  it('groups bought-in lines by supplier, ignoring accessory rows', () => {
    const [dave, halo] = ordersBySupplier(lines)
    expect(dave).toMatchObject({ supplier: 'Dave', total: 480 })
    expect(halo.total).toBe(300)
    expect(halo.lines.map(l => l.status)).toEqual(['Ordered', null])
  })
})

describe('templates', () => {
  it('drops a line whose placeholder is empty and keeps unknown tokens', () => {
    const out = renderTemplate('Hi {name},\n\nPay here: {link}\n\nRef {ref} {unknown}', { name: 'Jo', link: '', ref: 'A1' })
    expect(out).toBe('Hi Jo,\n\nRef A1 {unknown}')
  })
  it('uses a customised template over the built-in one', () => {
    const d = buildEmail('quote',
      { name: 'Party', project_number: 'P-1', event_date: null, delivery_date: null, collection_date: null, delivery_mode: null,
        collection_mode: null, delivery_address: null, invoice_number: null, invoice_url: null, expiry_date: null,
        client: { name: 'Jo Smith', email: null } },
      { company_name: 'Prae', email_signature: 'Cheers', payment_terms: '',
        email_templates: { quote: { subject: 'Your quote {ref}', body: 'Yo {first_name}\nExpires {expiry}\n{total}\n{signature}' } } },
      99)
    expect(d.subject).toBe('Your quote P-1')
    expect(d.body).toBe('Yo Jo\n£99.00\nCheers')
  })
})
