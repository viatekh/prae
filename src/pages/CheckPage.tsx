import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Minus, Plus, AlertTriangle, ScanLine } from 'lucide-react'
import { useProject, useUpdateLineCheck, useUpdateProject, useCheckAll } from '../hooks/useProjects'
import { useAddProjectLog } from '../hooks/useProjectLogs'
import type { ProjectLineItem } from '../types'
import { checkProgress, pickableLines } from '../lib/lines'
import { cn } from '../lib/utils'
import { errorMessage } from '../lib/errors'
import { useToast } from '../lib/toast-context'
import { Button } from '../components/shared/Button'

type Direction = 'out' | 'in'

/**
 * Warehouse screen for a phone or tablet: big targets, one job, count kit out
 * and back in. A barcode scanner that types into the box works as-is.
 */
export function CheckPage() {
  const { id } = useParams<{ id: string }>()
  const { data: project, isLoading } = useProject(id)
  const updateLine = useUpdateLineCheck()
  const updateProject = useUpdateProject()
  const checkAll = useCheckAll()
  const addLog = useAddProjectLog()
  const toast = useToast()
  const scanRef = useRef<HTMLInputElement>(null)
  const [scan, setScan] = useState('')
  const [chosen, setChosen] = useState<Direction | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)

  const lines = useMemo(() => pickableLines(project?.line_items ?? []), [project?.line_items])
  const progress = checkProgress(lines)

  if (isLoading || !project) return <div className="p-6 text-sm text-gray-500">Loading…</div>

  // Follow the job: counting out until it has left, counting in afterwards.
  const direction: Direction = chosen ?? (project.check_out_at ? 'in' : 'out')
  const field = direction === 'out' ? 'out_qty' : 'in_qty'
  const done = direction === 'out' ? progress.out : progress.back
  const complete = progress.total > 0 && done >= progress.total
  const stamped = direction === 'out' ? !!project.check_out_at : !!project.check_in_at

  const setCount = (line: ProjectLineItem, value: number) => {
    const next = Math.max(0, Math.min(line.quantity, value))
    if (next === line[field]) return
    updateLine.mutate({ id: line.id, projectId: project.id, [field]: next }, {
      onError: e => toast(errorMessage(e, 'Could not save — check your connection'), 'error'),
    })
  }

  const onScan = (e: React.FormEvent) => {
    e.preventDefault()
    const q = scan.trim().toLowerCase()
    if (!q) return
    const matches = (l: ProjectLineItem) =>
      l.item?.item_id?.toLowerCase() === q ||
      l.item?.serial_number?.toLowerCase() === q ||
      l.description.toLowerCase().includes(q)
    // Prefer a line that still needs counting, so scanning the same code twice fills two.
    const line = lines.find(l => matches(l) && l[field] < l.quantity) ?? lines.find(matches)
    if (!line) {
      toast(`"${scan.trim()}" is not on this job`, 'error')
    } else if (line[field] >= line.quantity) {
      toast(`${line.description} is already fully counted`, 'error')
    } else {
      setCount(line, line[field] + 1)
      setFlash(line.id)
      setTimeout(() => setFlash(null), 900)
    }
    setScan('')
    scanRef.current?.focus()
  }

  const finish = async () => {
    try {
      const at = new Date().toISOString()
      await updateProject.mutateAsync({ id: project.id, ...(direction === 'out' ? { check_out_at: at } : { check_in_at: at }) })
      const short = progress.total - done
      addLog.mutate({
        project_id: project.id,
        message: `${direction === 'out' ? 'Checked out' : 'Checked in'} ${done}/${progress.total} items${short > 0 ? ` — ${short} missing` : ''}${progress.damaged > 0 && direction === 'in' ? `, ${progress.damaged} damaged` : ''}`,
      })
      toast(direction === 'out' ? 'Job checked out' : 'Job checked in')
    } catch (e) {
      toast(errorMessage(e, 'Could not finish'), 'error')
    }
  }

  const all = async () => {
    try {
      await checkAll.mutateAsync({ projectId: project.id, direction })
      addLog.mutate({ project_id: project.id, message: direction === 'out' ? 'Checked out all kit' : 'Checked in all kit' })
      toast(direction === 'out' ? 'Everything checked out' : 'Everything checked in')
    } catch (e) {
      toast(errorMessage(e, 'Could not update'), 'error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-full">
      <div className="sticky top-0 z-10 bg-gray-50 px-3 md:px-6 pt-3 md:pt-6 pb-3 space-y-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Link to={`/projects/${project.id}`} aria-label="Back to project" className="text-gray-400 hover:text-gray-600 shrink-0 p-1 -ml-1">
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-gray-900 truncate">{project.name}</h1>
            <p className="text-xs text-gray-500 truncate">{project.project_number}{project.client ? ` · ${project.client.name}` : ''}</p>
          </div>
          <span className={cn('text-sm font-semibold tabular-nums px-2.5 py-1 rounded-full shrink-0',
            complete ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700')}>
            {done}/{progress.total}
          </span>
        </div>

        <div className="flex gap-1 bg-gray-200/70 p-1 rounded-lg" role="tablist">
          {(['out', 'in'] as const).map(d => (
            <button key={d} role="tab" aria-selected={direction === d} onClick={() => setChosen(d)}
              className={cn('flex-1 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer',
                direction === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
              {d === 'out' ? 'Going out' : 'Coming back'}
            </button>
          ))}
        </div>

        <form onSubmit={onScan} className="relative">
          <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input ref={scanRef} value={scan} onChange={e => setScan(e.target.value)}
            placeholder="Scan or type an item ID, then Enter"
            aria-label="Scan or type an item ID"
            autoCapitalize="off" autoCorrect="off" enterKeyHint="done"
            className="w-full pl-9 pr-3 py-2.5 text-base bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </form>
      </div>

      <div className="flex-1 px-3 md:px-6 py-3 space-y-2">
        {lines.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-16">No kit on this job yet.</p>
        )}
        {lines.map(line => {
          const count = line[field]
          const full = count >= line.quantity
          return (
            <div key={line.id}
              className={cn('bg-white rounded-xl border transition-colors',
                flash === line.id ? 'border-green-500 ring-2 ring-green-200' : full ? 'border-green-200' : 'border-gray-200',
                line.is_component && 'ml-5')}>
              <div className="flex items-center gap-2 p-2.5">
                <button type="button" onClick={() => setCount(line, full ? 0 : line.quantity)}
                  aria-label={full ? `Clear ${line.description}` : `Mark all ${line.description}`}
                  className={cn('w-11 h-11 rounded-lg flex items-center justify-center shrink-0 cursor-pointer border-2',
                    full ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent')}>
                  <Check size={22} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium line-clamp-2', full ? 'text-gray-500' : 'text-gray-900')}>{line.description}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {line.item?.item_id}{line.item?.serial_number ? ` · S/N ${line.item.serial_number}` : ''}
                    {direction === 'in' && line.out_qty < line.quantity && <span className="text-amber-600"> · only {line.out_qty} went out</span>}
                  </p>
                </div>
                {line.quantity > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setCount(line, count - 1)} disabled={count === 0} aria-label="One fewer"
                      className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center disabled:opacity-30 cursor-pointer"><Minus size={16} /></button>
                    <span className="w-12 text-center text-sm font-semibold tabular-nums">{count}/{line.quantity}</span>
                    <button type="button" onClick={() => setCount(line, count + 1)} disabled={full} aria-label="One more"
                      className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center disabled:opacity-30 cursor-pointer"><Plus size={16} /></button>
                  </div>
                )}
                {direction === 'in' && (
                  <button type="button" onClick={() => setNoteFor(noteFor === line.id ? null : line.id)}
                    aria-label={`Report a problem with ${line.description}`} aria-pressed={line.damaged_qty > 0}
                    className={cn('w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer',
                      line.damaged_qty > 0 ? 'bg-red-50 border-red-300 text-red-600' : 'border-gray-300 text-gray-400')}>
                    <AlertTriangle size={16} />
                  </button>
                )}
              </div>
              {direction === 'in' && (noteFor === line.id || line.damaged_qty > 0) && (
                <div className="flex items-center gap-2 px-2.5 pb-2.5">
                  <label className="text-xs text-gray-500 shrink-0">Damaged</label>
                  <input type="number" min="0" max={line.quantity} defaultValue={line.damaged_qty || ''} placeholder="0"
                    aria-label="Number damaged"
                    onBlur={e => {
                      const n = Math.max(0, Math.min(line.quantity, parseInt(e.target.value) || 0))
                      if (n !== line.damaged_qty) updateLine.mutate({ id: line.id, projectId: project.id, damaged_qty: n })
                    }}
                    className="w-14 text-sm border border-gray-300 rounded px-2 py-1.5" />
                  <input defaultValue={line.return_note ?? ''} placeholder="What's wrong?" aria-label="Damage note"
                    onBlur={e => {
                      const note = e.target.value.trim() || null
                      if (note !== (line.return_note ?? null)) updateLine.mutate({ id: line.id, projectId: project.id, return_note: note })
                    }}
                    className="flex-1 min-w-0 text-sm border border-gray-300 rounded px-2 py-1.5" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {lines.length > 0 && (
        <div className="sticky bottom-16 md:bottom-0 bg-white border-t border-gray-200 px-3 md:px-6 py-3 flex gap-2">
          {!complete && (
            <Button variant="secondary" className="flex-1 py-3" disabled={checkAll.isPending} onClick={all}>
              {direction === 'out' ? 'All out' : 'All back'}
            </Button>
          )}
          <Button className="flex-1 py-3" disabled={updateProject.isPending || (stamped && complete)} onClick={finish}>
            {stamped && complete ? (direction === 'out' ? 'Checked out ✓' : 'Checked in ✓')
              : complete ? (direction === 'out' ? 'Finish check-out' : 'Finish check-in')
              : `Finish with ${progress.total - done} missing`}
          </Button>
        </div>
      )}
    </div>
  )
}
