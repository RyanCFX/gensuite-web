import './Dashboard.css'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, ShoppingCart, Wallet, Clock, TrendingDown,
  Package, Users, Activity, Receipt, Banknote, ArrowRight, ArrowUp,
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

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0
  return (numerator / denominator) * 100
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

  const ventas     = kpis?.totalVentas ?? 0
  const compras    = kpis?.totalCompras ?? 0
  const cobrado    = kpis?.totalCobrado ?? 0
  const pendiente  = kpis?.totalPendiente ?? 0
  const utilidad   = kpis?.utilidad ?? 0
  const gastos     = kpis?.totalGastos ?? 0
  const numFacturas = kpis?.numFacturas ?? 0

  const cobradoPct   = Math.min(100, pct(cobrado, ventas))
  const pendientePct = Math.min(100 - cobradoPct, pct(pendiente, ventas))
  const comprasPct   = Math.min(100, pct(compras, ventas))
  const margenPct    = pct(utilidad, ventas)
  const isPositive   = margenPct >= 0
  const utilidadPct  = isPositive ? Math.min(100 - comprasPct, margenPct) : 0
  const avgTicket    = numFacturas > 0 ? ventas / numFacturas : 0

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="metric-grid">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="metric-card" style={{ '--i': i } as React.CSSProperties}>
                <div className="skeleton-box" style={{ width: '55%', height: 10, marginBottom: 14 }} />
                <div className="skeleton-box" style={{ width: '75%', height: 22, marginBottom: 12 }} />
                <div className="skeleton-box" style={{ width: '100%', height: 6, borderRadius: 'var(--radius-full)' }} />
              </div>
            ))}
          </div>
          <div className="dash-main">
            <div className="card metric-chart">
              <div className="card-body">
                <div className="skeleton-box" style={{ width: '100%', height: 240, borderRadius: 'var(--radius-lg)' }} />
              </div>
            </div>
            <div className="card stats-panel">
              <div className="card-body">
                <div className="skeleton-box" style={{ width: '100%', height: 200, borderRadius: 'var(--radius-lg)' }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI metric cards — real ratios, not invented deltas ── */}
          <div className="metric-grid">
            <div className="metric-card" style={{ '--i': 0 } as React.CSSProperties}>
              <div className="metric-top">
                <span className="metric-label">Total Ventas</span>
                <TrendingUp size={14} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div className="metric-value">{formatDOP(ventas)}</div>
              <span className="metric-pill" data-tone="neutral">
                {numFacturas} {numFacturas === 1 ? 'factura' : 'facturas'}
              </span>
              <div className="metric-bar">
                <span className="metric-bar-seg" style={{ width: `${cobradoPct}%`, background: 'var(--success-text)' }} />
                <span className="metric-bar-seg" style={{ width: `${pendientePct}%`, background: 'var(--warning-text)' }} />
              </div>
              <div className="metric-bar-legend">
                <span><i style={{ background: 'var(--success-text)' }} />Cobrado</span>
                <span><i style={{ background: 'var(--warning-text)' }} />Pendiente</span>
              </div>
            </div>

            <div className="metric-card" style={{ '--i': 1 } as React.CSSProperties}>
              <div className="metric-top">
                <span className="metric-label">Total Compras</span>
                <ShoppingCart size={14} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div className="metric-value">{formatDOP(compras)}</div>
              <span className="metric-pill" data-tone="info">{comprasPct.toFixed(0)}% de ventas</span>
              <div className="metric-bar">
                <span className="metric-bar-seg" style={{ width: `${comprasPct}%`, background: 'var(--brand-secondary)' }} />
              </div>
              <div className="metric-bar-legend">
                <span>{kpis?.numCompras ?? 0} {kpis?.numCompras === 1 ? 'compra' : 'compras'} registradas</span>
              </div>
            </div>

            <div className="metric-card" style={{ '--i': 2 } as React.CSSProperties}>
              <div className="metric-top">
                <span className="metric-label">Total Cobrado</span>
                <Wallet size={14} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div className="metric-value">{formatDOP(cobrado)}</div>
              <span className="metric-pill" data-tone="success">{cobradoPct.toFixed(0)}% de ventas</span>
              <div className="metric-bar">
                <span className="metric-bar-seg" style={{ width: `${cobradoPct}%`, background: 'var(--success-text)' }} />
              </div>
              <div className="metric-bar-legend">
                <span>Sobre el total facturado</span>
              </div>
            </div>

            <div className="metric-card" style={{ '--i': 3 } as React.CSSProperties}>
              <div className="metric-top">
                <span className="metric-label">Saldo Pendiente</span>
                <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div className="metric-value">{formatDOP(pendiente)}</div>
              <span className="metric-pill" data-tone="warning">{pendientePct.toFixed(0)}% de ventas</span>
              <div className="metric-bar">
                <span className="metric-bar-seg" style={{ width: `${pendientePct}%`, background: 'var(--warning-text)' }} />
              </div>
              <div className="metric-bar-legend">
                <span>Por cobrar del período</span>
              </div>
            </div>

            <div className="metric-card" style={{ '--i': 4 } as React.CSSProperties}>
              <div className="metric-top">
                <span className="metric-label">Utilidad</span>
                {isPositive ? <TrendingUp size={14} style={{ color: 'var(--success-text)' }} /> : <TrendingDown size={14} style={{ color: 'var(--error-text)' }} />}
              </div>
              <div className="metric-value" data-colored={isPositive ? 'success' : 'error'}>{formatDOP(utilidad)}</div>
              <span className="metric-pill" data-tone={isPositive ? 'success' : 'error'}>
                {isPositive ? '+' : ''}{margenPct.toFixed(1)}% margen
              </span>
              <div className="metric-bar">
                {isPositive ? (
                  <>
                    <span className="metric-bar-seg" style={{ width: `${comprasPct}%`, background: 'var(--brand-secondary)' }} />
                    <span className="metric-bar-seg" style={{ width: `${utilidadPct}%`, background: 'var(--success-text)' }} />
                  </>
                ) : (
                  <span className="metric-bar-seg" style={{ width: '100%', background: 'var(--error-text)' }} />
                )}
              </div>
              <div className="metric-bar-legend">
                <span><i style={{ background: 'var(--brand-secondary)' }} />Costo</span>
                <span><i style={{ background: isPositive ? 'var(--success-text)' : 'var(--error-text)' }} />{isPositive ? 'Utilidad' : 'Pérdida'}</span>
              </div>
            </div>
          </div>

          {/* ── Chart + statistics ── */}
          <div className="dash-main">
            <div className="card metric-chart">
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
                  <ResponsiveContainer width="100%" height={300}>
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

            <div className="card stats-panel">
              <div className="card-header">
                <h3 className="card-title">Estadísticas</h3>
              </div>
              <div className="stats-panel-body">
                <div className="stat-row">
                  <span className="stat-row-label">Margen de utilidad</span>
                  <div className="stat-row-main">
                    <span className="stat-row-value">{margenPct.toFixed(1)}%</span>
                    <span className="stat-row-delta" data-tone={isPositive ? 'success' : 'error'}>
                      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {isPositive ? '' : '-'}vs. ventas
                    </span>
                  </div>
                  <span className="stat-row-sub">Utilidad ÷ Ventas del período</span>
                </div>
                <div className="stat-row">
                  <span className="stat-row-label">Ticket promedio</span>
                  <div className="stat-row-main">
                    <Receipt size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="stat-row-value">{formatDOP(avgTicket)}</span>
                  </div>
                  <span className="stat-row-sub">Por factura emitida</span>
                </div>
                <div className="stat-row">
                  <span className="stat-row-label">Total Gastos</span>
                  <div className="stat-row-main">
                    <Banknote size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="stat-row-value">{formatDOP(gastos)}</span>
                  </div>
                  <span className="stat-row-sub">Gastos operativos del período</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── List cards: Top Productos / Top Clientes / Actividad ── */}
          <div className="list-grid">
            <div className="card list-card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="card-title">Top Productos</h3>
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
                <>
                  {(() => {
                    const top3 = data.topProducts.slice(0, 3)
                    return (
                      <div className="top-bar-wrap">
                        <div className="top-bar-shares">
                          {top3.map((row) => (
                            <span
                              key={row.itemCode}
                              className="top-bar-share"
                              style={{ width: `${row.percentage}%` }}
                            >
                              <ArrowUp size={10} aria-hidden="true" />
                              {row.percentage.toFixed(1)}%
                            </span>
                          ))}
                        </div>
                        <div className="top-bar">
                          {top3.map((row, i) => (
                            <span
                              key={row.itemCode}
                              className="top-bar-seg"
                              data-rank={i + 1}
                              style={{ width: `${row.percentage}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  <div className="list-card-rows">
                    {data.topProducts.map((row, i) => (
                      <div key={row.itemCode} className="list-row" style={{ '--i': i } as React.CSSProperties}>
                        <span className="list-row-dot" data-rank={i + 1 <= 3 ? String(i + 1) : undefined} />
                        <div className="list-row-main">
                          <div className="list-row-name">{row.itemName}</div>
                          <div className="list-row-sub" style={{ fontFamily: 'var(--font-mono)' }}>{row.itemCode}</div>
                        </div>
                        <div className="list-row-meta">
                          <div className="list-row-value">{formatDOP(row.amount)}</div>
                          <div className="list-row-sub">{formatNumber(row.qty)} unid.</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <Link to="/inventario/articulos" className="list-card-footer">
                Ver catálogo <ArrowRight size={13} />
              </Link>
            </div>

            <div className="card list-card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <h3 className="card-title">Top Clientes</h3>
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
                <>
                  <div className="list-card-rows">
                    {data.topCustomers.map((row, i) => (
                      <div key={row.customer} className="list-row" style={{ '--i': i } as React.CSSProperties}>
                        <span className="list-row-dot" data-rank={i + 1 <= 3 ? String(i + 1) : undefined} />
                        <div className="list-row-main">
                          <div className="list-row-name">{row.customerName}</div>
                          <div className="list-row-sub">{row.count} {row.count === 1 ? 'factura' : 'facturas'}</div>
                        </div>
                        <div className="list-row-meta">
                          <div className="list-row-value">{formatDOP(row.total)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <Link to="/clientes" className="list-card-footer">
                Ver clientes <ArrowRight size={13} />
              </Link>
            </div>

            <div className="card list-card">
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
                <>
                  <div className="list-card-rows">
                  {data.recentActivity.map((item, idx) => {
                    const accentColor = ACTIVITY_COLORS[item.type] ?? 'var(--border-strong)'
                    const label = ACTIVITY_LABELS[item.type] ?? item.type
                    return (
                      <div key={idx} className="list-row" style={{ '--i': idx } as React.CSSProperties}>
                        <span className="list-row-dot" style={{ background: accentColor }} />
                        <div className="list-row-main">
                          <div className="list-row-name">{item.description}</div>
                          <div className="list-row-sub">{label} · {formatDate(item.timestamp)}</div>
                        </div>
                        <div className="list-row-meta">
                          <div className="list-row-value">{formatDOP(item.amount)}</div>
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </>
              )}
              <Link to="/facturas" className="list-card-footer">
                Ver facturación <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
