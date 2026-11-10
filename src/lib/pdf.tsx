import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { Project, Settings, LineItemDraft } from '../types'
import { calcLineTotal, calcProjectTotals, lineRateBasis } from './utils'
import { format, parseISO } from 'date-fns'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 40, color: '#1a1a1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 14, borderBottom: '1.5 solid #1a1a1a' },
  headerLeft: { flex: 1 },
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  companyDetail: { fontSize: 8, color: '#555', lineHeight: 1.5 },
  headerRight: { width: 180, alignItems: 'flex-end' },
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 8, textAlign: 'right' },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { fontSize: 8, color: '#777', width: 80, textAlign: 'right' },
  metaValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', flex: 1, textAlign: 'right' },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 10, marginBottom: 3 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f3f3f3', padding: '4 6', marginBottom: 1 },
  tableRow: { flexDirection: 'row', padding: '3.5 6', borderBottom: '0.5 solid #eee' },
  componentRow: { flexDirection: 'row', padding: '2 6 2 16', borderBottom: '0.5 solid #f5f5f5', backgroundColor: '#fafafa' },
  colCheck: { width: 18 },
  colId: { width: 60, fontSize: 7, fontFamily: 'Helvetica' },
  col: { flex: 3 },
  colSm: { width: 38, textAlign: 'right' },
  colMd: { width: 52, textAlign: 'right' },
  colBold: { fontFamily: 'Helvetica-Bold' },
  faint: { color: '#999' },
  catTotal: { flexDirection: 'row', justifyContent: 'flex-end', padding: '3 6', borderTop: '0.5 solid #ddd', marginBottom: 4 },
  totalsBox: { marginTop: 10, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', marginBottom: 2 },
  totalLabel: { fontSize: 9, color: '#555', width: 110, textAlign: 'right' },
  totalValue: { fontSize: 9, width: 65, textAlign: 'right' },
  grandTotal: { flexDirection: 'row', marginTop: 4, paddingTop: 5, borderTop: '1.5 solid #1a1a1a' },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 110, textAlign: 'right' },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 65, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 28, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#bbb', borderTop: '0.5 solid #eee', paddingTop: 4 },
  internalBanner: { backgroundColor: '#fff3cd', padding: '5 10', borderRadius: 3, marginBottom: 14 },
  internalBannerText: { fontSize: 9, color: '#856404', fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  notesBox: { backgroundColor: '#f9f9f9', padding: '7 10', borderRadius: 3, marginTop: 6, marginBottom: 6 },
  notesText: { fontSize: 8, color: '#444', lineHeight: 1.5 },
  paymentBox: { marginTop: 14, paddingTop: 10, borderTop: '0.5 solid #ddd' },
  tcPage: { fontFamily: 'Helvetica', fontSize: 8, padding: 50, color: '#333', lineHeight: 1.6 },
  tcTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 16, textAlign: 'center' },
  tcBody: { fontSize: 8, lineHeight: 1.7, color: '#444' },
})

function fmt(n: number) { return `£${n.toFixed(2)}` }
function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  try { return format(parseISO(s), 'd MMM yyyy HH:mm') } catch { return String(s) }
}

function groupLines(lines: LineItemDraft[]) {
  const cats: Record<string, LineItemDraft[]> = {}
  lines.filter(l => !l.is_component).forEach(l => {
    if (!cats[l.category]) cats[l.category] = []
    cats[l.category].push(l)
  })
  return cats
}

function CompanyHeader({ settings, project, title }: { settings: Settings | undefined; project: Project; title: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.companyName}>{settings?.company_name || 'Your Company'}</Text>
        {settings?.company_address?.split('\n').map((line, i) => (
          <Text key={i} style={styles.companyDetail}>{line}</Text>
        ))}
        {settings?.company_email   && <Text style={styles.companyDetail}>{settings.company_email}</Text>}
        {settings?.company_phone   && <Text style={styles.companyDetail}>{settings.company_phone}</Text>}
        {settings?.company_website && <Text style={styles.companyDetail}>{settings.company_website}</Text>}
        {settings?.company_reg     && <Text style={styles.companyDetail}>{settings.company_reg}</Text>}
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.docTitle}>{title}</Text>
        <View style={styles.metaRow}><Text style={styles.metaLabel}>Ref</Text><Text style={[styles.metaValue, styles.colBold]}>{project.project_number}</Text></View>
        <View style={styles.metaRow}><Text style={styles.metaLabel}>Date</Text><Text style={styles.metaValue}>{format(new Date(), 'd MMM yyyy')}</Text></View>
        {project.expiry_date && <View style={styles.metaRow}><Text style={styles.metaLabel}>Expires</Text><Text style={styles.metaValue}>{project.expiry_date}</Text></View>}
        {project.po_number   && <View style={styles.metaRow}><Text style={styles.metaLabel}>PO ref</Text><Text style={styles.metaValue}>{project.po_number}</Text></View>}
        {project.event_date  && <View style={styles.metaRow}><Text style={styles.metaLabel}>Event date</Text><Text style={styles.metaValue}>{fmtDate(project.event_date)}</Text></View>}
        {project.delivery_date && !project.client_collects && (
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Delivery</Text><Text style={styles.metaValue}>{fmtDate(project.delivery_date)}</Text></View>
        )}
        {project.client_collects && (
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Delivery</Text><Text style={styles.metaValue}>Client collects</Text></View>
        )}
        {project.collection_date && !project.client_returns && (
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Collection</Text><Text style={styles.metaValue}>{fmtDate(project.collection_date)}</Text></View>
        )}
        {project.client_returns && (
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Collection</Text><Text style={styles.metaValue}>Client returns</Text></View>
        )}
      </View>
    </View>
  )
}

function QuoteDocument({ project, lines, settings }: { project: Project; lines: LineItemDraft[]; settings: Settings | undefined }) {
  const overallDiscount = project.overall_discount_pct ?? 0
  const { subtotal, linesSubtotal, overallDiscount: discAmount } = calcProjectTotals(lines, overallDiscount)
  const vatRate = settings?.vat_enabled ? settings.vat_rate / 100 : 0
  const vat = subtotal * vatRate
  const total = subtotal + vat
  const grouped = groupLines(lines)
  const allComponents = lines.filter(l => l.is_component)
  const hasTCs = !!(settings?.tc_text?.trim())

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <CompanyHeader settings={settings} project={project} title="Quotation" />

        {/* Client / job info */}
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
          Quotation: {project.name}
        </Text>
        {project.client && (
          <Text style={{ fontSize: 8, color: '#555', marginBottom: 1 }}>
            Client: {project.client.name}{project.client.company ? ` — ${project.client.company}` : ''}
          </Text>
        )}
        {project.delivery_address && (
          <Text style={{ fontSize: 8, color: '#555', marginBottom: 1 }}>
            {project.client_collects ? 'Collection address: ' : 'Delivery address: '}{project.delivery_address}
          </Text>
        )}
        {project.location && (
          <Text style={{ fontSize: 8, color: '#555', marginBottom: 6 }}>Location: {project.location}</Text>
        )}

        {project.client_notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesText}>{project.client_notes}</Text>
          </View>
        )}

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.col, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Item</Text>
          <Text style={[styles.colSm, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Type</Text>
          <Text style={[styles.colSm, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Qty</Text>
          <Text style={[styles.colSm, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Days</Text>
          <Text style={[styles.colMd, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Price</Text>
          <Text style={[styles.colSm, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Disc</Text>
          <Text style={[styles.colMd, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Total</Text>
        </View>

        {Object.entries(grouped).map(([cat, catLines]) => {
          const catTotal = catLines.reduce((s, l) => s + calcLineTotal(l), 0)
          return (
            <View key={cat}>
              <Text style={styles.sectionTitle}>{cat}</Text>
              {catLines.map((line, i) => {
                const lineTotal = calcLineTotal(line)
                const rate = lineRateBasis(line)
                const comps = allComponents.filter(c => c.item_id === line.item_id || c.package_id === line.package_id)
                return (
                  <View key={i}>
                    <View style={styles.tableRow}>
                      <View style={styles.col}>
                        <Text>{line.description}</Text>
                        {rate.basis !== 'day' && (
                          <Text style={{ fontSize: 7, color: '#777' }}>Charged as {rate.label}</Text>
                        )}
                      </View>
                      <Text style={[styles.colSm, styles.faint]}>{line.line_type === 'rental' ? 'Rental' : 'Service'}</Text>
                      <Text style={styles.colSm}>{line.quantity}</Text>
                      <Text style={styles.colSm}>{line.days}</Text>
                      <Text style={styles.colMd}>{fmt(line.unit_price)}</Text>
                      <Text style={styles.colSm}>{line.discount_pct > 0 ? `${line.discount_pct}%` : '—'}</Text>
                      <Text style={[styles.colMd, styles.colBold]}>{fmt(lineTotal)}</Text>
                    </View>
                    {comps.map((c, ci) => (
                      <View key={ci} style={styles.componentRow}>
                        <Text style={[styles.col, styles.faint]}>{c.description}</Text>
                        <Text style={[styles.colSm, styles.faint]}>Rental</Text>
                        <Text style={[styles.colSm, styles.faint]}>{c.quantity}</Text>
                        <Text style={[styles.colSm, styles.faint]}>{c.days}</Text>
                        <Text style={[styles.colMd, styles.faint]}>—</Text>
                        <Text style={[styles.colSm, styles.faint]}>—</Text>
                        <Text style={[styles.colMd, styles.faint]}>£0.00</Text>
                      </View>
                    ))}
                  </View>
                )
              })}
              <View style={styles.catTotal}>
                <Text style={{ fontSize: 8, color: '#555', marginRight: 6 }}>Total for {cat}:</Text>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmt(catTotal)}</Text>
              </View>
            </View>
          )
        })}

        {/* Totals */}
        <View style={styles.totalsBox}>
          {overallDiscount > 0 && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Lines subtotal</Text>
                <Text style={styles.totalValue}>{fmt(linesSubtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: '#c00' }]}>Overall discount ({overallDiscount}%)</Text>
                <Text style={[styles.totalValue, { color: '#c00' }]}>−{fmt(discAmount)}</Text>
              </View>
            </>
          )}
          {settings?.vat_enabled && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{fmt(subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>VAT ({settings.vat_rate}%)</Text>
                <Text style={styles.totalValue}>{fmt(vat)}</Text>
              </View>
            </>
          )}
          <View style={styles.grandTotal}>
            <Text style={styles.grandLabel}>TOTAL</Text>
            <Text style={styles.grandValue}>{fmt(total)}</Text>
          </View>
          {project.deposit_amount && (
            <View style={[styles.totalRow, { marginTop: 4 }]}>
              <Text style={[styles.totalLabel, { color: '#555' }]}>
                Deposit required{project.deposit_paid ? ' (paid)' : ''}
              </Text>
              <Text style={styles.totalValue}>{fmt(project.deposit_amount)}</Text>
            </View>
          )}
        </View>

        {/* Payment terms */}
        {settings?.payment_terms && (
          <View style={styles.paymentBox}>
            <Text style={{ fontSize: 8, color: '#555', fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>Payment terms</Text>
            <Text style={{ fontSize: 8, color: '#666' }}>{settings.payment_terms}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed
          render={({ pageNumber, totalPages }) =>
            `${settings?.company_name || ''} — ${project.project_number} — Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>

      {/* T&Cs page */}
      {hasTCs && (
        <Page size="A4" style={styles.tcPage}>
          <Text style={styles.tcTitle}>Terms & Conditions</Text>
          <Text style={styles.tcBody}>{settings!.tc_text}</Text>
          <Text style={styles.footer} fixed>{settings?.company_name} — Terms & Conditions</Text>
        </Page>
      )}
    </Document>
  )
}

export interface PickingItemInfo {
  item_id: string
  serial_number?: string | null
  is_subhire?: boolean
  subhire_owner?: string | null
}

function PickingListDocument({ project, lines, settings, itemInfo }: {
  project: Project
  lines: LineItemDraft[]
  settings: Settings | undefined
  itemInfo: Map<string, PickingItemInfo>
}) {
  const grouped: Record<string, LineItemDraft[]> = {}
  lines.forEach(l => {
    const cat = l.category || 'Misc'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(l)
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.internalBanner}>
          <Text style={styles.internalBannerText}>⚑  INTERNAL PICKING LIST — NOT FOR CLIENT  ⚑</Text>
        </View>

        <CompanyHeader settings={settings} project={project} title="Picking List" />

        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{project.name}</Text>
        {project.location && <Text style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>Location: {project.location}</Text>}
        {project.delivery_address && (
          <Text style={{ fontSize: 8, color: '#555', marginBottom: 6 }}>
            {project.client_collects ? 'Client collects from: ' : 'Deliver to: '}{project.delivery_address}
          </Text>
        )}

        {project.notes && (
          <View style={[styles.notesBox, { backgroundColor: '#fff3cd', marginBottom: 10 }]}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#856404', marginBottom: 2 }}>INTERNAL NOTES</Text>
            <Text style={[styles.notesText, { color: '#856404' }]}>{project.notes}</Text>
          </View>
        )}

        {/* Table header — wider ID column, checkbox, notes */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colCheck, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>✓</Text>
          <Text style={[styles.colId, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>ID</Text>
          <Text style={[styles.col, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Item / component</Text>
          <Text style={[styles.colSm, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Qty</Text>
          <Text style={[{ flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Serial / owner</Text>
        </View>

        {Object.entries(grouped).map(([cat, catLines]) => (
          <View key={cat}>
            <Text style={styles.sectionTitle}>{cat}</Text>
            {catLines.map((line, i) => {
              const info = !line.is_component && line.item_id ? itemInfo.get(line.item_id) : undefined
              return (
                <View key={i} style={line.is_component ? styles.componentRow : styles.tableRow}>
                  <Text style={[styles.colCheck, { color: '#ccc' }]}>□</Text>
                  <Text style={[styles.colId, { color: line.is_component ? '#ccc' : '#555', fontSize: 7 }]}>
                    {info?.item_id ?? ''}
                  </Text>
                  <Text style={[styles.col, line.is_component ? styles.faint : { fontFamily: 'Helvetica-Bold' }]}>
                    {line.description}
                  </Text>
                  <Text style={[styles.colSm, line.is_component ? styles.faint : {}]}>{line.quantity}</Text>
                  <View style={{ flex: 1 }}>
                    {info?.serial_number && (
                      <Text style={{ color: '#555', fontSize: 7 }}>S/N {info.serial_number}</Text>
                    )}
                    {info?.is_subhire && (
                      <Text style={{ color: '#b45309', fontSize: 7, fontFamily: 'Helvetica-Bold' }}>
                        SUB-HIRE{info.subhire_owner ? ` — ${info.subhire_owner}` : ''} · return to owner
                      </Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        ))}

        <Text style={styles.footer} fixed
          render={({ pageNumber, totalPages }) =>
            `Picking List — ${project.project_number} — ${project.name} — Page ${pageNumber} of ${totalPages} — Printed ${format(new Date(), 'd MMM yyyy HH:mm')}`
          }
        />
      </Page>
    </Document>
  )
}

async function downloadPDF(element: React.ReactElement<DocumentProps>, filename: string) {
  const blob = await pdf(element).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function generateQuotePDF(project: Project, lines: LineItemDraft[], settings: Settings | undefined) {
  await downloadPDF(
    <QuoteDocument project={project} lines={lines} settings={settings} /> as React.ReactElement<DocumentProps>,
    `${project.project_number}-quote.pdf`
  )
}

function DeliveryDocketDocument({ project, lines, settings }: { project: Project; lines: LineItemDraft[]; settings: Settings | undefined }) {
  const topLines = lines.filter(l => !l.is_component)
  const grouped: Record<string, LineItemDraft[]> = {}
  topLines.forEach(l => {
    const cat = l.category || 'Misc'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(l)
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <CompanyHeader settings={settings} project={project} title="Delivery Docket" />

        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>{project.name}</Text>
        {project.client && (
          <Text style={{ fontSize: 8, color: '#555', marginBottom: 1 }}>
            To: {project.client.name}{project.client.company ? ` — ${project.client.company}` : ''}
          </Text>
        )}
        {project.delivery_address && (
          <Text style={{ fontSize: 8, color: '#555', marginBottom: 1 }}>
            {project.client_collects ? 'Collection from: ' : 'Delivery to: '}{project.delivery_address}
          </Text>
        )}
        {project.location && (
          <Text style={{ fontSize: 8, color: '#555', marginBottom: 6 }}>Venue/Location: {project.location}</Text>
        )}
        {project.delivery_notes && (
          <View style={[styles.notesBox, { marginBottom: 8 }]}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', marginBottom: 2 }}>Delivery notes</Text>
            <Text style={styles.notesText}>{project.delivery_notes}</Text>
          </View>
        )}

        {/* Kit list */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colCheck, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>✓</Text>
          <Text style={[styles.col, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Item description</Text>
          <Text style={[styles.colSm, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Qty</Text>
          <Text style={[{ width: 100, fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Condition out</Text>
          <Text style={[{ width: 100, fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Condition in</Text>
        </View>

        {Object.entries(grouped).map(([cat, catLines]) => (
          <View key={cat}>
            <Text style={styles.sectionTitle}>{cat}</Text>
            {catLines.map((line, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.colCheck, { color: '#ccc' }]}>□</Text>
                <Text style={styles.col}>{line.description}</Text>
                <Text style={styles.colSm}>{line.quantity}</Text>
                <Text style={{ width: 100, color: '#bbb', fontSize: 8 }}>____________</Text>
                <Text style={{ width: 100, color: '#bbb', fontSize: 8 }}>____________</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Signature boxes */}
        <View style={{ marginTop: 30, flexDirection: 'row', gap: 30 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 24, color: '#555' }}>Dispatched by (print & sign)</Text>
            <View style={{ borderBottom: '0.75 solid #555', width: '100%', marginBottom: 4 }} />
            <Text style={{ fontSize: 7, color: '#aaa' }}>Name / Signature / Date</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 24, color: '#555' }}>Received by (print & sign)</Text>
            <View style={{ borderBottom: '0.75 solid #555', width: '100%', marginBottom: 4 }} />
            <Text style={{ fontSize: 7, color: '#aaa' }}>Name / Signature / Date</Text>
          </View>
        </View>

        <Text style={styles.footer} fixed
          render={({ pageNumber, totalPages }) =>
            `Delivery Docket — ${project.project_number} — ${project.name} — Page ${pageNumber} of ${totalPages} — Printed ${format(new Date(), 'd MMM yyyy HH:mm')}`
          }
        />
      </Page>
    </Document>
  )
}

export async function generateDeliveryDocketPDF(project: Project, lines: LineItemDraft[], settings: Settings | undefined) {
  await downloadPDF(
    <DeliveryDocketDocument project={project} lines={lines} settings={settings} /> as React.ReactElement<DocumentProps>,
    `${project.project_number}-delivery-docket.pdf`
  )
}

export async function generatePickingListPDF(
  project: Project,
  lines: LineItemDraft[],
  settings: Settings | undefined,
  items: (PickingItemInfo & { id: string })[] = [],
) {
  const itemInfo = new Map(items.map(i => [i.id, i]))
  await downloadPDF(
    <PickingListDocument project={project} lines={lines} settings={settings} itemInfo={itemInfo} /> as React.ReactElement<DocumentProps>,
    `${project.project_number}-picking-list.pdf`
  )
}
