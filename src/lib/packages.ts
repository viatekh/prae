import type { Package } from '../types'
import type { ItemAvailability } from '../hooks/useAvailability'

/**
 * How many of a package can go out over the hire window: the tightest of its
 * contents, each divided by how many the package needs. null when none of its
 * contents is tracked (no dates set, or an empty package), so nothing is claimed.
 */
export function packageAvailability(pkg: Package, availability: Map<string, ItemAvailability>): number | null {
  let fits: number | null = null
  for (const pi of pkg.package_items ?? []) {
    const a = availability.get(pi.item_id)
    if (!a || pi.quantity <= 0) continue
    const n = Math.max(0, Math.floor(a.available / pi.quantity))
    fits = fits === null ? n : Math.min(fits, n)
  }
  return fits
}
