import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useProjects } from '../hooks/useProjects'
import type { Project } from '../types'
import { supabase } from '../lib/supabase'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isToday, parseISO, isWithinInterval,
  addMonths, subMonths, startOfWeek, endOfWeek,
  addWeeks, subWeeks, isBefore, startOfDay,
} from 'date-fns'

// ─── Kit movement badge with hover tooltip ───────────────────────────────────

interface KitLine { description: string; quantity: number }
interface KitProject { id: string; name: string; lines: KitLine[] }

function KitMovementBadge({
  label, arrow, color, projects,
}: {
  label: string
  arrow: string
  color: string
  projects: Project[]
}) {
  const [tooltip, setTooltip] = useState(false)
  const [kitData, setKitData] = useState<KitProject[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchKit = useCallback(async () => {
    if (kitData || loading || projects.length === 0) return
    setLoading(true)
    const ids = projects.map(p => p.id)
    const { data } = await supabase
      .from('project_line_items')
      .select('project_id, description, quantity, is_component')
      .in('project_id', ids)
      .eq('is_component', false)
    setKitData(
      projects.map(p => ({
        id: p.id,
        name: p.name,
        lines: (data || [])
          .filter(l => l.project_id === p.id)
          .map(l => ({ description: l.description, quantity: l.quantity })),
      }))
    )
    setLoading(false)
  }, [kitData, loading, projects])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setTooltip(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        className={`text-xs font-medium ${color} hover:opacity-80 transition-opacity`}
        onMouseEnter={() => { setTooltip(true); fetchKit() }}
        onMouseLeave={() => setTooltip(false)}
      >
        {arrow} {label}
      </button>
      {tooltip && (
        <div className="absolute z-50 left-0 top-full mt-1 w-56 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-2.5 space-y-2 pointer-events-none">
          <p className="font-semibold text-gray-300 uppercase tracking-wide" style={{ fontSize: '10px' }}>{label}</p>
          {loading && <p className="text-gray-400">Loading…</p>}
          {kitData?.map(proj => (
            <div key={proj.id}>
              <p className="font-medium truncate">{proj.name}</p>
              {proj.lines.length === 0
                ? <p className="text-gray-400">No kit listed</p>
                : proj.lines.map((l, i) => (
                  <p key={i} className="text-gray-300 truncate">· {l.quantity > 1 ? `${l.quantity}× ` : ''}{l.description}</p>
                ))
              }
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ProjectChip({ p, day, onNavigate, className }: {
  p: Project; day: Date; onNavigate: (id: string) => void; className?: string
}) {
  const [tooltip, setTooltip] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const isOverdueP = isOverdue(p)

  const isDep = p.delivery_date && format(parseISO(p.delivery_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
  const isRet = p.collection_date && format(parseISO(p.collection_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')

  return (
    <div className="relative">
      <button
        ref={ref}
        onClick={() => onNavigate(p.id)}
        onMouseEnter={() => setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
        className={`w-full text-left px-1 py-0.5 rounded text-xs truncate ${className ?? projectColor(p)}`}
      >
        {isOverdueP ? '⚠ ' : ''}{isDep ? '↑ ' : ''}{isRet ? '↓ ' : ''}{p.name}
      </button>
      {tooltip && (
        <div className="absolute z-50 left-0 top-full mt-1 w-52 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-2.5 space-y-1 pointer-events-none">
          <p className="font-semibold truncate">{p.name}</p>
          {p.client && <p className="text-gray-300 truncate">👤 {p.client.name}{p.client.company ? ` — ${p.client.company}` : ''}</p>}
          {p.location && <p className="text-gray-300 truncate">📍 {p.location}</p>}
          <div className="border-t border-white/10 pt-1 space-y-0.5">
            {p.event_date && <p className="text-gray-400">Event: {format(parseISO(p.event_date), 'd MMM HH:mm')}</p>}
            {p.delivery_date && <p className="text-green-300">↑ Out: {format(parseISO(p.delivery_date), 'd MMM HH:mm')}</p>}
            {p.collection_date && <p className="text-blue-300">↓ In: {format(parseISO(p.collection_date), 'd MMM HH:mm')}</p>}
          </div>
          <p className="text-gray-500 uppercase tracking-wide" style={{fontSize:'10px'}}>{p.status} · {p.project_number}</p>
        </div>
      )}
    </div>
  )
}

interface CalendarViewProps {
  projects: Project[]
  onNavigate: (id: string) => void
  /** The date the calendar is centred on; shared so switching view keeps your place. */
  current: Date
  setCurrent: React.Dispatch<React.SetStateAction<Date>>
}

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-200 text-gray-700',
  sent:      'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  invoiced:  'bg-yellow-100 text-yellow-800',
  completed: 'bg-purple-100 text-purple-800',
  overdue:   'bg-red-100 text-red-800',
}

function projectsForDay(projects: Project[], day: Date): Project[] {
  return projects.filter(p => {
    const start = p.event_date ? parseISO(p.event_date) : null
    if (!start) return false
    const end = p.collection_date ? parseISO(p.collection_date) : start
    try { return isWithinInterval(day, { start, end }) } catch { return false }
  })
}

function isOverdue(p: Project): boolean {
  if (!p.collection_date) return false
  if (p.status === 'completed') return false
  return isBefore(parseISO(p.collection_date), startOfDay(new Date()))
}

function projectColor(p: Project): string {
  if (isOverdue(p)) return STATUS_COLORS.overdue
  return STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'
}

// ─── Month view ──────────────────────────────────────────────────────────────

function MonthView({ projects, onNavigate, current, setCurrent }: CalendarViewProps) {
  const monthStart = startOfMonth(current)
  const monthEnd   = endOfMonth(current)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 1 })
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{format(current, 'MMMM yyyy')}</h1>
        <div className="flex gap-1">
          <button onClick={() => setCurrent(m => subMonths(m, 1))} aria-label="Previous month" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrent(new Date())} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 cursor-pointer">Today</button>
          <button onClick={() => setCurrent(m => addMonths(m, 1))} aria-label="Next month" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-gray-400 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const dayProjects = projectsForDay(projects, day)
            const isCurrentMonth = isSameMonth(day, current)
            const depProjects = projects.filter(p => p.delivery_date && format(parseISO(p.delivery_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
            const retProjects = projects.filter(p => p.collection_date && format(parseISO(p.collection_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))

            return (
              <div key={idx} className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${!isCurrentMonth ? 'bg-gray-50' : ''} ${idx % 7 === 6 ? 'border-r-0' : ''}`}>
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-gray-900 text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                  {format(day, 'd')}
                </div>
                <div className="flex flex-col gap-0.5 mb-1">
                  {depProjects.length > 0 && <KitMovementBadge arrow="↑" label="Departing" color="text-green-600" projects={depProjects} />}
                  {retProjects.length > 0 && <KitMovementBadge arrow="↓" label="Returning" color="text-blue-600" projects={retProjects} />}
                </div>
                <div className="space-y-0.5">
                  {dayProjects.slice(0, 3).map(p => (
                    <ProjectChip key={p.id} p={p} day={day} onNavigate={onNavigate} />
                  ))}
                  {dayProjects.length > 3 && <p className="text-xs text-gray-400 px-1">+{dayProjects.length - 3} more</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Week view ───────────────────────────────────────────────────────────────

function WeekView({ projects, onNavigate, current, setCurrent }: CalendarViewProps) {
  const weekStart = startOfWeek(current, { weekStartsOn: 1 })
  const days = eachDayOfInterval({
    start: weekStart,
    end:   endOfWeek(weekStart, { weekStartsOn: 1 }),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {format(days[0], 'd MMM')} – {format(days[6], 'd MMM yyyy')}
        </h1>
        <div className="flex gap-1">
          <button onClick={() => setCurrent(w => subWeeks(w, 1))} aria-label="Previous week" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrent(new Date())} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 cursor-pointer">This week</button>
          <button onClick={() => setCurrent(w => addWeeks(w, 1))} aria-label="Next week" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {days.map(day => (
            <div key={day.toISOString()} className={`px-2 py-2 text-center border-r border-gray-100 last:border-r-0 ${isToday(day) ? 'bg-gray-900' : ''}`}>
              <p className={`text-xs font-medium ${isToday(day) ? 'text-white' : 'text-gray-400'}`}>{format(day, 'EEE')}</p>
              <p className={`text-sm font-semibold ${isToday(day) ? 'text-white' : 'text-gray-700'}`}>{format(day, 'd')}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-[200px]">
          {days.map(day => {
            const dayProjects = projectsForDay(projects, day)
            const depProjects = projects.filter(p => p.delivery_date && format(parseISO(p.delivery_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
            const retProjects = projects.filter(p => p.collection_date && format(parseISO(p.collection_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))

            return (
              <div key={day.toISOString()} className={`p-2 space-y-1 ${isToday(day) ? 'bg-gray-50' : ''}`}>
                {depProjects.length > 0 && <KitMovementBadge arrow="↑" label="Departing" color="text-green-600 font-medium" projects={depProjects} />}
                {retProjects.length > 0 && <KitMovementBadge arrow="↓" label="Returning" color="text-blue-600 font-medium" projects={retProjects} />}
                {dayProjects.map(p => (
                  <ProjectChip key={p.id} p={p} day={day} onNavigate={onNavigate} className={`px-2 py-1 ${projectColor(p)}`} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Agenda / list view (mobile-friendly) ────────────────────────────────────

function AgendaView({ projects, onNavigate, current, setCurrent }: CalendarViewProps) {
  // Show 30 days from current
  const days = eachDayOfInterval({ start: current, end: addMonths(current, 1) })
  const activeDays = days.filter(d => projectsForDay(projects, d).length > 0 ||
    projects.some(p => p.delivery_date && format(parseISO(p.delivery_date), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd')) ||
    projects.some(p => p.collection_date && format(parseISO(p.collection_date), 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd'))
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">{format(current, 'MMMM yyyy')}</h1>
        <div className="flex gap-1">
          <button onClick={() => setCurrent(m => subMonths(m, 1))} aria-label="Previous month" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrent(new Date())} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 cursor-pointer">Today</button>
          <button onClick={() => setCurrent(m => addMonths(m, 1))} aria-label="Next month" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="space-y-1">
        {activeDays.length === 0 && <p className="text-sm text-gray-400 text-center py-12">No events this month</p>}
        {activeDays.map(day => {
          const dayProjects = projectsForDay(projects, day)
          const depProjects = projects.filter(p => p.delivery_date && format(parseISO(p.delivery_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
          const retProjects = projects.filter(p => p.collection_date && format(parseISO(p.collection_date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
          return (
            <div key={day.toISOString()} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`px-4 py-2 border-b border-gray-100 flex items-center gap-3 ${isToday(day) ? 'bg-gray-900' : 'bg-gray-50'}`}>
                <span className={`text-sm font-bold ${isToday(day) ? 'text-white' : 'text-gray-700'}`}>{format(day, 'EEE d MMM')}</span>
                <div className="flex gap-2 ml-auto">
                  {depProjects.length > 0 && <span className="text-xs text-green-600 font-medium">↑ {depProjects.length} out</span>}
                  {retProjects.length > 0 && <span className="text-xs text-blue-600 font-medium">↓ {retProjects.length} in</span>}
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {dayProjects.map(p => (
                  <button key={p.id} onClick={() => onNavigate(p.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${projectColor(p).split(' ')[0]}`} />
                    <span className="flex-1 text-sm font-medium text-gray-900 truncate">{p.name}</span>
                    {p.client && <span className="text-xs text-gray-400 truncate max-w-[120px]">{p.client.name}</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${projectColor(p)}`}>{p.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

type CalendarView = 'month' | 'week' | 'agenda'
const VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'month',  label: 'Month' },
  { key: 'week',   label: 'Week' },
  { key: 'agenda', label: 'Agenda' },
]

function isView(v: string | null): v is CalendarView {
  return !!v && VIEWS.some(x => x.key === v)
}

export function CalendarPage() {
  const { data: projects = [] } = useProjects()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const viewParam = params.get('view')
  const view: CalendarView = isView(viewParam) ? viewParam : 'month'

  // One cursor for all three views — switching Month → Week used to jump you
  // back to today instead of keeping the week you were looking at.
  const [current, setCurrent] = useState(() => new Date())

  const setView = (next: CalendarView) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (next === 'month') p.delete('view')
      else p.set('view', next)
      return p
    }, { replace: true })
  }

  const goToProject = useCallback((id: string) => navigate(`/projects/${id}`), [navigate])

  const today = new Date()
  const departingToday = projects.filter(p => p.delivery_date && format(parseISO(p.delivery_date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'))
  const returningToday = projects.filter(p => p.collection_date && format(parseISO(p.collection_date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'))
  const todayProjects  = projectsForDay(projects, today)
  const overdueProjects = projects.filter(isOverdue)

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0">
          {/* View toggle */}
          <div className="flex gap-1 mb-4" role="group" aria-label="Calendar view">
            {VIEWS.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  view === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {view === 'month'  && <MonthView  projects={projects} current={current} setCurrent={setCurrent} onNavigate={goToProject} />}
          {view === 'week'   && <WeekView   projects={projects} current={current} setCurrent={setCurrent} onNavigate={goToProject} />}
          {view === 'agenda' && <AgendaView projects={projects} current={current} setCurrent={setCurrent} onNavigate={goToProject} />}

          <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
            <span><span className="text-green-600 mr-1">↑</span>Kit departing</span>
            <span><span className="text-blue-600 mr-1">↓</span>Kit returning</span>
            {Object.entries(STATUS_COLORS).map(([s, cls]) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`inline-block w-3 h-3 rounded ${cls.split(' ')[0]}`} />{s}
              </span>
            ))}
          </div>
        </div>

        {/* Sidebar — hidden on mobile (use agenda view instead) */}
        <div className="hidden md:block w-60 space-y-4 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Today — {format(today, 'd MMM')}</h2>
            {departingToday.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-green-700 mb-1">↑ Departing</p>
                {departingToday.map(p => (
                  <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="w-full text-left text-xs text-gray-700 hover:text-gray-900 py-0.5 truncate">{p.name}</button>
                ))}
              </div>
            )}
            {returningToday.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-blue-700 mb-1">↓ Returning</p>
                {returningToday.map(p => (
                  <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="w-full text-left text-xs text-gray-700 hover:text-gray-900 py-0.5 truncate">{p.name}</button>
                ))}
              </div>
            )}
            {todayProjects.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Out today</p>
                {todayProjects.map(p => (
                  <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                    className={`w-full text-left text-xs py-0.5 px-1.5 rounded mb-0.5 truncate ${projectColor(p)}`}>{p.name}</button>
                ))}
              </div>
            )}
            {departingToday.length === 0 && returningToday.length === 0 && todayProjects.length === 0 && (
              <p className="text-xs text-gray-400">Nothing today</p>
            )}
          </div>

          {overdueProjects.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-red-700 mb-2">⚠ Overdue collection</h2>
              {overdueProjects.map(p => (
                <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                  className="w-full text-left text-xs text-red-700 hover:text-red-900 py-0.5 truncate block">
                  {p.name}
                  {p.collection_date && <span className="text-red-400 ml-1">({format(parseISO(p.collection_date), 'd MMM')})</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
