// Registro de visuales del dashboard modular: key del widget → componente.
// docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §6.3–§6.5.
// Una key del catálogo sin entrada acá se ignora (no rompe la página).
import { TrendingUp, TrendingDown, ShoppingCart, Box } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMoney } from '@/lib/formatters'
import type { DashboardWidgetMeta } from '@/shared/api/types'
import {
  KpiCard, DeltaCaption, VentasAreaChart, DivergingBarChart,
  TopProductosLista, TopClientesLista, ActividadTabla, PendientesLista,
  ChartPlaceholder,
} from './dashShared'
import {
  kpiVentasTotal, kpiComprasTotal, kpiGastosTotal, kpiCobrosTotal, kpiUtilidad,
  kpiCxcSaldo, chartVentas, topProductos, topClientes, ingresosGastos,
  actividadReciente, pendientes, pendientesDeWidget, bajoMinimo, num,
} from './widgetData'

export interface WidgetProps {
  data: Record<string, unknown>
  meta: DashboardWidgetMeta
  /** Nombre del reporte según el catálogo (GenSuite Control puede personalizarlo). */
  titulo: string
}

function KpiDolares({ icon, titulo, valor, currency, caption }: {
  icon: React.ReactNode
  titulo: string
  valor: number
  currency?: string
  caption: React.ReactNode
}) {
  return <KpiCard icon={icon} label={titulo} value={formatMoney(valor, currency)} caption={caption} />
}

const IconoDinero = <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, padding: '5px 6px' }}>$</span>

export function VentasTotalWidget({ data, meta, titulo }: WidgetProps) {
  const k = kpiVentasTotal(data)
  return (
    <KpiDolares
      icon={<TrendingUp size={14} />} titulo={titulo} valor={k.total} currency={meta.currency}
      caption={k.count > 0
        ? (<><span className="kpi-caption-tone" data-tone="neutral">{k.count} {k.count === 1 ? 'factura' : 'facturas'}</span><span>del período</span></>)
        : <DeltaCaption deltaPct={k.deltaPct} sufijo="vs. período anterior" />}
    />
  )
}

export function ComprasTotalWidget({ data, meta, titulo }: WidgetProps) {
  const k = kpiComprasTotal(data)
  return (
    <KpiDolares
      icon={<ShoppingCart size={14} />} titulo={titulo} valor={k.total} currency={meta.currency}
      caption={<><span className="kpi-caption-tone" data-tone="neutral">{k.count} {k.count === 1 ? 'compra' : 'compras'}</span><span>del período</span></>}
    />
  )
}

export function GastosTotalWidget({ data, meta, titulo }: WidgetProps) {
  const k = kpiGastosTotal(data)
  return (
    <KpiDolares
      icon={IconoDinero} titulo={titulo} valor={k.total} currency={meta.currency}
      caption={<DeltaCaption deltaPct={k.deltaPct} sufijo="vs. período anterior" />}
    />
  )
}

export function GastosMesWidget({ data, meta, titulo }: WidgetProps) {
  return (
    <KpiDolares
      icon={IconoDinero} titulo={titulo} valor={num(data.gastosEsteMes)} currency={meta.currency}
      caption={<><span className="kpi-caption-tone" data-tone="neutral">mes en curso</span></>}
    />
  )
}

export function CxcSaldoWidget({ data, meta, titulo }: WidgetProps) {
  const k = kpiCxcSaldo(data)
  return (
    <KpiDolares
      icon={IconoDinero} titulo={titulo} valor={k.pendiente} currency={meta.currency}
      caption={<><span className="kpi-caption-tone" data-tone="warning"><TrendingUp size={11} />{k.num}</span><span>cuentas por cobrar</span></>}
    />
  )
}

export function CobrosTotalWidget({ data, meta, titulo }: WidgetProps) {
  const k = kpiCobrosTotal(data)
  return (
    <KpiDolares
      icon={<ShoppingCart size={14} />} titulo={titulo} valor={k.total} currency={meta.currency}
      caption={<DeltaCaption deltaPct={k.deltaPct} sufijo="vs. período anterior" />}
    />
  )
}

export function CobrosMesWidget({ data, meta, titulo }: WidgetProps) {
  return (
    <KpiDolares
      icon={<ShoppingCart size={14} />} titulo={titulo} valor={num(data.ingresosEsteMes)} currency={meta.currency}
      caption={<><span className="kpi-caption-tone" data-tone="neutral">mes en curso</span></>}
    />
  )
}

export function UtilidadWidget({ data, meta, titulo }: WidgetProps) {
  const k = kpiUtilidad(data)
  const positive = k.total >= 0
  return (
    <div className="kpi-card gap-50 w-200">
      <div className="kpi-top">
        <span className="kpi-icon"><Box size={14} /></span>
        <span className="kpi-label">{titulo}</span>
      </div>
      <div className="kpi-value" data-colored={positive ? 'success' : 'error'}>{formatMoney(k.total, meta.currency)}</div>
      <div className="kpi-caption">
        <span className="kpi-caption-tone" data-tone={positive ? 'success' : 'error'}>
          {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {k.deltaPct === null ? '—' : `${k.deltaPct >= 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%`}
        </span>
        <span>margen</span>
      </div>
    </div>
  )
}

export function VentasGraficoWidget({ data, meta }: WidgetProps) {
  return (
    <div className="dash-chart-primary">
      <div>
        <div className="chart-header">
          <div className="chart-heading">
            <span className="chart-icon"><ShoppingCart size={20} /></span>
            <div>
              <h3 className="card-title-dash">Ventas VS créditos pendientes</h3>
              <p className="chart-subtitle">Ventas emitidas vs. saldo pendiente de cobro</p>
            </div>
          </div>
          <div className="chart-legend">
            <span className="chart-legend-item"><span className="chart-legend-dot" data-tone="mint" />Ventas</span>
            <span className="chart-legend-item"><span className="chart-legend-dot" data-tone="teal" />Pendiente</span>
          </div>
        </div>
        <VentasAreaChart data={chartVentas(data)} currency={meta.currency} />
      </div>
    </div>
  )
}

export function TopProductosWidget({ data, meta, titulo }: WidgetProps) {
  return (
    <div className="list-card dash-col-products">
      <div className="list-card-header">
        <div className="list-card-heading">
          <span className="chart-icon chart-icon-sm"><Box size={16} /></span>
          <h3 className="card-title-sm">{titulo}</h3>
        </div>
        <Link to="/inventario/productos" className="btn-dash-dark">Ver catálogo</Link>
      </div>
      <TopProductosLista items={topProductos(data).slice(0, 5)} currency={meta.currency} />
    </div>
  )
}

export function TopClientesWidget({ data, meta, titulo }: WidgetProps) {
  return (
    <div className="list-card dash-col-products">
      <div className="list-card-header">
        <div className="list-card-heading">
          <span className="chart-icon chart-icon-sm"><Box size={16} /></span>
          <h3 className="card-title-sm">{titulo}</h3>
        </div>
        <Link to="/clientes" className="btn-dash-dark">Ver clientes</Link>
      </div>
      <TopClientesLista items={topClientes(data)} currency={meta.currency} />
    </div>
  )
}

export function IngresosGastosWidget({ data, meta, titulo }: WidgetProps) {
  const ig = ingresosGastos(data)
  const hasData = ig.puntos.some((d) => d.ingresos > 0 || d.gastos > 0)
  return (
    <div className="dash-chart-secondary">
      <div>
        <div className="chart-header">
          <div className="chart-heading">
            <span className="chart-icon"><ShoppingCart size={20} /></span>
            <div>
              <h3 className="card-title-dash">{titulo}</h3>
              <p className="chart-subtitle">{meta.periodLabel}</p>
            </div>
          </div>
          <Link to="/reportes/pl" className="btn-dash-primary">Ver Reportes</Link>
        </div>
        {!hasData ? (
          <ChartPlaceholder title="Sin datos" sub="No hay movimientos en este periodo." />
        ) : (
          <div className="dash-chart-secondary-body">
            <div className="ig-chart-wrap">
              <DivergingBarChart data={ig.puntos} height={220} currency={meta.currency} />
            </div>
            <div className="ig-summary">
              <div>
                <div className="ig-summary-value">{formatMoney(ig.totalGanancias, meta.currency)}</div>
                <div className="ig-summary-label">Total Ganancias</div>
              </div>
              <div className="ig-summary-row" data-tone="success">
                <div className="ig-summary-row-label">Ingresos este mes</div>
                <div className="ig-summary-row-value">{formatMoney(num(data.ingresosEsteMes), meta.currency)}</div>
              </div>
              <div className="ig-summary-row" data-tone="dark">
                <div className="ig-summary-row-label">Gastos este mes</div>
                <div className="ig-summary-row-value">{formatMoney(num(data.gastosEsteMes), meta.currency)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function BajoMinimoWidget({ data, titulo }: WidgetProps) {
  const items = bajoMinimo(data)
  return (
    <div className="list-card dash-col-pending">
      <div className="list-card-header">
        <div className="list-card-heading">
          <span className="chart-icon chart-icon-sm"><Box size={16} /></span>
          <h3 className="card-title-sm">{titulo}</h3>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="dash-empty">
          <div className="dash-empty-title">Sin stock crítico</div>
          <p className="dash-empty-sub">Ningún artículo está bajo el mínimo.</p>
        </div>
      ) : (
        <div className="list-card-rows">
          {items.map((row, i) => (
            <div key={row.item_code} className="list-row" style={{ '--i': i } as React.CSSProperties}>
              <span className="list-row-bar" data-rank="1" />
              <div className="list-row-main">
                <div className="list-row-name">{row.item_name}</div>
                <div className="list-row-sub">{row.item_code}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ActividadRecienteWidget({ data, titulo }: WidgetProps) {
  return (
    <div className="list-card dash-col-activity">
      <div className="list-card-header">
        <div className="list-card-heading">
          <span className="chart-icon chart-icon-sm"><Box size={16} /></span>
          <h3 className="card-title-sm">{titulo}</h3>
        </div>
        <Link to="/facturas" className="btn-dash-dark">Ver Facturación</Link>
      </div>
      <ActividadTabla items={actividadReciente(data)} />
    </div>
  )
}

export function PendientesWidget({ data, titulo }: WidgetProps) {
  return (
    <div className="list-card dash-col-pending">
      <div className="list-card-header">
        <div className="list-card-heading">
          <span className="chart-icon chart-icon-sm"><Box size={16} /></span>
          <h3 className="card-title-sm">{titulo}</h3>
        </div>
      </div>
      <PendientesLista
        items={pendientesDeWidget(pendientes(data))}
        emptyTitle="Todo al día"
        emptySub="No hay acciones pendientes."
      />
    </div>
  )
}


