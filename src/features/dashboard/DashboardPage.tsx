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

/** Widgets que el catálogo puede mandar pero no se muestran en el dashboard. */
const WIDGETS_OCULTOS = new Set([
  'dashboard.compras.total',
  'dashboard.gastos.mes',
  'dashboard.cobros.mes',
  'dashboard.ventas.top-clientes',
  'dashboard.inventario.bajo-minimo',
])

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

/** Widgets "grandes" que son gráficos (van en la fila `.dash-charts`, 2 columnas) — el resto de
 *  los no-KPI son listas (van en `.dash-bottom-grid`, 3 columnas). Cada componente en widgets.tsx
 *  ya se renderiza con la clase de grilla correcta (dash-chart-primary/secondary,
 *  dash-col-products/activity/pending) — mismas clases que usaba el dashboard legacy
 *  (LegacyDashboard.tsx), así que alcanza con agruparlos en el contenedor correcto. */
const WIDGETS_CHART = new Set([
  'dashboard.ventas.grafico',
  'dashboard.finanzas.ingresos-gastos',
])

/** Orden fijo dentro de cada fila, igual al dashboard legacy — un tenant con el catálogo
 *  "estándar" (los 8 KPI / 2 gráficos / 5 listas de arriba) queda idéntico a como se veía antes.
 *  Cualquier key fuera de este mapa simplemente va al final, en el orden que la mande el catálogo. */
const ORDEN_WIDGET: Record<string, number> = {
  'dashboard.ventas.total': 0,
  'dashboard.cobros.total': 1,
  'dashboard.gastos.total': 2,
  'dashboard.cxc.saldo': 3,
  'dashboard.finanzas.utilidad': 4,
  'dashboard.compras.total': 5,
  'dashboard.gastos.mes': 6,
  'dashboard.cobros.mes': 7,
  'dashboard.ventas.grafico': 0,
  'dashboard.finanzas.ingresos-gastos': 1,
  'dashboard.ventas.top-productos': 0,
  'dashboard.actividad.reciente': 1,
  'dashboard.actividad.pendientes': 2,
  'dashboard.ventas.top-clientes': 3,
  'dashboard.inventario.bajo-minimo': 4,
}

function ordenar<T extends { key: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (ORDEN_WIDGET[a.key] ?? 99) - (ORDEN_WIDGET[b.key] ?? 99))
}

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
  const limit = widgetKey === 'dashboard.ventas.top-productos' ? 5 : WIDGETS_LISTA.has(widgetKey) ? 20 : undefined
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

/** Reportes conocidos (con visual registrado) de todo el catálogo, sin importar el tipo/módulo al
 *  que pertenezcan — el layout de la página es fijo (KPIs / gráficos / listas), no por módulo. */
function reportesConocidos(catalogo: DashboardTipoReporte[]) {
  const todos = catalogo.flatMap((tipo) => tipo.reportes)
  if (import.meta.env.DEV) {
    for (const r of todos) {
      if (!WIDGETS[r.key]) console.debug(`[dashboard] reporte sin visual: ${r.key} — se ignora`)
    }
  }
  return todos.filter((r) => WIDGETS[r.key] && !WIDGETS_OCULTOS.has(r.key))
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
          <div className="dash-charts">
            <div className="dash-chart-primary">
              <div className="dash-skeleton" style={{ width: '100%', height: 240 }} />
            </div>
            <div className="dash-chart-secondary">
              <div className="dash-skeleton" style={{ width: '100%', height: 240 }} />
            </div>
          </div>
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
      ) : (() => {
        const conocidos = reportesConocidos(catalogo ?? [])
        const kpis = ordenar(conocidos.filter((r) => WIDGETS_KPI.has(r.key)))
        const charts = ordenar(conocidos.filter((r) => WIDGETS_CHART.has(r.key)))
        const listas = ordenar(conocidos.filter((r) => !WIDGETS_KPI.has(r.key) && !WIDGETS_CHART.has(r.key)))
        if (conocidos.length === 0) {
          return (
            <div className="dash-empty">
              <div className="dash-empty-title">Sin reportes disponibles</div>
              <p className="dash-empty-sub">No tiene reportes disponibles en el dashboard. Pídale acceso a su administrador.</p>
            </div>
          )
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {kpis.length > 0 && (
              <div className="kpi-grid">
                {kpis.map((r) => (
                  <WidgetCard key={r.key} widgetKey={r.key} titulo={r.nombre} period={period} />
                ))}
              </div>
            )}
            {charts.length > 0 && (
              <div className="dash-charts">
                {charts.map((r) => (
                  <WidgetCard key={r.key} widgetKey={r.key} titulo={r.nombre} period={period} />
                ))}
              </div>
            )}
            {listas.length > 0 && (
              <div className="dash-bottom-grid">
                {listas.map((r) => (
                  <WidgetCard key={r.key} widgetKey={r.key} titulo={r.nombre} period={period} />
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--dash-ink-400)' }}>
              ¿Falta un reporte? <Link to="/reportes/ventas">Ver todos los reportes</Link>
            </p>
          </div>
        )
      })()}
    </div>
  )
}
