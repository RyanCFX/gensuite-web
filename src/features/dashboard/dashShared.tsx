// Visuales compartidos del dashboard: los usan el dashboard modular (widgets) y el
// dashboard legacy (compatibilidad pre-v2). Mismos estilos (Dashboard.css) y mismos
// nombres de campo que GET /dashboard/summary.
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, BarChart3, ArrowUp } from 'lucide-react'
import { formatMoney, formatNumber, formatDateTime } from '@/lib/formatters'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import type { ReactNode } from 'react'
import type { PendienteVista } from './widgetData'

export function ChartTooltipContent({ active, payload, label, currency }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  currency?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--dash-card-bg)', border: '1px solid var(--dash-border-2)', borderRadius: 10, padding: '8px 12px', boxShadow: 'var(--dash-shadow)', minWidth: 140 }}>
      <p style={{ color: 'var(--dash-ink-400)', marginBottom: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: p.color, marginBottom: 2 }}>
          {p.name}: {formatMoney(Math.abs(p.value), currency)}
        </p>
      ))}
    </div>
  )
}

export function ChartPlaceholder({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="dash-chart-placeholder">
      <span className="dash-chart-placeholder-icon"><BarChart3 size={16} /></span>
      <div className="dash-chart-placeholder-title">{title}</div>
      <p className="dash-chart-placeholder-sub">{sub}</p>
    </div>
  )
}

function formatAxisValue(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) {
    const m = v / 1_000_000
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (a >= 1000) return `${(v / 1000).toFixed(0)}k`
  return `${Math.round(v)}`
}

export function DivergingBarChart({ data, height = 220, currency }: {
  data: { label: string; ingresos: number; gastos: number }[]
  height?: number
  currency?: string
}) {
  const padLeft = 34
  const padBottom = 28
  const gap = 0
  const barW = 20
  const plotH = height - padBottom
  const halfH = plotH / 2
  const availH = halfH - gap
  const midPct = 50

  const rawMax = data.reduce((m, d) => Math.max(m, d.ingresos, d.gastos), 0)
  const maxAbs = Math.ceil((rawMax || 1) / 1000) * 1000
  const gridSteps = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1]

  return (
    <div role="img" aria-label="Ingresos vs. Gastos" style={{ height, position: 'relative', paddingLeft: padLeft, paddingBottom: padBottom, boxSizing: 'border-box' }}>
      {gridSteps.map((step) => {
        const topPct = midPct - step * 50
        return (
          <div key={step} style={{ position: 'absolute', left: 0, right: 0, top: `${(topPct / 100) * plotH}px`, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
            <span style={{ width: padLeft - 6, paddingRight: 6, textAlign: 'right', fontSize: 10, lineHeight: 1, color: 'var(--dash-ink-400)', flexShrink: 0, whiteSpace: 'nowrap' }}>
              {formatAxisValue(step * maxAbs)}
            </span>
            <span style={{ flex: 1, borderTop: '1px dashed var(--dash-border)' }} />
          </div>
        )
      })}
      <div style={{ position: 'relative', height: plotH, display: 'flex', alignItems: 'stretch' }}>
        {data.map((d) => {
          const ingresosPx = d.ingresos > 0 ? Math.max(6, (d.ingresos / maxAbs) * availH) : 0
          const gastosPx = d.gastos > 0 ? Math.max(6, (d.gastos / maxAbs) * availH) : 0
          return (
            <div key={d.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ height: halfH, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: gap, boxSizing: 'border-box', overflow: 'hidden' }}>
                {ingresosPx > 0 && (
                  <div
                    title={`Ingresos ${d.label}: ${formatMoney(d.ingresos, currency)}`}
                    style={{ width: barW, maxWidth: '50%', height: ingresosPx, flexShrink: 0, background: 'var(--dash-mint)', borderRadius: '999px 999px 3px 3px' }}
                  />
                )}
              </div>
              <div style={{ height: halfH, width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: gap, boxSizing: 'border-box', overflow: 'hidden' }}>
                {gastosPx > 0 && (
                  <div
                    title={`Gastos ${d.label}: ${formatMoney(d.gastos, currency)}`}
                    style={{ width: barW, maxWidth: '50%', height: gastosPx, flexShrink: 0, background: 'var(--dash-teal)', borderRadius: '3px 3px 999px 999px' }}
                  />
                )}
              </div>
              <span style={{ position: 'absolute', bottom: -padBottom, left: '50%', transform: 'translateX(-50%)', fontSize: 10, lineHeight: `${padBottom}px`, color: 'var(--dash-ink-400)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── KPI genérico ────────────────────────────────────────────────────────────

export function KpiCard({ index = 0, icon, label, value, caption }: {
  index?: number
  icon: ReactNode
  label: string
  value: string
  caption: ReactNode
}) {
  return (
    <div className="kpi-card gap-50 w-200" style={{ '--i': index } as React.CSSProperties}>
      <div className="kpi-top">
        <span className="kpi-icon">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-caption">{caption}</div>
    </div>
  )
}

/** Delta porcentual: `null` (período anterior en cero) se muestra como "—", nunca 0 %. */
export function DeltaCaption({ deltaPct, sufijo }: { deltaPct: number | null; sufijo: string }) {
  if (deltaPct === null) {
    return (
      <>
        <span className="kpi-caption-tone" data-tone="neutral">—</span>
        <span>{sufijo}</span>
      </>
    )
  }
  const tone = deltaPct >= 0 ? 'success' : 'error'
  const Icon = deltaPct >= 0 ? TrendingUp : TrendingDown
  return (
    <>
      <span className="kpi-caption-tone" data-tone={tone}>
        <Icon size={11} />{deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
      </span>
      <span>{sufijo}</span>
    </>
  )
}

// ─── Gráfico de ventas (área) ────────────────────────────────────────────────

export function VentasAreaChart({ data, currency }: {
  data: { label: string; sales: number; credits: number }[]
  currency?: string
}) {
  const hasData = data.some((d) => d.sales > 0 || d.credits > 0)
  if (!hasData) return <ChartPlaceholder title="Sin datos de ventas" sub="No hay datos para el período seleccionado." />
  return (
    <div className="chart-plot-wrap">
      <ResponsiveContainer width="100%" height={224}>
        <AreaChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
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
          <Tooltip content={<ChartTooltipContent currency={currency} />} cursor={{ stroke: 'var(--dash-border-2)', strokeWidth: 1, strokeDasharray: '4 2' }} />
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
  )
}

// ─── Listas ──────────────────────────────────────────────────────────────────

export interface TopProductoVista {
  itemCode: string
  itemName: string
  qty: number
  amount: number
  percentage: number
}

export function TopProductosLista({ items, currency, emptyTitle = 'Sin datos', emptySub = 'No hay productos en este período.' }: {
  items: TopProductoVista[]
  currency?: string
  emptyTitle?: string
  emptySub?: string
}) {
  if (items.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-title">{emptyTitle}</div>
        <p className="dash-empty-sub">{emptySub}</p>
      </div>
    )
  }
  const top3 = items.slice(0, 3)
  return (
    <>
      <div className="top-bar">
        {items.map((row, i) => (
          <span key={row.itemCode} className="top-bar-seg" data-rank={i + 1 <= 3 ? i + 1 : undefined} style={{ width: `${row.percentage}%` }} />
        ))}
      </div>
      <div className="top-bar-shares">
        {top3.map((row) => (
          <span key={row.itemCode} className="top-bar-share" style={{ width: `${row.percentage}%` }}>
            <ArrowUp size={10} aria-hidden="true" />
            {row.percentage.toFixed(1)}%
          </span>
        ))}
      </div>
      <div className="list-card-rows">
        {items.map((row, i) => (
          <div key={row.itemCode} className="list-row" style={{ '--i': i } as React.CSSProperties}>
            <span className="list-row-bar" data-rank={i + 1 <= 3 ? String(i + 1) : undefined} />
            <div className="list-row-main">
              <div className="list-row-name">{row.itemName}</div>
              <div className="list-row-sub">{row.itemCode}</div>
            </div>
            <div className="list-row-meta">
              <div className="list-row-value">{formatMoney(row.amount, currency)}</div>
              <div className="list-row-sub">{formatNumber(row.qty)} unid. · {row.percentage.toFixed(1)}% del total</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export interface TopClienteVista {
  customer: string
  customerName: string
  total: number
  count: number
}

export function TopClientesLista({ items, currency }: { items: TopClienteVista[]; currency?: string }) {
  if (items.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-title">Sin datos</div>
        <p className="dash-empty-sub">No hay clientes en este período.</p>
      </div>
    )
  }
  return (
    <div className="list-card-rows">
      {items.map((row, i) => (
        <div key={row.customer} className="list-row" style={{ '--i': i } as React.CSSProperties}>
          <span className="list-row-bar" data-rank={i + 1 <= 3 ? String(i + 1) : undefined} />
          <div className="list-row-main">
            <div className="list-row-name">{row.customerName}</div>
            <div className="list-row-sub">{row.customer}</div>
          </div>
          <div className="list-row-meta">
            <div className="list-row-value">{formatMoney(row.total, currency)}</div>
            <div className="list-row-sub">{row.count} {row.count === 1 ? 'factura' : 'facturas'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Actividad reciente ──────────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  invoice_created:     'Factura',
  invoice_cancelled:   'Anulada',
  payment_received:    'Cobro',
  purchase_registered: 'Compra',
  expense_registered:  'Gasto',
}

const OUTFLOW_TYPES = new Set(['invoice_cancelled', 'purchase_registered', 'expense_registered'])

const ACTIVITY_COLUMNS = [
  { key: 'fecha', width: 90 },
  { key: 'transaccion', width: 130 },
  { key: 'detalle', width: 200 },
  { key: 'monto', width: 110 },
]

export interface ActividadVista {
  type: string
  description: string
  amount: number
  currency?: string
  timestamp: string
}

export function ActividadTabla({ items }: { items: ActividadVista[] }) {
  const { widths: colWidths, startResize } = useResizableColumns(ACTIVITY_COLUMNS)
  if (items.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-title">Sin actividad reciente</div>
        <p className="dash-empty-sub">Las transacciones recientes aparecerán aquí.</p>
      </div>
    )
  }
  return (
    <div className="dash-table-wrap">
      <table className="dash-activity-table items-table-resizable">
        <colgroup>
          {ACTIVITY_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
        </colgroup>
        <thead>
          <tr>
            <th>
              Fecha
              <span className="col-resize-handle" onMouseDown={startResize('fecha')} />
            </th>
            <th>
              Transacción
              <span className="col-resize-handle" onMouseDown={startResize('transaccion')} />
            </th>
            <th>
              Detalle
              <span className="col-resize-handle" onMouseDown={startResize('detalle')} />
            </th>
            <th style={{ textAlign: 'right' }}>Monto</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
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
                  {isOutflow ? '-' : ''}{formatMoney(item.amount, item.currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PendientesLista({ items, emptyTitle = 'Todo al día', emptySub = 'No hay pendientes.' }: {
  items: PendienteVista[]
  emptyTitle?: string
  emptySub?: string
}) {
  if (items.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-title">{emptyTitle}</div>
        <p className="dash-empty-sub">{emptySub}</p>
      </div>
    )
  }
  return (
    <div className="pending-list">
      {items.map((action) => (
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
  )
}
