import { useState, useRef } from 'react'
import { Upload, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { parseCSV, csvRowToItemData, parseComponents, type CSVRow } from '../../lib/csv'
import { generateItemCode, formatItemId } from '../../lib/generateId'
import { supabase } from '../../lib/supabase'
import { useCategories } from '../../hooks/useItems'
import { Button } from '../shared/Button'
import { Modal } from '../shared/Modal'
import { useToast } from '../../lib/toast-context'
import { errorMessage } from '../../lib/errors'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
  existingIds: string[]
}

type RowState = 'ok' | 'missing-id' | 'duplicate' | 'missing-name'

function rowState(row: CSVRow, existingIds: string[], allIds: string[]): RowState {
  if (!row.name.trim()) return 'missing-name'
  if (!row.item_id.trim()) return 'missing-id'
  // Check duplicate against existing DB ids
  if (existingIds.includes(row.item_id)) return 'duplicate'
  // Check duplicate within the import itself
  if (allIds.filter(id => id === row.item_id).length > 1) return 'duplicate'
  return 'ok'
}

export function CSVImport({ open, onClose, onImported, existingIds }: Props) {
  const { data: categories = [] } = useCategories()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<CSVRow[]>([])
  const [step, setStep] = useState<'upload' | 'review' | 'importing' | 'done'>('upload')
  const [generateMissingIds, setGenerateMissingIds] = useState<boolean | null>(null)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] })

  const reset = () => {
    setRows([])
    setStep('upload')
    setGenerateMissingIds(null)
    setProgress(0)
    setResults({ success: 0, failed: 0, errors: [] })
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { rows: parsed } = parseCSV(text)
      if (parsed.length === 0) { toast('No data rows found in CSV', 'error'); return }
      setRows(parsed)

      // Check if any rows are missing IDs
      const missingCount = parsed.filter(r => !r.item_id.trim()).length
      if (missingCount > 0) {
        setGenerateMissingIds(null) // will ask
      } else {
        setGenerateMissingIds(false)
      }
      setStep('review')
    }
    reader.readAsText(file)
  }

  const missingIdRows = rows.filter(r => !r.item_id.trim())
  const needsIdDecision = missingIdRows.length > 0 && generateMissingIds === null

  // Generate IDs for missing rows
  const resolvedRows = rows.map(row => {
    if (row.item_id.trim() || !generateMissingIds) return row
    const code = generateItemCode(row.name)
    const used = [...existingIds, ...rows.filter(r => r !== row && r.item_id).map(r => r.item_id)]
    let counter = 1
    while (used.includes(formatItemId(code, counter))) counter++
    return { ...row, item_id: formatItemId(code, counter) }
  })

  const states = resolvedRows.map(r => rowState(r, existingIds, resolvedRows.map(x => x.item_id)))
  const canImport = !needsIdDecision && states.every(s => s !== 'missing-name') && states.filter(s => s === 'duplicate').length === 0

  const handleImport = async () => {
    setStep('importing')
    const toImport = resolvedRows.filter((_, i) => states[i] === 'ok')
    let success = 0
    const errors: string[] = []

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i]
      setProgress(Math.round(((i + 1) / toImport.length) * 100))
      try {
        const itemData = csvRowToItemData(row, categories)
        const { data: created, error } = await supabase.from('items').insert(itemData).select().single()
        if (error) { errors.push(`${row.item_id || row.name}: ${error.message}`); continue }

        // Import components
        const components = parseComponents(row.components)
        if (components.length > 0 && created) {
          await supabase.from('item_components').insert(components.map(c => ({ ...c, item_id: created.id })))
        }
        success++
      } catch (e) {
        errors.push(`${row.item_id || row.name}: ${errorMessage(e, 'import failed')}`)
      }
    }

    setResults({ success, failed: errors.length, errors })
    setStep('done')
    onImported()
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Import inventory from CSV" size="xl">
      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload a CSV file with inventory items. Columns can be in any order — we'll match them automatically.
            Download the current inventory first to see the expected format.
          </p>
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            <Upload size={28} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700">Click to upload or drag & drop</p>
            <p className="text-xs text-gray-400 mt-1">CSV files only</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Recognised column names</p>
            <p className="text-xs text-gray-400">item_id, name, category, serial_number, day_price, week_price, month_price, purchase_price, replacement_value, out_of_service, is_subhire, subhire_owner, notes, components</p>
          </div>
        </div>
      )}

      {/* Step: Ask about missing IDs */}
      {step === 'review' && needsIdDecision && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <AlertTriangle size={20} className="text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-800">
                {missingIdRows.length} row{missingIdRows.length > 1 ? 's' : ''} {missingIdRows.length > 1 ? 'are' : 'is'} missing an item ID
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Would you like to auto-generate IDs from the item names (e.g. <span className="font-mono">CDJ3000-001</span>)?
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setGenerateMissingIds(true)}>
              <RefreshCw size={15} />Generate IDs automatically
            </Button>
            <Button variant="secondary" onClick={() => setGenerateMissingIds(false)}>
              Skip rows without IDs
            </Button>
          </div>
        </div>
      )}

      {/* Step: Review table */}
      {step === 'review' && !needsIdDecision && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <strong>{resolvedRows.length}</strong> rows found.{' '}
              {states.filter(s => s === 'ok').length} ready to import.
              {states.filter(s => s === 'duplicate').length > 0 && <span className="text-orange-600"> {states.filter(s => s === 'duplicate').length} duplicate IDs will be skipped.</span>}
              {states.filter(s => s === 'missing-name').length > 0 && <span className="text-red-600"> {states.filter(s => s === 'missing-name').length} rows missing names.</span>}
            </p>
            <Button variant="ghost" size="sm" onClick={reset}>Back</Button>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Category</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Day £</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resolvedRows.map((row, i) => {
                  const state = states[i]
                  return (
                    <tr key={i} className={state === 'duplicate' || state === 'missing-name' ? 'bg-red-50' : state === 'missing-id' ? 'bg-yellow-50' : ''}>
                      <td className="px-3 py-1.5">
                        {state === 'ok'           && <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} />Ready</span>}
                        {state === 'duplicate'    && <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12} />Duplicate</span>}
                        {state === 'missing-id'   && <span className="text-yellow-600 flex items-center gap-1"><AlertTriangle size={12} />No ID</span>}
                        {state === 'missing-name' && <span className="text-red-600 flex items-center gap-1"><AlertTriangle size={12} />No name</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-gray-600">{row.item_id || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-900">{row.name || <span className="text-red-400">missing</span>}</td>
                      <td className="px-3 py-1.5 text-gray-500">{row.category}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{row.day_price || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Back</Button>
            <Button onClick={handleImport} disabled={!canImport}>
              Import {states.filter(s => s === 'ok').length} items
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-gray-900 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-gray-600">Importing… {progress}%</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
            <CheckCircle size={20} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Import complete</p>
              <p className="text-xs text-green-700">{results.success} item{results.success !== 1 ? 's' : ''} imported successfully{results.failed > 0 ? `, ${results.failed} failed` : ''}.</p>
            </div>
          </div>
          {results.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-32 overflow-y-auto">
              {results.errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Import another file</Button>
            <Button onClick={() => { reset(); onClose() }}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
