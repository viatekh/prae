import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, isToday, startOfMonth, endOfMonth } from 'date-fns'
import { Truck, TrendingUp, Package, ChevronRight, Plus, FileText, Zap, Receipt } from 'lucide-react'
import { useProjects } from '../hooks/useProjects'
import { StatusBadge } from '../components/shared/Badge'
import { formatCurrency, calcProjectTotals } from '../lib/utils'
import { useProjectRevenue } from '../hooks/useRevenue'
import { useSettings } from '../hooks/useSettings'
import { deriveActions } from '../lib/actions'
import { ActionList } from '../components/dashboard/ActionList'
import type { Project } from '../types'

export function DashboardPage() {
  const { data: allProjects = [] } = useProjects()
  const { data: richProjects = [] } = useProjectRevenue()
  const { data: settings } = useSettings()

  // Anchored once per mount so the memos below have stable dependencies.
  const { today, monthStart, monthEnd } = useMemo(() => {
    const now = new Date()
    return { today: now, monthStart: startOfMonth(now), monthEnd: endOfMonth(now) }
  }, [])

  const departuresToday = useMemo(() =>
    allProjects.filter(p => p.delivery_date && isToday(parseISO(p.delivery_date)) && ['confirmed', 'sent', 'invoiced'].includes(p.status)),
    [allProjects])

  const inFlight = useMemo(() =>
    allProjects.filter(p => p.check_out_at && !p.check_in_at),
    [allProjects])

  const revenueThisMonth = useMemo(() => {
    return richProjects
      .filter(p => {
        const d = p.event_date || p.created_at
        if (!d) return false
        const date = parseISO(d)
        return date >= monthStart && date <= monthEnd && ['confirmed', 'invoiced', 'completed'].includes(p.status)
      })
      .reduce((sum, p) => sum + calcProjectTotals(p.line_items ?? [], p.overall_discount_pct ?? 0).subtotal, 0)
  }, [richProjects, monthStart, monthEnd])

  const drafts = useMemo(() =>
    allProjects.filter(p => p.status === 'draft'),
    [allProjects])

  const actions = useMemo(() => deriveActions(allProjects, today, {
    chaseQuoteDays: settings?.chase_quote_days ?? 3,
    paymentDays: settings?.payment_days ?? 14,
  }), [allProjects, today, settings?.chase_quote_days, settings?.payment_days])

  const unpaid = useMemo(() => allProjects.filter(p => p.status === 'invoiced'), [allProjects])

  return (
    <div className="p-3 md:p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(today, 'EEEE d MMMM yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/projects?new=1"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
            <Plus size={16} />New project
          </Link>
          <Link to="/quick"
            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors">
            <Zap size={16} />Quick hire
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Departures today"
          value={departuresToday.length}
          icon={<Truck size={18} className="text-blue-600" />}
          color="blue"
          urgent={departuresToday.length > 0}
          to="/warehouse"
        />
        <StatCard
          label="Awaiting payment"
          value={unpaid.length}
          icon={<Receipt size={18} className="text-green-600" />}
          color="green"
          to="/projects?status=invoiced"
        />
        <StatCard
          label="Kits out"
          value={inFlight.length}
          icon={<Package size={18} className="text-orange-600" />}
          color="orange"
          to="/warehouse"
        />
        <StatCard
          label={`Revenue ${format(today, 'MMM')}`}
          value={formatCurrency(revenueThisMonth)}
          icon={<TrendingUp size={18} className="text-purple-600" />}
          color="purple"
          isText
          to="/reports"
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">
          Needs doing{actions.length > 0 && <span className="ml-1.5 text-gray-400 font-normal">{actions.length}</span>}
        </h2>
        <ActionList actions={actions} projects={allProjects} settings={settings} />
      </div>

      {inFlight.length > 0 && (
        <Section title="Currently out">
          {inFlight.map(p => (
            <ProjectRow key={p.id} project={p} detail={p.collection_date ? `Back ${format(parseISO(p.collection_date), 'd MMM')}` : 'No return date'} />
          ))}
        </Section>
      )}

      {drafts.length > 0 && (
        <Section title="Drafts" icon={<FileText size={15} className="text-gray-400" />}>
          {drafts.slice(0, 5).map(p => (
            <ProjectRow key={p.id} project={p} detail={p.event_date ? format(parseISO(p.event_date), 'd MMM') : 'No date'} />
          ))}
          {drafts.length > 5 && (
            <Link to="/projects?status=draft" className="block px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50">
              View all {drafts.length} drafts
            </Link>
          )}
        </Section>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color, urgent, isText, to }: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  urgent?: boolean
  isText?: boolean
  to: string
}) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50', green: 'bg-green-50', orange: 'bg-orange-50', purple: 'bg-purple-50',
  }
  return (
    <Link to={to} className={`block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-400 transition-colors ${urgent ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs text-gray-500">{label}</p>
        <div className={`p-1.5 rounded-lg ${bg[color]}`}>{icon}</div>
      </div>
      <p className={`mt-2 font-bold text-gray-900 ${isText ? 'text-lg' : 'text-3xl'}`}>
        {value}
      </p>
    </Link>
  )
}

function Section({ title, icon, children, titleClass }: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  titleClass?: string
}) {
  return (
    <div>
      <h2 className={`flex items-center gap-1.5 text-sm font-semibold mb-2 ${titleClass || 'text-gray-700'}`}>
        {icon}{title}
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function ProjectRow({ project, detail, detailClass }: {
  project: Pick<Project, 'id' | 'name' | 'project_number' | 'status' | 'location'> & { client?: { name: string } | null }
  detail?: string
  detailClass?: string
}) {
  return (
    <Link to={`/projects/${project.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-mono text-gray-400">{project.project_number}</span>
          {project.client?.name && <span className="text-xs text-gray-500">{project.client.name}</span>}
          {project.location && <span className="text-xs text-gray-400 hidden sm:inline truncate max-w-[120px]">{project.location}</span>}
        </div>
      </div>
      {detail && <span className={`text-xs shrink-0 ${detailClass || 'text-gray-400'}`}>{detail}</span>}
      <StatusBadge status={project.status} />
      <ChevronRight size={14} className="text-gray-300 shrink-0" />
    </Link>
  )
}
