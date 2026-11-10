import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Copy, FileText, ClipboardList, Send, ScanLine, LogIn, LogOut, AlertCircle, MoreVertical, Users, MessageSquare, Truck, Check, Loader2 } from 'lucide-react'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { errorMessage } from '../lib/errors'
import { format, addDays, isPast, parseISO } from 'date-fns'
import { useProject, useUpdateProject, useSaveLineItems, useDeleteProject, useCheckAll } from '../hooks/useProjects'
import { useProjectLogs, useAddProjectLog, useDeleteProjectLog } from '../hooks/useProjectLogs'
import { useProjectCrew, useAddCrewMember, useRemoveCrewMember } from '../hooks/useProjectCrew'
import { useItemConflicts, useItemTypeAvailability } from '../hooks/useAvailability'
import { useItems } from '../hooks/useItems'
import { usePackages } from '../hooks/usePackages'
import { useClients, useCreateClient } from '../hooks/useClients'
import { useSettings } from '../hooks/useSettings'
import type { Project, ProjectStatus, Item, Package, Client, LineItemDraft } from '../types'
import { Button } from '../components/shared/Button'
import { Input, Textarea } from '../components/shared/Input'

import { Modal } from '../components/shared/Modal'
import { StatusBadge, SubhireBadge } from '../components/shared/Badge'
import { formatCurrency, calcLineTotal, calcProjectTotals, lineRateBasis } from '../lib/utils'
import { generateQuotePDF, generatePickingListPDF, generateDeliveryDocketPDF } from '../lib/pdf-lazy'
import { useToast } from '../lib/toast-context'
import { Select } from '../components/shared/Select'
import { ProjectWorkflow } from '../components/projects/ProjectWorkflow'
import { QuickAddItem } from '../components/projects/QuickAddItem'
import { defaultHireDays } from '../lib/workflow'
import { buildItemLines, buildPackageLines, buildServiceLine } from '../lib/lines'
import type { WorkflowAction } from '../lib/workflow'
import { ProjectMoney } from '../components/projects/ProjectMoney'
import { buildEmail, composeUrl, EMAIL_LABELS } from '../lib/email'
import type { EmailKind } from '../lib/email'
import { checkProgress } from '../lib/lines'


// ─── Left panel: project details + dates + notes ─────────────────────────────

const AUTOSAVE_DELAY_MS = 1200
const KIT_AUTOSAVE_DELAY_MS = 1500

function ProjectDetailsPanel({ project, clients, onSave, onRefreshClients }: {
  project: Project
  clients: Client[]
  onSave: (updates: Partial<Project>) => Promise<void>
  onRefreshClients: () => void
}) {
  const createClient = useCreateClient()
  const toast = useToast()
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientCompany, setNewClientCompany] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')

  const [form, setForm] = useState({
    client_id: project.client_id || '',
    location: project.location || '',
    delivery_address: project.delivery_address || '',
    event_date: project.event_date?.slice(0, 16) || '',
    delivery_date: project.delivery_date?.slice(0, 16) || '',
    collection_date: project.collection_date?.slice(0, 16) || '',
    delivery_mode: (project.delivery_mode || 'we_deliver') as 'we_deliver' | 'client_collects' | 'other',
    collection_mode: (project.collection_mode || 'we_collect') as 'we_collect' | 'client_returns' | 'other',
    delivery_notes: project.delivery_notes || '',
    collection_notes: project.collection_notes || '',
    expiry_date: project.expiry_date?.slice(0, 10) || '',
    po_number: project.po_number || '',
    overall_discount_pct: String(project.overall_discount_pct ?? 0),
    deposit_amount: project.deposit_amount != null ? String(project.deposit_amount) : '',
    deposit_paid: project.deposit_paid ? 'yes' : 'no',
    damage_notes: project.damage_notes || '',
    notes: project.notes || '',
    client_notes: project.client_notes || '',
  })
  const [deliverySameAsEvent, setDeliverySameAsEvent] = useState(
    !!project.event_date && project.event_date?.slice(0, 16) === project.delivery_date?.slice(0, 16)
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  type FormField = keyof typeof form
  const set = (field: FormField, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const toUpdates = useCallback((f: typeof form): Partial<Project> => ({
    client_id: f.client_id || null,
    location: f.location || null,
    delivery_address: f.delivery_address || null,
    event_date: f.event_date || null,
    delivery_date: f.delivery_date || null,
    collection_date: f.collection_date || null,
    client_collects: f.delivery_mode === 'client_collects',
    client_returns: f.collection_mode === 'client_returns',
    delivery_mode: f.delivery_mode,
    collection_mode: f.collection_mode,
    delivery_notes: f.delivery_notes || null,
    collection_notes: f.collection_notes || null,
    expiry_date: f.expiry_date || null,
    po_number: f.po_number || null,
    overall_discount_pct: parseFloat(f.overall_discount_pct) || 0,
    deposit_amount: f.deposit_amount.trim() === '' ? null : (parseFloat(f.deposit_amount) || 0),
    deposit_paid: f.deposit_paid === 'yes',
    damage_notes: f.damage_notes || null,
    notes: f.notes || null,
    client_notes: f.client_notes || null,
  }), [])

  // The snapshot last written to the server. Dirtiness is derived from it rather
  // than tracked in a ref, so the render never reads mutable state.
  const [savedSnapshot, setSavedSnapshot] = useState(form)
  const isDirty = (Object.keys(form) as (keyof typeof form)[])
    .some(k => form[k] !== savedSnapshot[k])

  // Latest values for the unmount flush, synced in an effect (never during render).
  const latest = useRef({ form, onSave, isDirty })
  useEffect(() => { latest.current = { form, onSave, isDirty } })

  const flush = useCallback(async () => {
    const { form: f, onSave: save, isDirty: dirty } = latest.current
    if (!dirty) return
    await save(toUpdates(f))
    setSavedSnapshot(f)
  }, [toUpdates])

  // Debounced autosave: edits are written AUTOSAVE_DELAY_MS after typing stops.
  useEffect(() => {
    if (!isDirty) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaveState('saving')
      flush()
        .then(() => {
          setSaveState('saved')
          setTimeout(() => setSaveState('idle'), 2000)
        })
        .catch(() => setSaveState('idle'))
    }, AUTOSAVE_DELAY_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [form, isDirty, flush])

  // Leaving the panel (mobile tab switch, route change) must not drop a pending edit.
  useEffect(() => () => { void flush() }, [flush])

  const handleEventDateChange = (val: string) => {
    set('event_date', val)
    if (deliverySameAsEvent) set('delivery_date', val)
  }

  const handleSameAsEvent = (checked: boolean) => {
    setDeliverySameAsEvent(checked)
    if (checked) set('delivery_date', form.event_date)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Project details</h2>
          {saveState === 'saving' && <span className="text-xs text-gray-400">Saving…</span>}
          {saveState === 'saved'  && <span className="text-xs text-green-600">Saved ✓</span>}
          {saveState === 'idle' && isDirty && (
            <span className="text-xs text-amber-600">Unsaved…</span>
          )}
        </div>

        <div>
          <div className="flex gap-1.5 items-end">
            <Select
              label="Client"
              className="flex-1"
              value={form.client_id}
              onChange={e => {
                const client = clients.find(c => c.id === e.target.value)
                setForm(f => ({
                  ...f,
                  client_id: e.target.value,
                  overall_discount_pct: client?.default_discount_pct
                    ? String(client.default_discount_pct)
                    : f.overall_discount_pct,
                }))
              }}
            >
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
            </Select>
            <Button type="button" variant="secondary" size="sm" className="shrink-0 h-[38px]"
              onClick={() => setShowNewClient(true)} title="Add new client">
              <Plus size={14} />New
            </Button>
          </div>
          {showNewClient && (
            <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
              <p className="text-xs font-medium text-gray-600">New client</p>
              <Input label="Name *" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
              <Input label="Company" value={newClientCompany} onChange={e => setNewClientCompany(e.target.value)} />
              <Input label="Email" type="email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewClient(false)}>Cancel</Button>
                <Button type="button" size="sm" disabled={!newClientName.trim() || createClient.isPending}
                  onClick={async () => {
                    if (!newClientName.trim()) return
                    try {
                      const client = await createClient.mutateAsync({
                        name: newClientName.trim(), company: newClientCompany || null,
                        email: newClientEmail || null, phone: null, address: null,
                        billing_address: null, credit_terms: null, notes: null,
                      })
                      set('client_id', client.id)
                      onRefreshClients()
                      setShowNewClient(false)
                      setNewClientName(''); setNewClientCompany(''); setNewClientEmail('')
                    } catch (e) {
                      toast(errorMessage(e, 'Failed to add client'), 'error')
                    }
                  }}
                >{createClient.isPending ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          )}
        </div>

        <Input label="Location" value={form.location} onChange={e => set('location', e.target.value)} />
        <Textarea label="Delivery address" value={form.delivery_address} onChange={e => set('delivery_address', e.target.value)} rows={3} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Dates</h2>

        <div>
          <Input label="Event date" type="datetime-local" value={form.event_date} onChange={e => handleEventDateChange(e.target.value)} />
          <div className="flex gap-1 mt-1">
            <button type="button" onClick={() => handleEventDateChange(format(new Date(), "yyyy-MM-dd'T'HH:mm"))}
              className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">Today</button>
            <button type="button" onClick={() => handleEventDateChange(format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm"))}
              className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">+7d</button>
            <button type="button" onClick={() => handleEventDateChange(format(addDays(new Date(), 14), "yyyy-MM-dd'T'HH:mm"))}
              className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">+14d</button>
          </div>
        </div>

        {/* Delivery */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500">Delivery</label>
          <div className="flex gap-1">
            {(['we_deliver', 'client_collects', 'other'] as const).map(mode => (
              <button key={mode} type="button"
                onClick={() => set('delivery_mode', mode)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${form.delivery_mode === mode ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                {mode === 'we_deliver' ? 'We deliver' : mode === 'client_collects' ? 'Client collects' : 'Other'}
              </button>
            ))}
            <label className="flex items-center gap-1 text-xs text-gray-400 ml-auto cursor-pointer">
              <input type="checkbox" className="rounded" checked={deliverySameAsEvent}
                onChange={e => handleSameAsEvent(e.target.checked)} />
              Same as event
            </label>
          </div>
          <input
            type="datetime-local"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            value={form.delivery_date}
            onChange={e => { set('delivery_date', e.target.value); setDeliverySameAsEvent(false) }}
          />
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Delivery notes (access, loading bay, contact...)"
            value={form.delivery_notes}
            onChange={e => set('delivery_notes', e.target.value)}
          />
        </div>

        {/* Collection */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500">Collection</label>
          <div className="flex gap-1">
            {(['we_collect', 'client_returns', 'other'] as const).map(mode => (
              <button key={mode} type="button"
                onClick={() => set('collection_mode', mode)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${form.collection_mode === mode ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                {mode === 'we_collect' ? 'We collect' : mode === 'client_returns' ? 'Client returns' : 'Other'}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            value={form.collection_date}
            onChange={e => set('collection_date', e.target.value)}
          />
          <input
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Collection notes..."
            value={form.collection_notes}
            onChange={e => set('collection_notes', e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Quote details</h2>
        <div className="grid grid-cols-2 gap-3">
          <Input label="PO / reference number" value={form.po_number} onChange={e => set('po_number', e.target.value)} placeholder="Client's ref" />
          <div>
            <Input label="Quote expires" type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
            <div className="flex gap-1 mt-1">
              {[['Today', 0], ['+7d', 7], ['+14d', 14]].map(([label, days]) => (
                <button key={label} type="button"
                  onClick={() => set('expiry_date', format(addDays(new Date(), days as number), 'yyyy-MM-dd'))}
                  className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">{label}</button>
              ))}
            </div>
          </div>
        </div>
        <Input label="Overall discount %" type="number" min="0" max="100" step="0.01" value={form.overall_discount_pct} onChange={e => set('overall_discount_pct', e.target.value)} />
        <div className="grid grid-cols-2 gap-3 items-end">
          <Input label="Deposit required (£)" type="number" min="0" step="0.01" placeholder="None"
            value={form.deposit_amount} onChange={e => set('deposit_amount', e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-2">
            <input type="checkbox" className="rounded" checked={form.deposit_paid === 'yes'}
              disabled={!form.deposit_amount.trim()}
              onChange={e => set('deposit_paid', e.target.checked ? 'yes' : 'no')} />
            Deposit paid
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Operations</h2>
        <div className="space-y-2">
          {project.check_out_at && (
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-medium text-orange-800 flex items-center gap-1"><LogOut size={12} />Kit checked out</p>
                <p className="text-xs text-orange-600">{new Date(project.check_out_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
              <button type="button" className="text-xs text-orange-500 hover:text-orange-700 underline cursor-pointer"
                onClick={() => { void onSave({ check_out_at: null }).catch(() => {}) }}>Undo</button>
            </div>
          )}
          {project.check_in_at && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-medium text-green-800 flex items-center gap-1"><LogIn size={12} />Kit checked in</p>
                <p className="text-xs text-green-600">{new Date(project.check_in_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
              <button type="button" className="text-xs text-green-500 hover:text-green-700 underline cursor-pointer"
                onClick={() => { void onSave({ check_in_at: null }).catch(() => {}) }}>Undo</button>
            </div>
          )}
          {!project.check_out_at && !project.check_in_at && (
            <p className="text-xs text-gray-400">Check-out and check-in are recorded from the progress bar at the top.</p>
          )}
        </div>
        <Textarea label="Damage / loss notes" value={form.damage_notes} onChange={e => set('damage_notes', e.target.value)} rows={2} placeholder="Post-hire damage or missing items" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
        <Textarea label="Internal (picking list only)" value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
        <Textarea label="Client notes (shown on quote)" value={form.client_notes} onChange={e => set('client_notes', e.target.value)} rows={3} />
      </div>

    </div>
  )
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading } = useProject(id!)
  const { data: allItems = [] } = useItems()
  const { data: allPackages = [] } = usePackages()
  const { data: clients = [], refetch: refetchClients } = useClients()
  const { data: settings } = useSettings()
  const availabilityMap = useItemTypeAvailability(allItems, id!, project?.event_date ?? null, project?.collection_date ?? null)
  const updateProject = useUpdateProject()
  const saveLineItems = useSaveLineItems()
  const deleteProject = useDeleteProject()
  const checkAll = useCheckAll()
  const addLog = useAddProjectLog()
  const toast = useToast()

  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddService, setShowAddService] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  // The snapshot whose save failed; autosave waits for a further edit (or Retry).
  const [failedLines, setFailedLines] = useState<LineItemDraft[] | null>(null)
  const [mobileTab, setMobileTab] = useState<'details' | 'kit'>('kit')
  const [showOverflow, setShowOverflow] = useState(false)

  // Local editable copy of the kit list; null means "no local edits yet".
  const [localLines, setLocalLines] = useState<LineItemDraft[] | null>(null)

  const savedLines = useMemo<LineItemDraft[]>(() => (project?.line_items ?? []).map(l => ({
    project_id: l.project_id,
    item_id: l.item_id,
    package_id: l.package_id,
    description: l.description,
    line_type: l.line_type,
    category: l.category,
    quantity: l.quantity,
    days: l.days,
    unit_price: l.unit_price,
    week_price: l.week_price,
    month_price: l.month_price,
    discount_pct: l.discount_pct,
    unit_cost: l.unit_cost ?? 0,
    supplier: l.supplier ?? null,
    area: l.area ?? null,
    order_status: l.order_status ?? null,
    out_qty: l.out_qty ?? 0,
    in_qty: l.in_qty ?? 0,
    damaged_qty: l.damaged_qty ?? 0,
    return_note: l.return_note ?? null,
    sort_order: l.sort_order,
    is_component: l.is_component,
    parent_line_id: l.parent_line_id,
  })), [project?.line_items])

  const lines: LineItemDraft[] = localLines ?? savedLines
  const hasUnsavedLines = localLines !== null
  const unsaved = useUnsavedChanges(hasUnsavedLines)

  const updateLine = <K extends keyof LineItemDraft>(idx: number, field: K, value: LineItemDraft[K]) => {
    setLocalLines(prev => {
      const base = prev ?? lines
      return base.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    })
  }

  const removeLine = (idx: number) => {
    setLocalLines(prev => {
      const base = prev ?? lines
      const line = base[idx]
      if (line.is_component) {
        // Just remove this component line
        return base.filter((_, i) => i !== idx)
      }
      // Remove the parent line plus any component lines that belong to it
      // Use strict matching: for items match item_id; for packages match package_id (only when non-null)
      const result: LineItemDraft[] = []
      let skipComponents = false
      for (let i = 0; i < base.length; i++) {
        if (i === idx) { skipComponents = true; continue }
        if (skipComponents && base[i].is_component) {
          const sameItem = line.item_id !== null && base[i].item_id === line.item_id
          const samePkg  = line.package_id !== null && base[i].package_id === line.package_id
          if (sameItem || samePkg) continue
        }
        skipComponents = false
        result.push(base[i])
      }
      return result
    })
  }

  const cloneLine = (idx: number) => {
    setLocalLines(prev => {
      const base = prev ?? lines
      const line = base[idx]
      // Collect line + its component children
      const toClone: LineItemDraft[] = [line]
      for (let i = idx + 1; i < base.length; i++) {
        if (base[i].is_component && base[i].item_id === line.item_id) toClone.push(base[i])
        else break
      }
      const clones = toClone.map(l => ({ ...l, sort_order: base.length + toClone.indexOf(l) }))
      return [...base, ...clones]
    })
  }

  const append = (build: (base: LineItemDraft[]) => LineItemDraft[]) =>
    setLocalLines(prev => { const base = prev ?? lines; return [...base, ...build(base)] })

  const addItem = (item: Item, qty: number, days: number) => {
    append(base => buildItemLines(item, qty, days, id!, base.length))
    setShowAddItem(false)
  }

  const addPackage = (pkg: Package, qty: number, days: number) => {
    append(base => buildPackageLines(pkg, qty, days, id!, base.length))
    setShowAddItem(false)
  }

  const addService = (description: string, qty: number, days: number, price: number, cost: number) => {
    append(base => [buildServiceLine(description, qty, days, price, cost, id!, base.length)])
    setShowAddService(false)
  }

  const { mutateAsync: persistLines } = saveLineItems

  // Saves one snapshot. Edits made while the request is in flight are kept:
  // local state is only cleared if it is still the snapshot that was written.
  const saveLines = useCallback(async (snapshot: LineItemDraft[]): Promise<boolean> => {
    setSaving(true)
    setFailedLines(null)
    try {
      await persistLines({ projectId: id!, lineItems: snapshot })
      setLocalLines(cur => (cur === snapshot ? null : cur))
      setJustSaved(true)
      return true
    } catch (e) {
      setFailedLines(snapshot)
      toast(errorMessage(e, 'Failed to save kit list'), 'error')
      return false
    } finally {
      setSaving(false)
    }
  }, [id, persistLines, toast])

  // Kit list autosaves like the details panel does — one save model per screen.
  useEffect(() => {
    if (!localLines || saving || localLines === failedLines) return
    const timer = setTimeout(() => { void saveLines(localLines) }, KIT_AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [localLines, saving, failedLines, saveLines])

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const handleAdvance = async (action: WorkflowAction) => {
    setAdvancing(true)
    try {
      if (action.kind === 'status') {
        await updateProject.mutateAsync({ id: id!, ...action.updates })
      } else {
        // Lines must exist in the database before they can be counted out or in.
        if (localLines && !(await saveLines(localLines))) return
        await checkAll.mutateAsync({ projectId: id!, direction: action.kind === 'check_out' ? 'out' : 'in' })
      }
      // The activity log writes itself; nobody should have to type "checked out".
      addLog.mutate({ project_id: id!, message: action.label })
    } catch (e) {
      toast(errorMessage(e, 'Failed to update project'), 'error')
    } finally {
      setAdvancing(false)
    }
  }

  const handleStatusChange = async (status: ProjectStatus) => {
    try {
      await updateProject.mutateAsync({ id: id!, status })
    } catch (e) {
      toast(errorMessage(e, 'Failed to update status'), 'error')
    }
  }

  const itemsById = useMemo(() => new Map(allItems.map(i => [i.id, i])), [allItems])

  const overallDiscountPct = project?.overall_discount_pct ?? 0
  const { subtotal, linesSubtotal, overallDiscount } = calcProjectTotals(lines, overallDiscountPct)
  const vatRate = settings?.vat_enabled ? (settings.vat_rate / 100) : 0
  const vat = subtotal * vatRate
  const total = subtotal + vat

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const handleNameSave = async () => {
    if (nameValue.trim() && nameValue !== project?.name) {
      try {
        await updateProject.mutateAsync({ id: id!, name: nameValue.trim() })
      } catch (e) {
        toast(errorMessage(e, 'Failed to rename'), 'error')
      }
    }
    setEditingName(false)
  }

  const quoteExpired = project?.expiry_date && project.status === 'sent' && isPast(parseISO(project.expiry_date))

  if (isLoading || !project) return <div className="p-6 text-sm text-gray-500">Loading...</div>

  // Group visible lines by category, carrying each line's index in `lines` so the
  // render doesn't have to indexOf() its way back (which was O(n^2) per render).
  const grouped = new Map<string, { line: LineItemDraft; index: number; children: { line: LineItemDraft; index: number }[] }[]>()
  lines.forEach((line, index) => {
    if (line.is_component) return
    // Component rows follow their parent until the next top-level row.
    const children: { line: LineItemDraft; index: number }[] = []
    for (let i = index + 1; i < lines.length && lines[i].is_component; i++) {
      children.push({ line: lines[i], index: i })
    }
    const bucket = grouped.get(line.category)
    if (bucket) bucket.push({ line, index, children })
    else grouped.set(line.category, [{ line, index, children }])
  })

  const qtyByItemId = new Map<string, number>()
  for (const l of lines) {
    if (l.is_component || !l.item_id) continue
    qtyByItemId.set(l.item_id, (qtyByItemId.get(l.item_id) ?? 0) + l.quantity)
  }

  const detailsPanel = (
    <ProjectDetailsPanel project={project} clients={clients} onRefreshClients={() => refetchClients()} onSave={async updates => {
      try {
        await updateProject.mutateAsync({ id: id!, ...updates })
        toast('Details saved')
      } catch (e) {
        toast(errorMessage(e, 'Failed to save details'), 'error')
        throw e
      }
    }} />
  )

  // Opens a ready-written draft; the user only has to press send.
  const sendEmail = (kind: EmailKind) => {
    const draft = buildEmail(kind, project, settings, total)
    window.open(composeUrl(draft, settings?.email_via ?? 'gmail'), '_blank', 'noopener')
    addLog.mutate({ project_id: id!, message: `Emailed ${EMAIL_LABELS[kind].toLowerCase()} to ${draft.to || 'client'}` })
    if (kind === 'quote') {
      // Gmail can't be handed a file, so put the PDF in Downloads ready to attach.
      void generateQuotePDF(project, lines, settings)
      void updateProject.mutateAsync({
        id: id!,
        quote_sent_at: new Date().toISOString(),
        ...(project.status === 'draft' ? { status: 'sent' as ProjectStatus } : {}),
      }).catch(() => {})
    }
  }

  const progress = checkProgress(project.line_items ?? [])

  const overflowActions: { label: string; icon: typeof FileText; action: () => void; danger?: boolean; inlineOnDesktop?: boolean }[] = [
    { label: 'Quote PDF', icon: FileText, action: () => generateQuotePDF(project, lines, settings), inlineOnDesktop: true },
    { label: 'Picking list', icon: ClipboardList, action: () => generatePickingListPDF(project, lines, settings, allItems), inlineOnDesktop: true },
    { label: 'Delivery docket', icon: Truck, action: () => generateDeliveryDocketPDF(project, lines, settings) },
    { label: 'Itemised check out / in', icon: ScanLine, action: () => navigate(`/projects/${id}/check`) },
    ...(['quote', 'confirmation', 'return_reminder', 'payment_reminder'] as EmailKind[]).map(kind => (
      { label: `Email ${EMAIL_LABELS[kind].toLowerCase()}`, icon: Send, action: () => sendEmail(kind) }
    )),
    { label: 'Delete project', icon: Trash2, action: () => setConfirmDelete(true), danger: true },
  ]

  const hireDays = defaultHireDays(project.event_date, project.collection_date)
  const goBack = () => {
    // idx > 0 means there is an in-app page to return to; otherwise fall back to the list.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate('/projects')
  }

  return (
    <div className="p-3 md:p-6 max-w-5xl">
      {quoteExpired && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          Quote expired on {format(parseISO(project.expiry_date!), 'd MMM yyyy')} — consider re-sending with a new expiry date
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {/* Go back to wherever the user came from (filtered list, calendar, dashboard). */}
          <button type="button" aria-label="Back" onClick={goBack}
            className="text-gray-400 hover:text-gray-600 shrink-0 cursor-pointer"><ArrowLeft size={20} /></button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {editingName ? (
                <input
                  autoFocus
                  className="text-xl md:text-2xl font-bold text-gray-900 border-b-2 border-gray-900 bg-transparent outline-none w-60 md:w-80"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false) }}
                />
              ) : (
                <h1
                  className="text-xl md:text-2xl font-bold text-gray-900 cursor-pointer hover:text-gray-600 truncate"
                  onClick={() => { setNameValue(project.name); setEditingName(true) }}
                  title="Click to edit"
                >{project.name}</h1>
              )}
              <StatusBadge status={project.status} />
            </div>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5 truncate">
              {project.project_number}
              {project.client && (
                <>
                  {' · '}
                  <Link to={`/clients?client=${project.client.id}`} className="hover:text-gray-900 hover:underline">
                    {project.client.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Actions: the two everyday documents inline on desktop, everything else in one menu */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" className="hidden md:inline-flex" onClick={() => generateQuotePDF(project, lines, settings)}>
            <FileText size={15} />Quote PDF
          </Button>
          <Button variant="secondary" size="sm" className="hidden md:inline-flex" onClick={() => generatePickingListPDF(project, lines, settings, allItems)}>
            <ClipboardList size={15} />Picking list
          </Button>
          <div className="relative">
            <button type="button" onClick={() => setShowOverflow(v => !v)}
              aria-label="More actions" aria-haspopup="menu" aria-expanded={showOverflow}
              className="p-2 md:p-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 cursor-pointer">
              <MoreVertical size={18} />
            </button>
            {showOverflow && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowOverflow(false)} />
                <div role="menu" className="absolute right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {overflowActions.map(({ label, icon: Icon, action, danger, inlineOnDesktop }) => (
                    <button key={label} role="menuitem" onClick={() => { action(); setShowOverflow(false) }}
                      className={`w-full items-center gap-2.5 px-4 py-2.5 text-sm text-left hover:bg-gray-50 cursor-pointer ${inlineOnDesktop ? 'flex md:hidden' : 'flex'} ${danger ? 'text-red-600 border-t border-gray-100' : 'text-gray-700'}`}>
                      <Icon size={14} className="shrink-0" />{label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ProjectWorkflow project={project} busy={advancing || updateProject.isPending}
        onAdvance={handleAdvance} onStatusChange={handleStatusChange} />

      {/* Mobile tab switcher */}
      <div className="md:hidden flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
        {(['kit', 'details'] as const).map(t => (
          <button key={t} onClick={() => setMobileTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${mobileTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'kit' ? 'Kit list' : 'Details'}
          </button>
        ))}
      </div>

      {/* Desktop: side-by-side. Mobile: tabs */}
      <div className="md:grid md:grid-cols-3 md:gap-6">
        <div className={`md:col-span-1 space-y-4 ${mobileTab === 'details' ? 'block' : 'hidden md:block'}`}>
          {detailsPanel}
          <ProjectCrewPanel projectId={id!} />
          <ProjectActivityLog projectId={id!} />
        </div>

        <div className={`md:col-span-2 space-y-4 ${mobileTab === 'kit' ? 'block' : 'hidden md:block'}`}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Kit list</h2>
                <span className="text-xs" aria-live="polite">
                  {saving ? (
                    <span className="inline-flex items-center gap-1 text-gray-400"><Loader2 size={12} className="animate-spin" />Saving…</span>
                  ) : failedLines && localLines === failedLines ? (
                    <span className="text-red-600">Not saved</span>
                  ) : hasUnsavedLines ? (
                    <span className="text-amber-600">Unsaved…</span>
                  ) : justSaved ? (
                    <span className="inline-flex items-center gap-1 text-green-600"><Check size={12} />Saved</span>
                  ) : null}
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {failedLines && localLines === failedLines && (
                  <Button size="sm" onClick={() => saveLines(failedLines)} disabled={saving}>Retry save</Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowAddService(true)}><Plus size={14} /><span className="hidden sm:inline">Service / crew</span><span className="sm:hidden">Service</span></Button>
                <Button variant="secondary" size="sm" onClick={() => setShowAddItem(true)}><Plus size={14} />Browse items</Button>
              </div>
            </div>

            <QuickAddItem
              items={allItems}
              availability={availabilityMap}
              showAvailability={!!(project.event_date || project.collection_date)}
              onAdd={item => addItem(item, 1, hireDays)}
            />

            {lines.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">No items yet — type in the box above to add kit, or add a service</p>
              </div>
            ) : (
              <div>
                {/* Desktop column headers */}
                <div className="hidden md:grid grid-cols-[1fr_60px_60px_80px_60px_70px_56px] gap-2 px-4 py-2 text-xs font-medium text-gray-400 border-b border-gray-100">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Days</span>
                  <span className="text-right">Unit £</span>
                  <span className="text-right">Disc%</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>

                {[...grouped.entries()].map(([cat, catLines]) => (
                  <div key={cat}>
                    <div className="px-4 py-1.5 bg-gray-50 border-y border-gray-100">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{cat || 'Uncategorised'}</span>
                    </div>
                    {catLines.map(({ line, index: lineIdx, children }) => {
                      const total = calcLineTotal(line)
                      const rate = lineRateBasis(line)
                      const subhireItem = line.item_id ? itemsById.get(line.item_id) : null
                      const avail = line.item_id ? availabilityMap.get(line.item_id) : undefined
                      const thisProjectQty = line.item_id ? (qtyByItemId.get(line.item_id) ?? 0) : 0
                      const effectiveAvail = avail ? avail.available + thisProjectQty : null
                      const overbooked = effectiveAvail !== null && line.quantity > effectiveAvail

                      return (
                        <div key={lineIdx} className={overbooked ? 'bg-red-50/60' : ''}>
                          {/* Desktop row */}
                          <div className={`hidden md:grid grid-cols-[1fr_60px_60px_80px_60px_70px_56px] gap-2 px-4 py-2 items-center border-b border-gray-50 hover:bg-gray-50`}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm text-gray-900 truncate">{line.description}</span>
                                {subhireItem?.is_subhire && <SubhireBadge />}
                                {overbooked && <span className="text-xs text-red-600 shrink-0">⚠ Over stock</span>}
                              </div>
                              {rate.basis !== 'day' && (
                                <span className="text-xs text-green-700" title="Charged using this item's weekly/monthly rate">
                                  {rate.label} rate
                                </span>
                              )}
                            </div>
                            <input className={`text-sm text-right border-0 bg-transparent focus:outline-none w-full ${overbooked ? 'text-red-600 font-medium' : ''}`}
                              type="number" min="1" max={effectiveAvail ?? undefined} value={line.quantity}
                              onChange={e => updateLine(lineIdx, 'quantity', parseInt(e.target.value) || 1)} />
                            <input className="text-sm text-right border-0 bg-transparent focus:outline-none w-full"
                              type="number" min="1" value={line.days}
                              onChange={e => updateLine(lineIdx, 'days', parseInt(e.target.value) || 1)} />
                            <input className="text-sm text-right border-0 bg-transparent focus:outline-none w-full"
                              type="number" min="0" step="0.01" value={line.unit_price}
                              onChange={e => updateLine(lineIdx, 'unit_price', parseFloat(e.target.value) || 0)} />
                            <input className="text-sm text-right border-0 bg-transparent focus:outline-none w-full"
                              type="number" min="0" max="100" step="0.01" value={line.discount_pct}
                              onChange={e => updateLine(lineIdx, 'discount_pct', parseFloat(e.target.value) || 0)} />
                            <span className="text-sm text-gray-900 text-right font-medium">{formatCurrency(total)}</span>
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => cloneLine(lineIdx)} className="text-gray-300 hover:text-gray-600" title="Clone"><Copy size={13} /></button>
                              <button onClick={() => removeLine(lineIdx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                            </div>
                          </div>

                          {/* Mobile card */}
                          <div className="md:hidden px-4 py-3 border-b border-gray-100">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-900">{line.description}</span>
                                {subhireItem?.is_subhire && <SubhireBadge />}
                                {overbooked && <span className="ml-1 text-xs text-red-600">⚠ Over stock</span>}
                                {rate.basis !== 'day' && (
                                  <span className="block text-xs text-green-700">{rate.label} rate</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => cloneLine(lineIdx)} className="text-gray-300 hover:text-gray-600 p-1"><Copy size={13} /></button>
                                <button onClick={() => removeLine(lineIdx)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              <div>
                                <label className="text-xs text-gray-400 block">Qty</label>
                                <input className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-center"
                                  type="number" min="1" value={line.quantity}
                                  onChange={e => updateLine(lineIdx, 'quantity', parseInt(e.target.value) || 1)} />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block">Days</label>
                                <input className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-center"
                                  type="number" min="1" value={line.days}
                                  onChange={e => updateLine(lineIdx, 'days', parseInt(e.target.value) || 1)} />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block">Price £</label>
                                <input className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-center"
                                  type="number" min="0" step="0.01" value={line.unit_price}
                                  onChange={e => updateLine(lineIdx, 'unit_price', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block">Total</label>
                                <p className="text-sm font-medium text-gray-900 py-1">{formatCurrency(total)}</p>
                              </div>
                            </div>
                          </div>

                          {/* Component sub-lines */}
                          {children.map(({ line: child, index: ci }) => {
                            return (
                              <div key={ci} className="hidden md:grid grid-cols-[1fr_60px_60px_80px_60px_70px_56px] gap-2 px-4 py-1 items-center border-b border-gray-50 bg-gray-50/50">
                                <span className="text-xs text-gray-400 pl-4">{child.description}</span>
                                <span className="text-xs text-gray-400 text-right">{child.quantity}</span>
                                <span className="text-xs text-gray-400 text-right">{child.days}</span>
                                <span className="text-xs text-gray-400 text-right">—</span>
                                <span className="text-xs text-gray-400 text-right">—</span>
                                <span className="text-xs text-gray-400 text-right">£0.00</span>
                                <span />
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-gray-200 px-4 py-3 space-y-1">
              {overallDiscountPct > 0 && (
                <>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Lines subtotal</span><span>{formatCurrency(linesSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Overall discount ({overallDiscountPct}%)</span><span>−{formatCurrency(overallDiscount)}</span>
                  </div>
                </>
              )}
              {settings?.vat_enabled && (
                <>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>VAT ({settings.vat_rate}%)</span><span>{formatCurrency(vat)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-100">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
              {project.deposit_amount && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Deposit {project.deposit_paid ? '✓ paid' : '(required)'}</span>
                  <span>{formatCurrency(project.deposit_amount)}</span>
                </div>
              )}
            </div>
          </div>

          {progress.total > 0 && (project.check_out_at || progress.out > 0) && (
            <Link to={`/projects/${id}/check`}
              className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm hover:border-gray-400 transition-colors">
              <span className="flex items-center gap-2 text-gray-700"><ScanLine size={15} />Kit movement</span>
              <span className="text-gray-500 tabular-nums">
                {progress.out}/{progress.total} out · {progress.back}/{progress.total} back
                {progress.damaged > 0 && <span className="text-red-600"> · {progress.damaged} damaged</span>}
              </span>
            </Link>
          )}

          <ProjectMoney
            project={project}
            lines={lines}
            settings={settings}
            onLineChange={updateLine}
            onEmail={sendEmail}
            onSave={async updates => {
              try {
                await updateProject.mutateAsync({ id: id!, ...updates })
              } catch (e) {
                toast(errorMessage(e, 'Failed to save'), 'error')
                throw e
              }
            }}
          />
        </div>
      </div>{/* end desktop grid */}

      {/* Add item modal */}
      <AddItemModal
        open={showAddItem}
        onClose={() => setShowAddItem(false)}
        items={allItems}
        packages={allPackages}
        onAddItems={(items) => items.forEach(({item, qty, days}) => addItem(item, qty, days))}
        onAddPackage={addPackage}
        projectId={id!}
        eventDate={project.event_date}
        collectionDate={project.collection_date}
      />

      {/* Add service modal */}
      <AddServiceModal open={showAddService} onClose={() => setShowAddService(false)} onAdd={addService} />

      {/* Confirm delete */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete project" size="sm" closeOnBackdrop={false}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Delete <strong>{project.name}</strong>? All kit list data will be lost. Cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" disabled={deleteProject.isPending} onClick={async () => {
              try {
                await deleteProject.mutateAsync(id!)
                // The project is gone; don't challenge the redirect over its kit list.
                unsaved.allowNext()
                setLocalLines(null)
                navigate('/projects', { replace: true })
              } catch (e) {
                toast(errorMessage(e, 'Failed to delete project'), 'error')
              }
            }}>{deleteProject.isPending ? 'Deleting…' : 'Delete'}</Button>
          </div>
        </div>
      </Modal>

      {/* Navigating away with an unedited kit list used to lose the work silently */}
      <Modal open={unsaved.isBlocked} onClose={unsaved.stay} title="Unsaved kit list" size="sm" closeOnBackdrop={false}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            The latest kit list changes haven't been saved yet.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={unsaved.stay}>Keep editing</Button>
            <Button variant="secondary" onClick={() => { setLocalLines(null); unsaved.discard() }}>
              Discard
            </Button>
            <Button disabled={saving} onClick={async () => {
              if (!localLines || await saveLines(localLines)) unsaved.discard()
              else unsaved.stay()
            }}>
              {saving ? 'Saving…' : 'Save and leave'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function AddItemModal({ open, onClose, items, packages, onAddItems, onAddPackage, projectId, eventDate, collectionDate }: {
  open: boolean; onClose: () => void
  items: Item[]; packages: Package[]
  onAddItems: (items: { item: Item; qty: number; days: number }[]) => void
  onAddPackage: (pkg: Package, qty: number, days: number) => void
  projectId: string
  eventDate: string | null
  collectionDate: string | null
}) {
  const [tab, setTab] = useState<'items' | 'packages'>('items')
  const [search, setSearch] = useState('')
  const [selectedItems, setSelectedItems] = useState<Map<string, { qty: number; days: number }>>(new Map())
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
  const [pkgQty, setPkgQty] = useState(1)
  const [pkgDays, setPkgDays] = useState(1)

  const defaultDays = defaultHireDays(eventDate, collectionDate)

  const filteredItems = items.filter(i =>
    !i.out_of_service &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.item_id.toLowerCase().includes(search.toLowerCase()))
  )
  const filteredPkgs = packages.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const conflictItemIds = Array.from(selectedItems.keys())
  const { data: conflicts = [] } = useItemConflicts(conflictItemIds, projectId, eventDate, collectionDate)
  const availabilityMap = useItemTypeAvailability(items, projectId, eventDate, collectionDate)

  const toggleItem = (item: Item) => {
    setSelectedItems(prev => {
      const next = new Map(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        const avail = availabilityMap.get(item.id)
        const maxQty = avail ? avail.max : 1
        if (maxQty === 0) return prev // blocked — zero available
        next.set(item.id, { qty: 1, days: defaultDays })
      }
      return next
    })
  }

  const updateItemField = (id: string, field: 'qty' | 'days', val: number) => {
    setSelectedItems(prev => {
      const next = new Map(prev)
      const cur = next.get(id)
      if (!cur) return prev
      if (field === 'qty') {
        const avail = availabilityMap.get(id)
        const max = avail ? avail.max : 9999
        val = Math.min(val, max)
      }
      next.set(id, { ...cur, [field]: val })
      return next
    })
  }

  const handleAdd = () => {
    if (tab === 'items') {
      const toAdd = Array.from(selectedItems.entries())
        .map(([id, { qty, days }]) => ({ item: items.find(i => i.id === id)!, qty, days }))
        .filter(x => x.item)
      onAddItems(toAdd)
      setSelectedItems(new Map())
    } else if (selectedPkg) {
      onAddPackage(selectedPkg, pkgQty, pkgDays)
      setSelectedPkg(null)
    }
    setSearch('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to kit list" size="xl">
      <div className="space-y-4">
        <div className="flex gap-2 items-center">
          {(['items', 'packages'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedItems(new Map()); setSelectedPkg(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t}
            </button>
          ))}
          {tab === 'items' && selectedItems.size > 0 && (
            <span className="ml-auto text-xs text-gray-500">{selectedItems.size} selected</span>
          )}
        </div>
        <input className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
          placeholder={`Search ${tab}...`} value={search} onChange={e => setSearch(e.target.value)} />

        {tab === 'items' ? (
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            {filteredItems.map(item => {
              const sel = selectedItems.get(item.id)
              const avail = availabilityMap.get(item.id)
              const isUnavailable = !!avail && avail.available === 0 && !sel
              return (
                <div key={item.id} className={`border-b border-gray-100 last:border-0 ${sel ? 'bg-blue-50' : isUnavailable ? 'bg-red-50/40 opacity-60' : ''}`}>
                  <div
                    onClick={() => !isUnavailable && toggleItem(item)}
                    className={`flex items-center gap-3 px-3 py-2.5 ${isUnavailable ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                  >
                    <input type="checkbox" checked={!!sel} onChange={() => {}} disabled={isUnavailable} className="rounded shrink-0" />
                    <span className="font-mono text-xs text-gray-400 w-28 shrink-0">{item.item_id}</span>
                    <span className="text-sm flex-1">{item.name}</span>
                    {item.is_subhire && <SubhireBadge />}
                    {avail && (eventDate || collectionDate) && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        avail.available === 0 ? 'bg-red-100 text-red-700' :
                        avail.available <= 1 ? 'bg-orange-100 text-orange-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {avail.available}/{avail.total} avail
                      </span>
                    )}
                    <span className="text-sm text-gray-500 shrink-0">{formatCurrency(item.day_price)}/day</span>
                  </div>
                  {sel && (
                    <div className="flex gap-3 px-10 pb-2 items-center">
                      <label className="text-xs text-gray-500">Qty</label>
                      <input
                        type="number" min="1" max={avail?.max ?? 99} value={sel.qty}
                        onChange={e => updateItemField(item.id, 'qty', parseInt(e.target.value) || 1)}
                        className="w-16 text-sm border border-gray-300 rounded px-2 py-1"
                      />
                      {avail && sel.qty > avail.max && (
                        <span className="text-xs text-red-600">⚠ Exceeds stock</span>
                      )}
                      <label className="text-xs text-gray-500">Days</label>
                      <input type="number" min="1" value={sel.days}
                        onChange={e => updateItemField(item.id, 'days', parseInt(e.target.value) || 1)}
                        className="w-16 text-sm border border-gray-300 rounded px-2 py-1" />
                    </div>
                  )}
                </div>
              )
            })}
            {filteredItems.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No items found</p>}
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            {filteredPkgs.map(pkg => (
              <button key={pkg.id} onClick={() => setSelectedPkg(pkg)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-100 last:border-0 ${selectedPkg?.id === pkg.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                <span className={`font-mono text-xs ${selectedPkg?.id === pkg.id ? 'text-gray-300' : 'text-gray-400'}`}>{pkg.package_id}</span>
                <span className="text-sm flex-1">{pkg.name}</span>
                <span className={`text-sm ${selectedPkg?.id === pkg.id ? 'text-gray-200' : 'text-gray-500'}`}>{formatCurrency(pkg.day_price)}/day</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'packages' && selectedPkg && (
          <div className="flex gap-4">
            <Input label="Qty" type="number" min="1" value={pkgQty} onChange={e => setPkgQty(parseInt(e.target.value) || 1)} className="w-24" />
            <Input label="Days" type="number" min="1" value={pkgDays} onChange={e => setPkgDays(parseInt(e.target.value) || 1)} className="w-24" />
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-0.5">
            <p className="text-xs font-semibold text-red-700">Booking conflict on selected dates:</p>
            {conflicts.slice(0, 3).map((c, i) => (
              <p key={i} className="text-xs text-red-600">{items.find(x => x.id === c.item_id)?.item_id} — already on <strong>{c.project_name}</strong></p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd} disabled={tab === 'items' ? selectedItems.size === 0 : !selectedPkg}>
            {tab === 'items' && selectedItems.size > 0 ? `Add ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''}` : tab === 'packages' && selectedPkg ? 'Add package' : 'Add'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ProjectCrewPanel({ projectId }: { projectId: string }) {
  const { data: crew = [] } = useProjectCrew(projectId)
  const addMember = useAddCrewMember()
  const removeMember = useRemoveCrewMember()
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  const handleAdd = async () => {
    const n = name.trim()
    if (!n) return
    await addMember.mutateAsync({ project_id: projectId, name: n, role: role.trim() || null })
    setName('')
    setRole('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Users size={14} />Crew</h2>
      {crew.length > 0 && (
        <div className="space-y-1">
          {crew.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 font-medium text-gray-800">{m.name}</span>
              {m.role && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{m.role}</span>}
              <button onClick={() => removeMember.mutateAsync({ id: m.id, project_id: projectId })}
                className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
          onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role"
          className="w-28 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
          onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <button onClick={handleAdd} disabled={!name.trim() || addMember.isPending}
          className="px-2 py-1 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50">
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

function ProjectActivityLog({ projectId }: { projectId: string }) {
  const { data: logs = [] } = useProjectLogs(projectId)
  const addLog = useAddProjectLog()
  const deleteLog = useDeleteProjectLog()
  const [message, setMessage] = useState('')

  const handleAdd = async () => {
    const m = message.trim()
    if (!m) return
    await addLog.mutateAsync({ project_id: projectId, message: m })
    setMessage('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><MessageSquare size={14} />Activity log</h2>
      {logs.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-2 text-xs">
              <span className="text-gray-400 shrink-0 tabular-nums pt-0.5">{format(new Date(log.created_at), 'd MMM HH:mm')}</span>
              <span className="flex-1 text-gray-700">
                {log.message}
                {log.author && (
                  <span className="text-gray-400"> — {log.author.full_name || log.author.email}</span>
                )}
              </span>
              <button onClick={() => deleteLog.mutateAsync({ id: log.id, project_id: projectId })}
                className="text-gray-300 hover:text-red-500 shrink-0 pt-0.5"><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      )}
      {logs.length === 0 && <p className="text-xs text-gray-400">No log entries yet</p>}
      <div className="flex gap-1.5">
        <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Add note…"
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
          onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <button onClick={handleAdd} disabled={!message.trim() || addLog.isPending}
          className="px-3 py-1 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50">Add</button>
      </div>
    </div>
  )
}

function AddServiceModal({ open, onClose, onAdd }: {
  open: boolean; onClose: () => void
  onAdd: (description: string, qty: number, days: number, price: number, cost: number) => void
}) {
  const [description, setDescription] = useState('')
  const [qty, setQty] = useState(1)
  const [days, setDays] = useState(1)
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')

  const COMMON = ['Sound Engineer', 'Crew for rig', 'Crew for derig', 'Delivery', 'Collection', 'Van hire']

  return (
    <Modal open={open} onClose={onClose} title="Add service / crew" size="sm">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {COMMON.map(s => (
            <button key={s} onClick={() => setDescription(s)}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700">{s}</button>
          ))}
        </div>
        <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} required />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Qty" type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} />
          <Input label="Days/units" type="number" min="1" value={days} onChange={e => setDays(parseInt(e.target.value) || 1)} />
          <Input label="Price (£)" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
        </div>
        <Input label="Our cost per unit (£)" type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
          hint="What we pay — used for the job's margin, never shown to the client" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onAdd(description, qty, days, parseFloat(price) || 0, parseFloat(cost) || 0); setDescription(''); setPrice(''); setCost(''); onClose() }} disabled={!description}>Add</Button>
        </div>
      </div>
    </Modal>
  )
}
