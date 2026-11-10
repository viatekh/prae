import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ProjectRevenueRow, ProjectStatus } from '../types'

/** Statuses that count as booked income. */
export const EARNING_STATUSES: ProjectStatus[] = ['confirmed', 'invoiced', 'completed']

const REVENUE_SELECT =
  'id, name, project_number, status, client_id, event_date, created_at, overall_discount_pct, ' +
  'client:clients(name), ' +
  'line_items:project_line_items(unit_price, week_price, month_price, unit_cost, quantity, days, discount_pct, is_component, description)'

/**
 * Projects with enough line-item detail to compute revenue.
 * Dashboard, Reports and Clients previously each ran their own near-identical
 * ad-hoc query with `any` rows.
 */
export function useProjectRevenue(statuses: ProjectStatus[] = EARNING_STATUSES) {
  return useQuery({
    queryKey: ['project-revenue', [...statuses].sort()],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(REVENUE_SELECT)
        .in('status', statuses)
        .order('event_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as ProjectRevenueRow[]
    },
  })
}
