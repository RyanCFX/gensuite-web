import './Dashboard.css'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, ShoppingCart, Wallet, Clock, TrendingDown,
  Package, Users, Activity,
} from 'lucide-react'
import { formatDOP, formatDate, formatNumber } from '@/lib/formatters'
import {
  getDashboardData,
  type DashboardPeriod,
} from '@/shared/api/dashboard'

const PERIOD_OPTIONS: { label: string; value: DashboardPeriod }[] = [
  { label: 'Hoy',      value: 'today' },
  { label: '7 días',   value: '7d'    },
  { label: 'Este mes', value: 'month' },
  { label: 'Este año', value: 'year'  },
]

const ACTIVITY_COLORS: Record<string, string> = {
  invoice_created:     'var(--brand-primary)',
  invoice_cancelled:   'var(--error-text)',
  payment_received:    'var(--success-text)',
  purchase_registered: 'var(--warning-text)',
  expense_registered:  '#7c3aed',
}

const ACTIVITY_LABELS: Record<string, string> = {
  invoice_created:     'Factura',
  invoice_cancelled:   'Anulada',
  payment_received:    'Cobro',
  purchase_registered: 'Compra',
  expense_registered:  'Gasto',
}

function ChartTooltipContent({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: 'var(--shadow-lg)', minWidth: 140 }}>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: p.color, marginBottom: 2 }}>
          {formatDOP(p.value)}
        </p>
      ))}
    </div>
  )
}

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
        sales:   chart.sales[i]   ?? 0,
        credits: chart.credits[i] ?? 0,
      }))
    : []

  const hasSalesData = chartData.some((d) => d.sales > 0 || d.credits > 0)

  const isPositive = (kpis?.utilidad ?? 0) >= 0

  const KPI_CARDS = [
    {
      key:    'ventas',
      label:  'Total Ventas',
      icon:   <TrendingUp size={15} />,
      value:  formatDOP(kpis?.totalVentas),
      sub:    `${kpis?.numFacturas ?? 0} ${kpis?.numFacturas === 1 ? 'factura' : 'facturas'}`,
      color:  'var(--brand-primary)',
    },
    {
      key:    'compras',
      label:  'Total Compras',
      icon:   <ShoppingCart size={15} />,
      value:  formatDOP(kpis?.totalCompras),
      sub:    `${kpis?.numCompras ?? 0} ${kpis?.numCompras === 1 ? 'compra' : 'compras'}`,
      color:  'var(--brand-secondary)',
    },
    {
      key:    'cobrado',
      label:  'Total Cobrado',
      icon:   <Wallet size={15} />,
      value:  formatDOP(kpis?.totalCobrado),
      sub:    'Total recibido',
      color:  'var(--success-text)',
    },
    {
      key:    'pendiente',
      label:  'Saldo Pendiente',
      icon:   <Clock size={15} />,
      value:  formatDOP(kpis?.totalPendiente),
      sub:    'Por cobrar',
      color:  'var(--warning-text)',
    },
    {
      key:    'utilidad',
      label:  'Utilidad',
      icon:   isPositive ? <TrendingUp size={15} /> : <TrendingDown size={15} />,
      value:  formatDOP(kpis?.utilidad),
      sub:    'Ventas − Compras',
      color:  isPositive ? 'var(--success-text)' : 'var(--error-text)',
      coloredValue: true,
    },
  ]

  return (
    <div className="page-container">

      {/* ── Header ── */}
      <div className="dashboard-header">
        <div className="dashboard-greeting">
          <span className="dashboard-overline">Bienvenido de vuelta</span>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">{data?.periodLabel ?? 'Resumen de actividad del negocio'}</p>
        </div>
        <div className="period-pills">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="period-pill"
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
          <div className="kpi-grid">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="kpi-card" style={{ '--i': i } as React.CSSProperties}>
                <div className="skeleton-box" style={{ width: '55%', height: 11, marginBottom: 14 }} />
                <div className="skeleton-box" style={{ width: '80%', height: 24, marginBottom: 8 }} />
                <div className="skeleton-box" style={{ width: '40%', height: 11 }} />
              </div>
            ))}
          </div>
          <div className="card dashboard-chart">
            <div className="card-header">
              <div className="skeleton-box" style={{ width: '25%', height: 15 }} />
            </div>
            <div className="card-body">
              <div className="skeleton-box" style={{ width: '100%', height: 240, borderRadius: 'var(--radius-lg)' }} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="kpi-grid">
            {KPI_CARDS.map((card, i) => (
              <div
                key={card.key}
                className="kpi-card"
                style={{ '--i': i, '--kpi-color': card.color } as React.CSSProperties}
              >
                <div className="kpi-top">
                  <span className="kpi-label">{card.label}</span>
                  <div className="kpi-icon">{card.icon}</div>
                </div>
                <div
                  className="kpi-value"
                  {...(card.coloredValue ? { 'data-colored': '' } : {})}
                >
                  {card.value}
                </div>
                <div className="kpi-sub">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Chart ── */}
          <div className="card dashboard-chart">
            <div className="card-header chart-header">
              <h3 className="card-title">Ventas vs. Crédito pendiente</h3>
              <div className="chart-legend">
                <div className="chart-legend-item">
                  <span className="chart-legend-dot" style={{ background: 'var(--brand-primary)' }} />
                  Ventas
                </div>
                <div className="chart-legend-item">
                  <span className="chart-legend-dot" style={{ background: 'var(--warning-text)' }} />
                  Pendiente
                </div>
              </div>
            </div>
            <div className="card-body">
              {!hasSalesData ? (
                <div className="empty-state">
                  <div className="empty-title">Sin datos de ventas</div>
                  <p className="empty-sub">No hay datos para el período seleccionado.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="var(--brand-primary)" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0}   />
                      </linearGradient>
                      <linearGradient id="creditsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="var(--warning-text)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--warning-text)" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                      width={40}
                    />
                    <Tooltip
                      content={<ChartTooltipContent />}
                      cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '4 2' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      name="Ventas"
                      stroke="var(--brand-primary)"
                      strokeWidth={2.5}
                      fill="url(#salesGradient)"
                      activeDot={{ r: 5, fill: 'var(--brand-primary)', stroke: 'var(--surface-page)', strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="credits"
                      name="Pendiente"
                      stroke="var(--warning-text)"
                      strokeWidth={2}
                      fill="url(#creditsGradient)"
                      activeDot={{ r: 5, fill: 'var(--warning-text)', stroke: 'var(--surface-page)', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── Top tables ── */}
          <div className="dashboard-tables">
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={14} style={{ color: 'var(--text-tertiary)' }} />
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
                            <div className="rank-cell">
                              <span className="rank-badge" data-rank={i + 1 <= 3 ? String(i + 1) : undefined}>
                                {i + 1}
                              </span>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{row.itemName}</div>
                                <div className="td-muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>{row.itemCode}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumber(row.qty)}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
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
                  <Users size={14} style={{ color: 'var(--text-tertiary)' }} />
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
                            <div className="rank-cell">
                              <span className="rank-badge" data-rank={i + 1 <= 3 ? String(i + 1) : undefined}>
                                {i + 1}
                              </span>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{row.customerName}</div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.count}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
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

          {/* ── Activity feed ── */}
          <div className="card dashboard-activity">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={14} style={{ color: 'var(--text-tertiary)' }} />
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
                      style={{ '--i': idx, '--accent-color': accentColor } as React.CSSProperties}
                    >
                      <div className="activity-stripe" />
                      <span className="activity-badge">{label}</span>
                      <p className="activity-desc">{item.description}</p>
                      <div className="activity-meta">
                        <div className="activity-amount">{formatDOP(item.amount)}</div>
                        <div className="activity-date">{formatDate(item.timestamp)}</div>
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
