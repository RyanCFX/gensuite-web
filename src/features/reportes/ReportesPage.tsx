import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  getReporte606, getReporte607, getReporte608,
  getBalanceGeneral, getIngresosEgresos, getReporteVentas,
  getInventarioValoracion, getInventarioMovimientos,
  getCxcAging, getCajaCuadre,
} from '@/shared/api/reportes'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate, formatDOP } from '@/lib/formatters'
import { BarChart3, AlertCircle, Download, FileText } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPORT_META: Record<string, { label: string; description: string }> = {
  '606':        { label: 'DGII 606',             description: 'Compras y gastos del período' },
  '607':        { label: 'DGII 607',             description: 'Retenciones del período' },
  '608':        { label: 'DGII 608',             description: 'Ventas del período' },
  balance:      { label: 'Balance General',      description: 'Estado de situación financiera' },
  pl:           { label: 'Estado de Resultados', description: 'Ingresos y egresos del período' },
  ventas:       { label: 'Ventas',               description: 'Reporte de ventas por período' },
  stock:        { label: 'Valoración de Stock',  description: 'Costo y valor del inventario' },
  movimientos:  { label: 'Movimientos de Stock', description: 'Historial de entradas y salidas' },
  cxcaging:    { label: 'Aging CxC',            description: 'Antigüedad de cuentas por cobrar' },
  caja:         { label: 'Cuadre de Caja',       description: 'Resumen de movimientos de caja' },
}

function thisYear() { return new Date().getFullYear() }
function thisMonth() { return new Date().getMonth() + 1 }
function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

type ApiError = { statusCode?: number; message?: string }

// ─── ServiceUnavailable ───────────────────────────────────────────────────────

function ServiceUnavailable({ message }: { message?: string }) {
  return (
    <div className="service-unavailable">
      <span className="service-unavailable-icon">
        <AlertCircle size={22} aria-hidden="true" />
      </span>
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          Reporte no disponible
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 400, lineHeight: 1.6 }}>
          {message ?? 'Este reporte requiere configuración adicional (dgii-compliance). Contacta al administrador.'}
        </p>
      </div>
    </div>
  )
}

// ─── Generic table renderer ───────────────────────────────────────────────────

function ReportTable({
  data,
  columns,
}: {
  data: Record<string, unknown>[]
  columns?: ColumnDef[]
}) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><FileText size={20} /></span>
        <p className="empty-title">Sin datos</p>
        <p className="empty-sub">No hay registros para los filtros seleccionados.</p>
      </div>
    )
  }

  // Usa los fieldnames de `columns` si vienen del backend; si no, infiere de la primera fila
  const colDefs: ColumnDef[] = columns && columns.length > 0
    ? columns
    : Object.keys(data[0]).map((k) => ({ fieldname: k, label: k.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim() }))

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {colDefs.map((c) => (
              <th key={c.fieldname}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {colDefs.map((c) => {
                const val = row[c.fieldname]
                const isAmount = c.fieldname.toLowerCase().includes('monto') || c.fieldname.toLowerCase().includes('total')
                const isDate = typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)
                const str = typeof val === 'number' && isAmount
                  ? formatDOP(val)
                  : isDate
                    ? formatDate(val as string)
                    : String(val ?? '—')
                return <td key={c.fieldname}>{str}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LoadingRows() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="skeleton-box" style={{ height: 14, width: `${50 + i * 7}%` }} />
      ))}
    </div>
  )
}

function ErrorBanner({ err }: { err: unknown }) {
  const e = err as ApiError
  if (e.statusCode === 503) return <ServiceUnavailable />
  return (
    <div className="inline-alert inline-alert-error" style={{ margin: 16 }}>
      <AlertCircle size={16} aria-hidden="true" />
      {e.message ?? 'Error al cargar el reporte'}
    </div>
  )
}

type ColumnDef = { fieldname: string; label: string }

function extractRows(data: unknown): { rows: Record<string, unknown>[]; columns?: ColumnDef[] } {
  if (!data) return { rows: [] }

  // Case: { success, data: { rows, columns, totalRows } }  ← formato DGII 606/607/608
  const envelope = data as { data?: unknown }
  const inner = envelope.data ?? data

  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const shaped = inner as { rows?: unknown; columns?: ColumnDef[] }
    if (Array.isArray(shaped.rows)) {
      return { rows: shaped.rows as Record<string, unknown>[], columns: shaped.columns }
    }
  }

  // Case: data is a direct array
  if (Array.isArray(inner)) return { rows: inner as Record<string, unknown>[] }

  return { rows: [] }
}

// ─── Report components ────────────────────────────────────────────────────────

function DgiiReport({ tipo }: { tipo: '606' | '607' | '608' }) {
  const [year, setYear] = useState(thisYear())
  const [month, setMonth] = useState(thisMonth())
  const fn = tipo === '606' ? getReporte606 : tipo === '607' ? getReporte607 : getReporte608

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-dgii', tipo, year, month],
    queryFn: () => fn({ year, month }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            Año:
            <select className="filter-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear(), thisYear() - 1, thisYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            Mes:
            <select className="filter-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString('es-DO', { month: 'long' })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filter-bar-right">
          <button className="btn btn-secondary btn-size-sm">
            <Download size={13} aria-hidden="true" /> Exportar TXT
          </button>
        </div>
      </div>
      <div className="card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

/** Wrapper que desenvuelve cualquier formato de respuesta y renderiza la tabla */
function AutoTable({ data }: { data: unknown }) {
  const { rows, columns } = extractRows(data)
  return <ReportTable data={rows} columns={columns} />
}

function FinancialReport({ tipo }: { tipo: 'balance' | 'pl' }) {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [periodicity, setPeriodicity] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const fn = tipo === 'balance' ? getBalanceGeneral : getIngresosEgresos

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-financial', tipo, fromDate, toDate, periodicity],
    queryFn: () => fn({ fromDate, toDate, periodicity }),
    retry: false,
  })

  const note = (data as { note?: string })?.note

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <input type="date" className="filter-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="filter-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select className="filter-select" value={periodicity} onChange={(e) => setPeriodicity(e.target.value as typeof periodicity)}>
            <option value="monthly">Mensual</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
      </div>
      <div className="card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && (
          <>
            {note && (
              <div className="inline-alert inline-alert-info" style={{ margin: '16px 16px 0' }}>
                <AlertCircle size={14} aria-hidden="true" /> {note}
              </div>
            )}
            <AutoTable data={data} />
          </>
        )}
      </div>
    </div>
  )
}

function VentasReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('month')

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-ventas', fromDate, toDate, groupBy],
    queryFn: () => getReporteVentas({ fromDate, toDate, groupBy }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <input type="date" className="filter-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="filter-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select className="filter-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
            <option value="day">Por día</option>
            <option value="week">Por semana</option>
            <option value="month">Por mes</option>
          </select>
        </div>
      </div>
      <div className="card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function InventarioReport({ tipo }: { tipo: 'stock' | 'movimientos' }) {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const fn = tipo === 'stock' ? getInventarioValoracion : getInventarioMovimientos

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-inventario', tipo, fromDate, toDate],
    queryFn: () => fn({ fromDate, toDate }),
    retry: false,
  })

  const isGenerating = (data as { preparedReport?: boolean })?.preparedReport

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <input type="date" className="filter-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="filter-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>
      <div className="card">
        {isLoading && <LoadingRows />}
        {isGenerating && (
          <div className="inline-alert inline-alert-info" style={{ margin: 16 }}>
            <AlertCircle size={14} aria-hidden="true" />
            El reporte se está generando en background. Reintenta en unos segundos.
          </div>
        )}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && !isGenerating && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function CxcAgingReport() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-cxc-aging'],
    queryFn: getCxcAging,
    retry: false,
  })

  return (
    <div className="card">
      {isLoading && <LoadingRows />}
      {error && <ErrorBanner err={error} />}
      {!isLoading && !error && <AutoTable data={data} />}
    </div>
  )
}

function CajaCuadreReport() {
  const [date, setDate] = useState(today())
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-caja', date],
    queryFn: () => getCajaCuadre({ date }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            Fecha: <input type="date" className="filter-select" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const REPORT_NAV = [
  { key: '606',         group: 'DGII',       label: '606 – Compras' },
  { key: '607',         group: 'DGII',       label: '607 – Retenciones' },
  { key: '608',         group: 'DGII',       label: '608 – Ventas' },
  { key: 'ventas',      group: 'Ventas',     label: 'Ventas' },
  { key: 'balance',     group: 'Financiero', label: 'Balance General' },
  { key: 'pl',          group: 'Financiero', label: 'Estado de Resultados' },
  { key: 'stock',       group: 'Inventario', label: 'Valoración de Stock' },
  { key: 'movimientos', group: 'Inventario', label: 'Movimientos de Stock' },
  { key: 'cxcaging',   group: 'CxC',        label: 'Aging CxC' },
  { key: 'caja',        group: 'Caja',       label: 'Cuadre de Caja' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const { tipo } = useParams<{ tipo: string }>()
  const navigate = useNavigate()
  const active = tipo ?? '606'
  const meta = REPORT_META[active]
  const groups = [...new Set(REPORT_NAV.map((n) => n.group))]

  function renderReport() {
    switch (active) {
      case '606':        return <DgiiReport tipo="606" />
      case '607':        return <DgiiReport tipo="607" />
      case '608':        return <DgiiReport tipo="608" />
      case 'balance':    return <FinancialReport tipo="balance" />
      case 'pl':         return <FinancialReport tipo="pl" />
      case 'ventas':     return <VentasReport />
      case 'stock':      return <InventarioReport tipo="stock" />
      case 'movimientos':return <InventarioReport tipo="movimientos" />
      case 'cxcaging':  return <CxcAgingReport />
      case 'caja':       return <CajaCuadreReport />
      default:           return <ServiceUnavailable message="Reporte no encontrado." />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 'calc(100vh - var(--navbar-height))' }}>
      {/* ── Sidebar de reportes ── */}
      <aside style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid var(--border-default)',
        padding: '12px 0',
        background: 'var(--surface-page)',
        overflowY: 'auto',
      }}>
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: 4 }}>
            <div className="sb-label" style={{ padding: '6px 12px 2px' }}>{group}</div>
            {REPORT_NAV.filter((n) => n.group === group).map((n) => (
              <button
                key={n.key}
                className={`nav-item${active === n.key ? ' active' : ''}`}
                style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                onClick={() => navigate(`/reportes/${n.key}`)}
                aria-current={active === n.key ? 'page' : undefined}
              >
                <BarChart3 size={13} aria-hidden="true" />
                <span className="nav-label">{n.label}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* ── Contenido ── */}
      <div style={{ flex: 1, minWidth: 0, padding: '24px 28px', overflowY: 'auto' }}>
        <PageHeader
          overline="Reportes"
          title={meta?.label ?? active}
          description={meta?.description}
        />
        {renderReport()}
      </div>
    </div>
  )
}
