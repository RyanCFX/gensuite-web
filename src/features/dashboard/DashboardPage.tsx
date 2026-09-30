import './Dashboard.css'
import { useState, type ComponentType } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getDashboardCatalogo, getDashboardWidget, type DashboardPeriod } from '@/shared/api/dashboard'
import type { ApiError, DashboardTipoReporte } from '@/shared/api/types'
import { isApiErrorCode } from '@/shared/api/client'
import LegacyDashboard from './LegacyDashboard'
import {
  type WidgetProps,
  VentasTotalWidget,
  VentasGraficoWidget,
  TopProductosWidget,
  TopClientesWidget,
  ComprasTotalWidget,
  GastosTotalWidget,
  GastosMesWidget,
  CxcSaldoWidget,
  CobrosTotalWidget,
  CobrosMesWidget,
  UtilidadWidget,
  IngresosGastosWidget,
  BajoMinimoWidget,
  ActividadRecienteWidget,
  PendientesWidget,
} from './widgets'

const PERIOD_OPTIONS: { label: string; value: DashboardPeriod }[] = [
  { label: 'Hoy',      value: 'today' },
  { label: '7 días',   value: '7d'    },
  { label: 'Este mes', value: 'month' },
  { label: 'Este año', value: 'year'  },
]

/** Key del widget → visual. Una key del catálogo sin entrada se ignora (no rompe la página). */
const WIDGETS: Record<string, ComponentType<WidgetProps>> = {
  'dashboard.ventas.total': VentasTotalWidget,
  'dashboard.ventas.grafico': VentasGraficoWidget,
  'dashboard.ventas.top-productos': TopProductosWidget,
  'dashboard.ventas.top-clientes': TopClientesWidget,
  'dashboard.compras.total': ComprasTotalWidget,
  'dashboard.gastos.total': GastosTotalWidget,
  'dashboard.gastos.mes': GastosMesWidget,
  'dashboard.cxc.saldo': CxcSaldoWidget,
  'dashboard.cobros.total': CobrosTotalWidget,
  'dashboard.cobros.mes': CobrosMesWidget,
  'dashboard.finanzas.utilidad': UtilidadWidget,
  'dashboard.finanzas.ingresos-gastos': IngresosGastosWidget,
  'dashboard.inventario.bajo-minimo': BajoMinimoWidget,
  'dashboard.actividad.reciente': ActividadRecienteWidget,
  'dashboard.actividad.pendientes': PendientesWidget,
}

/** Widgets chicos que se agrupan en la fila de KPIs de su sección. */
const WIDGETS_KPI = new Set([
  'dashboard.ventas.total',
  'dashboard.compras.total',
  'dashboard.gastos.total',
  'dashboard.gastos.mes',
  'dashboard.cxc.saldo',
  'dashboard.cobros.total',
  'dashboard.cobros.mes',
  'dashboard.finanzas.utilidad',
])

/** Widgets de lista: el `limit` sí aplica (openapi: 1–20, default 5). */
const WIDGETS_LISTA = new Set([
  'dashboard.ventas.top-productos',
  'dashboard.ventas.top-clientes',
  'dashboard.inventario.bajo-minimo',
  'dashboard.actividad.reciente',
  'dashboard.actividad.pendientes',
])

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

function statusCodeOf(err: unknown): number | undefined {
  return (err as unknown as ApiError | null)?.statusCode
}

function WidgetCard({ widgetKey, titulo, period }: {
  widgetKey: string
  titulo: string
  period: DashboardPeriod
}) {
  const queryClient = useQueryClient()
  // `limit` solo aplica a reportes de lista (tops, actividad, bajo mínimo): 20 para no
  // truncar respecto al dashboard legacy. El resto usa el default del backend.
  const limit = WIDGETS_LISTA.has(widgetKey) ? 20 : undefined
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-widget', widgetKey, period, limit],
    queryFn: () => getDashboardWidget(widgetKey, { period, limit }),
    retry: false,
  })

  const Visual = WIDGETS[widgetKey]
  if (!Visual) {
    if (import.meta.env.DEV) console.debug(`[dashboard] widget sin visual registrado: ${widgetKey} — se ignora`)
    return null
  }

  if (isLoading) {
    return WIDGETS_KPI.has(widgetKey)
      ? (
        <div className="kpi-card gap-50 w-200">
          <div className="dash-skeleton" style={{ width: '55%', height: 10, marginBottom: 14 }} />
          <div className="dash-skeleton" style={{ width: '75%', height: 22, marginBottom: 10 }} />
          <div className="dash-skeleton" style={{ width: '60%', height: 10 }} />
        </div>
      )
      : <div className="dash-skeleton" style={{ width: '100%', height: 240 }} />
  }

  if (isError) {
    // 403 WIDGET_* → el interceptor ya refrescó el acceso; además se re-pide el catálogo
    // por si el reporte dejó de estar visible/contratado. La tarjeta se oculta.
    if (isApiErrorCode(error, 'WIDGET_NO_PERMITIDO') || isApiErrorCode(error, 'WIDGET_NO_CONTRATADO')) {
      queryClient.invalidateQueries({ queryKey: ['dashboard-catalogo'] })
      return null
    }
    return WIDGETS_KPI.has(widgetKey)
      ? (
        <div className="kpi-card gap-50 w-200">
          <div className="dash-empty-title">No se pudo cargar</div>
          <p className="dash-empty-sub">{apiMessage(error, 'Error al cargar el reporte.')}</p>
          <button className="btn btn-ghost btn-size-sm" onClick={() => refetch()}>Reintentar</button>
        </div>
      )
      : (
        <div className="list-card">
          <div className="dash-empty">
            <div className="dash-empty-title">No se pudo cargar "{titulo}"</div>
            <p className="dash-empty-sub">{apiMessage(error, 'Error al cargar el reporte.')}</p>
            <button className="btn btn-ghost btn-size-sm" onClick={() => refetch()}>Reintentar</button>
          </div>
        </div>
      )
  }

  if (!data) return null
  return <Visual data={data.data} meta={data.meta} titulo={titulo} />
}

function TipoSection({ tipo, period }: { tipo: DashboardTipoReporte; period: DashboardPeriod }) {
  const conocidos = tipo.reportes.filter((r) => WIDGETS[r.key])
  if (import.meta.env.DEV) {
    for (const r of tipo.reportes) {
      if (!WIDGETS[r.key]) console.debug(`[dashboard] reporte sin visual: ${r.key} — se ignora`)
    }
  }
  if (conocidos.length === 0) return null
  const kpis = conocidos.filter((r) => WIDGETS_KPI.has(r.key))
  const grandes = conocidos.filter((r) => !WIDGETS_KPI.has(r.key))
  return (
    <section aria-label={tipo.nombre} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 className="card-title-dash" style={{ margin: 0 }}>{tipo.nombre}</h2>
        {tipo.descripcion && <p className="chart-subtitle" style={{ margin: '4px 0 0' }}>{tipo.descripcion}</p>}
      </div>
      {kpis.length > 0 && (
        <div className="kpi-grid">
          {kpis.map((r) => (
            <WidgetCard key={r.key} widgetKey={r.key} titulo={r.nombre} period={period} />
          ))}
        </div>
      )}
      {grandes.map((r) => (
        <WidgetCard key={r.key} widgetKey={r.key} titulo={r.nombre} period={period} />
      ))}
    </section>
  )
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('month')

  const { data: catalogo, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-catalogo'],
    queryFn: getDashboardCatalogo,
    retry: false,
    staleTime: 60_000,
  })

  const header = (
    <div className="dashboard-header">
      <div className="dashboard-greeting">
        <span className="dashboard-overline">Bienvenido de vuelta</span>
        <h1 className="dashboard-title">Panel de Control</h1>
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
  )

  // Backend anterior a v2 (sin /dashboard/catalogo): dashboard legacy con /dashboard/summary.
  if (isError && statusCodeOf(error) === 404) return <LegacyDashboard />

  return (
    <div className="dashboard-page">
      {header}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="kpi-grid">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="kpi-card gap-50 w-200" style={{ '--i': i } as React.CSSProperties}>
                <div className="dash-skeleton" style={{ width: '55%', height: 10, marginBottom: 14 }} />
                <div className="dash-skeleton" style={{ width: '75%', height: 22, marginBottom: 10 }} />
                <div className="dash-skeleton" style={{ width: '60%', height: 10 }} />
              </div>
            ))}
          </div>
          <div className="dash-skeleton" style={{ width: '100%', height: 240 }} />
        </div>
      ) : isError ? (
        <div className="dash-empty">
          <div className="dash-empty-title">No se pudo cargar el dashboard</div>
          <p className="dash-empty-sub">{apiMessage(error, 'Error al cargar el catálogo de reportes.')}</p>
          <button className="btn btn-ghost btn-size-sm" onClick={() => refetch()}>Reintentar</button>
        </div>
      ) : (catalogo ?? []).length === 0 ? (
        <div className="dash-empty">
          <div className="dash-empty-title">Sin reportes disponibles</div>
          <p className="dash-empty-sub">No tiene reportes disponibles en el dashboard. Pídale acceso a su administrador.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {(catalogo ?? []).map((tipo) => (
            <TipoSection key={tipo.key} tipo={tipo} period={period} />
          ))}
          <p style={{ fontSize: 12, color: 'var(--dash-ink-400)' }}>
            ¿Falta un reporte? <Link to="/reportes/ventas">Ver todos los reportes</Link>
          </p>
        </div>
      )}
    </div>
  )
}
