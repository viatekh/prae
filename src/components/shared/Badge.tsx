import { cn } from '../../lib/utils'
import type { ProjectStatus } from '../../types'

const STATUS_STYLES: Record<ProjectStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  invoiced: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-purple-100 text-purple-700',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_STYLES[status])}>
      {status}
    </span>
  )
}

export function SubhireBadge() {
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
      Subhire
    </span>
  )
}

export function OutOfServiceBadge({ reason }: { reason?: string | null }) {
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={reason || 'Out of service'}>
      Out of service
    </span>
  )
}
