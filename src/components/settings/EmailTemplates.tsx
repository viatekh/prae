import { useState } from 'react'
import type { Settings } from '../../types'
import { DEFAULT_TEMPLATES, EMAIL_LABELS, EMAIL_PLACEHOLDERS, buildEmail } from '../../lib/email'
import type { EmailKind, EmailTemplates as Templates } from '../../lib/email'
import { Input, Textarea } from '../shared/Input'
import { Button } from '../shared/Button'
import { cn } from '../../lib/utils'

const KINDS = Object.keys(EMAIL_LABELS) as EmailKind[]

/** A made-up job, so the preview shows real-looking wording. */
const SAMPLE = {
  name: 'Summer Party', project_number: 'SP-00042', event_date: '2026-07-18', delivery_date: '2026-07-18T09:00:00',
  collection_date: '2026-07-20T10:00:00', delivery_mode: 'client_collects', collection_mode: 'client_returns',
  delivery_address: null, invoice_number: 'INV-0101', invoice_url: 'https://example.freeagent.com/invoices/101',
  expiry_date: '2026-07-01', client: { name: 'Alex Morgan', email: 'alex@example.com' },
}

/** Edit the wording of the emails the app writes. Untouched ones keep the built-in text. */
export function EmailTemplates({ form, onChange }: {
  form: Partial<Settings>
  onChange: (templates: Templates) => void
}) {
  const [kind, setKind] = useState<EmailKind>('quote')
  const templates = (form.email_templates ?? {}) as Templates
  const current = templates[kind] ?? DEFAULT_TEMPLATES[kind]
  const customised = kind in templates

  const set = (field: 'subject' | 'body', value: string) =>
    onChange({ ...templates, [kind]: { ...current, [field]: value } })
  const reset = () => {
    const { [kind]: _removed, ...rest } = templates
    onChange(rest)
  }

  const preview = buildEmail(kind, SAMPLE, {
    company_name: form.company_name ?? '', email_signature: form.email_signature ?? '',
    payment_terms: form.payment_terms ?? '', email_templates: templates,
  }, 240)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Email templates</h2>
        <p className="text-xs text-gray-400 mt-0.5">The wording used when a job's Email buttons open a draft.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map(k => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={cn('px-2.5 py-1.5 text-xs font-medium rounded-lg cursor-pointer',
              kind === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {EMAIL_LABELS[k]}{k in templates ? ' •' : ''}
          </button>
        ))}
      </div>
      <Input label="Subject" value={current.subject} onChange={e => set('subject', e.target.value)} />
      <Textarea label="Message" value={current.body} onChange={e => set('body', e.target.value)} rows={10} className="font-mono text-xs" />
      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer font-medium text-gray-600">Placeholders you can use</summary>
        <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
          {EMAIL_PLACEHOLDERS.map(([token, meaning]) => (
            <li key={token}><code className="text-gray-800">{token}</code> — {meaning}</li>
          ))}
        </ul>
        <p className="mt-2">A line is left out automatically when its placeholder is empty — for example the invoice link before an invoice exists.</p>
      </details>
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1">Preview with a sample job</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700">
          <p className="font-semibold mb-2">{preview.subject}</p>
          <p className="whitespace-pre-wrap">{preview.body}</p>
        </div>
      </div>
      {customised && (
        <Button type="button" variant="ghost" size="sm" onClick={reset}>Reset this one to the built-in wording</Button>
      )}
    </div>
  )
}
