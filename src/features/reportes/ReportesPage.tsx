import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getReporte606, getReporte607, getReporte608,
  getBalanceGeneral, getIngresosEgresos, getReporteVentas,
  getInventarioValoracion, getInventarioMovimientos,
  getCxcAging, getCxpAging, getCajaCuadre,
  getLibroDiario, getLibroMayor,
  getCuadreTurno, downloadCuadreTurnoExcel, downloadCuadreTurnoPdf,
  downloadReporteExcel,
  downloadBalanceGeneralPdf, downloadIngresosEgresosPdf, downloadVentasPdf,
  downloadInventarioValoracionPdf, downloadInventarioMovimientosPdf,
  downloadCxcAgingPdf, downloadCxpAgingPdf, downloadCajaCuadrePdf,
} from '@/shared/api/reportes'
import type { LibroDiarioByDimension, CuadreTurnoRow } from '@/shared/api/types'
import { listSucursales } from '@/shared/api/sucursales'
import { listDepartamentos } from '@/shared/api/departamentos'
import { listUsuarios } from '@/shared/api/usuarios'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate, formatDateTime, formatDOP } from '@/lib/formatters'
import { BarChart3, AlertCircle, Download, FileText, Loader2 } from 'lucide-react'

// ─── Branch / Department filter ──────────────────────────────────────────────

function useBranchOptions() {
  const { data } = useQuery({
    queryKey: ['reportes-sucursales-options'],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  return data?.items ?? []
}

function useDepartmentOptions() {
  const { data } = useQuery({
    queryKey: ['reportes-departamentos-options'],
    queryFn: () => listDepartamentos({ limit: 100 }),
    staleTime: 60_000,
  })
  return data?.items ?? []
}

/** Selectores opcionales de Sucursal / Departamento para reportes con rango de fechas. */
function BranchDepartmentFilters({
  branch,
  onBranchChange,
  department,
  onDepartmentChange,
}: {
  branch: string
  onBranchChange: (v: string) => void
  department: string
  onDepartmentChange: (v: string) => void
}) {
  const branches = useBranchOptions()
  const departments = useDepartmentOptions()

  return (
    <>
      <select className="filter-select" value={branch} onChange={(e) => onBranchChange(e.target.value)}>
        <option value="">Todas las sucursales</option>
        {branches.map((b) => (
          <option key={b.id} value={b.name}>{b.name}</option>
        ))}
      </select>
      <select className="filter-select" value={department} onChange={(e) => onDepartmentChange(e.target.value)}>
        <option value="">Todos los departamentos</option>
        {departments.map((d) => (
          <option key={d.id} value={d.name}>{d.name}</option>
        ))}
      </select>
    </>
  )
}

/** Botón "Descargar PDF" reutilizable — mismo patrón que Libro Diario/Mayor. */
function DownloadPdfButton({ onDownload }: { onDownload: () => Promise<void> }) {
  const mutation = useMutation({
    mutationFn: onDownload,
    onError: () => toast.error('No se pudo descargar el PDF'),
  })
  return (
    <button
      className="btn btn-secondary btn-size-sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? <Loader2 size={13} className="spin" /> : <Download size={13} aria-hidden="true" />}
      {' '}Descargar PDF
    </button>
  )
}

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
  libroDiario:  { label: 'Libro Diario',         description: 'Movimientos contables (GL) del período' },
  libroMayor:   { label: 'Libro Mayor',          description: 'Movimientos por cuenta con saldo inicial y final' },
  cuadreTurno:  { label: 'Cuadre por Turno',     description: 'Historial de turnos de caja cerrados y su cuadre' },
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
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [downloadingExcel, setDownloadingExcel] = useState(false)
  const fn = tipo === '606' ? getReporte606 : tipo === '607' ? getReporte607 : getReporte608

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-dgii', tipo, year, month, branch, department],
    queryFn: () => fn({ year, month, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  async function handleDownloadExcel() {
    setDownloadingExcel(true)
    try {
      await downloadReporteExcel(tipo, year, month, branch || undefined)
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Error al descargar el Excel'
      const { toast } = await import('sonner')
      toast.error(msg)
    } finally {
      setDownloadingExcel(false)
    }
  }

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
          <BranchDepartmentFilters
            branch={branch} onBranchChange={setBranch}
            department={department} onDepartmentChange={setDepartment}
          />
        </div>
        <div className="filter-bar-right">
          <button className="btn btn-secondary btn-size-sm" onClick={handleDownloadExcel} disabled={downloadingExcel}>
            {downloadingExcel ? <Loader2 size={13} className="spin" /> : <Download size={13} aria-hidden="true" />}
            {' '}Descargar Excel
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
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const fn = tipo === 'balance' ? getBalanceGeneral : getIngresosEgresos
  const downloadPdf = tipo === 'balance' ? downloadBalanceGeneralPdf : downloadIngresosEgresosPdf

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-financial', tipo, fromDate, toDate, periodicity, branch, department],
    queryFn: () => fn({ fromDate, toDate, periodicity, branch: branch || undefined, department: department || undefined }),
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
          <BranchDepartmentFilters
            branch={branch} onBranchChange={setBranch}
            department={department} onDepartmentChange={setDepartment}
          />
        </div>
        <div className="filter-bar-right">
          <DownloadPdfButton
            onDownload={() => downloadPdf({ fromDate, toDate, periodicity, branch: branch || undefined, department: department || undefined })}
          />
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
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-ventas', fromDate, toDate, groupBy, branch, department],
    queryFn: () => getReporteVentas({ fromDate, toDate, groupBy, branch: branch || undefined, department: department || undefined }),
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
          <BranchDepartmentFilters
            branch={branch} onBranchChange={setBranch}
            department={department} onDepartmentChange={setDepartment}
          />
        </div>
        <div className="filter-bar-right">
          <DownloadPdfButton
            onDownload={() => downloadVentasPdf({ fromDate, toDate, groupBy, branch: branch || undefined, department: department || undefined })}
          />
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
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const fn = tipo === 'stock' ? getInventarioValoracion : getInventarioMovimientos
  const downloadPdf = tipo === 'stock' ? downloadInventarioValoracionPdf : downloadInventarioMovimientosPdf

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-inventario', tipo, fromDate, toDate, branch, department],
    queryFn: () => fn({ fromDate, toDate, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  const isGenerating = (data as { preparedReport?: boolean })?.preparedReport

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <input type="date" className="filter-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="filter-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <BranchDepartmentFilters
            branch={branch} onBranchChange={setBranch}
            department={department} onDepartmentChange={setDepartment}
          />
        </div>
        <div className="filter-bar-right">
          <DownloadPdfButton
            onDownload={() => downloadPdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined })}
          />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left" />
        <div className="filter-bar-right">
          <DownloadPdfButton onDownload={downloadCxcAgingPdf} />
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

function CxpAgingReport() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-cxp-aging'],
    queryFn: getCxpAging,
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left" />
        <div className="filter-bar-right">
          <DownloadPdfButton onDownload={downloadCxpAgingPdf} />
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

type CajaCuadreData = {
  date: string
  cashier: string
  totalCobrado: number
  totalFacturado: number
  numCobros: number
  numFacturas: number
  porMetodoDePago: { metodo: string; total: number }[]
  diferencia: number
}

function CajaCuadreReport() {
  const [date, setDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-caja', date, branch, department],
    queryFn: () => getCajaCuadre({ date, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  const cuadre = (data as { data?: CajaCuadreData } | undefined)?.data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtro */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            Fecha: <input type="date" className="filter-select" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <BranchDepartmentFilters
            branch={branch} onBranchChange={setBranch}
            department={department} onDepartmentChange={setDepartment}
          />
        </div>
        <div className="filter-bar-right">
          <DownloadPdfButton
            onDownload={() => downloadCajaCuadrePdf({ date, branch: branch || undefined, department: department || undefined })}
          />
        </div>
      </div>

      {isLoading && <div className="card"><LoadingRows /></div>}
      {error && <ErrorBanner err={error} />}

      {!isLoading && !error && cuadre && (
        <>
          {/* Tarjetas resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total Cobrado',    value: formatDOP(cuadre.totalCobrado),   sub: `${cuadre.numCobros} cobro${cuadre.numCobros !== 1 ? 's' : ''}` },
              { label: 'Total Facturado',  value: formatDOP(cuadre.totalFacturado), sub: `${cuadre.numFacturas} factura${cuadre.numFacturas !== 1 ? 's' : ''}` },
              { label: 'Diferencia',       value: formatDOP(cuadre.diferencia),     sub: cuadre.diferencia > 0 ? 'Pendiente por cobrar' : 'Cuadrado', danger: cuadre.diferencia > 0 },
              { label: 'Cajero',           value: cuadre.cashier,                  sub: formatDate(cuadre.date) },
            ].map((card) => (
              <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: card.danger ? 'var(--color-danger, #e53e3e)' : 'var(--text-primary)', wordBreak: 'break-all' }}>{card.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Desglose por método de pago */}
          <div className="card">
            <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border-default)' }}>
              Desglose por método de pago
            </div>
            {cuadre.porMetodoDePago.length === 0
              ? (
                <div className="empty-state">
                  <span className="empty-icon"><FileText size={20} /></span>
                  <p className="empty-title">Sin movimientos</p>
                  <p className="empty-sub">No hubo cobros registrados en esta fecha.</p>
                </div>
              )
              : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Método de pago</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuadre.porMetodoDePago.map((row) => (
                        <tr key={row.metodo}>
                          <td>{row.metodo}</td>
                          <td style={{ textAlign: 'right' }}>{formatDOP(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </>
      )}

      {!isLoading && !error && !cuadre && (
        <div className="empty-state">
          <span className="empty-icon"><FileText size={20} /></span>
          <p className="empty-title">Sin datos</p>
          <p className="empty-sub">No hay información de caja para la fecha seleccionada.</p>
        </div>
      )}
    </div>
  )
}

function useCajeroOptions() {
  const { data } = useQuery({
    queryKey: ['reportes-cajeros-options'],
    queryFn: () => listUsuarios({ limit: 100 }),
    staleTime: 60_000,
  })
  return data?.items ?? []
}

function diferenciaColor(diff: number): string | undefined {
  if (diff < 0) return 'var(--error-text)'
  if (diff > 0) return 'var(--warning-text)'
  return undefined
}

function CuadreTurnoReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [cajero, setCajero] = useState('')
  const [downloadingExcel, setDownloadingExcel] = useState(false)
  const cajeros = useCajeroOptions()

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-cuadre-turno', fromDate, toDate, cajero],
    queryFn: () => getCuadreTurno({ fromDate, toDate, cajero: cajero || undefined }),
    retry: false,
  })

  const rows: CuadreTurnoRow[] = data?.data?.rows ?? []

  const resumen = rows.reduce(
    (acc, r) => {
      acc.totalDiferencia += r.difference
      if (r.difference !== 0) acc.turnosConDiferencia.add(r.closingEntryId)
      return acc
    },
    { totalDiferencia: 0, turnosConDiferencia: new Set<string>() },
  )

  async function handleDownloadExcel() {
    setDownloadingExcel(true)
    try {
      await downloadCuadreTurnoExcel({ fromDate, toDate, cajero: cajero || undefined })
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Error al descargar el Excel'
      const { toast } = await import('sonner')
      toast.error(msg)
    } finally {
      setDownloadingExcel(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <input type="date" className="filter-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="filter-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select className="filter-select" value={cajero} onChange={(e) => setCajero(e.target.value)}>
            <option value="">Todos los cajeros</option>
            {cajeros.map((u) => (
              <option key={u.email} value={u.email}>{u.fullName}</option>
            ))}
          </select>
        </div>
        <div className="filter-bar-right">
          <button className="btn btn-secondary btn-size-sm" onClick={handleDownloadExcel} disabled={downloadingExcel}>
            {downloadingExcel ? <Loader2 size={13} className="spin" /> : <Download size={13} aria-hidden="true" />}
            {' '}Descargar Excel
          </button>
          {/* Acción separada — /pdf ignora cualquier `format`, no es un tercer valor del selector de Excel */}
          <DownloadPdfButton
            onDownload={() => downloadCuadreTurnoPdf({ fromDate, toDate, cajero: cajero || undefined })}
          />
        </div>
      </div>

      {!isLoading && !error && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: 'Turnos en el período', value: String(new Set(rows.map((r) => r.closingEntryId)).size) },
            { label: 'Turnos con diferencia', value: String(resumen.turnosConDiferencia.size) },
            {
              label: 'Diferencia total',
              value: formatDOP(resumen.totalDiferencia),
              color: diferenciaColor(resumen.totalDiferencia),
            },
          ].map((card) => (
            <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: card.color ?? 'var(--text-primary)' }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && rows.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon"><FileText size={20} /></span>
            <p className="empty-title">Sin turnos cerrados</p>
            <p className="empty-sub">No hay turnos de caja cerrados para los filtros seleccionados.</p>
          </div>
        )}
        {!isLoading && !error && rows.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Cajero</th>
                  <th>Modo de Pago</th>
                  <th style={{ textAlign: 'right' }}>Apertura</th>
                  <th style={{ textAlign: 'right' }}>Esperado</th>
                  <th style={{ textAlign: 'right' }}>Contado</th>
                  <th style={{ textAlign: 'right' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.closingEntryId}-${r.modeOfPayment}-${i}`}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {r.closingEntryId}
                      <div className="td-muted" style={{ fontSize: 11 }}>{formatDateTime(r.periodStartDate)}</div>
                    </td>
                    <td>{r.cajero}</td>
                    <td>{r.modeOfPayment}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatDOP(r.openingAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatDOP(r.expectedAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatDOP(r.closingAmount)}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: diferenciaColor(r.difference),
                      }}
                    >
                      {r.difference > 0 ? '+' : ''}
                      {formatDOP(r.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ByDimensionTable({ rows }: { rows: LibroDiarioByDimension[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Dimensión</th>
            <th style={{ textAlign: 'right' }}>Total Débito</th>
            <th style={{ textAlign: 'right' }}>Total Crédito</th>
            <th style={{ textAlign: 'right' }}>Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td style={{ textAlign: 'right' }}>{formatDOP(r.totalDebit)}</td>
              <td style={{ textAlign: 'right' }}>{formatDOP(r.totalCredit)}</td>
              <td style={{ textAlign: 'right' }}>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LibroDiarioReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [groupBy, setGroupBy] = useState<
    'Group by Voucher' | 'Group by Voucher (Consolidated)' | 'Group by Account' | 'Group by Sucursal' | 'Group by Departamento'
  >('Group by Voucher (Consolidated)')

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-libro-diario', fromDate, toDate, branch, department, groupBy],
    queryFn: () => getLibroDiario({ fromDate, toDate, branch: branch || undefined, department: department || undefined, groupBy }),
    retry: false,
  })

  const { rows, columns } = extractRows(data)
  const byDimension = (data as { data?: { byDimension?: LibroDiarioByDimension[] } } | undefined)?.data?.byDimension
    ?? (data as { byDimension?: LibroDiarioByDimension[] } | undefined)?.byDimension

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <input type="date" className="filter-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="filter-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select className="filter-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
            <option value="Group by Voucher">Agrupar por Voucher</option>
            <option value="Group by Voucher (Consolidated)">Agrupar por Voucher (Consolidado)</option>
            <option value="Group by Account">Agrupar por Cuenta</option>
            <option value="Group by Sucursal">Agrupar por Sucursal</option>
            <option value="Group by Departamento">Agrupar por Departamento</option>
          </select>
          <BranchDepartmentFilters
            branch={branch} onBranchChange={setBranch}
            department={department} onDepartmentChange={setDepartment}
          />
        </div>
      </div>

      {byDimension && byDimension.length > 0 && (
        <div className="card">
          <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border-default)' }}>
            Resumen por {groupBy === 'Group by Sucursal' ? 'Sucursal' : 'Departamento'}
          </div>
          <ByDimensionTable rows={byDimension} />
        </div>
      )}

      <div className="card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <ReportTable data={rows} columns={columns} />}
      </div>
    </div>
  )
}

function LibroMayorReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-libro-mayor', fromDate, toDate, branch, department],
    queryFn: () => getLibroMayor({ fromDate, toDate, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="filter-bar">
        <div className="filter-bar-left">
          <input type="date" className="filter-select" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" className="filter-select" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <BranchDepartmentFilters
            branch={branch} onBranchChange={setBranch}
            department={department} onDepartmentChange={setDepartment}
          />
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
  { key: '607',         group: 'DGII',       label: '607 – Ventas' },
  { key: '608',         group: 'DGII',       label: '608 – Anulaciones' },
  { key: 'ventas',      group: 'Ventas',     label: 'Ventas' },
  { key: 'balance',     group: 'Financiero', label: 'Balance General' },
  { key: 'pl',          group: 'Financiero', label: 'Estado de Resultados' },
  { key: 'stock',       group: 'Inventario', label: 'Valoración de Stock' },
  { key: 'movimientos', group: 'Inventario', label: 'Movimientos de Stock' },
  { key: 'cxcaging',   group: 'CxC',        label: 'Aging CxC' },
  { key: 'cxpaging',   group: 'CXP',        label: 'Aging CXP' },
  { key: 'caja',        group: 'Caja',       label: 'Cuadre de Caja' },
  { key: 'cuadreTurno', group: 'Caja',       label: 'Cuadre por Turno' },
  { key: 'libroDiario', group: 'Contabilidad', label: 'Libro Diario' },
  { key: 'libroMayor',  group: 'Contabilidad', label: 'Libro Mayor' },
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
      case 'cxpaging':  return <CxpAgingReport />
      case 'caja':       return <CajaCuadreReport />
      case 'cuadreTurno': return <CuadreTurnoReport />
      case 'libroDiario': return <LibroDiarioReport />
      case 'libroMayor':  return <LibroMayorReport />
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
          <div key={group} style={{ marginBottom: 4, padding:'0px 10px' }}>
            <div style={{ padding: '6px 12px 2px' }}>{group}</div>
            {REPORT_NAV.filter((n) => n.group === group).map((n) => (
              <button
                key={n.key}
                className={`nav-item${active === n.key ? ' active' : ''}`}
                style={{ height: 30, padding: '0 12px', fontSize: 12, width:'100%', justifyContent:'flex-start' }}
                onClick={() => navigate(`/reportes/${n.key}`)}
                aria-current={active === n.key ? 'page' : undefined}
              >
                <BarChart3 size={13} aria-hidden="true" />
                <span>{n.label}</span>
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
