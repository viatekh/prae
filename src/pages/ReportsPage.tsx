import { useMemo } from 'react'
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { formatCurrency, calcProjectTotals, calcProjectMargin } from '../lib/utils'
import { TrendingUp, Users, Package } from 'lucide-react'
import { useProjectRevenue } from '../hooks/useRevenue'

export function ReportsPage() {
  const { data: projects = [], isLoading } = useProjectRevenue()

  const months = useMemo(() => {
    const result = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      result.push({ label: format(d, 'MMM yy'), start: startOfMonth(d), end: endOfMonth(d) })
    }
    return result
  }, [])

  const monthlyRevenue = useMemo(() => {
    return months.map(m => {
      const inMonth = projects.filter(p => {
        const d = p.event_date || p.created_at
        if (!d) return false
        const date = parseISO(d)
        return date >= m.start && date <= m.end
      })
      const revenue = inMonth.reduce((sum, p) => {
        const { subtotal } = calcProjectTotals(p.line_items || [], p.overall_discount_pct ?? 0)
        return sum + subtotal
      }, 0)
      const cost = inMonth.reduce((sum, p) => sum + calcProjectMargin(p.line_items || [], p.overall_discount_pct ?? 0).cost, 0)
      return { ...m, revenue, cost, count: inMonth.length }
    })
  }, [projects, months])

  const maxRevenue = Math.max(...monthlyRevenue.map(m => m.revenue), 1)

  const topClients = useMemo(() => {
    const clientMap: Record<string, { name: string; total: number; count: number }> = {}
    projects.forEach(p => {
      if (!p.client_id || !p.client) return
      if (!clientMap[p.client_id]) clientMap[p.client_id] = { name: p.client.name, total: 0, count: 0 }
      const { subtotal } = calcProjectTotals(p.line_items || [], p.overall_discount_pct ?? 0)
      clientMap[p.client_id].total += subtotal
      clientMap[p.client_id].count++
    })
    return Object.values(clientMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [projects])

  const topItems = useMemo(() => {
    const itemMap: Record<string, { name: string; bookings: number; revenue: number }> = {}
    projects.forEach(p => {
      for (const l of (p.line_items ?? [])) {
        if (l.is_component) continue
        const key = l.description ?? 'Untitled line'
        if (!itemMap[key]) itemMap[key] = { name: key, bookings: 0, revenue: 0 }
        itemMap[key].bookings++
        itemMap[key].revenue += (l.unit_price * l.quantity * l.days) * (1 - (l.discount_pct / 100))
      }
    })
    return Object.values(itemMap)
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 10)
  }, [projects])

  const thisMonth = monthlyRevenue[11]
  const lastMonth = monthlyRevenue[10]
  const totalRevenue = monthlyRevenue.reduce((s, m) => s + m.revenue, 0)
  const totalCost = monthlyRevenue.reduce((s, m) => s + m.cost, 0)
  const totalProfit = totalRevenue - totalCost

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading...</div>

  return (
    <div className="p-3 md:p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Revenue from confirmed, invoiced and completed projects</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">This month</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(thisMonth.revenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{thisMonth.count} project{thisMonth.count !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Last month</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(lastMonth.revenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{lastMonth.count} project{lastMonth.count !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-gray-500">Last 12 months</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-3">
          <p className="text-xs text-gray-500">Profit, last 12 months</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(totalProfit)}
            {totalRevenue > 0 && <span className="text-sm font-medium text-gray-500 ml-2">{((totalProfit / totalRevenue) * 100).toFixed(0)}% margin</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">After {formatCurrency(totalCost)} of sub-hire, crew and transport costs entered on jobs</p>
        </div>
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Revenue by month (last 12 months)</h2>
        </div>
        <div className="flex items-end gap-1.5 h-40">
          {monthlyRevenue.map(m => (
            <div key={m.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                <div
                  className="w-full bg-gray-900 rounded-t-sm transition-all"
                  style={{ height: `${maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0}%`, minHeight: m.revenue > 0 ? '3px' : '0' }}
                  title={formatCurrency(m.revenue)}
                />
              </div>
              <span className="text-xs text-gray-400 truncate w-full text-center">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top clients */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-gray-100">
            <Users size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Top clients</h2>
          </div>
          {topClients.length === 0 && (
            <p className="text-sm text-gray-400 p-4">No data yet</p>
          )}
          {topClients.map((c, i) => (
            <div key={c.name} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-xs font-mono text-gray-300 w-4 shrink-0">{i + 1}</span>
              <span className="flex-1 text-sm text-gray-900 truncate">{c.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{c.count} job{c.count !== 1 ? 's' : ''}</span>
              <span className="text-sm font-medium text-gray-700 shrink-0 w-20 text-right">{formatCurrency(c.total)}</span>
            </div>
          ))}
        </div>

        {/* Top items */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-gray-100">
            <Package size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Most hired items</h2>
          </div>
          {topItems.length === 0 && (
            <p className="text-sm text-gray-400 p-4">No data yet</p>
          )}
          {topItems.map((item, i) => (
            <div key={item.name} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-xs font-mono text-gray-300 w-4 shrink-0">{i + 1}</span>
              <span className="flex-1 text-sm text-gray-900 truncate">{item.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{item.bookings}×</span>
              <span className="text-sm font-medium text-gray-700 shrink-0 w-20 text-right">{formatCurrency(item.revenue)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
