import { useState } from 'react'
import { ExternalLink, Copy, Mail, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { LineItemDraft, Project, Settings } from '../../types'
import { calcLineCost, calcLineTotal, calcProjectMargin, cn, formatCurrency } from '../../lib/utils'
import { invoiceText } from '../../lib/invoice'
import type { EmailKind } from '../../lib/email'
import { Button } from '../shared/Button'
import { useToast } from '../../lib/toast-context'

const marginTone = (pct: number | null) =>
  pct === null ? 'text-gray-400' : pct < 20 ? 'text-red-600' : pct < 40 ? 'text-amber-600' : 'text-green-700'

/**
 * Internal-only view of a job's money: what it costs us, what we keep, and
 * where the invoice is. Nothing here is printed on client documents.
 */
export function ProjectMoney({ project, lines, settings, onLineChange, onSave, onEmail }: {
  project: Project
  lines: LineItemDraft[]
  settings: Settings | undefined
  onLineChange: <K extends 'unit_cost' | 'supplier'>(index: number, field: K, value: LineItemDraft[K]) => void
  onSave: (updates: Partial<Project>) => Promise<void>
  onEmail: (kind: EmailKind) => void
}) {
  const toast = useToast()
  const [showCosts, setShowCosts] = useState(false)
  // null = untouched, so the saved value shows until the user types.
  const [number, setNumber] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  const { revenue, cost, profit, marginPct } = calcProjectMargin(lines, project.overall_discount_pct ?? 0)
  const isInvoiced = project.status === 'invoiced' || project.status === 'completed'

  const openFreeAgent = async () => {
    try {
      await navigator.clipboard.writeText(invoiceText(project, lines))
      toast('Invoice lines copied — paste them into FreeAgent')
    } catch {
      toast('Could not copy the invoice lines', 'error')
    }
    if (settings?.freeagent_url) window.open(settings.freeagent_url, '_blank', 'noopener')
  }

  const saveField = (field: 'invoice_number' | 'invoice_url', value: string | null) => {
    if (value === null) return
    const next = value.trim() || null
    if (next !== (project[field] ?? null)) void onSave({ [field]: next }).catch(() => {})
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Margin &amp; invoice</h2>
        <span className="text-xs text-gray-400">Internal — never shown to the client</span>
      </div>

      <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
        {[
          ['Price', formatCurrency(revenue), 'text-gray-900'],
          ['Cost', formatCurrency(cost), 'text-gray-900'],
          ['Profit', formatCurrency(profit), profit < 0 ? 'text-red-600' : 'text-gray-900'],
          ['Margin', marginPct === null ? '—' : `${marginPct.toFixed(0)}%`, marginTone(marginPct)],
        ].map(([label, value, tone]) => (
          <div key={label} className="px-3 py-2.5 md:px-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('text-sm md:text-base font-semibold tabular-nums', tone)}>{value}</p>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => setShowCosts(v => !v)} aria-expanded={showCosts}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
        <span>Costs per line{cost === 0 && ' — none entered yet'}</span>
        {showCosts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showCosts && (
        <div className="border-b border-gray-100">
          <div className="grid grid-cols-[1fr_110px_80px_70px] gap-2 px-4 py-1.5 text-xs font-medium text-gray-400">
            <span>Line</span><span>Supplier</span><span className="text-right">Cost / day</span><span className="text-right">Profit</span>
          </div>
          {lines.map((line, index) => line.is_component ? null : (
            <div key={index} className="grid grid-cols-[1fr_110px_80px_70px] gap-2 px-4 py-1.5 items-center border-t border-gray-50">
              <span className="text-sm text-gray-800 truncate">{line.quantity} × {line.description}</span>
              <input value={line.supplier ?? ''} placeholder="—" aria-label={`Supplier for ${line.description}`}
                onChange={e => onLineChange(index, 'supplier', e.target.value || null)}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full" />
              <input type="number" min="0" step="0.01" value={line.unit_cost || ''} placeholder="0" aria-label={`Cost per day for ${line.description}`}
                onChange={e => onLineChange(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                className="text-sm text-right border border-gray-200 rounded px-1.5 py-1 w-full" />
              <span className="text-xs text-right text-gray-500 tabular-nums">{formatCurrency(calcLineTotal(line) - calcLineCost(line))}</span>
            </div>
          ))}
          {lines.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">Add kit or services first.</p>}
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={openFreeAgent}>
            {settings?.freeagent_url ? <ExternalLink size={14} /> : <Copy size={14} />}
            {settings?.freeagent_url ? 'Copy lines & open FreeAgent' : 'Copy invoice lines'}
          </Button>
          {isInvoiced && project.client?.email && (
            <Button size="sm" variant="ghost" onClick={() => onEmail('invoice')}><Mail size={14} />Email invoice</Button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {project.paid_at ? `Paid ${format(parseISO(project.paid_at), 'd MMM')}`
              : project.invoiced_at ? `Invoiced ${format(parseISO(project.invoiced_at), 'd MMM')}`
              : 'Not invoiced'}
          </span>
        </div>
        {!settings?.freeagent_url && (
          <p className="text-xs text-gray-400">Add your FreeAgent link in Settings and this button opens a new invoice there too.</p>
        )}
        <div className="grid grid-cols-[130px_1fr] gap-2">
          <input value={number ?? project.invoice_number ?? ''} onChange={e => setNumber(e.target.value)}
            onBlur={() => saveField('invoice_number', number)} placeholder="Invoice no." aria-label="Invoice number"
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5" />
          <input value={url ?? project.invoice_url ?? ''} onChange={e => setUrl(e.target.value)}
            onBlur={() => saveField('invoice_url', url)} placeholder="Paste the FreeAgent invoice link" aria-label="Invoice link"
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 min-w-0" />
        </div>
      </div>
    </div>
  )
}
