import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Item, ItemComponent } from '../../types'
import { Input, Textarea } from '../shared/Input'
import { Select } from '../shared/Select'
import { Button } from '../shared/Button'
import { useCategories } from '../../hooks/useItems'
import { generateItemCode, formatItemId } from '../../lib/generateId'

interface ItemFormProps {
  initial?: Item
  onSave: (
    item: Omit<Item, 'id' | 'created_at' | 'category' | 'components'>,
    components: Omit<ItemComponent, 'id' | 'item_id'>[]
  ) => void
  onCancel: () => void
  existingIds?: string[]
  existingItems?: Item[]
}

export function ItemForm({ initial, onSave, onCancel, existingIds = [], existingItems = [] }: ItemFormProps) {
  const { data: categories = [] } = useCategories()
  const [name, setName] = useState(initial?.name || '')
  const [manualItemId, setManualItemId] = useState(initial?.item_id || '')
  const [categoryId, setCategoryId] = useState(initial?.category_id || '')
  const [serialNumber, setSerialNumber] = useState(initial?.serial_number || '')
  const [dayPrice, setDayPrice] = useState(String(initial?.day_price ?? ''))
  const [weekPrice, setWeekPrice] = useState(String(initial?.week_price ?? ''))
  const [monthPrice, setMonthPrice] = useState(String(initial?.month_price ?? ''))
  const [weekSuggested, setWeekSuggested] = useState(false)
  const [monthSuggested, setMonthSuggested] = useState(false)
  const [purchasePrice, setPurchasePrice] = useState(String(initial?.purchase_price ?? ''))
  const [replacementValue, setReplacementValue] = useState(String(initial?.replacement_value ?? ''))
  const [outOfService, setOutOfService] = useState(initial?.out_of_service || false)
  const [outOfServiceReason, setOutOfServiceReason] = useState(initial?.out_of_service_reason || '')
  const [isSubhire, setIsSubhire] = useState(initial?.is_subhire || false)
  const [subhireOwner, setSubhireOwner] = useState(initial?.subhire_owner || '')
  const [subhireCost, setSubhireCost] = useState(initial?.subhire_cost ? String(initial.subhire_cost) : '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [components, setComponents] = useState<Omit<ItemComponent, 'id' | 'item_id'>[]>(
    initial?.components?.map(c => ({ name: c.name, quantity: c.quantity })) || []
  )
  const [idManuallyEdited, setIdManuallyEdited] = useState(!!initial)
  const [suggestions, setSuggestions] = useState<Item[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestRef = useRef<HTMLDivElement>(null)

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleNameChange = (val: string) => {
    setName(val)
    if (!initial && val.trim().length >= 2) {
      const q = val.trim().toLowerCase()
      const matches = existingItems
        .filter(i => i.name.toLowerCase().includes(q))
        .reduce<Item[]>((acc, item) => {
          // Deduplicate by name
          if (!acc.find(x => x.name.toLowerCase() === item.name.toLowerCase())) acc.push(item)
          return acc
        }, [])
        .slice(0, 6)
      setSuggestions(matches)
      setShowSuggestions(matches.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }

  const applySuggestion = (item: Item) => {
    setName(item.name)
    setCategoryId(item.category_id)
    setDayPrice(String(item.day_price))
    setWeekPrice(item.week_price ? String(item.week_price) : '')
    setMonthPrice(item.month_price ? String(item.month_price) : '')
    setIsSubhire(item.is_subhire)
    setSubhireOwner(item.subhire_owner || '')
    setNotes(item.notes || '')
    setShowSuggestions(false)
  }

  // The ID is derived from the name until the user types their own — derived
  // during render rather than mirrored into state by an effect.
  const itemId = useMemo(() => {
    if (idManuallyEdited || initial) return manualItemId
    if (!name.trim()) return ''
    const code = generateItemCode(name)
    let counter = 1
    while (existingIds.includes(formatItemId(code, counter))) counter++
    return formatItemId(code, counter)
  }, [name, manualItemId, idManuallyEdited, initial, existingIds])

  // Auto-suggest week / month from day price
  // Standard AV rates: week ≈ 3× day, month ≈ 10× day
  const handleDayPriceChange = (val: string) => {
    setDayPrice(val)
    const day = parseFloat(val)
    if (!isNaN(day) && day > 0) {
      if (!weekPrice || weekSuggested) {
        setWeekPrice((day * 3).toFixed(2))
        setWeekSuggested(true)
      }
      if (!monthPrice || monthSuggested) {
        setMonthPrice((day * 10).toFixed(2))
        setMonthSuggested(true)
      }
    }
  }

  const addComponent = () => setComponents(c => [...c, { name: '', quantity: 1 }])
  const removeComponent = (i: number) => setComponents(c => c.filter((_, j) => j !== i))
  const updateComponent = (i: number, field: keyof Omit<ItemComponent, 'id' | 'item_id'>, value: string | number) =>
    setComponents(c => c.map((comp, j) => j === i ? { ...comp, [field]: value } : comp))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(
      {
        item_id: itemId,
        name,
        category_id: categoryId,
        serial_number: serialNumber || null,
        day_price: parseFloat(dayPrice) || 0,
        week_price: weekPrice ? parseFloat(weekPrice) : null,
        month_price: monthPrice ? parseFloat(monthPrice) : null,
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        replacement_value: replacementValue ? parseFloat(replacementValue) : null,
        out_of_service: outOfService,
        out_of_service_reason: outOfServiceReason || null,
        is_subhire: isSubhire,
        subhire_owner: subhireOwner || null,
        subhire_cost: isSubhire && subhireCost ? parseFloat(subhireCost) : null,
        notes: notes || null,
      },
      components.filter(c => c.name.trim())
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="relative" ref={suggestRef}>
          <Input
            label="Item name *"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            required
          />
          {showSuggestions && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              <p className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">Existing items — click to copy settings</p>
              {suggestions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => applySuggestion(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
                >
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{s.item_id.replace(/-\d+$/, '')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Input
          label="Item ID *"
          value={itemId}
          onChange={e => { setManualItemId(e.target.value.toUpperCase()); setIdManuallyEdited(true) }}
          required
          className="font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select label="Category *" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
          <option value="">Select category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input
          label="Serial number"
          value={serialNumber}
          onChange={e => setSerialNumber(e.target.value)}
          placeholder="For insurance / records"
        />
      </div>

      <div>
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Day price (£)"
            type="number" step="0.01" min="0"
            value={dayPrice}
            onChange={e => handleDayPriceChange(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <Input
              label={weekSuggested ? 'Week price (£) — suggested' : 'Week price (£)'}
              type="number" step="0.01" min="0"
              value={weekPrice}
              onChange={e => { setWeekPrice(e.target.value); setWeekSuggested(false) }}
              className={weekSuggested ? 'border-blue-300 bg-blue-50' : ''}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Input
              label={monthSuggested ? 'Month price (£) — suggested' : 'Month price (£)'}
              type="number" step="0.01" min="0"
              value={monthPrice}
              onChange={e => { setMonthPrice(e.target.value); setMonthSuggested(false) }}
              className={monthSuggested ? 'border-blue-300 bg-blue-50' : ''}
              placeholder="Optional"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">Week and month prices are suggested at 3× and 10× day rate — override as needed</p>
      </div>

      {/* Financial */}
      <div className="grid grid-cols-2 gap-4">
        <Input label="Purchase price (£)" type="number" step="0.01" min="0" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="Internal only" />
        <Input label="Replacement value (£)" type="number" step="0.01" min="0" value={replacementValue} onChange={e => setReplacementValue(e.target.value)} placeholder="For insurance" />
      </div>

      {/* Out of service */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={outOfService} onChange={e => setOutOfService(e.target.checked)} className="rounded accent-red-500" />
          <span className="text-sm font-medium text-gray-700">Out of service</span>
        </label>
        {outOfService && (
          <Input label="Reason" value={outOfServiceReason} onChange={e => setOutOfServiceReason(e.target.value)} placeholder="e.g. In for repair, awaiting parts" />
        )}
      </div>

      {/* Subhire toggle */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isSubhire} onChange={e => setIsSubhire(e.target.checked)} className="rounded" />
          <span className="text-sm font-medium text-gray-700">Subhire item</span>
        </label>
        {isSubhire && (
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Input label="Owner / contact details" value={subhireOwner} onChange={e => setSubhireOwner(e.target.value)} placeholder="Name, phone, email..." />
            <Input label="Costs us / day (£)" type="number" min="0" step="0.01" value={subhireCost} onChange={e => setSubhireCost(e.target.value)}
              hint="Used for job margins" />
          </div>
        )}
      </div>

      <Textarea label="Internal notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Visible on picking list only, not on client quote" />

      {/* Components */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="text-sm font-medium text-gray-700">Components</label>
            <p className="text-xs text-gray-400">Travel with the item — cables, cases, stands, bags etc.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={addComponent}><Plus size={14} />Add</Button>
        </div>
        {components.length === 0 && <p className="text-xs text-gray-400">No components</p>}
        <div className="space-y-2">
          {components.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                className="flex-1"
                placeholder="e.g. Flight case, XLR cable, Stand bag"
                value={c.name}
                onChange={e => updateComponent(i, 'name', e.target.value)}
              />
              <Input
                className="w-20"
                type="number" min="1"
                value={c.quantity}
                onChange={e => updateComponent(i, 'quantity', parseInt(e.target.value) || 1)}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => removeComponent(i)}><Trash2 size={14} /></Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save item</Button>
      </div>
    </form>
  )
}
