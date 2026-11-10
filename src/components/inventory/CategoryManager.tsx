import { useState } from 'react'
import { Plus, Trash2, Tag, Pencil, Check, X } from 'lucide-react'
import { useCategories } from '../../hooks/useItems'
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from '../../hooks/useSettings'
import { useToast } from '../../lib/toast-context'
import { errorMessage } from '../../lib/errors'
import type { Category } from '../../types'
import { Button } from '../shared/Button'

/**
 * Single source of truth for category CRUD — Inventory › Categories and
 * Settings both render this instead of keeping two diverging copies.
 */
export function CategoryManager({ title = 'Categories' }: { title?: string }) {
  const { data: categories = [], isLoading } = useCategories()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const del = useDeleteCategory()
  const toast = useToast()

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await create.mutateAsync({ name, sort_order: categories.length + 1 })
      setNewName('')
      setAdding(false)
    } catch (e) {
      toast(errorMessage(e, 'Could not add category'), 'error')
    }
  }

  const handleRename = async (cat: Category) => {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    try {
      await update.mutateAsync({ id: cat.id, name, sort_order: cat.sort_order })
      setEditingId(null)
    } catch (e) {
      toast(errorMessage(e, 'Could not rename category'), 'error')
    }
  }

  const handleDelete = async (cat: Category) => {
    try {
      await del.mutateAsync(cat.id)
    } catch {
      toast(`Cannot delete "${cat.name}" — it is still in use`, 'error')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus size={14} />Add</Button>
      </div>

      {isLoading && <p className="text-xs text-gray-400">Loading…</p>}

      <ul className="space-y-1">
        {categories.map(cat => (
          <li key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group">
            <Tag size={13} className="text-gray-300 shrink-0" aria-hidden="true" />
            {editingId === cat.id ? (
              <>
                <input
                  autoFocus
                  aria-label={`Rename ${cat.name}`}
                  className="flex-1 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename(cat)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
                <button type="button" onClick={() => handleRename(cat)} aria-label="Save"
                  className="text-green-600 hover:text-green-700 cursor-pointer"><Check size={14} /></button>
                <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel"
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={14} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-700">{cat.name}</span>
                <button type="button" onClick={() => { setEditingId(cat.id); setEditName(cat.name) }}
                  aria-label={`Rename ${cat.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-gray-600 cursor-pointer">
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => handleDelete(cat)}
                  aria-label={`Delete ${cat.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-red-500 cursor-pointer">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </li>
        ))}
        {adding && (
          <li className="flex items-center gap-2 px-2 py-1.5">
            <Tag size={13} className="text-gray-200 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              aria-label="New category name"
              className="flex-1 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Category name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
            />
            <button type="button" onClick={handleAdd} aria-label="Add category"
              className="text-green-600 hover:text-green-700 cursor-pointer"><Check size={14} /></button>
            <button type="button" onClick={() => { setAdding(false); setNewName('') }} aria-label="Cancel"
              className="text-gray-400 hover:text-gray-600 cursor-pointer"><X size={14} /></button>
          </li>
        )}
        {!isLoading && categories.length === 0 && !adding && (
          <li className="text-xs text-gray-400 px-2 py-1.5">No categories yet</li>
        )}
      </ul>
    </div>
  )
}
