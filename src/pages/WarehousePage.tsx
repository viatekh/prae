import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { ChevronRight, PackageCheck, Truck } from 'lucide-react'
import { useProjects } from '../hooks/useProjects'
import type { Project } from '../types'
import { checkProgress } from '../lib/lines'
import { cn } from '../lib/utils'

const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null)
const UPCOMING_DAYS = 7

/** What the warehouse has to pick and what it is waiting to get back. */
export function WarehousePage() {
  const { data: projects = [], isLoading } = useProjects()
  // Anchored once per visit so the lists don't reshuffle mid-count.
  const [{ today, horizon }] = useState(() => {
    const now = new Date()
    return { today: format(now, 'yyyy-MM-dd'), horizon: format(addDays(now, UPCOMING_DAYS), 'yyyy-MM-dd') }
  })

  const { goingOut, out } = useMemo(() => {
    const start = (p: Project) => dayOf(p.delivery_date || p.event_date)
    const live = projects.filter(p => p.status === 'confirmed')
    return {
      goingOut: live
        .filter(p => !p.check_out_at && start(p) !== null && start(p)! <= horizon)
        .sort((a, b) => start(a)!.localeCompare(start(b)!)),
      out: projects
        .filter(p => p.check_out_at && !p.check_in_at && p.status !== 'completed')
        .sort((a, b) => (dayOf(a.collection_date) ?? '9').localeCompare(dayOf(b.collection_date) ?? '9')),
    }
  }, [projects, horizon])

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading…</div>

  return (
    <div className="p-3 md:p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Warehouse</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tap a job to count its kit out or back in</p>
      </div>

      <Group title="Going out" icon={<Truck size={15} className="text-blue-500" />} empty="Nothing to prep in the next week.">
        {goingOut.map(p => {
          const d = dayOf(p.delivery_date || p.event_date)!
          return <Row key={p.id} project={p} when={d < today ? 'Late' : d === today ? 'Today' : format(parseISO(d), 'EEE d MMM')}
            urgent={d <= today} count={checkProgress(p.line_items ?? []).out} />
        })}
      </Group>

      <Group title="Out — waiting to come back" icon={<PackageCheck size={15} className="text-green-600" />} empty="Nothing is out.">
        {out.map(p => {
          const d = dayOf(p.collection_date)
          return <Row key={p.id} project={p} when={!d ? 'No return date' : d < today ? 'Overdue' : d === today ? 'Today' : format(parseISO(d), 'EEE d MMM')}
            urgent={!!d && d <= today} overdue={!!d && d < today} count={checkProgress(p.line_items ?? []).back} />
        })}
      </Group>
    </div>
  )
}

function Group({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">{icon}{title}</h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {children.length > 0 ? children : <p className="px-4 py-6 text-sm text-gray-400 text-center">{empty}</p>}
      </div>
    </section>
  )
}

function Row({ project, when, urgent, overdue, count }: { project: Project; when: string; urgent?: boolean; overdue?: boolean; count: number }) {
  const total = checkProgress(project.line_items ?? []).total
  return (
    <Link to={`/projects/${project.id}/check`}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
        <p className="text-xs text-gray-500 truncate">
          {project.client?.name || 'No client'}
          {project.delivery_mode === 'client_collects' ? ' · client collects' : ''}
        </p>
      </div>
      <span className="text-xs text-gray-400 tabular-nums shrink-0">{count}/{total}</span>
      <span className={cn('text-xs font-medium px-2 py-1 rounded-full shrink-0',
        overdue ? 'bg-red-100 text-red-700' : urgent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>{when}</span>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </Link>
  )
}
