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

/**
 * Ready-to-send text for the routine emails of a hire. `total` is the amount
 * the client pays (VAT included where charged).
 */
export function buildEmail(kind: EmailKind, p: EmailProject, settings: Pick<Settings, 'company_name' | 'email_signature' | 'payment_terms'> | undefined, total: number): EmailDraft {
  const first = (p.client?.name || '').trim().split(/\s+/)[0]
  const hello = first ? `Hi ${first},` : 'Hi,'
  const sign = settings?.email_signature?.trim() || `Thanks,\n${settings?.company_name || ''}`.trim()
  const ref = p.project_number
  const amount = formatCurrency(total)
  const invoiceRef = p.invoice_number ? `invoice ${p.invoice_number}` : 'your invoice'
  const link = p.invoice_url ? `\n\nView and pay online: ${p.invoice_url}` : ''

  let subject = ''
  let paragraphs: string[] = []
  switch (kind) {
    case 'quote':
      subject = `Quote ${ref} — ${p.name}`
      paragraphs = [
        `Please find attached our quote for ${p.name}, totalling ${amount}.`,
        ...(p.expiry_date ? [`The quote is valid until ${day(p.expiry_date)}.`] : []),
        'Just reply to this email to confirm and we will get it booked in.',
      ]
      break
    case 'confirmation':
      subject = `Booking confirmed — ${p.name} (${ref})`
      paragraphs = [
        `Your booking for ${p.name} is confirmed.`,
        ...(logistics(p).length ? [logistics(p).join('\n')] : []),
        `Total: ${amount}.`,
        'Let us know if anything changes.',
      ]
      break
    case 'return_reminder':
      subject = `Return reminder — ${p.name} (${ref})`
      paragraphs = [
        p.collection_date
          ? (p.collection_mode === 'client_returns'
            ? `A quick reminder that the kit for ${p.name} is due back with us on ${dayTime(p.collection_date)}.`
            : `A quick reminder that we are due to collect the kit for ${p.name} on ${dayTime(p.collection_date)}.`)
          : `A quick reminder about returning the kit for ${p.name}.`,
        'If you need it for longer, reply and we will extend the hire.',
      ]
      break
    case 'invoice':
      subject = `Invoice${p.invoice_number ? ` ${p.invoice_number}` : ''} — ${p.name}`
      paragraphs = [
        `Thanks for hiring with us. Please find ${invoiceRef} for ${p.name}, totalling ${amount}.${link}`,
        ...(settings?.payment_terms ? [settings.payment_terms] : []),
      ]
      break
    case 'payment_reminder':
      subject = `Payment reminder — ${p.invoice_number ? `invoice ${p.invoice_number}` : p.name}`
      paragraphs = [
        `A friendly reminder that ${invoiceRef} for ${p.name} (${amount}) is still showing as unpaid.${link}`,
        'If you have already paid, please ignore this — and thank you.',
      ]
      break
  }
  return { to: p.client?.email || '', subject, body: [hello, ...paragraphs, sign].join('\n\n') }
}

/** A link that opens a pre-filled draft — in Gmail, or in the device's mail app. */
export function composeUrl(draft: EmailDraft, via: 'gmail' | 'default' = 'gmail'): string {
  const e = encodeURIComponent
  if (via === 'default') return `mailto:${e(draft.to)}?subject=${e(draft.subject)}&body=${e(draft.body)}`
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${e(draft.to)}&su=${e(draft.subject)}&body=${e(draft.body)}`
}
