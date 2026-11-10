import { useState, useMemo, useCallback } from 'react'
import { Plus, Search, ChevronDown, ChevronRight, Pencil, Trash2, AlertTriangle, Copy, Download, Upload, AlertCircle, ClipboardList } from 'lucide-react'
import { useItemLogs, useAddItemLog, useDeleteItemLog } from '../hooks/useItemLogs'
import { itemsToCSV, downloadCSV } from '../lib/csv'
import { CSVImport } from '../components/inventory/CSVImport'
import { CategoryManager } from '../components/inventory/CategoryManager'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../lib/toast-context'
import { useItems, useCreateItem, useUpdateItem, useDeleteItem, useSaveComponents, useCategories } from '../hooks/useItems'
import { usePackages, useCreatePackage, useUpdatePackage, useDeletePackage } from '../hooks/usePackages'
import { useProjectsWithLines } from '../hooks/useProjects'
import { useItemTypeAvailability } from '../hooks/useAvailability'
import type { Item, Package, ItemComponent, PackageItem } from '../types'
import { errorMessage } from '../lib/errors'

type NewItem = Omit<Item, 'id' | 'created_at' | 'category' | 'components'>
type NewComponent = Omit<ItemComponent, 'id' | 'item_id'>
type NewPackage = Omit<Package, 'id' | 'created_at' | 'category' | 'package_items'>
type NewPackageItem = Omit<PackageItem, 'id' | 'package_id' | 'item'>
import { StatusBadge } from '../components/shared/Badge'
import { format, parseISO } from 'date-fns'
import { Button } from '../components/shared/Button'
import { Modal } from '../components/shared/Modal'
import { ItemForm } from '../components/inventory/ItemForm'
import { SubhireBadge, OutOfServiceBadge } from '../components/shared/Badge'
import { formatCurrency } from '../lib/utils'
import { generateItemCode, formatItemId } from '../lib/generateId'
import { Input, Textarea } from '../components/shared/Input'
import { Select } from '../components/shared/Select'

// ─── Bulk add modal ───────────────────────────────────────────────────────────

function BulkAddModal({ open, onClose, items }: { open: boolean; onClose: () => void; items: Item[] }) {
  const { data: categories = [] } = useCategories()
  const createItem = useCreateItem()
  const saveComponents = useSaveComponents()
  const toast = useToast()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const existingIds = items.map(i => i.item_id)
  const existingByName = new Map(items.map(i => [i.name.toLowerCase(), i]))

  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Generate IDs, preventing duplicates both with existing items AND within this batch
  const preview = rawLines.reduce<{ name: string; id: string; match: Item | undefined }[]>((acc, name) => {
    const match = existingByName.get(name.toLowerCase())
    const code = generateItemCode(name)
    const takenIds = new Set([...existingIds, ...acc.map(p => p.id)])
    let counter = 1
    while (takenIds.has(formatItemId(code, counter))) counter++
    acc.push({ name, id: formatItemId(code, counter), match })
    return acc
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const p of preview) {
        const base = p.match
        const created = await createItem.mutateAsync({
          item_id: p.id,
          name: p.name,
          category_id: base?.category_id || categories[0]?.id || '',
          serial_number: null,
          day_price: base?.day_price ?? 0,
          week_price: base?.week_price ?? null,
          month_price: base?.month_price ?? null,
          purchase_price: null,
          replacement_value: null,
          out_of_service: false,
          out_of_service_reason: null,
          is_subhire: base?.is_subhire ?? false,
          subhire_owner: base?.subhire_owner ?? null,
          notes: null,
        })
        if (base?.components?.length) {
          await saveComponents.mutateAsync({
            itemId: created.id,
            components: base.components.map(c => ({ name: c.name, quantity: c.quantity })),
          })
        }
      }
      toast(`Added ${preview.length} item${preview.length !== 1 ? 's' : ''}`)
      setText('')
      onClose()
    } catch (e) {
      toast(errorMessage(e, 'Bulk add failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk add items" size="lg">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Item names — one per line</label>
          <textarea
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
            rows={6}
            placeholder={"Pioneer CDJ3000\nPioneer DJM900NXS2\nMartin Audio XP12"}
            value={text}
            onChange={e => setText(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-gray-400 mt-1">If a name matches an existing item, its category and pricing will be copied automatically.</p>
        </div>
        {preview.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_1fr] gap-0 text-xs font-medium text-gray-400 px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span>Name</span><span>ID</span><span>Based on</span>
            </div>
            {preview.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_1fr] gap-0 px-3 py-2 border-b border-gray-100 last:border-0 text-sm items-center">
                <span className="text-gray-900">{p.name}</span>
                <span className="font-mono text-xs text-gray-500">{p.id}</span>
                <span className="text-xs text-gray-400">{p.match ? `↳ ${p.match.item_id}` : 'New — set pricing after'}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={preview.length === 0 || saving}>
            {saving ? 'Adding…' : `Add ${preview.length} item${preview.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ItemMaintenanceLog({ itemId }: { itemId: string }) {
  const { data: logs = [] } = useItemLogs(itemId)
  const addLog = useAddItemLog()
  const deleteLog = useDeleteItemLog()
  const [note, setNote] = useState('')

  const handleAdd = async () => {
    const trimmed = note.trim()
    if (!trimmed) return
    await addLog.mutateAsync({ item_id: itemId, note: trimmed })
    setNote('')
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1"><ClipboardList size={12} />Maintenance log</p>
      <div className="space-y-1 mb-2">
        {logs.map(log => (
          <div key={log.id} className="flex items-start gap-2 text-xs bg-white border border-gray-200 rounded px-2 py-1.5">
            <span className="text-gray-400 shrink-0 tabular-nums">{format(new Date(log.created_at), 'd MMM yy')}</span>
            <span className="flex-1 text-gray-700">
              {log.note}
              {log.author && (
                <span className="text-gray-400"> — {log.author.full_name || log.author.email}</span>
              )}
            </span>
            <button onClick={() => deleteLog.mutateAsync({ id: log.id, item_id: itemId })}
              className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={10} /></button>
          </div>
        ))}
        {logs.length === 0 && <p className="text-xs text-gray-400">No entries yet</p>}
      </div>
      <div className="flex gap-1.5">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add log entry…"
          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <button onClick={handleAdd} disabled={!note.trim() || addLog.isPending}
          className="px-2 py-1 text-xs bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50">Add</button>
      </div>
    </div>
  )
}

// ─── Items tab ───────────────────────────────────────────────────────────────

function ItemsTab({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
  const { data: items = [], isLoading } = useItems()
  const { data: allProjects = [] } = useProjectsWithLines()
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const saveComponents = useSaveComponents()
  const navigate = useNavigate()

  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null)

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.item_id.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce<Record<string, Item[]>>((acc, item) => {
    const cat = item.category?.name || 'Uncategorised'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const toast = useToast()

  const toggleExpanded = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const existingIds = items.map(i => i.item_id)

  const handleSave = async (itemData: NewItem, components: NewComponent[]) => {
    try {
      if (editing) {
        await updateItem.mutateAsync({ id: editing.id, ...itemData })
        await saveComponents.mutateAsync({ itemId: editing.id, components })
        setEditing(null)
        toast('Item updated')
      } else {
        const created = await createItem.mutateAsync(itemData)
        await saveComponents.mutateAsync({ itemId: created.id, components })
        setShowForm(false)
        toast('Item added')
      }
    } catch (e) {
      toast(errorMessage(e, 'Save failed'), 'error')
    }
  }

  const handleDuplicate = async (item: Item) => {
    try {
    const code = item.item_id.replace(/-\d+$/, '')
    let counter = 1
    while (existingIds.includes(formatItemId(code, counter))) counter++
    const newId = formatItemId(code, counter)

    const created = await createItem.mutateAsync({
      item_id: newId,
      name: item.name,
      category_id: item.category_id,
      serial_number: null, purchase_price: null, replacement_value: null, out_of_service: false, out_of_service_reason: null,
      day_price: item.day_price,
      week_price: item.week_price,
      month_price: item.month_price,
      is_subhire: item.is_subhire,
      subhire_owner: item.subhire_owner,
      notes: item.notes,
    })
    if (item.components?.length) {
      await saveComponents.mutateAsync({
        itemId: created.id,
        components: item.components.map(c => ({ name: c.name, quantity: c.quantity })),
      })
    }
    toast('Item duplicated')
    } catch (e) {
      toast(errorMessage(e, 'Duplicate failed'), 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="search"
            aria-label="Search items"
            className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg w-full sm:w-72 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Search items or IDs..."
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setShowBulk(true)}><Plus size={16} />Bulk add</Button>
          <Button onClick={() => setShowForm(true)}><Plus size={16} />Add item</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat}</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {catItems.map((item, idx) => (
                  <div key={item.id} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                      <button onClick={() => toggleExpanded(item.id)} className="text-gray-400 hover:text-gray-600 shrink-0">
                        {expanded.has(item.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <span className="font-mono text-xs text-gray-400 w-28 shrink-0">{item.item_id}</span>
                      <span className="font-medium text-gray-900 flex-1">{item.name}</span>
                      {item.is_subhire && <SubhireBadge />}
                      {item.out_of_service && <OutOfServiceBadge reason={item.out_of_service_reason} />}
                      {item.serial_number && (
                        <span className="text-xs text-gray-400 font-mono">{item.serial_number}</span>
                      )}
                      <span className="text-sm text-gray-600 w-24 text-right">
                        {formatCurrency(item.day_price)}<span className="text-gray-400">/day</span>
                      </span>
                      <div className="flex gap-1 ml-2">
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicate(item)} title="Duplicate item"><Copy size={14} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(item)}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(item)}><Trash2 size={14} /></Button>
                      </div>
                    </div>

                    {expanded.has(item.id) && (
                      <div className="px-14 py-3 bg-gray-50 border-t border-gray-100 space-y-3">
                        {item.is_subhire && item.subhire_owner && (
                          <div>
                            <p className="text-xs font-medium text-orange-700 mb-0.5">Subhire owner</p>
                            <p className="text-xs text-gray-600">{item.subhire_owner}</p>
                          </div>
                        )}
                        {item.notes && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-0.5">Internal notes</p>
                            <p className="text-xs text-gray-600">{item.notes}</p>
                          </div>
                        )}
                        {(item.components?.length || 0) > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-1">Components</p>
                            <div className="flex flex-wrap gap-2">
                              {item.components!.map(c => (
                                <span key={c.id} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5">
                                  {c.quantity > 1 ? `${c.quantity}× ` : ''}{c.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(item.week_price || item.month_price) && (
                          <div className="flex gap-4">
                            {item.week_price && <span className="text-xs text-gray-500">{formatCurrency(item.week_price)}/week</span>}
                            {item.month_price && <span className="text-xs text-gray-500">{formatCurrency(item.month_price)}/month</span>}
                          </div>
                        )}
                        <ItemMaintenanceLog itemId={item.id} />

                        {/* Bookings for this item */}
                        {(() => {
                          const bookings = allProjects.filter(p =>
                            p.line_items?.some(l => l.item_id === item.id)
                          )
                          const upcoming = bookings
                            .filter(p => p.status !== 'completed' && (p.event_date || p.collection_date))
                            .sort((a, b) => (a.event_date || '') > (b.event_date || '') ? 1 : -1)
                          if (!upcoming.length) return null
                          return (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">On projects</p>
                              <div className="space-y-1">
                                {upcoming.map(p => (
                                  <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                                    className="w-full flex items-center gap-2 text-xs bg-white border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 text-left">
                                    <StatusBadge status={p.status} />
                                    <span className="flex-1 font-medium text-gray-700 truncate">{p.name}</span>
                                    {p.event_date && (
                                      <span className="text-gray-400 shrink-0">{format(parseISO(p.event_date), 'd MMM yy')}</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">{search ? 'No items match your search' : 'No items yet — add your first item'}</p>
            </div>
          )}
        </div>
      )}

      <BulkAddModal open={showBulk} onClose={() => setShowBulk(false)} items={items} />

      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null) }}
        title={editing ? `Edit: ${editing.name}` : 'Add inventory item'} size="lg">
        <ItemForm
          initial={editing || undefined}
          existingIds={existingIds}
          existingItems={editing ? [] : items}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete item" size="sm">
        <div className="space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              Delete <strong>{confirmDelete?.name}</strong>? This will remove all its physical units and components. Cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { await deleteItem.mutateAsync(confirmDelete!.id); setConfirmDelete(null) }}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Packages tab ────────────────────────────────────────────────────────────

function PackageForm({ initial, onSave, onCancel, existingIds = [] }: {
  initial?: Package
  onSave: (pkg: NewPackage, items: NewPackageItem[]) => void
  onCancel: () => void
  existingIds?: string[]
}) {
  const { data: allItems = [] } = useItems()
  const { data: categories = [] } = useCategories()
  const [name, setName] = useState(initial?.name || '')
  const [manualPkgId, setManualPkgId] = useState(initial?.package_id || '')
  const [categoryId, setCategoryId] = useState(initial?.category_id || '')
  const [manualDayPrice, setManualDayPrice] = useState(String(initial?.day_price || ''))
  const [weekPrice, setWeekPrice] = useState(String(initial?.week_price || ''))
  const [monthPrice, setMonthPrice] = useState(String(initial?.month_price || ''))
  const [priceOverridden, setPriceOverridden] = useState(!!initial)
  const [notes, setNotes] = useState(initial?.notes || '')
  const [pkgItems, setPkgItems] = useState<{ item_id: string; quantity: number }[]>(
    initial?.package_items?.map(pi => ({ item_id: pi.item_id, quantity: pi.quantity })) || []
  )
  const [idEdited, setIdEdited] = useState(!!initial)

  // Both of these are derived during render. Mirroring them into state via an
  // effect meant an extra render pass and a window where the two disagreed.
  const itemsSum = useMemo(() => pkgItems.reduce((acc, pi) => {
    const item = allItems.find(i => i.id === pi.item_id)
    return acc + (item?.day_price || 0) * pi.quantity
  }, 0), [pkgItems, allItems])

  const dayPrice = priceOverridden || itemsSum === 0 ? manualDayPrice : itemsSum.toFixed(2)

  const pkgId = useMemo(() => {
    if (idEdited || initial || !name.trim()) return manualPkgId
    const code = generateItemCode(name)
    let counter = 1
    while (existingIds.includes(formatItemId(code, counter))) counter++
    return formatItemId(code, counter)
  }, [name, manualPkgId, idEdited, initial, existingIds])

  return (
    <form onSubmit={e => {
      e.preventDefault()
      onSave({
        package_id: pkgId, name, category_id: categoryId,
        day_price: parseFloat(dayPrice) || 0,
        week_price: weekPrice ? parseFloat(weekPrice) : null,
        month_price: monthPrice ? parseFloat(monthPrice) : null,
        notes: notes || null,
      }, pkgItems.filter(p => p.item_id))
    }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Package name *" value={name} onChange={e => setName(e.target.value)} required />
        <Input label="Package ID *" value={pkgId} onChange={e => { setManualPkgId(e.target.value.toUpperCase()); setIdEdited(true) }} required className="font-mono" />
      </div>
      <Select label="Category" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
        <option value="">Select category</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Input label={priceOverridden ? 'Day price (£)' : 'Day price (£) — auto from items'} type="number" step="0.01" min="0" value={dayPrice}
            onChange={e => { setManualDayPrice(e.target.value); setPriceOverridden(true) }}
            className={!priceOverridden ? 'border-blue-300 bg-blue-50' : ''} />
          {priceOverridden && <button type="button" className="text-xs text-blue-500 hover:underline mt-0.5" onClick={() => setPriceOverridden(false)}>Reset to auto</button>}
        </div>
        <Input label="Week price (£)" type="number" step="0.01" min="0" value={weekPrice} onChange={e => setWeekPrice(e.target.value)} placeholder="Optional" />
        <Input label="Month price (£)" type="number" step="0.01" min="0" value={monthPrice} onChange={e => setMonthPrice(e.target.value)} placeholder="Optional" />
      </div>
      <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Items in package</label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPkgItems(p => [...p, { item_id: '', quantity: 1 }])}>
            <Plus size={14} />Add item
          </Button>
        </div>
        <div className="space-y-2">
          {pkgItems.map((pi, i) => {
            const usedIds = new Set(pkgItems.map((x, j) => j !== i ? x.item_id : '').filter(Boolean))
            return (
            <div key={i} className="flex gap-2 items-center">
              <select
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                value={pi.item_id}
                onChange={e => setPkgItems(p => p.map((x, j) => j === i ? { ...x, item_id: e.target.value } : x))}
              >
                <option value="">Select item</option>
                {allItems.filter(item => !usedIds.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name} ({item.item_id})</option>)}
              </select>
              <Input className="w-20" type="number" min="1" value={pi.quantity}
                onChange={e => setPkgItems(p => p.map((x, j) => j === i ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setPkgItems(p => p.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </Button>
            </div>
            )
          })}
          {pkgItems.length === 0 && <p className="text-xs text-gray-400">No items added yet</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save package</Button>
      </div>
    </form>
  )
}

function PackagesTab() {
  const { data: packages = [], isLoading } = usePackages()
  const create = useCreatePackage()
  const update = useUpdatePackage()
  const del = useDeletePackage()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Package | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<Package | null>(null)

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const existingIds = packages.map(p => p.package_id)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{packages.length} packages</p>
        <Button onClick={() => setShowForm(true)}><Plus size={16} />Add package</Button>
      </div>

      {isLoading ? <p className="text-sm text-gray-500">Loading...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {packages.map((pkg, idx) => (
            <div key={pkg.id} className={idx > 0 ? 'border-t border-gray-100' : ''}>
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <button onClick={() => toggle(pkg.id)} className="text-gray-400 hover:text-gray-600">
                  {expanded.has(pkg.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <span className="font-mono text-xs text-gray-400 w-32 shrink-0">{pkg.package_id}</span>
                <span className="font-medium text-gray-900 flex-1">{pkg.name}</span>
                <span className="text-sm text-gray-500">{pkg.category?.name}</span>
                <span className="text-sm text-gray-600 w-24 text-right">{formatCurrency(pkg.day_price)}<span className="text-gray-400">/day</span></span>
                <div className="flex gap-1 ml-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(pkg)}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(pkg)}><Trash2 size={14} /></Button>
                </div>
              </div>
              {expanded.has(pkg.id) && (
                <div className="px-14 py-3 bg-gray-50 border-t border-gray-100">
                  {pkg.package_items?.length ? (
                    <div className="space-y-1">
                      {pkg.package_items.map(pi => (
                        <div key={pi.id} className="text-sm text-gray-600">
                          {pi.quantity}× {pi.item?.name}
                          {(pi.item?.components?.length || 0) > 0 && (
                            <span className="text-xs text-gray-400 ml-2">
                              (incl. {pi.item!.components!.map(c => c.name).join(', ')})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-gray-400">No items in package</p>}
                  {pkg.notes && <p className="text-xs text-gray-500 mt-2">{pkg.notes}</p>}
                </div>
              )}
            </div>
          ))}
          {packages.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">No packages yet</p>
            </div>
          )}
        </div>
      )}

      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null) }}
        title={editing ? `Edit: ${editing.name}` : 'Add package'} size="lg">
        <PackageForm
          initial={editing || undefined}
          existingIds={existingIds}
          onSave={async (pkg, items) => {
            if (editing) { await update.mutateAsync({ id: editing.id, pkg, items }); setEditing(null) }
            else { await create.mutateAsync({ pkg, items }); setShowForm(false) }
          }}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete package" size="sm">
        <div className="space-y-4">
          <div className="flex gap-3 items-start">
            <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">Delete <strong>{confirmDelete?.name}</strong>? Cannot be undone.</p>
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

// ─── Page shell ──────────────────────────────────────────────────────────────

type Tab = 'items' | 'packages' | 'categories'

const TABS: Tab[] = ['items', 'packages', 'categories']

function isTab(value: string | null): value is Tab {
  return !!value && (TABS as string[]).includes(value)
}

export function InventoryPage() {
  const { data: items = [] } = useItems()
  const [showImport, setShowImport] = useState(false)
  const existingIds = items.map(i => i.item_id)

  // Tab and search live in the URL: the view survives a refresh or a trip to a
  // project and back, and global search can deep-link straight to an item.
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = isTab(tabParam) ? tabParam : 'items'
  const search = params.get('q') ?? ''

  const setParam = useCallback((key: string, value: string, fallback?: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (value && value !== fallback) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }, [setParams])

  // "Fully booked" warning for the next 14 days. Both bounds are day-precision
  // so they line up with how project dates are stored.
  const { todayIso, in14Iso } = useMemo(() => {
    const now = new Date()
    const later = new Date(now.getTime() + 14 * 86_400_000)
    return { todayIso: now.toISOString().slice(0, 10), in14Iso: later.toISOString().slice(0, 10) }
  }, [])
  const availMap = useItemTypeAvailability(items, '', todayIso, in14Iso)
  const zeroAvailItems = useMemo(() => {
    const seen = new Set<string>()
    return items.filter(item => {
      const key = item.name.trim().toLowerCase()
      if (seen.has(key)) return false
      const a = availMap.get(item.id)
      if (a && a.total > 0 && a.available === 0) { seen.add(key); return true }
      return false
    })
  }, [items, availMap])

  return (
    <div className="p-3 md:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} items</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => downloadCSV(itemsToCSV(items), `inventory-${new Date().toISOString().slice(0, 10)}.csv`)}>
            <Download size={15} />Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
            <Upload size={15} />Import CSV
          </Button>
        </div>
      </div>

      {zeroAvailItems.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Fully booked in the next 14 days: </span>
            {zeroAvailItems.map(i => i.name).join(', ')}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t} type="button" onClick={() => setParam('tab', t, 'items')}
            aria-current={tab === t ? 'page' : undefined}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize cursor-pointer ${
              tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'items' ? <ItemsTab search={search} onSearch={v => setParam('q', v)} />
        : tab === 'packages' ? <PackagesTab />
        : <div className="max-w-md"><CategoryManager /></div>}

      <CSVImport
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => {}}
        existingIds={existingIds}
      />
    </div>
  )
}
