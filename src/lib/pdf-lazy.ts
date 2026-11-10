import type { Project, Settings, LineItemDraft, Item } from '../types'

/** The item fields the picking list prints. */
type PickingItemInfo = Pick<Item, 'id' | 'item_id' | 'serial_number' | 'is_subhire' | 'subhire_owner'>

/**
 * @react-pdf/renderer is ~1.8MB and is only needed when someone actually asks
 * for a document, so it is loaded on demand rather than in the entry bundle.
 */
const loadPdf = () => import('./pdf')

export async function generateQuotePDF(project: Project, lines: LineItemDraft[], settings: Settings | undefined) {
  return (await loadPdf()).generateQuotePDF(project, lines, settings)
}

export async function generatePickingListPDF(
  project: Project,
  lines: LineItemDraft[],
  settings: Settings | undefined,
  items: PickingItemInfo[] = [],
) {
  return (await loadPdf()).generatePickingListPDF(project, lines, settings, items)
}

export async function generateDeliveryDocketPDF(project: Project, lines: LineItemDraft[], settings: Settings | undefined) {
  return (await loadPdf()).generateDeliveryDocketPDF(project, lines, settings)
}
