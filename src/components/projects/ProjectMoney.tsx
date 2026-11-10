import { useState } from 'react'
import { ExternalLink, Copy, Mail, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { LineItemDraft, Project, Settings } from '../../types'
import { breakdownByArea, calcLineCost, calcLineTotal, calcProjectMargin, cn, formatCurrency, ordersBySupplier } from '../../lib/utils'
import { invoiceText } from '../../lib/invoice'
import type { EmailKind } from '../../lib/email'
import { Button } from '../shared/Button'
import { useToast } from '../../lib/toast-context'

/** Where a bought-in line has got to — the statuses used on the job spec sheets. */
const ORDER_STATUSES = ['Enquired', 'Requested', 'In progress', 'Ordered', 'Confirmed', 'Urgent', 'Cancelled']

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
  onLineChange: <K extends 'unit_cost' | 'supplier' | 'area' | 'order_status'>(index: number, field: K, value: LineItemDraft[K]) => void
  onSave: (updates: Partial<Project>) => Promise<void>
  onEmail: (kind: EmailKind) => void
}) {
  const toast = useToast()
  const [showCosts, setShowCosts] = useState(false)
  // null = untouched, so the saved value shows until the user types.
  const [number, setNumber] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  const { revenue, cost, profit, marginPct } = calcProjectMargin(lines, project.overall_discount_pct ?? 0)
  const areas = breakdownByArea(lines)
  const hasAreas = lines.some(l => l.area)
  const orders = ordersBySupplier(lines)
  const knownAreas = [...new Set(lines.map(l => l.area).filter((a): a is string => !!a))]
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
        <span>Costs, areas &amp; suppliers{cost === 0 && ' — none entered yet'}</span>
        {showCosts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showCosts && (
        <div className="border-b border-gray-100">
          <datalist id="job-areas">{knownAreas.map(a => <option key={a} value={a} />)}</datalist>
          {lines.map((line, index) => line.is_component ? null : (
            <div key={index} className="px-4 py-2 border-t border-gray-50 first:border-t-0 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-gray-800 truncate">{line.quantity} × {line.description}</span>
                <span className="text-xs text-gray-500 tabular-nums shrink-0">{formatCurrency(calcLineTotal(line) - calcLineCost(line))} profit</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_120px_90px] gap-1.5">
                <input value={line.area ?? ''} placeholder="Area" list="job-areas" aria-label={`Area for ${line.description}`}
                  onChange={e => onLineChange(index, 'area', e.target.value || null)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 min-w-0" />
                <input value={line.supplier ?? ''} placeholder="Supplier / who" aria-label={`Supplier for ${line.description}`}
                  onChange={e => onLineChange(index, 'supplier', e.target.value || null)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 min-w-0" />
                <select value={line.order_status ?? ''} aria-label={`Order status for ${line.description}`}
                  onChange={e => onLineChange(index, 'order_status', e.target.value || null)}
                  className="text-xs border border-gray-200 rounded px-1 py-1 bg-white min-w-0">
                  <option value="">No status</option>
                  {ORDER_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                <input type="number" min="0" step="0.01" value={line.unit_cost || ''} placeholder="Cost / day" aria-label={`Cost per day for ${line.description}`}
                  onChange={e => onLineChange(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                  className="text-xs text-right border border-gray-200 rounded px-1.5 py-1 min-w-0" />
              </div>
            </div>
          ))}
          {lines.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">Add kit or services first.</p>}
        </div>
      )}

      {hasAreas && (
        <div className="border-b border-gray-100">
          <div className="grid grid-cols-[1fr_80px_80px_80px_52px] gap-2 px-4 py-1.5 text-xs font-medium text-gray-400">
            <span>By area</span><span className="text-right">Cost</span><span className="text-right">Price</span><span className="text-right">Profit</span><span className="text-right">Margin</span>
          </div>
          {areas.map(a => (
            <div key={a.area} className="grid grid-cols-[1fr_80px_80px_80px_52px] gap-2 px-4 py-1.5 text-xs border-t border-gray-50 tabular-nums">
              <span className={cn('truncate', a.area === 'Unassigned' ? 'text-gray-400' : 'text-gray-800')}>{a.area}</span>
              <span className="text-right text-gray-600">{formatCurrency(a.cost)}</span>
              <span className="text-right text-gray-600">{formatCurrency(a.price)}</span>
              <span className="text-right text-gray-800">{formatCurrency(a.profit)}</span>
              <span className={cn('text-right font-medium', marginTone(a.marginPct))}>{a.marginPct === null ? '—' : `${a.marginPct.toFixed(0)}%`}</span>
            </div>
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <div className="border-b border-gray-100 px-4 py-2.5 space-y-2">
          <p className="text-xs font-medium text-gray-400">Orders by supplier</p>
          {orders.map(o => (
            <div key={o.supplier} className="text-xs">
              <div className="flex justify-between font-medium text-gray-800">
                <span>{o.supplier}</span><span className="tabular-nums">{formatCurrency(o.total)}</span>
              </div>
              {o.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-2 text-gray-500 pl-3">
                  <span className="truncate">{l.quantity} × {l.description}{l.area ? ` · ${l.area}` : ''}</span>
                  <span className={cn('shrink-0', l.status === 'Urgent' && 'text-red-600 font-medium', l.status === 'Confirmed' && 'text-green-700')}>{l.status ?? 'No status'}</span>
                </div>
              ))}
            </div>
          ))}
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
