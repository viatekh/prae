import { Check, ArrowRight } from 'lucide-react'
import type { Project, ProjectStatus } from '../../types'
import { cn } from '../../lib/utils'
import { WORKFLOW_STAGES, workflowStageIndex, nextWorkflowAction } from '../../lib/workflow'
import type { WorkflowAction } from '../../lib/workflow'
import { PROJECT_STATUSES } from '../../hooks/useProjects'
import { Button } from '../shared/Button'

/**
 * Shows where a project is in its life and offers the one obvious next step.
 * The status dropdown stays for corrections and for skipping stages.
 */
export function ProjectWorkflow({ project, busy, onAdvance, onStatusChange }: {
  project: Pick<Project, 'status' | 'check_out_at' | 'check_in_at'>
  busy: boolean
  onAdvance: (action: WorkflowAction) => void
  onStatusChange: (status: ProjectStatus) => void
}) {
  const current = workflowStageIndex(project)
  const next = nextWorkflowAction(project)

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 md:px-4 mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
      <ol className="flex items-center flex-1 min-w-0" aria-label="Project progress">
        {WORKFLOW_STAGES.map((stage, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={stage.key} className={cn('flex items-center', i > 0 && 'flex-1')}
              aria-current={active ? 'step' : undefined}>
              {i > 0 && <span className={cn('h-0.5 flex-1 min-w-2 mx-1 md:mx-1.5 rounded', i <= current ? 'bg-gray-900' : 'bg-gray-200')} />}
              <span className="flex items-center gap-1.5 shrink-0">
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                  done && 'bg-gray-900 text-white',
                  active && 'bg-gray-900 text-white ring-4 ring-gray-200',
                  !done && !active && 'bg-gray-100 text-gray-400',
                )}>
                  {done ? <Check size={11} /> : i + 1}
                </span>
                <span className={cn(
                  'text-xs whitespace-nowrap',
                  active ? 'font-semibold text-gray-900' : 'hidden xl:inline',
                  done ? 'text-gray-600' : !active && 'text-gray-400',
                )}>
                  {stage.label}
                </span>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="flex items-center gap-2 shrink-0">
        <label className="sr-only" htmlFor="project-status">Status</label>
        <select
          id="project-status"
          value={project.status}
          disabled={busy}
          onChange={e => onStatusChange(e.target.value as ProjectStatus)}
          title="Change status directly"
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        {next && (
          <Button size="sm" disabled={busy} onClick={() => onAdvance(next)} className="flex-1 lg:flex-none">
            {next.label}<ArrowRight size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
