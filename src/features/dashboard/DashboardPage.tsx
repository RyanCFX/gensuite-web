import './Dashboard.css'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, TrendingDown, ShoppingCart, Box, Zap, Clipboard, BarChart3, ArrowUp,
} from 'lucide-react'
import { formatDOP, formatDate, formatDateTime, formatNumber, daysSince, displayId } from '@/lib/formatters'
import {
  getDashboardData,
  type DashboardPeriod,
} from '@/shared/api/dashboard'
import { listInvoices } from '@/shared/api/invoices'
import { listInventory } from '@/shared/api/inventory'

const PERIOD_OPTIONS: { label: string; value: DashboardPeriod }[] = [
  { label: 'Hoy',      value: 'today' },
  { label: '7 días',   value: '7d'    },
  { label: 'Este mes', value: 'month' },
  { label: 'Este año', value: 'year'  },
]

const ACTIVITY_LABELS: Record<string, string> = {
  invoice_created:     'Factura',
  invoice_cancelled:   'Anulada',
  payment_received:    'Cobro',
  purchase_registered: 'Compra',
  expense_registered:  'Gasto',
}

// Salidas de caja — se muestran en rojo en la tabla de actividad, el resto en el tono normal.
const OUTFLOW_TYPES = new Set(['invoice_cancelled', 'purchase_registered', 'expense_registered'])

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
    <div style={{ background: 'var(--dash-card-bg)', border: '1px solid var(--dash-border-2)', borderRadius: 10, padding: '8px 12px', boxShadow: 'var(--dash-shadow)', minWidth: 140 }}>
      <p style={{ color: 'var(--dash-ink-400)', marginBottom: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: p.color, marginBottom: 2 }}>
          {p.name}: {formatDOP(Math.abs(p.value))}
        </p>
      ))}
    </div>
  )
}

function ChartPlaceholder({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="dash-chart-placeholder">
      <span className="dash-chart-placeholder-icon"><BarChart3 size={16} /></span>
      <div className="dash-chart-placeholder-title">{title}</div>
      <p className="dash-chart-placeholder-sub">{sub}</p>
    </div>
  )
}

// SVG dibujado a mano (no Recharts): en recharts@3.9.2 un BarChart con dos series de signo
// mixto (positiva/negativa) en la misma categoría produce barras cuya altura no coincide con
// la escala real del eje Y — a veces ni se renderizan según la cantidad de categorías. Es un
// bug de la librería, no de los datos. Con SVG propio controlamos la escala nosotros mismos.
function DivergingBarChart({ data, height = 220 }: {
  data: { label: string; ingresos: number; gastos: number }[]
  height?: number
}) {
  const viewW = 600
  const padLeft = 34
  const padRight = 6
  const padTop = 8
  const padBottom = 20
  const plotW = viewW - padLeft - padRight
  const plotH = height - padTop - padBottom
  const midY = padTop + plotH / 2

  const rawMax = data.reduce((m, d) => Math.max(m, d.ingresos, d.gastos), 0)
  const maxAbs = Math.ceil((rawMax || 1) / 1000) * 1000
  const scale = (plotH / 2) / maxAbs

  const band = plotW / data.length
  const barW = Math.min(28, band * 0.5)

  const gridSteps = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1]

  return (
    <svg viewBox={`0 0 ${viewW} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Ingresos vs. Gastos">
      {gridSteps.map((step) => {
        const y = midY - step * maxAbs * scale
        return (
          <g key={step}>
            <line x1={padLeft} x2={viewW - padRight} y1={y} y2={y} stroke={step === 0 ? 'var(--dash-border-2)' : 'var(--dash-border)'} strokeDasharray={step === 0 ? undefined : '3 3'} />
            <text x={padLeft - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--dash-ink-400)">
              {`${(step * maxAbs / 1000).toFixed(0)}k`}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const cx = padLeft + band * i + band / 2
        const x = cx - barW / 2
        const ingresosH = d.ingresos * scale
        const gastosH = d.gastos * scale
        return (
          <g key={d.label}>
            {ingresosH > 0 && (
              <rect x={x} y={midY - ingresosH} width={barW} height={ingresosH} rx={4} fill="var(--dash-mint)">
                <title>{`Ingresos ${d.label}: ${formatDOP(d.ingresos)}`}</title>
              </rect>
            )}
            {gastosH > 0 && (
              <rect x={x} y={midY} width={barW} height={gastosH} rx={4} fill="var(--dash-teal)">
                <title>{`Gastos ${d.label}: ${formatDOP(d.gastos)}`}</title>
              </rect>
            )}
            <text x={cx} y={height - 4} textAnchor="middle" fontSize={10} fill="var(--dash-ink-400)">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

interface PendingAction {
  id: string
  date?: string
  tone: 'warning' | 'danger' | 'info'
  label: string
  sublabel: string
  href: string
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('month')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => getDashboardData(period),
    retry: false,
  })

  // ── Acciones pendientes — 3 llamadas independientes, sin depender del `period` ──
  const { data: dueSoonRes, isLoading: loadingDueSoon } = useQuery({
    queryKey: ['dashboard-pending-invoices'],
    queryFn: () => listInvoices({ status: 'submitted', paymentStatus: ['unpaid', 'partly_paid'], orderBy: 'dueDate', limit: 3 }),
    retry: false,
  })
  const { data: draftRes, isLoading: loadingDrafts } = useQuery({
    queryKey: ['dashboard-draft-invoices'],
    queryFn: () => listInvoices({ status: 'draft', orderBy: '-postingDate', limit: 2 }),
    retry: false,
  })
  const { data: lowStockRes, isLoading: loadingLowStock } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: () => listInventory({ stockStatus: 'low_stock', limit: 2 }),
    retry: false,
  })

  const pendingActions = useMemo<PendingAction[]>(() => {
    const dueSoon: PendingAction[] = (dueSoonRes?.items ?? []).map((inv) => {
      const diff = daysSince(inv.dueDate) ?? 0
      const overdue = diff > 0
      const abs = Math.abs(diff)
      return {
        id: `due-${inv.id}`,
        date: formatDate(inv.dueDate),
        tone: overdue ? 'danger' : 'warning',
        label: `#${displayId(inv.id, inv.sequence)}`,
        sublabel: overdue
          ? `Vencida hace ${abs} ${abs === 1 ? 'día' : 'días'}`
          : diff === 0 ? 'Vence hoy' : `Vence en ${abs} ${abs === 1 ? 'día' : 'días'}`,
        href: `/facturas/${inv.id}`,
      }
    })
    const drafts: PendingAction[] = (draftRes?.items ?? []).map((inv) => ({
      id: `draft-${inv.id}`,
      date: formatDate(inv.postingDate),
      tone: 'info',
      label: `#${displayId(inv.id, inv.sequence)}`,
      sublabel: 'Factura pendiente de aprobación',
      href: `/facturas/${inv.id}`,
    }))
    const lowStock: PendingAction[] = (lowStockRes?.items ?? []).map((item) => ({
      id: `stock-${item.itemCode}`,
      tone: 'danger',
      label: item.itemCode,
      sublabel: `Stock crítico · ${formatNumber(item.actualQty)} unid. de ${item.itemName}`,
      href: '/inventario/productos',
    }))
    return [...dueSoon, ...drafts, ...lowStock]
  }, [dueSoonRes, draftRes, lowStockRes])

  const pendingLoading = loadingDueSoon || loadingDrafts || loadingLowStock

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

  const igChart = data?.ingresosGastosChart
  const igChartData = igChart
    ? igChart.labels.map((label, i) => ({
        label,
        ingresos: igChart.ingresos[i] ?? 0,
        gastos:   igChart.gastos[i]   ?? 0,
      }))
    : []
  const hasIgData = igChartData.some((d) => d.ingresos > 0 || d.gastos > 0)

  const ventas     = kpis?.totalVentas ?? 0
  const cobrado    = kpis?.totalCobrado ?? 0
  const gastos     = kpis?.totalGastos ?? 0
  const pendiente  = kpis?.totalPendiente ?? 0
  const utilidad   = kpis?.utilidad ?? 0
  const numFacturas = kpis?.numFacturas ?? 0

  const cobradoPct   = pct(cobrado, ventas)
  const gastosPct    = pct(gastos, ventas)
  const pendientePct = pct(pendiente, ventas)
  const margenPct    = pct(utilidad, ventas)
  const isPositive   = margenPct >= 0

  return (
    <div className="dashboard-page">

      {/* ── Header ── */}
      <div className="dashboard-header">
        <div className="dashboard-greeting">
          <span className="dashboard-overline">Bienvenido de vuelta</span>
          <h1 className="dashboard-title">Panel de Control</h1>
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
          <div className="kpi-grid">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="kpi-card" style={{ '--i': i } as React.CSSProperties}>
                <div className="dash-skeleton" style={{ width: '55%', height: 10, marginBottom: 14 }} />
                <div className="dash-skeleton" style={{ width: '75%', height: 22, marginBottom: 10 }} />
                <div className="dash-skeleton" style={{ width: '60%', height: 10 }} />
              </div>
            ))}
          </div>
          <div className="dash-charts">
            <div className="dash-chart-primary">
              <div className="dash-skeleton" style={{ width: '100%', height: 240 }} />
            </div>
            <div className="dash-chart-secondary">
              <div className="dash-skeleton" style={{ width: '100%', height: 240 }} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI cards — reales, sin deltas inventados ── */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ '--i': 0 } as React.CSSProperties}>
              <div className="kpi-top">
                <span className="kpi-icon"><TrendingUp size={14} /></span>
                <span className="kpi-label">Total Ventas</span>
              </div>
              <div className="kpi-value">{formatDOP(ventas)}</div>
              <div className="kpi-caption">
                <span className="kpi-caption-tone" data-tone="neutral">{numFacturas} {numFacturas === 1 ? 'factura' : 'facturas'}</span>
                <span>del período</span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--i': 1 } as React.CSSProperties}>
              <div className="kpi-top">
                <span className="kpi-icon"><ShoppingCart size={14} /></span>
                <span className="kpi-label">Ingresos</span>
              </div>
              <div className="kpi-value">{formatDOP(cobrado)}</div>
              <div className="kpi-caption">
                <span className="kpi-caption-tone" data-tone="success"><TrendingUp size={11} />{cobradoPct.toFixed(1)}%</span>
                <span>de ventas cobradas</span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--i': 2 } as React.CSSProperties}>
              <div className="kpi-top">
                <span className="kpi-icon" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, padding: '5px 6px' }}>$</span>
                <span className="kpi-label">Gastos</span>
              </div>
              <div className="kpi-value">{formatDOP(gastos)}</div>
              <div className="kpi-caption">
                <span className="kpi-caption-tone" data-tone="warning"><TrendingDown size={11} />{gastosPct.toFixed(1)}%</span>
                <span>de ventas</span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--i': 3 } as React.CSSProperties}>
              <div className="kpi-top">
                <span className="kpi-icon" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, padding: '5px 6px' }}>$</span>
                <span className="kpi-label">Cuentas por Cobrar</span>
              </div>
              <div className="kpi-value">{formatDOP(pendiente)}</div>
              <div className="kpi-caption">
                <span className="kpi-caption-tone" data-tone="warning"><TrendingUp size={11} />{pendientePct.toFixed(1)}%</span>
                <span>de ventas pendiente</span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--i': 4 } as React.CSSProperties}>
              <div className="kpi-top">
                <span className="kpi-icon"><Box size={14} /></span>
                <span className="kpi-label">Utilidad</span>
              </div>
              <div className="kpi-value" data-colored={isPositive ? 'success' : 'error'}>{formatDOP(utilidad)}</div>
              <div className="kpi-caption">
                <span className="kpi-caption-tone" data-tone={isPositive ? 'success' : 'error'}>
                  {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {margenPct.toFixed(1)}%
                </span>
                <span>margen</span>
              </div>
            </div>
          </div>

          {/* ── Gráficos ── */}
          <div className="dash-charts">
            <div className="dash-chart-primary">
              <div>
                <div className="chart-header">
                  <div className="chart-heading">
                    <span className="chart-icon"><ShoppingCart size={20} /></span>
                    <div>
                      <h3 className="card-title-dash">Ventas vs. Créditos Pendientes</h3>
                      <p className="chart-subtitle">Ventas emitidas vs. saldo pendiente de cobro</p>
                    </div>
                  </div>
                  <div className="chart-legend">
                    <span className="chart-legend-item"><span className="chart-legend-dot" data-tone="mint" />Ventas</span>
                    <span className="chart-legend-item"><span className="chart-legend-dot" data-tone="teal" />Pendiente</span>
                  </div>
                </div>
                {!hasSalesData ? (
                  <ChartPlaceholder title="Sin datos de ventas" sub="No hay datos para el período seleccionado." />
                ) : (
                  <div className="chart-plot-wrap">
                    <ResponsiveContainer width="100%" height={224}>
                      <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="var(--dash-mint)" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="var(--dash-mint)" stopOpacity={0}    />
                          </linearGradient>
                          <linearGradient id="creditsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="var(--dash-teal)" stopOpacity={0.18} />
                            <stop offset="100%" stopColor="var(--dash-teal)" stopOpacity={0}    />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--dash-border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--dash-ink-400)' }} tickLine={false} axisLine={false} />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'var(--dash-ink-400)' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                          width={40}
                        />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: 'var(--dash-border-2)', strokeWidth: 1, strokeDasharray: '4 2' }} />
                        <Area
                          type="monotone" dataKey="sales" name="Ventas"
                          stroke="var(--dash-mint)" strokeWidth={2.5} fill="url(#salesGradient)"
                          activeDot={{ r: 5, fill: 'var(--dash-mint)', stroke: 'var(--dash-card-bg)', strokeWidth: 2 }}
                        />
                        <Area
                          type="monotone" dataKey="credits" name="Pendiente"
                          stroke="var(--dash-teal)" strokeWidth={2} fill="url(#creditsGradient)"
                          activeDot={{ r: 5, fill: 'var(--dash-teal)', stroke: 'var(--dash-card-bg)', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div className="dash-chart-secondary">
              <div>
                <div className="chart-header">
                  <div className="chart-heading">
                    <span className="chart-icon"><ShoppingCart size={20} /></span>
                    <div>
                      <h3 className="card-title-dash">Ingresos vs. Gastos</h3>
                      <p className="chart-subtitle">{PERIOD_OPTIONS.find((opt) => opt.value === period)?.label ?? 'Período seleccionado'}</p>
                    </div>
                  </div>
                  <Link to="/reportes/pl" className="btn-dash-primary">Ver Reportes</Link>
                </div>
                {!hasIgData ? (
                  <ChartPlaceholder title="Sin datos" sub="No hay movimientos en este periodo." />
                ) : (
                  <div className="dash-chart-secondary-body">
                    <div className="ig-chart-wrap">
                      <DivergingBarChart data={igChartData} height={220} />
                    </div>
                    <div className="ig-summary">
                      <div>
                        <div className="ig-summary-value">{formatDOP(data?.totalGanancias ?? 0)}</div>
                        <div className="ig-summary-label">Total Ganancias</div>
                      </div>
                      <div className="ig-summary-row" data-tone="success">
                        <div className="ig-summary-row-label">Ingresos este mes</div>
                        <div className="ig-summary-row-value">{formatDOP(data?.ingresosEsteMes ?? 0)}</div>
                      </div>
                      <div className="ig-summary-row" data-tone="dark">
                        <div className="ig-summary-row-label">Gastos este mes</div>
                        <div className="ig-summary-row-value">{formatDOP(data?.gastosEsteMes ?? 0)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Top Productos / Actividad Reciente / Acciones Pendientes ── */}
          <div className="dash-bottom-grid">
            <div className="list-card dash-col-products">
              <div className="list-card-header">
                <div className="list-card-heading">
                  <span className="chart-icon chart-icon-sm"><Box size={16} /></span>
                  <h3 className="card-title-sm">Top Productos Vendidos</h3>
                </div>
                <Link to="/inventario/productos" className="btn-dash-dark">Ver catálogo</Link>
              </div>
              {!data?.topProducts?.length ? (
                <div className="dash-empty">
                  <div className="dash-empty-title">Sin datos</div>
                  <p className="dash-empty-sub">No hay productos en este período.</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const top3 = data.topProducts.slice(0, 3)
                    return (
                      <>
                        <div className="top-bar-shares">
                          {top3.map((row) => (
                            <span key={row.itemCode} className="top-bar-share" style={{ width: `${row.percentage}%` }}>
                              <ArrowUp size={10} aria-hidden="true" />
                              {row.percentage.toFixed(1)}%
                            </span>
                          ))}
                        </div>
                        <div className="top-bar">
                          {top3.map((row, i) => (
                            <span key={row.itemCode} className="top-bar-seg" data-rank={i + 1} style={{ width: `${row.percentage}%` }} />
                          ))}
                        </div>
                      </>
                    )
                  })()}
                  <div className="list-card-rows">
                    {data.topProducts.map((row, i) => (
                      <div key={row.itemCode} className="list-row" style={{ '--i': i } as React.CSSProperties}>
                        <span className="list-row-bar" data-rank={i + 1 <= 3 ? String(i + 1) : undefined} />
                        <div className="list-row-main">
                          <div className="list-row-name">{row.itemName}</div>
                          <div className="list-row-sub">{row.itemCode}</div>
                        </div>
                        <div className="list-row-meta">
                          <div className="list-row-value">{formatDOP(row.amount)}</div>
                          <div className="list-row-sub">{formatNumber(row.qty)} unid. · {row.percentage.toFixed(1)}% del total</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="list-card dash-col-activity">
              <div className="list-card-header">
                <div className="list-card-heading">
                  <span className="chart-icon chart-icon-sm"><Zap size={16} /></span>
                  <h3 className="card-title-sm">Actividad Reciente</h3>
                </div>
                <Link to="/facturas" className="btn-dash-dark">Ver Facturación</Link>
              </div>
              {!data?.recentActivity?.length ? (
                <div className="dash-empty">
                  <div className="dash-empty-title">Sin actividad reciente</div>
                  <p className="dash-empty-sub">Las transacciones recientes aparecerán aquí.</p>
                </div>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-activity-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Transacción</th>
                        <th>Detalle</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentActivity.map((item, idx) => {
                        const isOutflow = OUTFLOW_TYPES.has(item.type)
                        const [datePart, timePart] = formatDateTime(item.timestamp).split(' ')
                        return (
                          <tr key={idx}>
                            <td style={{ color: 'var(--dash-ink-400)', lineHeight: 1.3, fontWeight: 400 }}>
                              {datePart}<br /><span style={{ fontSize: 9 }}>{timePart}</span>
                            </td>
                            <td>
                              <span className="dash-txn-badge">{ACTIVITY_LABELS[item.type] ?? item.type}</span>
                            </td>
                            <td style={{ color: 'var(--dash-ink-600)', fontWeight: 400, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.description}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isOutflow ? 'var(--dash-rose)' : 'var(--dash-ink-800)' }}>
                              {isOutflow ? '-' : ''}{formatDOP(item.amount)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="list-card dash-col-pending">
              <div className="list-card-header">
                <div className="list-card-heading">
                  <span className="chart-icon chart-icon-sm"><Clipboard size={16} /></span>
                  <h3 className="card-title-sm">Acciones Pendientes</h3>
                </div>
              </div>
              {pendingLoading ? (
                <div className="dash-skeleton" style={{ width: '100%', height: 160 }} />
              ) : !pendingActions.length ? (
                <div className="dash-empty">
                  <div className="dash-empty-title">Todo al día</div>
                  <p className="dash-empty-sub">No hay facturas por vencer, aprobaciones ni stock crítico.</p>
                </div>
              ) : (
                <div className="pending-list">
                  {pendingActions.map((action) => (
                    <Link key={action.id} to={action.href} className="pending-row">
                      <span className="pending-row-date">{action.date ?? ''}</span>
                      <span className="pending-row-rail">
                        <span className="pending-row-dot" data-tone={action.tone} />
                      </span>
                      <div className="pending-row-main">
                        <span className="pending-row-label">{action.label}</span>
                        <p className="pending-row-sub">{action.sublabel}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
