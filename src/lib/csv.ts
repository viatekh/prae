import type { Item, Category } from '../types'

// ─── Export ──────────────────────────────────────────────────────────────────

export function itemsToCSV(items: Item[]): string {
  const headers = [
    'item_id', 'name', 'category', 'serial_number',
    'day_price', 'week_price', 'month_price',
    'purchase_price', 'replacement_value',
    'out_of_service', 'is_subhire', 'subhire_owner',
    'notes', 'components',
  ]

  const escape = (v: string | number | boolean | null | undefined): string => {
    const s = v == null ? '' : String(v)
    // Wrap in quotes if contains comma, quote or newline
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const rows = items.map(item => [
    item.item_id,
    item.name,
    item.category?.name || '',
    item.serial_number || '',
    item.day_price,
    item.week_price ?? '',
    item.month_price ?? '',
    item.purchase_price ?? '',
    item.replacement_value ?? '',
    item.out_of_service ? 'Yes' : 'No',
    item.is_subhire ? 'Yes' : 'No',
    item.subhire_owner || '',
    item.notes || '',
    (item.components || []).map(c => c.quantity > 1 ? `${c.quantity}x ${c.name}` : c.name).join('; '),
  ].map(escape).join(','))

  return [headers.join(','), ...rows].join('\n')
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Import / Parse ───────────────────────────────────────────────────────────

export interface CSVRow {
  item_id: string
  name: string
  category: string
  serial_number: string
  day_price: string
  week_price: string
  month_price: string
  purchase_price: string
  replacement_value: string
  out_of_service: string
  is_subhire: string
  subhire_owner: string
  notes: string
  components: string
  // raw row for display
  _raw: Record<string, string>
}

export interface ParsedImport {
  rows: CSVRow[]
  headers: string[]
  unknownHeaders: string[]
}

const KNOWN_HEADERS: Record<string, keyof CSVRow> = {
  'item_id': 'item_id', 'id': 'item_id', 'code': 'item_id',
  'name': 'name', 'item name': 'name', 'description': 'name',
  'category': 'category', 'cat': 'category',
  'serial_number': 'serial_number', 'serial': 'serial_number', 'serial no': 'serial_number',
  'day_price': 'day_price', 'day price': 'day_price', 'daily rate': 'day_price', 'price': 'day_price',
  'week_price': 'week_price', 'week price': 'week_price', 'weekly rate': 'week_price',
  'month_price': 'month_price', 'month price': 'month_price', 'monthly rate': 'month_price',
  'purchase_price': 'purchase_price', 'purchase price': 'purchase_price', 'cost price': 'purchase_price',
  'replacement_value': 'replacement_value', 'replacement value': 'replacement_value', 'insured value': 'replacement_value',
  'out_of_service': 'out_of_service', 'out of service': 'out_of_service', 'broken': 'out_of_service',
  'is_subhire': 'is_subhire', 'subhire': 'is_subhire', 'sub hire': 'is_subhire',
  'subhire_owner': 'subhire_owner', 'subhire owner': 'subhire_owner', 'owner': 'subhire_owner',
  'notes': 'notes', 'note': 'notes', 'comments': 'notes',
  'components': 'components', 'accessories': 'components', 'includes': 'components',
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

export function parseCSV(text: string): ParsedImport {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { rows: [], headers: [], unknownHeaders: [] }

  const rawHeaders = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
  const mappedHeaders = rawHeaders.map(h => KNOWN_HEADERS[h] || h)
  const unknownHeaders = rawHeaders.filter(h => !KNOWN_HEADERS[h])

  const rows: CSVRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i])
    if (cells.every(c => !c)) continue // skip blank rows

    const raw: Record<string, string> = {}
    rawHeaders.forEach((h, j) => { raw[h] = cells[j] || '' })

    const row: CSVRow = {
      item_id: '', name: '', category: '', serial_number: '',
      day_price: '', week_price: '', month_price: '',
      purchase_price: '', replacement_value: '',
      out_of_service: '', is_subhire: '', subhire_owner: '',
      notes: '', components: '', _raw: raw,
    }

    mappedHeaders.forEach((mapped, j) => {
      if (mapped !== '_raw' && mapped in row) {
        // Every mapped key other than `_raw` addresses a string field of CSVRow.
        const key = mapped as Exclude<keyof CSVRow, '_raw'>
        row[key] = cells[j] || ''
      }
    })

    rows.push(row)
  }

  return { rows, headers: rawHeaders, unknownHeaders }
}

export function csvRowToItemData(
  row: CSVRow,
  categories: Category[],
  generatedId?: string
) {
  const parseBool = (v: string) => /^(yes|true|1|y)$/i.test(v.trim())
  const parseNum  = (v: string) => { const n = parseFloat(v.replace(/[£,$,]/g, '')); return isNaN(n) ? null : n }

  const cat = categories.find(c => c.name.toLowerCase() === row.category.toLowerCase())

  return {
    item_id:           generatedId || row.item_id,
    name:              row.name,
    category_id:       cat?.id || null,
    serial_number:     row.serial_number || null,
    day_price:         parseNum(row.day_price) ?? 0,
    week_price:        parseNum(row.week_price),
    month_price:       parseNum(row.month_price),
    purchase_price:    parseNum(row.purchase_price),
    replacement_value: parseNum(row.replacement_value),
    out_of_service:    parseBool(row.out_of_service),
    out_of_service_reason: null as string | null,
    is_subhire:        parseBool(row.is_subhire),
    subhire_owner:     row.subhire_owner || null,
    notes:             row.notes || null,
  }
}

/** Parse component string like "Flight case; 2x XLR cable; Stand bag" */
export function parseComponents(componentsStr: string) {
  if (!componentsStr.trim()) return []
  return componentsStr.split(/[;,]/).map(s => {
    s = s.trim()
    const qtyMatch = s.match(/^(\d+)x?\s+(.+)$/i)
    if (qtyMatch) return { name: qtyMatch[2].trim(), quantity: parseInt(qtyMatch[1]) }
    return { name: s, quantity: 1 }
  }).filter(c => c.name)
}
