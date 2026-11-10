/**
 * Project dates are stored as both plain dates (`2026-09-20`) and full
 * timestamps (`2026-09-20T18:00:00Z`), and are compared as strings. Trimming
 * to day precision first keeps those two forms comparable — otherwise
 * `'2026-09-20T09:00' <= '2026-09-20'` is false and a same-day booking is
 * missed.
 */
export function toDay(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null
}

/** True when two closed day ranges share at least one day. */
export function overlaps(
  startA: string | null, endA: string | null,
  startB: string | null, endB: string | null,
): boolean {
  if (!startA || !endA || !startB || !endB) return false
  return startA <= endB && endA >= startB
}
