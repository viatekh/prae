import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { Item } from '../../types'
import { cn, formatCurrency } from '../../lib/utils'

const MAX_RESULTS = 8

interface Availability { available: number; total: number }

/**
 * Type-to-add for the kit list: search, Enter, keep typing. The full browser
 * modal is still there for multi-select and packages.
 */
export function QuickAddItem({ items, availability, showAvailability, onAdd }: {
  items: Item[]
  availability: Map<string, Availability>
  showAvailability: boolean
  onAdd: (item: Item) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return items
      .filter(i => !i.out_of_service && (i.name.toLowerCase().includes(q) || i.item_id.toLowerCase().includes(q)))
      .slice(0, MAX_RESULTS)
  }, [items, query])

  const add = (item: Item) => {
    onAdd(item)
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); add(results[activeIndex]) }
  }

  const showList = open && query.trim().length > 0

  return (
    <div className="relative px-4 py-2 border-b border-gray-100 bg-gray-50/60">
      <Search size={14} className="absolute left-6.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIndex(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Quick add — type an item name or ID, Enter to add"
        aria-label="Quick add item to kit list"
        role="combobox"
        aria-expanded={showList}
        aria-controls="quick-add-results"
        aria-autocomplete="list"
        className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
      {showList && (
        <ul id="quick-add-results" role="listbox"
          className="absolute left-4 right-4 top-full -mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
          {results.map((item, i) => {
            const avail = availability.get(item.id)
            return (
              <li key={item.id} role="option" aria-selected={i === activeIndex}>
                <button type="button"
                  // mousedown, not click: fires before the input's blur closes the list
                  onMouseDown={e => { e.preventDefault(); add(item) }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn('w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer', i === activeIndex && 'bg-gray-100')}>
                  <span className="font-mono text-xs text-gray-400 w-24 shrink-0 truncate">{item.item_id}</span>
                  <span className="text-sm text-gray-900 flex-1 truncate">{item.name}</span>
                  {showAvailability && avail && (
                    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded shrink-0',
                      avail.available === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
                      {avail.available}/{avail.total}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 shrink-0">{formatCurrency(item.day_price)}/day</span>
                </button>
              </li>
            )
          })}
          {results.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No items match</li>}
        </ul>
      )}
    </div>
  )
}
