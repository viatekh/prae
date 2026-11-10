import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useItems, useCategories } from '../hooks/useItems'
import { QrCode } from '../components/shared/QrCode'
import { Button } from '../components/shared/Button'
import { Select } from '../components/shared/Select'

/**
 * Printable QR labels for the kit. Each code holds the item's ID, which the
 * check-out / check-in screen reads with the phone camera.
 */
export function LabelsPage() {
  const { data: items = [], isLoading } = useItems()
  const { data: categories = [] } = useCategories()
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [size, setSize] = useState<'small' | 'large'>('small')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i =>
      (!categoryId || i.category_id === categoryId) &&
      (!q || i.name.toLowerCase().includes(q) || i.item_id.toLowerCase().includes(q)))
  }, [items, categoryId, search])

  return (
    <div className="p-3 md:p-6 max-w-5xl">
      <div className="print:hidden space-y-4 mb-5">
        <div className="flex items-center gap-3">
          <Link to="/inventory" aria-label="Back to inventory" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={20} /></Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">QR labels</h1>
            <p className="text-sm text-gray-500 mt-0.5">Print on sticker sheets, or on paper and tape over. Scan them from the check-out screen.</p>
          </div>
          <Button onClick={() => window.print()} disabled={shown.length === 0}><Printer size={16} />Print {shown.length}</Button>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by name or ID" aria-label="Filter items"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white w-56" />
          <Select value={categoryId} onChange={e => setCategoryId(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={size} onChange={e => setSize(e.target.value as 'small' | 'large')} aria-label="Label size">
            <option value="small">Small labels (5 across)</option>
            <option value="large">Large labels (3 across)</option>
          </Select>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : shown.length === 0 ? (
        <p className="text-sm text-gray-400 py-16 text-center">No items match.</p>
      ) : (
        <div className={size === 'small' ? 'grid grid-cols-3 sm:grid-cols-5 print:grid-cols-5 gap-2' : 'grid grid-cols-2 sm:grid-cols-3 print:grid-cols-3 gap-3'}>
          {shown.map(item => (
            <div key={item.id} className="bg-white border border-gray-300 rounded-lg p-2 text-center break-inside-avoid">
              <QrCode value={item.item_id} className="w-full h-auto" />
              <p className="font-mono text-xs font-semibold text-gray-900 mt-1 break-all">{item.item_id}</p>
              <p className="text-[10px] leading-tight text-gray-600 line-clamp-2">{item.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
