import { describe, it, expect } from 'vitest'
import { parseCSV, parseComponents, csvRowToItemData, itemsToCSV } from './csv'
import type { Category, Item } from '../types'

const CATEGORIES: Category[] = [
  { id: 'cat-dj', name: 'DJ', sort_order: 1 },
  { id: 'cat-spk', name: 'Speakers', sort_order: 2 },
]

describe('parseCSV', () => {
  it('maps known headers and reads rows', () => {
    const { rows, unknownHeaders } = parseCSV('name,day_price\nPioneer CDJ3000,85\n')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Pioneer CDJ3000')
    expect(rows[0].day_price).toBe('85')
    expect(unknownHeaders).toEqual([])
  })

  it('reports headers it does not recognise', () => {
    const { unknownHeaders } = parseCSV('name,warehouse_bay\nCDJ,A12\n')
    expect(unknownHeaders).toContain('warehouse_bay')
  })

  it('respects quoted fields containing commas', () => {
    const { rows } = parseCSV('name,notes\n"Speaker, large","Heavy, needs two people"\n')
    expect(rows[0].name).toBe('Speaker, large')
    expect(rows[0].notes).toBe('Heavy, needs two people')
  })

  it('handles escaped double quotes', () => {
    const { rows } = parseCSV('name\n"12"" driver"\n')
    expect(rows[0].name).toBe('12" driver')
  })

  it('accepts CRLF and bare CR line endings', () => {
    expect(parseCSV('name\r\nA\r\nB\r\n').rows).toHaveLength(2)
    expect(parseCSV('name\rA\rB\r').rows).toHaveLength(2)
  })

  it('skips blank rows', () => {
    const { rows } = parseCSV('name,day_price\nCDJ,85\n\n,\nDJM,120\n')
    expect(rows.map(r => r.name)).toEqual(['CDJ', 'DJM'])
  })

  it('returns nothing for a header-only or empty file', () => {
    expect(parseCSV('name,day_price\n').rows).toEqual([])
    expect(parseCSV('').rows).toEqual([])
  })
})

describe('csvRowToItemData', () => {
  // Values are quoted, as a real export would be, so a value containing a
  // comma (a formatted price) stays in its own column.
  const row = (over: Partial<Record<string, string>> = {}) => {
    const cells = [
      over.item_id ?? 'CDJ-001',
      over.name ?? 'CDJ3000',
      over.category ?? 'DJ',
      over.day_price ?? '85',
      over.week_price ?? '',
      over.out_of_service ?? '',
      over.is_subhire ?? '',
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',')
    return parseCSV(
      'item_id,name,category,day_price,week_price,out_of_service,is_subhire\n' + cells + '\n'
    ).rows[0]
  }

  it('resolves the category by name, case-insensitively', () => {
    expect(csvRowToItemData(row({ category: 'dj' }), CATEGORIES).category_id).toBe('cat-dj')
  })

  it('leaves the category null when it does not match', () => {
    expect(csvRowToItemData(row({ category: 'Lasers' }), CATEGORIES).category_id).toBeNull()
  })

  it('strips currency symbols and separators from prices', () => {
    expect(csvRowToItemData(row({ day_price: '£1,250.50' }), CATEGORIES).day_price).toBe(1250.5)
  })

  it('defaults an unparseable day price to 0 but leaves optional prices null', () => {
    const data = csvRowToItemData(row({ day_price: 'n/a', week_price: '' }), CATEGORIES)
    expect(data.day_price).toBe(0)
    expect(data.week_price).toBeNull()
  })

  it('reads the usual spellings of yes', () => {
    for (const v of ['yes', 'YES', 'true', '1', 'y']) {
      expect(csvRowToItemData(row({ is_subhire: v }), CATEGORIES).is_subhire).toBe(true)
    }
    for (const v of ['no', 'false', '0', '']) {
      expect(csvRowToItemData(row({ is_subhire: v }), CATEGORIES).is_subhire).toBe(false)
    }
  })

  it('prefers a generated id when one is supplied', () => {
    expect(csvRowToItemData(row(), CATEGORIES, 'GEN-009').item_id).toBe('GEN-009')
  })
})

describe('parseComponents', () => {
  it('splits on semicolons and commas', () => {
    expect(parseComponents('Flight case; XLR cable, Stand bag').map(c => c.name))
      .toEqual(['Flight case', 'XLR cable', 'Stand bag'])
  })

  it('reads a leading quantity, with or without the x', () => {
    expect(parseComponents('2x XLR cable')).toEqual([{ name: 'XLR cable', quantity: 2 }])
    expect(parseComponents('3 Stands')).toEqual([{ name: 'Stands', quantity: 3 }])
  })

  it('defaults to a quantity of one', () => {
    expect(parseComponents('Flight case')).toEqual([{ name: 'Flight case', quantity: 1 }])
  })

  it('returns nothing for empty input', () => {
    expect(parseComponents('')).toEqual([])
    expect(parseComponents('   ')).toEqual([])
  })
})

describe('itemsToCSV', () => {
  const item = {
    id: 'i1', item_id: 'CDJ-001', name: 'CDJ3000', category_id: 'cat-dj',
    category: CATEGORIES[0], serial_number: 'SN1', day_price: 85,
    week_price: 255, month_price: null, purchase_price: null, replacement_value: null,
    out_of_service: false, out_of_service_reason: null, is_subhire: false,
    subhire_owner: null, notes: 'Handle, with care', created_at: '2026-01-01T00:00:00Z',
    components: [{ id: 'c1', item_id: 'i1', name: 'Flight case', quantity: 1 }],
  } satisfies Item

  it('round-trips through the parser', () => {
    const { rows } = parseCSV(itemsToCSV([item]))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('CDJ3000')
    expect(rows[0].item_id).toBe('CDJ-001')
  })

  it('quotes values containing commas so columns do not shift', () => {
    const { rows } = parseCSV(itemsToCSV([item]))
    expect(rows[0].notes).toBe('Handle, with care')
  })
})
