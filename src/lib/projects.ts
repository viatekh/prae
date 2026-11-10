import type { NewProject } from '../hooks/useProjects'

/** A reference built from the project's initials and the reserved number, e.g. SPB-00042. */
export function autoRef(name: string, nextNumber: string): string {
  const numPart = nextNumber.split('-').pop() || '00001'
  const abbr = name.trim().split(/\s+/).slice(0, 4).map(w => w[0]?.toUpperCase() || '').join('')
  return abbr ? `${abbr}-${numPart}` : nextNumber
}

/** Every scalar column of a project, at its "new project" default. */
export function blankProject(): Omit<NewProject, 'project_number' | 'name' | 'client_id'> {
  return {
    status: 'draft',
    location: null,
    delivery_address: null,
    event_date: null,
    delivery_date: null,
    collection_date: null,
    client_collects: false,
    client_returns: false,
    delivery_mode: null,
    collection_mode: null,
    delivery_notes: null,
    collection_notes: null,
    expiry_date: null,
    po_number: null,
    deposit_amount: null,
    deposit_paid: false,
    overall_discount_pct: 0,
    check_out_at: null,
    check_in_at: null,
    damage_notes: null,
    notes: null,
    client_notes: null,
  }
}

