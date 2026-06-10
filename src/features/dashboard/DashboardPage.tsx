import './Dashboard.css'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, ShoppingCart, Wallet, Clock, ArrowUpRight,
  Package, Users, Activity, TrendingDown,
} from 'lucide-react'
import { formatDOP, formatDate, formatNumber } from '@/lib/formatters'
import {
  getDashboardData,
  type DashboardPeriod,
} from '@/shared/api/dashboard'

const PERIOD_OPTIONS: { label: string; value: DashboardPeriod }[] = [
  { label: 'Hoy', value: 'today' },
  { label: '7 días', value: '7d' },
  { label: 'Este mes', value: 'month' },
  { label: 'Este año', value: 'year' },
]

const ACTIVITY_COLORS: Record<string, string> = {
  invoice_created: 'var(--brand-primary)',
  invoice_cancelled: 'var(--error-text)',
  payment_received: 'var(--success-text)',
  purchase_registered: 'var(--warning-text)',
  expense_registered: '#7c3aed',
}

const ACTIVITY_LABELS: Record<string, string> = {
  invoice_created: 'Factura',
  invoice_cancelled: 'Anulada',
  payment_received: 'Cobro',
  purchase_registered: 'Compra',
  expense_registered: 'Gasto',
}

function ChartTooltipContent({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.12)' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 4, fontSize: 12 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: p.color }}>
          {formatDOP(p.value)}
        </p>
      ))}
    </div>
  )
}

const KPI_CARDS = [
  {
    key: 'ventas',
    label: 'Total Ventas',
    icon: (u?: number) => <TrendingUp size={16} />,
    value: (kpis: ReturnType<typeof useKpis>) => formatDOP(kpis?.totalVentas),
    sub: (kpis: ReturnType<typeof useKpis>) =>
      `${kpis?.numFacturas ?? 0} ${kpis?.numFacturas === 1 ? 'factura' : 'facturas'}`,
  },
] as const

// Small hook to avoid repeating kpis
function useKpis() { return null as never }

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('month')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => getDashboardData(period),
    retry: false,
  })

  const kpis = data?.kpis
  const chart = data?.chart

  const chartData = chart
    ? chart.labels.map((label, i) => ({
        label,
        sales: chart.sales[i] ?? 0,
        credits: chart.credits[i] ?? 0,
      }))
    : []

  const hasSalesData = chartData.some((d) => d.sales > 0 || d.credits > 0)

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="overline">Bienvenido de vuelta</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">{data?.periodLabel ?? 'Resumen de actividad del negocio'}</p>
        </div>
        <div className="tabs-bar">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="tab-btn"
              data-active={period === opt.value ? '' : undefined}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="stats-row dashboard-kpis">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div className="skeleton-box" style={{ width: '60%', height: 12, marginBottom: 8 }} />
                <div className="skeleton-box" style={{ width: '80%', height: 26, marginBottom: 8 }} />
                <div className="skeleton-box" style={{ width: '40%', height: 12 }} />
              </div>
            ))}
          </div>
          <div className="card dashboard-chart">
            <div className="card-header">
              <div className="skeleton-box" style={{ width: '30%', height: 16 }} />
            </div>
            <div className="card-body">
              <div className="skeleton-box" style={{ width: '100%', height: 240, borderRadius: 'var(--radius-lg)' }} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="stats-row dashboard-kpis">
            {([
              {
                icon: <TrendingUp size={16} />,
                label: 'Total Ventas',
                value: formatDOP(kpis?.totalVentas),
                sub: `${kpis?.numFacturas ?? 0} ${kpis?.numFacturas === 1 ? 'factura' : 'facturas'}`,
              },
              {
                icon: <ShoppingCart size={16} />,
                label: 'Total Compras',
                value: formatDOP(kpis?.totalCompras),
                sub: `${kpis?.numCompras ?? 0} ${kpis?.numCompras === 1 ? 'compra' : 'compras'}`,
              },
              {
                icon: <Wallet size={16} />,
                label: 'Total Cobrado',
                value: formatDOP(kpis?.totalCobrado),
                sub: 'Total recibido',
              },
              {
                icon: <Clock size={16} />,
                label: 'Saldo Pendiente',
                value: formatDOP(kpis?.totalPendiente),
                sub: 'Por cobrar',
              },
              {
                icon: (kpis?.utilidad ?? 0) >= 0
                  ? <TrendingUp size={16} style={{ color: 'var(--success-text)' }} />
                  : <TrendingDown size={16} style={{ color: 'var(--error-text)' }} />,
                label: 'Utilidad',
                value: formatDOP(kpis?.utilidad),
                sub: 'Ventas − Compras',
                valueColor: (kpis?.utilidad ?? 0) >= 0 ? 'var(--success-text)' : 'var(--error-text)',
                iconBg: (kpis?.utilidad ?? 0) >= 0 ? 'var(--success-bg)' : 'var(--error-bg)',
              },
            ] as {
              icon: React.ReactNode
              label: string
              value: string
              sub: string
              valueColor?: string
              iconBg?: string
            }[]).map((card, i) => (
              <div
                key={card.label}
                className="stat-card"
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="stat-card-top">
                  <div
                    className="stat-icon-badge"
                    style={card.iconBg ? { background: card.iconBg } : undefined}
                  >
                    {card.icon}
                  </div>
                  <span className="stat-label">{card.label}</span>
                </div>
                <div
                  className="stat-value"
                  style={card.valueColor ? { color: card.valueColor } : undefined}
                >
                  {card.value}
                </div>
                <div className="stat-footer">
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{card.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="card dashboard-chart" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h3 className="card-title">Ventas vs. Crédito pendiente</h3>
            </div>
            <div className="card-body">
              {!hasSalesData ? (
                <div className="empty-state">
                  <div className="empty-title">Sin datos de ventas</div>
                  <p className="empty-sub">No hay datos para el período seleccionado.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 12, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="creditsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--warning-text)" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="var(--warning-text)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: 'var(--border-default)', strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      name="Ventas"
                      stroke="var(--brand-primary)"
                      strokeWidth={2}
                      fill="url(#salesGradient)"
                      activeDot={{ r: 4, fill: 'var(--brand-primary)', stroke: 'var(--surface-page)', strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="credits"
                      name="Pendiente"
                      stroke="var(--warning-text)"
                      strokeWidth={2}
                      fill="url(#creditsGradient)"
                      activeDot={{ r: 4, fill: 'var(--warning-text)', stroke: 'var(--surface-page)', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top products + top customers */}
          <div className="dashboard-tables" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={14} style={{ color: 'var(--text-secondary)' }} />
                  <h3 className="card-title">Top 5 Productos</h3>
                </div>
              </div>
              {!data?.topProducts?.length ? (
                <div className="card-body">
                  <div className="empty-state">
                    <div className="empty-title">Sin datos</div>
                    <p className="empty-sub">No hay productos en este período.</p>
                  </div>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: 'right' }}>Cant.</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((row, i) => (
                        <tr key={row.itemCode} style={{ '--i': i } as React.CSSProperties}>
                          <td>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{row.itemName}</div>
                            <div className="td-muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>{row.itemCode}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumber(row.qty)}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                            {formatDOP(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={14} style={{ color: 'var(--text-secondary)' }} />
                  <h3 className="card-title">Top 5 Clientes</h3>
                </div>
              </div>
              {!data?.topCustomers?.length ? (
                <div className="card-body">
                  <div className="empty-state">
                    <div className="empty-title">Sin datos</div>
                    <p className="empty-sub">No hay clientes en este período.</p>
                  </div>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th style={{ textAlign: 'right' }}>Facturas</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCustomers.map((row, i) => (
                        <tr key={row.customer} style={{ '--i': i } as React.CSSProperties}>
                          <td>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{row.customerName}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.count}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                            {formatDOP(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="card dashboard-activity">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={14} style={{ color: 'var(--text-secondary)' }} />
                <h3 className="card-title">Actividad Reciente</h3>
              </div>
            </div>
            {!data?.recentActivity?.length ? (
              <div className="card-body">
                <div className="empty-state">
                  <div className="empty-title">Sin actividad reciente</div>
                  <p className="empty-sub">Las transacciones recientes aparecerán aquí.</p>
                </div>
              </div>
            ) : (
              <div>
                {data.recentActivity.map((item, idx) => {
                  const accentColor = ACTIVITY_COLORS[item.type] ?? 'var(--border-strong)'
                  const label = ACTIVITY_LABELS[item.type] ?? item.type
                  return (
                    <div
                      key={idx}
                      className="activity-item"
                      style={{
                        '--i': idx,
                        '--accent-color': accentColor,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 20px',
                        borderBottom: idx < (data.recentActivity?.length ?? 0) - 1 ? '1px solid var(--border-subtle)' : 'none',
                      } as React.CSSProperties}
                    >
                      <div className="activity-dot" />
                      <span
                        className="badge badge-neutral"
                        style={{ flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}
                      >
                        {label}
                      </span>
                      <p style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                        {item.description}
                      </p>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', justifyContent: 'flex-end' }}>
                          <ArrowUpRight size={12} style={{ color: 'var(--text-secondary)' }} />
                          {formatDOP(item.amount)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatDate(item.timestamp)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
