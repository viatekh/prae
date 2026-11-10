import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { Minus, Plus, Trash2, Zap } from 'lucide-react'
import { useItems } from '../hooks/useItems'
import { useClients, useCreateClient } from '../hooks/useClients'
import { useSettings } from '../hooks/useSettings'
import { useCreateProject, useSaveLineItems, useCheckAll, reserveProjectNumber } from '../hooks/useProjects'
import { useItemTypeAvailability } from '../hooks/useAvailability'
import type { Item, LineItemDraft } from '../types'
import { buildItemLines } from '../lib/lines'
import { autoRef, blankProject } from '../lib/projects'
import { defaultHireDays } from '../lib/workflow'
import { calcProjectTotals, cn, formatCurrency } from '../lib/utils'
import { errorMessage } from '../lib/errors'
import { useToast } from '../lib/toast-context'
import { Button } from '../components/shared/Button'
import { Input } from '../components/shared/Input'
import { Select } from '../components/shared/Select'
import { QuickAddItem } from '../components/projects/QuickAddItem'

const NEW_CLIENT = '__new__'
const today = () => format(new Date(), 'yyyy-MM-dd')

/**
 * A whole small hire on one screen — who, when, what — booked as a confirmed
 * job in one press. For "one deck till Monday", not for a festival.
 */
export function QuickHirePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: items = [] } = useItems()
  const { data: clients = [] } = useClients()
  const { data: settings } = useSettings()
  const createClient = useCreateClient()
  const createProject = useCreateProject()
  const saveLines = useSaveLineItems()
  const checkAll = useCheckAll()

  const [clientId, setClientId] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [outDate, setOutDate] = useState(today)
  const [backDate, setBackDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [weDeliver, setWeDeliver] = useState(false)
  const [address, setAddress] = useState('')
  const [picked, setPicked] = useState<{ item: Item; qty: number }[]>([])
  const [busy, setBusy] = useState(false)

  const availability = useItemTypeAvailability(items, '', outDate, backDate)
  const days = defaultHireDays(outDate, backDate)
  const client = clients.find(c => c.id === clientId)
  const discountPct = client?.default_discount_pct ?? 0

  // Priced exactly as the saved job will be, so the total shown is the total booked.
  const draftLines: LineItemDraft[] = picked.flatMap(({ item, qty }, i) => buildItemLines(item, qty, days, '', i * 100))
  const { subtotal } = calcProjectTotals(draftLines, discountPct)
  const vat = settings?.vat_enabled ? subtotal * (settings.vat_rate / 100) : 0

  const add = (item: Item) => setPicked(prev => {
    const existing = prev.find(p => p.item.id === item.id)
    return existing
      ? prev.map(p => (p === existing ? { ...p, qty: p.qty + 1 } : p))
      : [...prev, { item, qty: 1 }]
  })
  const setQty = (id: string, qty: number) =>
    setPicked(prev => prev.flatMap(p => (p.item.id !== id ? [p] : qty <= 0 ? [] : [{ ...p, qty }])))

  const clientReady = clientId === NEW_CLIENT ? newName.trim().length > 0 : clientId !== ''
  const datesValid = backDate >= outDate
  const canBook = clientReady && picked.length > 0 && datesValid && !busy

  const book = async (checkOutNow: boolean) => {
    setBusy(true)
    try {
      let bookedClientId = clientId
      let clientName = client?.name ?? ''
      if (clientId === NEW_CLIENT) {
        const created = await createClient.mutateAsync({
          name: newName.trim(), company: null, email: newEmail.trim() || null, phone: null,
          address: null, billing_address: null, credit_terms: null, notes: null,
        })
        bookedClientId = created.id
        clientName = created.name
      }
      const first = picked[0]
      const name = `${clientName} — ${first.qty > 1 ? `${first.qty}× ` : ''}${first.item.name}${picked.length > 1 ? ` +${picked.length - 1}` : ''}`
      const reserved = await reserveProjectNumber(qc)
      const project = await createProject.mutateAsync({
        ...blankProject(),
        name,
        project_number: autoRef(clientName, reserved),
        client_id: bookedClientId,
        status: 'confirmed',
        event_date: outDate,
        delivery_date: outDate,
        collection_date: backDate,
        delivery_mode: weDeliver ? 'we_deliver' : 'client_collects',
        collection_mode: weDeliver ? 'we_collect' : 'client_returns',
        client_collects: !weDeliver,
        client_returns: !weDeliver,
        delivery_address: weDeliver ? address.trim() || null : null,
        overall_discount_pct: discountPct,
      })
      await saveLines.mutateAsync({
        projectId: project.id,
        lineItems: draftLines.map(l => ({ ...l, project_id: project.id })),
      })
      if (checkOutNow) await checkAll.mutateAsync({ projectId: project.id, direction: 'out' })
      toast(checkOutNow ? 'Booked and checked out' : 'Hire booked')
      navigate(`/projects/${project.id}`, { replace: true })
    } catch (e) {
      toast(errorMessage(e, 'Could not book the hire'), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="p-3 md:p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Zap size={22} className="text-amber-500" />Quick hire</h1>
        <p className="text-sm text-gray-500 mt-0.5">Book a small job in one go. It is saved as a confirmed booking you can still edit.</p>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">1 · Who</h2>
        <Select label="Client" value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">Choose a client…</option>
          <option value={NEW_CLIENT}>+ New client</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
        </Select>
        {clientId === NEW_CLIENT && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Name *" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            <Input label="Email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">2 · When</h2>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Out" type="date" value={outDate} onChange={e => setOutDate(e.target.value)} />
          <Input label="Back" type="date" value={backDate} min={outDate} onChange={e => setBackDate(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 7].map(n => (
            <button key={n} type="button" onClick={() => setBackDate(format(addDays(new Date(`${outDate}T00:00`), n), 'yyyy-MM-dd'))}
              className={cn('px-2.5 py-1 text-xs rounded-lg border cursor-pointer',
                days === n ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>
              {n === 7 ? '1 week' : `${n} day${n > 1 ? 's' : ''}`}
            </button>
          ))}
          {!datesValid && <span className="text-xs text-red-600">Back date is before the out date</span>}
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {[[false, 'Client collects & returns'], [true, 'We deliver & collect']].map(([value, label]) => (
            <button key={String(value)} type="button" onClick={() => setWeDeliver(value as boolean)}
              className={cn('flex-1 py-1.5 text-sm font-medium rounded-md cursor-pointer',
                weDeliver === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
              {label as string}
            </button>
          ))}
        </div>
        {weDeliver && <Input label="Delivery address" value={address} onChange={e => setAddress(e.target.value)} />}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">3 · What</h2>
        <QuickAddItem items={items} availability={availability} showAvailability onAdd={add} />
        {picked.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">Type above to add kit.</p>}
        {picked.map(({ item, qty }) => {
          const avail = availability.get(item.id)
          const short = avail ? qty > avail.available : false
          return (
            <div key={item.id} className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{item.name}</p>
                <p className={cn('text-xs', short ? 'text-red-600' : 'text-gray-400')}>
                  {formatCurrency(item.day_price)}/day{avail ? ` · ${avail.available} of ${avail.total} free` : ''}{short ? ' — not enough in stock' : ''}
                </p>
              </div>
              <button type="button" onClick={() => setQty(item.id, qty - 1)} aria-label={qty === 1 ? `Remove ${item.name}` : 'One fewer'}
                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center cursor-pointer text-gray-600">
                {qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button type="button" onClick={() => setQty(item.id, qty + 1)} aria-label="One more"
                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center cursor-pointer text-gray-600"><Plus size={14} /></button>
            </div>
          )
        })}
        {picked.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-baseline justify-between">
            <span className="text-sm text-gray-600">
              {days} day{days > 1 ? 's' : ''}{discountPct > 0 ? ` · ${discountPct}% client discount` : ''}{vat > 0 ? ' · inc. VAT' : ''}
            </span>
            <span className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(subtotal + vat)}</span>
          </div>
        )}
      </section>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <Button variant="secondary" disabled={!canBook} onClick={() => book(false)}>Book hire</Button>
        <Button disabled={!canBook} onClick={() => book(true)}>{busy ? 'Booking…' : 'Book & check out now'}</Button>
      </div>
    </div>
  )
}
