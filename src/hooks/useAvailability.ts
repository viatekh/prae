import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Item, ProjectStatus } from '../types'
import { toDay, overlaps } from '../lib/dates'

/** Statuses that hold stock — a draft doesn't reserve anything. */
const COMMITTED_STATUSES: ProjectStatus[] = ['sent', 'confirmed', 'invoiced']

interface BookingRow {
  item_id: string | null
  quantity: number
  project: {
    id: string
    name: string
    project_number: string
    event_date: string | null
    collection_date: string | null
    status: ProjectStatus
  } | null
}

export interface BookingConflict {
  item_id: string
  project_id: string
  project_name: string
  project_number: string
  event_date: string | null
}

/**
 * Rows for other projects that hold stock over the given window.
 * `excludeProjectId` may be empty (e.g. the Inventory overview, which has no
 * project context) — filtering `project_id != ''` against a uuid column errors
 * in Postgres, so the filter is only applied when there is an id to exclude.
 */
function bookedLineItemsQuery(excludeProjectId: string) {
  let query = supabase
    .from('project_line_items')
    .select('item_id, quantity, project:projects!inner(id, name, project_number, event_date, collection_date, status)')
    .not('item_id', 'is', null)
    .in('projects.status', COMMITTED_STATUSES)
  if (excludeProjectId) query = query.neq('project_id', excludeProjectId)
  return query
}

export function useItemConflicts(
  itemIds: string[],
  projectId: string,
  eventDate: string | null,
  collectionDate: string | null,
) {
  return useQuery({
    queryKey: ['conflicts', [...itemIds].sort(), projectId, eventDate, collectionDate],
    enabled: itemIds.length > 0 && !!(eventDate || collectionDate),
    queryFn: async () => {
      const start = toDay(eventDate || collectionDate)
      const end = toDay(collectionDate || eventDate)

      const { data, error } = await bookedLineItemsQuery(projectId).in('item_id', itemIds)
      if (error) throw error

      const conflicts: BookingConflict[] = []
      for (const row of (data ?? []) as unknown as BookingRow[]) {
        const p = row.project
        if (!p || !row.item_id) continue
        if (overlaps(start, end, toDay(p.event_date || p.collection_date), toDay(p.collection_date || p.event_date))) {
          conflicts.push({
            item_id: row.item_id,
            project_id: p.id,
            project_name: p.name,
            project_number: p.project_number,
            event_date: p.event_date,
          })
        }
      }
      return conflicts
    },
  })
}

// ─── Per-item-type availability ───────────────────────────────────────────────
// Returns a map from item.id → { total, booked, available }
// "total"  = physical units of that name in inventory
// "booked" = qty committed to OTHER sent/confirmed/invoiced projects on overlapping dates

function useBookedQtyMap(projectId: string, eventDate: string | null, collectionDate: string | null) {
  return useQuery({
    queryKey: ['booked-qty', projectId, eventDate, collectionDate],
    enabled: !!(eventDate || collectionDate),
    staleTime: 30_000,
    queryFn: async () => {
      const start = toDay(eventDate || collectionDate)
      const end = toDay(collectionDate || eventDate)

      const { data, error } = await bookedLineItemsQuery(projectId)
      if (error) throw error

      const map = new Map<string, number>() // item uuid → qty booked
      for (const row of (data ?? []) as unknown as BookingRow[]) {
        const p = row.project
        if (!p || !row.item_id) continue
        if (overlaps(start, end, toDay(p.event_date || p.collection_date), toDay(p.collection_date || p.event_date))) {
          map.set(row.item_id, (map.get(row.item_id) ?? 0) + row.quantity)
        }
      }
      return map
    },
  })
}

export interface ItemAvailability {
  total: number     // physical units of this name in inventory
  booked: number    // committed in other overlapping projects
  available: number // total - booked
  max: number       // max qty the user should be allowed to add
}

const EMPTY_BOOKINGS = new Map<string, number>()

export function useItemTypeAvailability(
  allItems: Item[],
  projectId: string,
  eventDate: string | null,
  collectionDate: string | null,
): Map<string, ItemAvailability> {
  // A stable fallback — `= new Map()` inline would be a fresh object each render
  // and defeat the memo below.
  const { data: bookedByItemId = EMPTY_BOOKINGS } = useBookedQtyMap(projectId, eventDate, collectionDate)

  return useMemo(() => {
    // Group hireable items by lowercased name to get a count per type.
    // Out-of-service units can't be booked, so they're excluded from the total.
    const activeItems = allItems.filter(i => !i.out_of_service)
    const byName = new Map<string, Item[]>()
    for (const item of activeItems) {
      const key = item.name.trim().toLowerCase()
      const peers = byName.get(key)
      if (peers) peers.push(item)
      else byName.set(key, [item])
    }

    const result = new Map<string, ItemAvailability>()
    for (const item of activeItems) {
      const peers = byName.get(item.name.trim().toLowerCase()) ?? []
      const total = peers.length
      const booked = peers.reduce((sum, p) => sum + (bookedByItemId.get(p.id) ?? 0), 0)
      const available = Math.max(0, total - booked)
      result.set(item.id, { total, booked, available, max: available })
    }
    return result
  }, [allItems, bookedByItemId])
}
