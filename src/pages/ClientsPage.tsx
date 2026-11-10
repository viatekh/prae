import { useState } from 'react'
import { Plus, Pencil, Trash2, Mail, Phone, Search, AlertTriangle, History } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProjectRevenue } from '../hooks/useRevenue'
import { useClients, useCreateClient, useUpdateClient, useDeleteClient } from '../hooks/useClients'
import { useProjects } from '../hooks/useProjects'
import { useToast } from '../lib/toast-context'
import { errorMessage } from '../lib/errors'
import type { Client } from '../types'
import { formatCurrency, calcProjectTotals } from '../lib/utils'
import { Button } from '../components/shared/Button'
import { Input, Textarea } from '../components/shared/Input'
import { Modal } from '../components/shared/Modal'
import { StatusBadge } from '../components/shared/Badge'
import { format, parseISO } from 'date-fns'

function ClientForm({ initial, onSave, onCancel }: {
  initial?: Client
  onSave: (data: Omit<Client, 'id' | 'created_at'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [company, setCompany] = useState(initial?.company || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [address, setAddress] = useState(initial?.address || '')
  const [billingAddress, setBillingAddress] = useState(initial?.billing_address || '')
  const [billingSameAsDelivery, setBillingSameAsDelivery] = useState(!initial?.billing_address)
  const [creditTerms, setCreditTerms] = useState(initial?.credit_terms || '')
  const [defaultDiscount, setDefaultDiscount] = useState(String(initial?.default_discount_pct ?? 0))
  const [notes, setNotes] = useState(initial?.notes || '')

  return (
    <form onSubmit={e => {
      e.preventDefault()
      onSave({
        name, company: company || null, email: email || null, phone: phone || null,
        address: address || null,
        billing_address: billingSameAsDelivery ? null : (billingAddress || null),
        credit_terms: creditTerms || null,
        default_discount_pct: parseFloat(defaultDiscount) || null,
        notes: notes || null,
      })
    }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Contact name *" value={name} onChange={e => setName(e.target.value)} required />
        <Input label="Company" value={company} onChange={e => setCompany(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Input label="Phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      <Textarea label="Delivery / event address" value={address} onChange={e => setAddress(e.target.value)} rows={3} />
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">Billing address</label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" className="rounded" checked={billingSameAsDelivery}
              onChange={e => setBillingSameAsDelivery(e.target.checked)} />
            Same as above
          </label>
        </div>
        {!billingSameAsDelivery && (
          <Textarea value={billingAddress} onChange={e => setBillingAddress(e.target.value)} rows={3} />
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Credit terms" value={creditTerms} onChange={e => setCreditTerms(e.target.value)} placeholder="e.g. 30 days, Pro forma" />
        <Input label="Default discount %" type="number" min="0" max="100" value={defaultDiscount} onChange={e => setDefaultDiscount(e.target.value)} placeholder="0" />
      </div>
      <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save client</Button>
      </div>
    </form>
  )
}

export function ClientsPage() {
  const { data: clients = [], isLoading } = useClients()
  const { data: allProjects = [] } = useProjects()
  const { data: richProjects = [] } = useProjectRevenue()
  const create = useCreateClient()
  const update = useUpdateClient()
  const del = useDeleteClient()
  const navigate = useNavigate()

  // Backed by the URL so global search can deep-link straight to a client.
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const setSearch = (value: string) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (value) next.set('q', value)
    else next.delete('q')
    return next
  }, { replace: true })
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null)
  // In the URL so search results and project pages can link straight to a client.
  const viewingHistory = clients.find(c => c.id === params.get('client')) ?? null
  const setViewingHistory = (client: Client | null) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (client) next.set('client', client.id)
    else next.delete('client')
    return next
  }, { replace: true })
  const toast = useToast()

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-3 md:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} clients</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus size={16} />Add client</Button>
      </div>

      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg w-full max-w-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? <p className="text-sm text-gray-500">Loading...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.map((client, idx) => (
            <div key={client.id} className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-50 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
              <button type="button" onClick={() => setViewingHistory(client)} className="flex-1 min-w-0 text-left cursor-pointer">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{client.name}</p>
                  {client.default_discount_pct ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{client.default_discount_pct}% disc</span>
                  ) : null}
                </div>
                {client.company && <p className="text-sm text-gray-500">{client.company}</p>}
              </button>
              <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
                {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:text-gray-900"><Mail size={13} />{client.email}</a>}
                {client.phone && <span className="flex items-center gap-1"><Phone size={13} />{client.phone}</span>}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setViewingHistory(client)} title="View project history"><History size={14} /></Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(client)} title="Edit client" aria-label={`Edit ${client.name}`}><Pencil size={14} /></Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(client)} title="Delete client" aria-label={`Delete ${client.name}`}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">{search ? 'No clients match' : 'No clients yet'}</p>
            </div>
          )}
        </div>
      )}

      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null) }}
        title={editing ? `Edit: ${editing.name}` : 'Add client'}>
        <ClientForm
          initial={editing || undefined}
          onSave={async data => {
            try {
              if (editing) {
                await update.mutateAsync({ id: editing.id, ...data })
                setEditing(null)
                toast('Client updated')
              } else {
                await create.mutateAsync(data)
                setShowForm(false)
                toast('Client added')
              }
            } catch (e) {
              toast(errorMessage(e, 'Save failed'), 'error')
            }
          }}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      </Modal>

      {/* Client history */}
      <Modal open={!!viewingHistory} onClose={() => setViewingHistory(null)}
        title={viewingHistory ? `${viewingHistory.name}${viewingHistory.company ? ` · ${viewingHistory.company}` : ''}` : ''} size="lg">
        {viewingHistory && (() => {
          const clientProjects = allProjects
            .filter(p => p.client_id === viewingHistory.id)
            .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
          const totalSpend = richProjects
            .filter(p => p.client_id === viewingHistory.id && ['confirmed', 'invoiced', 'completed'].includes(p.status))
            .reduce((s, p) => s + calcProjectTotals(p.line_items ?? [], p.overall_discount_pct ?? 0).subtotal, 0)
          return (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-3">
                {viewingHistory.email && <a href={`mailto:${viewingHistory.email}`} className="flex items-center gap-1 hover:text-gray-900"><Mail size={13} />{viewingHistory.email}</a>}
                {viewingHistory.phone && <a href={`tel:${viewingHistory.phone}`} className="flex items-center gap-1 hover:text-gray-900"><Phone size={13} />{viewingHistory.phone}</a>}
                <span className="flex-1" />
                <Button variant="secondary" size="sm" onClick={() => { const c = viewingHistory; setViewingHistory(null); setEditing(c) }}><Pencil size={13} />Edit</Button>
                <Button size="sm" onClick={() => navigate(`/projects?new=1&client=${viewingHistory.id}`)}><Plus size={14} />New project</Button>
              </div>
              {totalSpend > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg mb-3">
                  <span className="text-sm text-gray-600">Total spend (confirmed+)</span>
                  <span className="text-sm font-bold text-gray-900">{formatCurrency(totalSpend)}</span>
                </div>
              )}
              {clientProjects.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No projects yet for this client</p>
              )}
              {clientProjects.map(p => (
                <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.project_number}</p>
                  </div>
                  <StatusBadge status={p.status} />
                  {p.event_date && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {format(parseISO(p.event_date), 'd MMM yyyy')}
                    </span>
                  )}
                  {p.location && <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{p.location}</span>}
                </button>
              ))}
            </div>
          )
        })()}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete client" size="sm">
        <div className="space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">Delete <strong>{confirmDelete?.name}</strong>? This cannot be undone.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { await del.mutateAsync(confirmDelete!.id); setConfirmDelete(null) }}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
