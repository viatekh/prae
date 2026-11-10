import { format, parseISO } from 'date-fns'
import type { Project, Settings } from '../types'
import { formatCurrency } from './utils'

export type EmailKind = 'quote' | 'confirmation' | 'return_reminder' | 'invoice' | 'payment_reminder'

export const EMAIL_LABELS: Record<EmailKind, string> = {
  quote: 'Quote',
  confirmation: 'Booking confirmation',
  return_reminder: 'Return reminder',
  invoice: 'Invoice',
  payment_reminder: 'Payment reminder',
}

export interface EmailDraft { to: string; subject: string; body: string }

type EmailProject = Pick<Project,
  'name' | 'project_number' | 'event_date' | 'delivery_date' | 'collection_date' |
  'delivery_mode' | 'collection_mode' | 'delivery_address' | 'invoice_number' | 'invoice_url' | 'expiry_date'>
  & { client?: { name: string; email: string | null } | null }

const day = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'EEEE d MMMM') : null)
const dayTime = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = parseISO(iso)
  // Date-only values parse to midnight; don't print a meaningless 00:00.
  return d.getHours() === 0 && d.getMinutes() === 0 ? format(d, 'EEEE d MMMM') : format(d, "EEEE d MMMM 'at' HH:mm")
}

function logistics(p: EmailProject): string[] {
  const out = p.delivery_date || p.event_date
  const lines: string[] = []
  if (out) {
    lines.push(p.delivery_mode === 'client_collects'
      ? `Collection from us: ${dayTime(out)}`
      : `Delivery: ${dayTime(out)}${p.delivery_address ? ` to ${p.delivery_address.replace(/\s*\n\s*/g, ', ')}` : ''}`)
  }
  if (p.collection_date) {
    lines.push(p.collection_mode === 'client_returns'
      ? `Return to us by: ${dayTime(p.collection_date)}`
      : `We collect: ${dayTime(p.collection_date)}`)
  }
  return lines
}

export interface EmailTemplate { subject: string; body: string }
export type EmailTemplates = Partial<Record<EmailKind, EmailTemplate>>

/** Placeholders a template may use, with what each one becomes. */
export const EMAIL_PLACEHOLDERS: [string, string][] = [
  ['{first_name}', "Client's first name"],
  ['{client}', "Client's full name"],
  ['{job}', 'Job name'],
  ['{ref}', 'Job reference'],
  ['{total}', 'Amount the client pays'],
  ['{logistics}', 'Delivery / collection and return lines'],
  ['{return_date}', 'When the kit is due back'],
  ['{expiry}', 'Quote valid-until date'],
  ['{invoice_number}', 'Invoice number'],
  ['{invoice_link}', 'Link to the invoice'],
  ['{payment_terms}', 'Payment terms from Settings'],
  ['{company}', 'Your company name'],
  ['{signature}', 'Your email sign-off'],
]

export const DEFAULT_TEMPLATES: Record<EmailKind, EmailTemplate> = {
  quote: {
    subject: 'Quote {ref} — {job}',
    body: 'Hi {first_name},\n\nPlease find attached our quote for {job}, totalling {total}.\n\nValid until: {expiry}\n\nJust reply to this email to confirm and we will get it booked in.\n\n{signature}',
  },
  confirmation: {
    subject: 'Booking confirmed — {job} ({ref})',
    body: 'Hi {first_name},\n\nYour booking for {job} is confirmed.\n\n{logistics}\n\nTotal: {total}\n\nLet us know if anything changes.\n\n{signature}',
  },
  return_reminder: {
    subject: 'Return reminder — {job} ({ref})',
    body: 'Hi {first_name},\n\nA quick reminder about the kit for {job}.\n\nDue back: {return_date}\n\nIf you need it for longer, reply and we will extend the hire.\n\n{signature}',
  },
  invoice: {
    subject: 'Invoice {invoice_number} — {job}',
    body: 'Hi {first_name},\n\nThanks for hiring with us. Please find your invoice for {job}, totalling {total}.\n\nView and pay online: {invoice_link}\n\n{payment_terms}\n\n{signature}',
  },
  payment_reminder: {
    subject: 'Payment reminder — {job}',
    body: 'Hi {first_name},\n\nA friendly reminder that invoice {invoice_number} for {job} is still showing as unpaid.\n\nAmount: {total}\nView and pay online: {invoice_link}\n\nIf you have already paid, please ignore this — and thank you.\n\n{signature}',
  },
}

/**
 * Fills a template. A line whose placeholder has nothing to say (no invoice
 * link yet, no expiry date) is dropped whole, so a template never prints
 * "Valid until: " with nothing after it.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  const lines = template.split('\n').flatMap(line => {
    let empty = false
    const out = line.replace(/\{(\w+)\}/g, (token, key: string) => {
      if (!(key in values)) return token
      if (values[key] === '') empty = true
      return values[key]
    })
    return empty ? [] : [out]
  })
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()
}

/**
 * Ready-to-send text for the routine emails of a hire. `total` is the amount
 * the client pays (VAT included where charged); null when it isn't known.
 */
export function buildEmail(
  kind: EmailKind,
  p: EmailProject,
  settings: Pick<Settings, 'company_name' | 'email_signature' | 'payment_terms'> & { email_templates?: EmailTemplates } | undefined,
  total: number | null,
): EmailDraft {
  const clientName = (p.client?.name || '').trim()
  const company = settings?.company_name || ''
  const values: Record<string, string> = {
    first_name: clientName.split(/\s+/)[0] || 'there',
    client: clientName,
    job: p.name,
    ref: p.project_number,
    total: total === null ? '' : formatCurrency(total),
    logistics: logistics(p).join('\n'),
    return_date: dayTime(p.collection_date) ?? '',
    expiry: day(p.expiry_date) ?? '',
    invoice_number: p.invoice_number ?? '',
    invoice_link: p.invoice_url ?? '',
    payment_terms: settings?.payment_terms ?? '',
    company,
    signature: settings?.email_signature?.trim() || `Thanks,\n${company}`.trim(),
  }
  const template = settings?.email_templates?.[kind] ?? DEFAULT_TEMPLATES[kind]
  return {
    to: p.client?.email || '',
    // A subject is one line, so an empty placeholder is removed rather than dropping it all.
    subject: template.subject.replace(/\{(\w+)\}/g, (t, k: string) => (k in values ? values[k] : t)).replace(/\s+/g, ' ').replace(/\s+—\s*$|^\s*—\s+/g, '').trim(),
    body: renderTemplate(template.body, values),
  }
}

/** A link that opens a pre-filled draft — in Gmail, or in the device's mail app. */
export function composeUrl(draft: EmailDraft, via: 'gmail' | 'default' = 'gmail'): string {
  const e = encodeURIComponent
  if (via === 'default') return `mailto:${e(draft.to)}?subject=${e(draft.subject)}&body=${e(draft.body)}`
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${e(draft.to)}&su=${e(draft.subject)}&body=${e(draft.body)}`
}
