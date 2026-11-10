import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { Project, Settings } from '../../types'
import type { ProjectAction, ActionKind } from '../../lib/actions'
import { buildEmail, composeUrl } from '../../lib/email'
import type { EmailKind } from '../../lib/email'
import { useUpdateProject } from '../../hooks/useProjects'
import { useAddProjectLog } from '../../hooks/useProjectLogs'
import { cn } from '../../lib/utils'
import { Button } from '../shared/Button'

const TONE: Record<ActionKind, string> = {
  overdue_return: 'bg-red-100 text-red-700',
  check_out: 'bg-blue-100 text-blue-700',
  check_in: 'bg-green-100 text-green-700',
  to_invoice: 'bg-amber-100 text-amber-700',
  unpaid: 'bg-amber-100 text-amber-700',
  chase_quote: 'bg-purple-100 text-purple-700',
  quote_expired: 'bg-gray-100 text-gray-600',
  finish_draft: 'bg-gray-100 text-gray-600',
}

/** The button for each kind of action: what it says, and the email it sends (if it is one). */
const BUTTON: Record<ActionKind, { label: string; email?: EmailKind; to?: 'check' | 'project' }> = {
  overdue_return: { label: 'Chase return', email: 'return_reminder' },
  check_out: { label: 'Check out', to: 'check' },
  check_in: { label: 'Check in', to: 'check' },
  to_invoice: { label: 'Invoice', to: 'project' },
  unpaid: { label: 'Send reminder', email: 'payment_reminder' },
  chase_quote: { label: 'Chase', email: 'quote' },
  quote_expired: { label: 'Open', to: 'project' },
  finish_draft: { label: 'Finish quote', to: 'project' },
}

/**
 * The day's work, derived from the jobs themselves. Each row carries the one
 * button that deals with it.
 */
export function ActionList({ actions, projects, settings }: {
  actions: ProjectAction[]
  projects: Project[]
  settings: Settings | undefined
}) {
  const navigate = useNavigate()
  const updateProject = useUpdateProject()
  const addLog = useAddProjectLog()
  const byId = new Map(projects.map(p => [p.id, p]))

  if (actions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center">
        <CheckCircle2 size={28} className="mx-auto text-green-500 mb-2" />
        <p className="text-sm font-medium text-gray-900">All clear</p>
        <p className="text-sm text-gray-500">Nothing needs doing right now.</p>
      </div>
    )
  }

  const run = (action: ProjectAction, project: Project) => {
    const button = BUTTON[action.kind]
    if (button.email) {
      // The total isn't loaded on the list view; reminders read fine without it.
      const draft = buildEmail(button.email, project, settings, 0)
      const body = draft.body.replace(/, totalling £0\.00| \(£0\.00\)/g, '')
      window.open(composeUrl({ ...draft, body }, settings?.email_via ?? 'gmail'), '_blank', 'noopener')
      addLog.mutate({ project_id: project.id, message: `${button.label} — emailed ${draft.to || 'client'}` })
      if (action.kind === 'chase_quote') updateProject.mutate({ id: project.id, quote_sent_at: new Date().toISOString() })
    } else {
      navigate(button.to === 'check' ? `/projects/${project.id}/check` : `/projects/${project.id}`)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {actions.map(action => {
        const project = byId.get(action.projectId)
        if (!project) return null
        const button = BUTTON[action.kind]
        return (
          <div key={`${action.kind}-${action.projectId}`} className="flex items-center gap-3 px-3 md:px-4 py-3 border-b border-gray-100 last:border-0">
            <span className={cn('hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full shrink-0 w-36 justify-center', TONE[action.kind])}>
              {action.kind === 'overdue_return' && <AlertCircle size={12} />}{action.title}
            </span>
            <Link to={`/projects/${project.id}`} className="flex-1 min-w-0 group">
              <p className="text-sm font-medium text-gray-900 truncate group-hover:underline">{project.name}</p>
              <p className="text-xs text-gray-500 truncate">
                <span className={cn('sm:hidden font-medium', action.kind === 'overdue_return' && 'text-red-600')}>{action.title} · </span>
                {project.client?.name ? `${project.client.name} · ` : ''}{action.detail}
              </p>
            </Link>
            {action.kind === 'unpaid' && (
              <Button size="sm" variant="ghost" className="shrink-0"
                onClick={() => updateProject.mutate({ id: project.id, status: 'completed', paid_at: new Date().toISOString() })}>
                Mark paid
              </Button>
            )}
            <Button size="sm" variant={action.priority <= 2 ? 'primary' : 'secondary'} className="shrink-0" onClick={() => run(action, project)}>
              {button.label}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
