import { useState, Fragment } from 'react'
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
  getCorteCajaDia, downloadCorteCajaDiaPdf,
  downloadReporteExcel,
  downloadBalanceGeneralPdf, downloadIngresosEgresosPdf, downloadVentasPdf,
  downloadInventarioValoracionPdf, downloadInventarioMovimientosPdf,
  downloadCxcAgingPdf, downloadCxpAgingPdf, downloadCajaCuadrePdf,
  getReporteFarmaciaLotes, getReporteFacturasArs,
  getFacturacionFiscal, downloadFacturacionFiscalPdf,
  getFlujoEfectivo, downloadFlujoEfectivoPdf,
  getComprasAnalitica, downloadComprasAnaliticaPdf,
  getComprasRegistro, downloadComprasRegistroPdf,
  getVentasItemWise, downloadVentasItemWisePdf,
  getComprasItemWise, downloadComprasItemWisePdf,
  getPedidosAnalitica, downloadPedidosAnaliticaPdf,
  getComprasOrdenesAnalitica, downloadComprasOrdenesAnaliticaPdf,
  getInventarioAntiguedad, downloadInventarioAntiguedadPdf,
  getInventarioProyeccion, downloadInventarioProyeccionPdf,
  solicitarInventarioMovimientos, listSolicitudes, getSolicitud,
  type SolicitudReporte,
  getDespachoMargen, getDespachoReservas, getDespachoFaltantes, getDespachoPendientesCompra,
} from '@/shared/api/reportes'
import { usePermissionsStore } from '@/stores/permissions.store'
import type { LibroDiarioByDimension, CuadreTurnoRow, CorteCajaDiaTurno, AgingGroupBy } from '@/shared/api/types'
import { CorteCajaView } from '@/components/shared/CorteCajaView'
import { listSucursales } from '@/shared/api/sucursales'
import { listCustomers } from '@/shared/api/customers'
import { listAseguradoras, nombreAseguradora } from '@/shared/api/aseguradoras'
import { listSuppliers } from '@/shared/api/suppliers'
import { listUsuarios } from '@/shared/api/usuarios'
import { listItems } from '@/shared/api/catalog'
import { getFacturacionConfig, listAlmacenes } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate, formatDateTime, formatDOP, formatMoney } from '@/lib/formatters'
import { BarChart3, AlertCircle, Download, FileText, Loader2, RefreshCw } from 'lucide-react'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { GlLedgerTable } from '@/shared/ui/GlLedgerTable'

// ─── Branch / Department filter ──────────────────────────────────────────────

function useBranchOptions() {
  const { data } = useQuery({
    queryKey: ['reportes-sucursales-options'],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  return data?.items ?? []
}

/** Selectores opcionales de Sucursal / Departamento para reportes con rango de fechas. */
function BranchDepartmentFilters({
  branch,
  onBranchChange,
}: {
  branch: string
  onBranchChange: (v: string) => void
  department: string
  onDepartmentChange: (v: string) => void
}) {
  const branches = useBranchOptions()

  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = branches
    .filter((b) => !branchSearch || b.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((b) => ({ value: b.name, label: b.name }))

  return (
    <>
      <FilterField label="Sucursal" style={{ width: 200 }}>
        <SearchSelect
          value={branch}
          onChange={onBranchChange}
          options={branchOptions}
          onSearch={setBranchSearch}
          selectedLabel={branch}
          placeholder="Todas las sucursales"
        />
      </FilterField>
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
  cxcaging:    { label: 'Antiguedad de saldos CxC', description: 'Antigüedad de cuentas por cobrar' },
  caja:         { label: 'Cuadre de Caja',       description: 'Resumen de movimientos de caja' },
  libroDiario:  { label: 'Libro Diario',         description: 'Movimientos contables (GL) del período' },
  libroMayor:   { label: 'Libro Mayor',          description: 'Movimientos por cuenta con saldo inicial y final' },
  cuadreTurno:  { label: 'Cuadre por Turno',     description: 'Historial de turnos de caja cerrados y su cuadre' },
  corteCajaDia: { label: 'Corte de Caja del Día', description: 'Ventas, ingresos, egresos e importe a entregar del día, consolidado y por turno' },
  'facturacion-fiscal': { label: 'Facturación Fiscal', description: 'Comprobantes E31/E32 emitidos por forma de pago, con totales e ITBIS' },
  'flujo-efectivo': { label: 'Flujo de Efectivo', description: 'Cash Flow: entradas y salidas de efectivo del período' },
  'compras-analitica': { label: 'Analítica de Compras', description: 'Purchase Analytics: compras por proveedor y artículo' },
  'compras-registro': { label: 'Registro de Compras', description: 'Purchase Register: facturas de compra del período' },
  'ventas-item-wise': { label: 'Registro de Ventas por Artículo', description: 'Item-wise Sales Register: ventas detalladas por artículo' },
  'compras-item-wise': { label: 'Registro de Compras por Artículo', description: 'Item-wise Purchase Register: compras detalladas por artículo' },
  'pedidos-analitica': { label: 'Analítica de Pedidos', description: 'Sales Order Analysis: cantidad pedida vs. entregada vs. facturada' },
  'compras-ordenes-analitica': { label: 'Analítica de Órdenes de Compra', description: 'Purchase Order Analysis: cantidad ordenada vs. recibida vs. facturada' },
  'inventario-antiguedad': { label: 'Antigüedad de Inventario', description: 'Stock Ageing: cuánto tiempo lleva el inventario en almacén, a una fecha de corte' },
  'inventario-proyeccion': { label: 'Proyección de Inventario', description: 'Stock Projected Qty: existencia actual, reservada y proyectada en vivo' },
  solicitudes: { label: 'Reportes Solicitados', description: 'Estado de los reportes encolados para generarse en segundo plano' },
  'farmacia-lotes': { label: 'Farmacia ARS — Listado de Lotes', description: 'Lotes de facturación con sus totales y NCF asignado' },
  'farmacia-facturas-ars': { label: 'Farmacia ARS — Facturas con cobertura ARS', description: 'Qué coberturas siguen pendientes, qué lote/NCF consolidado tomó cada factura y qué se devolvió' },
  'despacho-margen': { label: 'Margen Real', description: 'Gross Profit: margen real por factura/artículo, calculado a posteriori con el costo real' },
  'despacho-reservas': { label: 'Reservas de Stock', description: 'Reserved Stock: Stock Reservation Entry vigentes — qué está comprometido ahora mismo y para quién' },
  'despacho-faltantes': { label: 'Faltantes', description: 'Item Shortage Report: artículos con proyección negativa en un almacén (requiere elegir almacén)' },
  'despacho-pendientes-compra': { label: 'Pendientes de Comprar', description: 'Pending SO Items For Purchase Request — vista nativa de solo lectura, complementa a Abastecimiento' },
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
      <table className="data-table navy-table">
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
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                Año:
                <Select value={String(year)} onValueChange={(val) => setYear(Number(val))}>
                  {[thisYear(), thisYear() - 1, thisYear() - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </Select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                Mes:
                <Select value={String(month)} onValueChange={(val) => setMonth(Number(val))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {new Date(2000, m - 1, 1).toLocaleString('es-DO', { month: 'long' })}
                    </SelectItem>
                  ))}
                </Select>
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
        </div>
      </div>
      <div className="card navy-table-card">
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

// Mismos labels de fallback que ya usan AgingPage.tsx (Cobros) y AgingProveedoresPage.tsx (Pagos)
// cuando el backend no manda `config.rangos` — para que los 3 lugares se vean consistentes.
const AGING_DEFAULT_LABELS = ['Corriente', '0–30 días', '31–60 días', '61–90 días', '+90 días']

// Tarea 42 §2 — sin esto, AutoTable infiere los headers de Object.keys() y salen como "range1",
// "range2", "totalOutstanding" en vez de las etiquetas legibles que sí usan las pantallas de
// Cobros/Pagos (que consumen `config.rangos` del backend).
function buildAgingColumns(groupBy: AgingGroupBy, partyField: 'customer' | 'supplier', partyLabel: string, rangos: string[] | undefined): ColumnDef[] {
  const labels = rangos && rangos.length === 5 ? rangos : AGING_DEFAULT_LABELS
  const nameField = partyField === 'customer' ? 'customerName' : 'supplierName'
  const partyColumns: ColumnDef[] = [
    { fieldname: partyField, label: partyLabel },
    { fieldname: nameField, label: 'Nombre' },
  ]
  const invoiceColumns: ColumnDef[] = groupBy === 'invoice'
    ? [{ fieldname: 'invoice', label: 'Factura' }, { fieldname: 'dueDate', label: 'Vencimiento' }]
    : []
  return [
    ...partyColumns,
    ...invoiceColumns,
    { fieldname: 'totalOutstanding', label: 'Total' },
    { fieldname: 'current', label: labels[0] },
    { fieldname: 'range1', label: labels[1] },
    { fieldname: 'range2', label: labels[2] },
    { fieldname: 'range3', label: labels[3] },
    { fieldname: 'range4', label: labels[4] },
  ]
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
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <FilterField label="Periodicidad">
                <Select value={periodicity} onValueChange={(val) => setPeriodicity(val as typeof periodicity)}>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </Select>
              </FilterField>
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
        </div>
      </div>
      <div className="card navy-table-card">
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
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <FilterField label="Agrupar por">
                <Select value={groupBy} onValueChange={(val) => setGroupBy(val as typeof groupBy)}>
                  <SelectItem value="day">Por día</SelectItem>
                  <SelectItem value="week">Por semana</SelectItem>
                  <SelectItem value="month">Por mes</SelectItem>
                </Select>
              </FilterField>
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
        </div>
      </div>
      <div className="card navy-table-card">
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
  // "Generar en segundo plano" (docs/tasks/62_reportes_solicitados_y_reportes_nuevos.md §Parte 1)
  // gatea con el MISMO permiso del reporte síncrono — no es una acción nueva — y solo existe
  // hoy para Movimientos de Inventario, no para ningún otro reporte.
  const puedeVerMovimientos = usePermissionsStore((s) => s.acciones['reportes.inventario.movimientos.ver'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-inventario', tipo, fromDate, toDate, branch, department],
    queryFn: () => fn({ fromDate, toDate, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  const isGenerating = (data as { preparedReport?: boolean })?.preparedReport

  const solicitarMutation = useMutation({
    mutationFn: () => solicitarInventarioMovimientos({ fromDate, toDate, branch: branch || undefined, department: department || undefined }),
    onSuccess: () => {
      toast.success('Reporte encolado. Puedes seguir trabajando — te avisamos cuando esté listo en Reportes Solicitados.')
    },
    onError: () => toast.error('No se pudo encolar el reporte'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
            </div>
            <div className="filter-bar-right">
              {tipo === 'movimientos' && puedeVerMovimientos && (
                <button
                  className="btn btn-secondary btn-size-sm"
                  onClick={() => solicitarMutation.mutate()}
                  disabled={solicitarMutation.isPending}
                >
                  {solicitarMutation.isPending ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} aria-hidden="true" />}
                  {' '}Generar en segundo plano
                </button>
              )}
              <DownloadPdfButton
                onDownload={() => downloadPdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined })}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
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
  const [customer, setCustomer] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [groupBy, setGroupBy] = useState<AgingGroupBy>('party')

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
  }))

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-cxc-aging', customer, groupBy],
    queryFn: () => getCxcAging({ customer: customer || undefined, groupBy }),
    retry: false,
  })

  const raw = data as { data?: Record<string, unknown>[]; config?: { rangos?: string[] } } | undefined
  const rows = raw?.data ?? []
  const columns = buildAgingColumns(groupBy, 'customer', 'Cliente', raw?.config?.rangos)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Cliente" style={{ width: 240 }}>
                <SearchSelect
                  value={customer}
                  selectedLabel={customerLabel}
                  onChange={(val, opt) => { setCustomer(val); setCustomerLabel(opt?.label ?? '') }}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={customersLoading}
                  placeholder="Todos los clientes"
                />
              </FilterField>
              <FilterField label="Agrupar por">
                <Select value={groupBy} onValueChange={(val) => setGroupBy(val as AgingGroupBy)} clearable={false}>
                  <SelectItem value="party">Agrupar por Cliente</SelectItem>
                  <SelectItem value="invoice">Agrupar por Factura</SelectItem>
                </Select>
              </FilterField>
            </div>
            <div className="filter-bar-right">
              <DownloadPdfButton onDownload={() => downloadCxcAgingPdf({ customer: customer || undefined, groupBy })} />
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <ReportTable data={rows} columns={columns} />}
      </div>
    </div>
  )
}

function CxpAgingReport() {
  const [supplier, setSupplier] = useState('')
  const [supplierLabel, setSupplierLabel] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [groupBy, setGroupBy] = useState<AgingGroupBy>('party')

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
  })
  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
  }))

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-cxp-aging', supplier, groupBy],
    queryFn: () => getCxpAging({ supplier: supplier || undefined, groupBy }),
    retry: false,
  })

  const raw = data as { data?: Record<string, unknown>[]; config?: { rangos?: string[] } } | undefined
  const rows = raw?.data ?? []
  const columns = buildAgingColumns(groupBy, 'supplier', 'Proveedor', raw?.config?.rangos)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Proveedor" style={{ width: 240 }}>
                <SearchSelect
                  value={supplier}
                  selectedLabel={supplierLabel}
                  onChange={(val, opt) => { setSupplier(val); setSupplierLabel(opt?.label ?? '') }}
                  options={supplierOptions}
                  onSearch={setSupplierQuery}
                  loading={suppliersLoading}
                  placeholder="Todos los proveedores"
                />
              </FilterField>
              <FilterField label="Agrupar por">
                <Select value={groupBy} onValueChange={(val) => setGroupBy(val as AgingGroupBy)} clearable={false}>
                  <SelectItem value="party">Agrupar por Proveedor</SelectItem>
                  <SelectItem value="invoice">Agrupar por Factura</SelectItem>
                </Select>
              </FilterField>
            </div>
            <div className="filter-bar-right">
              <DownloadPdfButton onDownload={() => downloadCxpAgingPdf({ supplier: supplier || undefined, groupBy })} />
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <ReportTable data={rows} columns={columns} />}
      </div>
    </div>
  )
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

  const cuadre = data?.data
  // porMoneda es la fuente de verdad cuando el día operó en más de una moneda — los campos
  // "legacy" a nivel raíz son la suma cruda entre monedas y solo tienen sentido con una sola.
  // Ver docs/tasks/64_multimoneda_completo.md §6.3.
  const porMoneda = cuadre?.porMoneda ?? []
  const segmentado = porMoneda.length > 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtro */}
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Fecha">
                <DatePicker className="filter-select" clearable value={date} onChange={setDate} />
              </FilterField>
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
        </div>
      </div>

      {isLoading && <div className="card"><LoadingRows /></div>}
      {error && <ErrorBanner err={error} />}

      {!isLoading && !error && cuadre && (
        <>
          {segmentado && (
            <div className="inline-alert inline-alert-info">
              <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              Este día operó en {porMoneda.length} monedas — el desglose por moneda de abajo es la fuente de verdad.
              Los totales combinados NO deben leerse como un monto único (son la suma cruda entre monedas distintas).
            </div>
          )}

          {/* Tarjetas resumen — solo confiables cuando el día operó en una sola moneda */}
          {!segmentado && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Cobrado',    value: formatMoney(cuadre.totalCobrado, porMoneda[0]?.moneda),   sub: `${cuadre.numCobros} cobro${cuadre.numCobros !== 1 ? 's' : ''}` },
                { label: 'Total Facturado',  value: formatMoney(cuadre.totalFacturado, porMoneda[0]?.moneda), sub: `${cuadre.numFacturas} factura${cuadre.numFacturas !== 1 ? 's' : ''}` },
                { label: 'Diferencia',       value: formatMoney(cuadre.diferencia, porMoneda[0]?.moneda),     sub: cuadre.diferencia > 0 ? 'Pendiente por cobrar' : 'Cuadrado', danger: cuadre.diferencia > 0 },
                { label: 'Cajero',           value: cuadre.cashier,                  sub: formatDate(cuadre.date) },
              ].map((card) => (
                <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: card.danger ? 'var(--color-danger, #e53e3e)' : 'var(--text-primary)', wordBreak: 'break-all' }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{card.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* Desglose por moneda — fuente de verdad cuando hay más de una moneda operando en el día */}
          {porMoneda.map((fila) => (
            <div key={fila.moneda} className="card navy-table-card">
              <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Cuadre en {fila.moneda}</span>
                <span style={{ fontWeight: 700, color: fila.diferencia > 0 ? 'var(--warning-text)' : 'var(--text-primary)' }}>
                  Diferencia: {formatMoney(fila.diferencia, fila.moneda)}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, padding: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Cobrado</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{formatMoney(fila.totalCobrado, fila.moneda)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fila.numCobros} cobro{fila.numCobros !== 1 ? 's' : ''}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Facturado</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{formatMoney(fila.totalFacturado, fila.moneda)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fila.numFacturas} factura{fila.numFacturas !== 1 ? 's' : ''}</div>
                </div>
              </div>
              {fila.porMetodoDePago.length === 0
                ? (
                  <div className="empty-state">
                    <span className="empty-icon"><FileText size={20} /></span>
                    <p className="empty-title">Sin movimientos</p>
                    <p className="empty-sub">No hubo cobros en {fila.moneda} en esta fecha.</p>
                  </div>
                )
                : (
                  <div className="table-scroll">
                    <table className="data-table navy-table">
                      <thead>
                        <tr>
                          <th>Método de pago</th>
                          <th style={{ textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fila.porMetodoDePago.map((row) => (
                          <tr key={row.metodo}>
                            <td>{row.metodo}</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(row.total, fila.moneda)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          ))}

          {/* Sin porMoneda (backend viejo/sin multimoneda): desglose plano en la moneda base */}
          {porMoneda.length === 0 && (
            <div className="card navy-table-card">
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
                    <table className="data-table navy-table">
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
                            <td style={{ textAlign: 'right' }}>{formatMoney(row.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          )}
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
  const [cajeroSearch, setCajeroSearch] = useState('')
  const cajeroOptions: SearchSelectOption[] = cajeros
    .filter((u) => !cajeroSearch || u.fullName.toLowerCase().includes(cajeroSearch.toLowerCase()))
    .map((u) => ({ value: u.email, label: u.fullName }))

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-cuadre-turno', fromDate, toDate, cajero],
    queryFn: () => getCuadreTurno({ fromDate, toDate, cajero: cajero || undefined }),
    retry: false,
  })

  const rows: CuadreTurnoRow[] = data?.data?.rows ?? []
  // ERPNext garantiza que un turno nunca mezcla monedas, pero el RANGO de fechas puede incluir
  // turnos de distintos POS Profiles en monedas distintas — no sumar entre monedas en ese caso.
  // Ver docs/tasks/64_multimoneda_completo.md §6.4.
  const monedasEnRango = Array.from(new Set(rows.map((r) => r.moneda ?? 'DOP')))
  const monedaUnica = monedasEnRango.length <= 1 ? monedasEnRango[0] : undefined

  const resumen = rows.reduce(
    (acc, r) => {
      acc.totalDiferencia += r.difference
      if (r.difference !== 0) acc.turnosConDiferencia.add(r.closingEntryId)
      return acc
    },
    { totalDiferencia: 0, turnosConDiferencia: new Set<string>() },
  )
  const diferenciaPorMoneda = monedasEnRango.map((m) => ({
    moneda: m,
    total: rows.filter((r) => (r.moneda ?? 'DOP') === m).reduce((sum, r) => sum + r.difference, 0),
  }))

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
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <FilterField label="Cajero" style={{ width: 200 }}>
                <SearchSelect
                  value={cajero}
                  onChange={setCajero}
                  options={cajeroOptions}
                  onSearch={setCajeroSearch}
                  selectedLabel={cajeros.find((u) => u.email === cajero)?.fullName ?? ''}
                  placeholder="Todos los cajeros"
                />
              </FilterField>
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
        </div>
      </div>

      {!isLoading && !error && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Turnos en el período
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{new Set(rows.map((r) => r.closingEntryId)).size}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Turnos con diferencia
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{resumen.turnosConDiferencia.size}</div>
          </div>
          {monedaUnica !== undefined ? (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Diferencia total
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: diferenciaColor(resumen.totalDiferencia) ?? 'var(--text-primary)' }}>
                {formatMoney(resumen.totalDiferencia, monedaUnica)}
              </div>
            </div>
          ) : (
            diferenciaPorMoneda.map((d) => (
              <div key={d.moneda} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Diferencia total ({d.moneda})
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: diferenciaColor(d.total) ?? 'var(--text-primary)' }}>
                  {formatMoney(d.total, d.moneda)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="card navy-table-card">
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
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Cajero</th>
                  {monedaUnica === undefined && <th>Moneda</th>}
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
                    {monedaUnica === undefined && <td>{r.moneda ?? 'DOP'}</td>}
                    <td>{r.modeOfPayment}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(r.openingAmount, r.moneda)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(r.expectedAmount, r.moneda)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(r.closingAmount, r.moneda)}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: diferenciaColor(r.difference),
                      }}
                    >
                      {r.difference > 0 ? '+' : ''}
                      {formatMoney(r.difference, r.moneda)}
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

function CorteCajaDiaReport() {
  const [date, setDate] = useState(today())
  const [cajero, setCajero] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const cajeros = useCajeroOptions()
  const [cajeroSearch, setCajeroSearch] = useState('')
  const cajeroOptions: SearchSelectOption[] = cajeros
    .filter((u) => !cajeroSearch || u.fullName.toLowerCase().includes(cajeroSearch.toLowerCase()))
    .map((u) => ({ value: u.email, label: u.fullName }))

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-corte-caja-dia', date, cajero],
    queryFn: () => getCorteCajaDia({ date, cajero: cajero || undefined }),
    enabled: !!date,
    retry: false,
  })

  const result = data?.data
  const turnos: CorteCajaDiaTurno[] = result?.turnos ?? []
  // `consolidadoPorMoneda` es la fuente de verdad cuando el día tuvo turnos en distintas
  // monedas — `consolidado` es una suma cruda entre monedas, solo confiable con una sola. Ver
  // docs/tasks/64_multimoneda_completo.md §6.5.
  const consolidadoPorMoneda = result?.consolidadoPorMoneda ?? []
  const diaSegmentado = consolidadoPorMoneda.length > 1
  const monedaUnicaDelDia = turnos.length > 0 ? (new Set(turnos.map((t) => t.moneda ?? 'DOP')).size <= 1 ? (turnos[0].moneda ?? 'DOP') : undefined) : undefined

  async function handleDownloadPdf() {
    setDownloadingPdf(true)
    try {
      await downloadCorteCajaDiaPdf({ date, cajero: cajero || undefined })
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'No se pudo descargar el PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Fecha">
                <DatePicker className="filter-select" value={date} onChange={setDate} />
              </FilterField>
              <FilterField label="Cajero" style={{ width: 200 }}>
                <SearchSelect
                  value={cajero}
                  onChange={setCajero}
                  options={cajeroOptions}
                  onSearch={setCajeroSearch}
                  selectedLabel={cajeros.find((u) => u.email === cajero)?.fullName ?? ''}
                  placeholder="Todos los cajeros"
                />
              </FilterField>
            </div>
            <div className="filter-bar-right">
              <button className="btn btn-secondary btn-size-sm" onClick={handleDownloadPdf} disabled={downloadingPdf || !date}>
                {downloadingPdf ? <Loader2 size={13} className="spin" /> : <Download size={13} aria-hidden="true" />}
                {' '}Descargar PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLoading && <LoadingRows />}
      {error && <ErrorBanner err={error} />}

      {!isLoading && !error && result && (
        <>
          {turnos.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <span className="empty-icon"><FileText size={20} /></span>
                <p className="empty-title">Sin turnos cerrados</p>
                <p className="empty-sub">No hay turnos de caja cerrados para la fecha y filtros seleccionados.</p>
              </div>
            </div>
          ) : (
            <>
              {diaSegmentado && (
                <div className="inline-alert inline-alert-info">
                  <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                  Este día tuvo turnos en {consolidadoPorMoneda.length} monedas — el desglose por moneda de abajo
                  es la fuente de verdad. El consolidado combinado NO debe leerse como un monto único.
                </div>
              )}

              {diaSegmentado ? (
                consolidadoPorMoneda.map((c) => (
                  <div key={c.moneda} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Consolidado del día — {c.moneda}</h2>
                    <CorteCajaView corteCaja={c} currency={c.moneda} />
                  </div>
                ))
              ) : (
                <>
                  <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Consolidado del día</h2>
                  <CorteCajaView corteCaja={result.consolidado} currency={consolidadoPorMoneda[0]?.moneda} />
                </>
              )}

              <div className="card navy-table-card">
                <div className="card-header">
                  <span className="card-title">Turnos del día</span>
                </div>
                <div className="table-scroll">
                  <table className="data-table navy-table">
                    <thead>
                      <tr>
                        <th>Turno</th>
                        <th>Cajero</th>
                        {monedaUnicaDelDia === undefined && <th>Moneda</th>}
                        <th>Apertura</th>
                        <th>Cierre</th>
                        <th style={{ textAlign: 'right' }}>Ventas del Día</th>
                        <th style={{ textAlign: 'right' }}>Egresos</th>
                        <th style={{ textAlign: 'right' }}>Importe a Entregar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turnos.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.id}</td>
                          <td>{t.cajero}</td>
                          {monedaUnicaDelDia === undefined && <td>{t.moneda ?? 'DOP'}</td>}
                          <td style={{ fontSize: 12 }}>{formatDateTime(t.periodStartDate)}</td>
                          <td style={{ fontSize: 12 }}>{formatDateTime(t.periodEndDate)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(t.corteCaja.ventasDelDia.total, t.moneda)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(t.corteCaja.egresos.total, t.moneda)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatMoney(t.corteCaja.importeAEntregar, t.moneda)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function ByDimensionTable({ rows }: { rows: LibroDiarioByDimension[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table navy-table">
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

  // Filtro de Tercero (§3): el reporte nativo exige valor exacto + saber si es Cliente o
  // Proveedor — reemplaza el viejo input de texto libre por tipo + autocompletar.
  const [partyType, setPartyType] = useState<'' | 'Customer' | 'Supplier'>('')
  const [party, setParty] = useState('')
  const [partyLabel, setPartyLabel] = useState('')
  const [partyQuery, setPartyQuery] = useState('')

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', partyQuery],
    queryFn: () => listCustomers({ search: partyQuery || undefined, limit: 15 }),
    enabled: partyType === 'Customer',
  })
  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', partyQuery],
    queryFn: () => listSuppliers({ search: partyQuery || undefined, limit: 15 }),
    enabled: partyType === 'Supplier',
  })
  const partyOptions: SearchSelectOption[] = partyType === 'Customer'
    ? (customersData?.items ?? []).map((c) => ({ value: c.id, label: c.customerName }))
    : partyType === 'Supplier'
      ? (suppliersData?.items ?? []).map((s) => ({ value: s.id, label: s.supplierName }))
      : []

  function handlePartyTypeChange(val: string) {
    setPartyType(val === 'all' ? '' : (val as 'Customer' | 'Supplier'))
    setParty('')
    setPartyLabel('')
    setPartyQuery('')
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-libro-diario', fromDate, toDate, branch, department, groupBy, partyType, party],
    queryFn: () => getLibroDiario({
      fromDate, toDate, branch: branch || undefined, department: department || undefined, groupBy,
      partyType: partyType || undefined,
      party: partyType && party ? party : undefined,
    }),
    retry: false,
  })

  const { rows, columns } = extractRows(data)
  const byDimension = (data as { data?: { byDimension?: LibroDiarioByDimension[] } } | undefined)?.data?.byDimension
    ?? (data as { byDimension?: LibroDiarioByDimension[] } | undefined)?.byDimension

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <FilterField label="Agrupar por">
                <Select value={groupBy} onValueChange={(val) => setGroupBy(val as typeof groupBy)}>
                  <SelectItem value="Group by Voucher">Agrupar por Voucher</SelectItem>
                  <SelectItem value="Group by Voucher (Consolidated)">Agrupar por Voucher (Consolidado)</SelectItem>
                  <SelectItem value="Group by Account">Agrupar por Cuenta</SelectItem>
                  <SelectItem value="Group by Sucursal">Agrupar por Sucursal</SelectItem>
                  <SelectItem value="Group by Departamento">Agrupar por Departamento</SelectItem>
                </Select>
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Tercero">
                <Select value={partyType || 'all'} onValueChange={handlePartyTypeChange}>
                  <SelectItem value="all">Sin filtro</SelectItem>
                  <SelectItem value="Customer">Cliente</SelectItem>
                  <SelectItem value="Supplier">Proveedor</SelectItem>
                </Select>
              </FilterField>
              {partyType && (
                <FilterField label={partyType === 'Customer' ? 'Cliente' : 'Proveedor'} style={{ width: 220 }}>
                  <SearchSelect
                    value={party}
                    selectedLabel={partyLabel}
                    onChange={(val, opt) => { setParty(val); setPartyLabel(opt?.label ?? '') }}
                    options={partyOptions}
                    onSearch={setPartyQuery}
                    loading={partyType === 'Customer' ? customersLoading : suppliersLoading}
                    placeholder={partyType === 'Customer' ? 'Todos los clientes' : 'Todos los proveedores'}
                  />
                </FilterField>
              )}
            </div>
          </div>
        </div>
      </div>

      {byDimension && byDimension.length > 0 && (
        <div className="card navy-table-card">
          <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border-default)' }}>
            Resumen por {groupBy === 'Group by Sucursal' ? 'Sucursal' : 'Departamento'}
          </div>
          <ByDimensionTable rows={byDimension} />
        </div>
      )}

      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <GlLedgerTable data={rows} columns={columns} />}
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

  const { rows, columns } = extractRows(data)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <GlLedgerTable data={rows} columns={columns} />}
      </div>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────

// ─── Farmacia ARS — reportes de auditoría ────────────────────────────────────

// Nunca `/customers`: el vertical expone las ARS en su propio CRUD y el backend rechaza un
// Customer que no sea aseguradora (docs/PROMPT_FARMACIA_V2_FRONTEND.md §3.2).
function useAseguradoraFilter(aseguradoraId: string) {
  const [query, setQuery] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['aseguradoras-filtro-reportes', query],
    queryFn: () => listAseguradoras({ nombre: query || undefined, limit: 15 }),
  })
  const options: SearchSelectOption[] = (data?.items ?? []).map((a) => ({ value: a.id, label: nombreAseguradora(a) }))
  const encontrada = data?.items.find((a) => a.id === aseguradoraId)
  const label = encontrada ? nombreAseguradora(encontrada) : ''
  return { options, label, isLoading, onSearch: setQuery }
}

function FarmaciaLotesReport() {
  const [aseguradora, setAseguradora] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const aseguradoraFilter = useAseguradoraFilter(aseguradora)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-farmacia-lotes', aseguradora, estado, desde, hasta],
    queryFn: () => getReporteFarmaciaLotes({ aseguradora: aseguradora || undefined, estado: estado || undefined, desde: desde || undefined, hasta: hasta || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="ARS" style={{ width: 200 }}>
                <SearchSelect
                  value={aseguradora}
                  selectedLabel={aseguradoraFilter.label}
                  onChange={setAseguradora}
                  options={aseguradoraFilter.options}
                  onSearch={aseguradoraFilter.onSearch}
                  loading={aseguradoraFilter.isLoading}
                  placeholder="Todas las ARS"
                />
              </FilterField>
              <FilterField label="Estado">
                <Select value={estado || 'all'} onValueChange={(val) => setEstado(val === 'all' ? '' : val)}>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Abierto">Abierto</SelectItem>
                  <SelectItem value="En Revisión">En Revisión</SelectItem>
                  <SelectItem value="Facturado">Facturado</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={desde} onChange={setDesde} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={hasta} onChange={setHasta} />
              </FilterField>
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function FarmaciaFacturasArsReport() {
  const [aseguradora, setAseguradora] = useState('')
  const [estadoArs, setEstadoArs] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const aseguradoraFilter = useAseguradoraFilter(aseguradora)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-farmacia-facturas-ars', aseguradora, estadoArs, desde, hasta],
    queryFn: () => getReporteFacturasArs({
      aseguradora: aseguradora || undefined,
      estadoArs: estadoArs || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="ARS" style={{ width: 200 }}>
                <SearchSelect
                  value={aseguradora}
                  selectedLabel={aseguradoraFilter.label}
                  onChange={setAseguradora}
                  options={aseguradoraFilter.options}
                  onSearch={aseguradoraFilter.onSearch}
                  loading={aseguradoraFilter.isLoading}
                  placeholder="Todas las ARS"
                />
              </FilterField>
              <FilterField label="Estado ARS">
                <Select value={estadoArs || 'all'} onValueChange={(val) => setEstadoArs(val === 'all' ? '' : val)}>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="En Lote">En Lote</SelectItem>
                  <SelectItem value="Facturado">Facturado</SelectItem>
                  <SelectItem value="Anulada">Anulada</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={desde} onChange={setDesde} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={hasta} onChange={setHasta} />
              </FilterField>
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// ─── DGII — Facturación Fiscal ────────────────────────────────────────────────

type FacturacionFiscalFila = { formaDePago: string; total: number; itbis: number; subtotal: number }
type FacturacionFiscalTotales = { total: number; itbis: number; subtotal: number }
type FacturacionFiscalComprobante = {
  codigo: 'E31' | 'E32'
  label: string
  comprobantes: number
  filas: FacturacionFiscalFila[]
  totales: FacturacionFiscalTotales
}
type FacturacionFiscalData = {
  fromDate: string
  toDate: string
  resumenGeneral: { facturasFiscales: number; totalFacturado: number; itbis: number }
  comprobantes: FacturacionFiscalComprobante[]
  totalGeneral: FacturacionFiscalTotales
  movimientosCaja: { movimientos: number; total: number; cuentaCaja: string | null }
}

const FACTURACION_FISCAL_NOTA_PRORRATEO =
  'En ventas con pago mixto, el total por forma de pago conserva el monto realmente cobrado; ' +
  'subtotal e ITBIS se distribuyen proporcionalmente entre las formas de pago para fines de presentación.'

function FacturacionFiscalReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.dgii.facturacion-fiscal.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-facturacion-fiscal', fromDate, toDate, branch, department],
    queryFn: () => getFacturacionFiscal({ fromDate, toDate, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  const reporte = (data as { data?: FacturacionFiscalData } | undefined)?.data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadFacturacionFiscalPdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoading && <div className="card"><LoadingRows /></div>}
      {error && <ErrorBanner err={error} />}

      {!isLoading && !error && reporte && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { label: 'Facturas Fiscales', value: String(reporte.resumenGeneral.facturasFiscales) },
              { label: 'Total Facturado', value: formatDOP(reporte.resumenGeneral.totalFacturado) },
              { label: 'ITBIS', value: formatDOP(reporte.resumenGeneral.itbis) },
            ].map((card) => (
              <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{card.value}</div>
              </div>
            ))}
          </div>

          {reporte.comprobantes.map((comp) => (
            <div key={comp.codigo} className="card navy-table-card">
              <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border-default)' }}>
                {comp.codigo} — {comp.label} ({comp.comprobantes} comprobante{comp.comprobantes !== 1 ? 's' : ''})
              </div>
              {comp.filas.length === 0
                ? (
                  <div className="empty-state">
                    <span className="empty-icon"><FileText size={20} /></span>
                    <p className="empty-title">Sin comprobantes</p>
                    <p className="empty-sub">No hubo comprobantes {comp.codigo} en el período seleccionado.</p>
                  </div>
                )
                : (
                  <div className="table-scroll">
                    <table className="data-table navy-table">
                      <thead>
                        <tr>
                          <th>Forma de pago</th>
                          <th style={{ textAlign: 'right' }}>Subtotal</th>
                          <th style={{ textAlign: 'right' }}>ITBIS</th>
                          <th style={{ textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comp.filas.map((fila) => (
                          <tr key={fila.formaDePago}>
                            <td>{fila.formaDePago}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(fila.subtotal)}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(fila.itbis)}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(fila.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 600 }}>
                          <td>Total {comp.codigo}</td>
                          <td style={{ textAlign: 'right' }}>{formatDOP(comp.totales.subtotal)}</td>
                          <td style={{ textAlign: 'right' }}>{formatDOP(comp.totales.itbis)}</td>
                          <td style={{ textAlign: 'right' }}>{formatDOP(comp.totales.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
            </div>
          ))}

          <div className="card navy-table-card">
            <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>Total General</span>
              <span>{formatDOP(reporte.totalGeneral.total)} (Subtotal {formatDOP(reporte.totalGeneral.subtotal)} + ITBIS {formatDOP(reporte.totalGeneral.itbis)})</span>
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{FACTURACION_FISCAL_NOTA_PRORRATEO}</p>

          {/* Movimientos de Caja — informativo, no afecta el total fiscal */}
          <div className="card" style={{ padding: '14px 16px', border: '1px dashed var(--border-default)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Movimientos de Caja (informativo)</div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span>Movimientos: {reporte.movimientosCaja.movimientos}</span>
              <span>Total: {formatDOP(reporte.movimientosCaja.total)}</span>
              <span>Cuenta: {reporte.movimientosCaja.cuentaCaja ?? 'No configurada'}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Referencia operativa de salidas de caja del período — no forma parte del total fiscal.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── 9 reportes nativos nuevos (docs/tasks/62_reportes_solicitados_y_reportes_nuevos.md §Parte 2) ─
// Mismo patrón {columns, rows} de siempre — se renderizan con AutoTable, igual que Ventas/
// Balance/Valoración de Stock. Filtros compartidos de Proveedor/Cliente/Artículo/Almacén.

function useSupplierFilter(supplierId: string) {
  const [query, setQuery] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-filtro-reportes', query],
    queryFn: () => listSuppliers({ search: query || undefined, limit: 15 }),
  })
  const options: SearchSelectOption[] = (data?.items ?? []).map((s) => ({ value: s.id, label: s.supplierName }))
  const encontrado = data?.items.find((s) => s.id === supplierId)
  const label = encontrado ? encontrado.supplierName : ''
  return { options, label, isLoading, onSearch: setQuery }
}

function useCustomerFilter(customerId: string) {
  const [query, setQuery] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['customer-filtro-reportes', query],
    queryFn: () => listCustomers({ search: query || undefined, limit: 15 }),
  })
  const options: SearchSelectOption[] = (data?.items ?? []).map((c) => ({ value: c.id, label: c.customerName }))
  const encontrado = data?.items.find((c) => c.id === customerId)
  const label = encontrado ? encontrado.customerName : ''
  return { options, label, isLoading, onSearch: setQuery }
}

function useItemFilter(itemCode: string) {
  const [query, setQuery] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['item-filtro-reportes', query],
    queryFn: () => listItems({ search: query || undefined, limit: 15 }),
  })
  const options: SearchSelectOption[] = (data?.items ?? []).map((i) => ({ value: i.id, label: `${i.id} — ${i.itemName}` }))
  const encontrado = data?.items.find((i) => i.id === itemCode)
  const label = encontrado ? `${encontrado.id} — ${encontrado.itemName}` : ''
  return { options, label, isLoading, onSearch: setQuery }
}

function useWarehouseFilter(warehouseId: string) {
  const [query, setQuery] = useState('')
  const { data } = useQuery({
    queryKey: ['almacenes-filtro-reportes'],
    queryFn: () => listAlmacenes(),
    staleTime: 60_000,
  })
  const almacenes = data ?? []
  const options: SearchSelectOption[] = almacenes
    .filter((w) => !query || w.name.toLowerCase().includes(query.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))
  const encontrado = almacenes.find((w) => w.id === warehouseId)
  const label = encontrado ? encontrado.name : ''
  return { options, label, onSearch: setQuery }
}

// ─── Despacho — 4 reportes nativos de ERPNext (docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §9) ─
// Mismo formato {columns, rows} → AutoTable. Sin PDF (el backend no lo expone para estos 4).

function DespachoMargenReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [customer, setCustomer] = useState('')
  const [itemCode, setItemCode] = useState('')
  const customerFilter = useCustomerFilter(customer)
  const itemFilter = useItemFilter(itemCode)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-despacho-margen', fromDate, toDate, branch, department, customer, itemCode],
    queryFn: () => getDespachoMargen({ fromDate, toDate, branch: branch || undefined, department: department || undefined, customer: customer || undefined, itemCode: itemCode || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Cliente" style={{ width: 200 }}>
                <SearchSelect
                  value={customer}
                  selectedLabel={customerFilter.label}
                  onChange={setCustomer}
                  options={customerFilter.options}
                  onSearch={customerFilter.onSearch}
                  loading={customerFilter.isLoading}
                  placeholder="Todos los clientes"
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function DespachoReservasReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [itemCode, setItemCode] = useState('')
  const warehouseFilter = useWarehouseFilter(warehouse)
  const itemFilter = useItemFilter(itemCode)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-despacho-reservas', fromDate, toDate, branch, department, warehouse, itemCode],
    queryFn: () => getDespachoReservas({ fromDate, toDate, branch: branch || undefined, department: department || undefined, warehouse: warehouse || undefined, itemCode: itemCode || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Almacén" style={{ width: 200 }}>
                <SearchSelect
                  value={warehouse}
                  selectedLabel={warehouseFilter.label}
                  onChange={setWarehouse}
                  options={warehouseFilter.options}
                  onSearch={warehouseFilter.onSearch}
                  placeholder="Todos los almacenes"
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// El reporte nativo Item Shortage exige un almacén — no consolida "todos" (§9.3). Sin almacén
// elegido, no se dispara la consulta y se muestra un estado vacío pidiéndolo, en vez de un 400.
function DespachoFaltantesReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [itemCode, setItemCode] = useState('')
  const warehouseFilter = useWarehouseFilter(warehouse)
  const itemFilter = useItemFilter(itemCode)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-despacho-faltantes', fromDate, toDate, branch, department, warehouse, itemCode],
    queryFn: () => getDespachoFaltantes({ fromDate, toDate, branch: branch || undefined, department: department || undefined, warehouse, itemCode: itemCode || undefined }),
    enabled: !!warehouse,
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Almacén" style={{ width: 200 }}>
                <SearchSelect
                  value={warehouse}
                  selectedLabel={warehouseFilter.label}
                  onChange={setWarehouse}
                  options={warehouseFilter.options}
                  onSearch={warehouseFilter.onSearch}
                  placeholder="Selecciona un almacén…"
                  error={!warehouse}
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {!warehouse && (
          <div className="empty-state">
            <p className="empty-title">Elegí un almacén</p>
            <p className="empty-sub">El reporte de Faltantes no consolida todos los almacenes a la vez — seleccioná uno arriba.</p>
          </div>
        )}
        {warehouse && isLoading && <LoadingRows />}
        {warehouse && error && <ErrorBanner err={error} />}
        {warehouse && !isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// Sin filtros — GET /reportes/despacho/pendientes-compra no acepta query params.
function DespachoPendientesCompraReport() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-despacho-pendientes-compra'],
    queryFn: () => getDespachoPendientesCompra(),
    retry: false,
  })

  return (
    <div className="card navy-table-card">
      {isLoading && <LoadingRows />}
      {error && <ErrorBanner err={error} />}
      {!isLoading && !error && <AutoTable data={data} />}
    </div>
  )
}

function FlujoEfectivoReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [periodicity, setPeriodicity] = useState<'Monthly' | 'Quarterly' | 'Yearly'>('Monthly')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.contabilidad.flujo-efectivo.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-flujo-efectivo', fromDate, toDate, periodicity, branch, department],
    queryFn: () => getFlujoEfectivo({ fromDate, toDate, periodicity, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <FilterField label="Periodicidad">
                <Select value={periodicity} onValueChange={(val) => setPeriodicity(val as typeof periodicity)}>
                  <SelectItem value="Monthly">Mensual</SelectItem>
                  <SelectItem value="Quarterly">Trimestral</SelectItem>
                  <SelectItem value="Yearly">Anual</SelectItem>
                </Select>
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadFlujoEfectivoPdf({ fromDate, toDate, periodicity, branch: branch || undefined, department: department || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function ComprasAnaliticaReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [supplier, setSupplier] = useState('')
  const [itemCode, setItemCode] = useState('')
  const supplierFilter = useSupplierFilter(supplier)
  const itemFilter = useItemFilter(itemCode)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.compras.analitica.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-compras-analitica', fromDate, toDate, branch, department, supplier, itemCode],
    queryFn: () => getComprasAnalitica({ fromDate, toDate, branch: branch || undefined, department: department || undefined, supplier: supplier || undefined, itemCode: itemCode || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Proveedor" style={{ width: 200 }}>
                <SearchSelect
                  value={supplier}
                  selectedLabel={supplierFilter.label}
                  onChange={setSupplier}
                  options={supplierFilter.options}
                  onSearch={supplierFilter.onSearch}
                  loading={supplierFilter.isLoading}
                  placeholder="Todos los proveedores"
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadComprasAnaliticaPdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined, supplier: supplier || undefined, itemCode: itemCode || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function ComprasRegistroReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [supplier, setSupplier] = useState('')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const supplierFilter = useSupplierFilter(supplier)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.compras.registro.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-compras-registro', fromDate, toDate, supplier, branch, department],
    queryFn: () => getComprasRegistro({ fromDate, toDate, supplier: supplier || undefined, branch: branch || undefined, department: department || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <FilterField label="Proveedor" style={{ width: 200 }}>
                <SearchSelect
                  value={supplier}
                  selectedLabel={supplierFilter.label}
                  onChange={setSupplier}
                  options={supplierFilter.options}
                  onSearch={supplierFilter.onSearch}
                  loading={supplierFilter.isLoading}
                  placeholder="Todos los proveedores"
                />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadComprasRegistroPdf({ fromDate, toDate, supplier: supplier || undefined, branch: branch || undefined, department: department || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function VentasItemWiseReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [customer, setCustomer] = useState('')
  const [itemCode, setItemCode] = useState('')
  const customerFilter = useCustomerFilter(customer)
  const itemFilter = useItemFilter(itemCode)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.ventas.item-wise.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-ventas-item-wise', fromDate, toDate, branch, department, customer, itemCode],
    queryFn: () => getVentasItemWise({ fromDate, toDate, branch: branch || undefined, department: department || undefined, customer: customer || undefined, itemCode: itemCode || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Cliente" style={{ width: 200 }}>
                <SearchSelect
                  value={customer}
                  selectedLabel={customerFilter.label}
                  onChange={setCustomer}
                  options={customerFilter.options}
                  onSearch={customerFilter.onSearch}
                  loading={customerFilter.isLoading}
                  placeholder="Todos los clientes"
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadVentasItemWisePdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined, customer: customer || undefined, itemCode: itemCode || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function ComprasItemWiseReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [supplier, setSupplier] = useState('')
  const [itemCode, setItemCode] = useState('')
  const supplierFilter = useSupplierFilter(supplier)
  const itemFilter = useItemFilter(itemCode)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.compras.item-wise.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-compras-item-wise', fromDate, toDate, branch, department, supplier, itemCode],
    queryFn: () => getComprasItemWise({ fromDate, toDate, branch: branch || undefined, department: department || undefined, supplier: supplier || undefined, itemCode: itemCode || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Proveedor" style={{ width: 200 }}>
                <SearchSelect
                  value={supplier}
                  selectedLabel={supplierFilter.label}
                  onChange={setSupplier}
                  options={supplierFilter.options}
                  onSearch={supplierFilter.onSearch}
                  loading={supplierFilter.isLoading}
                  placeholder="Todos los proveedores"
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadComprasItemWisePdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined, supplier: supplier || undefined, itemCode: itemCode || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// Reporte de funnel (cantidad pedida vs. entregada vs. facturada) — columnas pending_qty/
// billed_qty/qty_to_bill etc. via AutoTable; una barra de progreso por línea queda como mejora
// futura opcional (no obligatoria según el doc de la tarea).
function PedidosAnaliticaReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [customer, setCustomer] = useState('')
  const customerFilter = useCustomerFilter(customer)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.pedidos.analitica.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-pedidos-analitica', fromDate, toDate, branch, department, customer],
    queryFn: () => getPedidosAnalitica({ fromDate, toDate, branch: branch || undefined, department: department || undefined, customer: customer || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Cliente" style={{ width: 200 }}>
                <SearchSelect
                  value={customer}
                  selectedLabel={customerFilter.label}
                  onChange={setCustomer}
                  options={customerFilter.options}
                  onSearch={customerFilter.onSearch}
                  loading={customerFilter.isLoading}
                  placeholder="Todos los clientes"
                />
              </FilterField>
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadPedidosAnaliticaPdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined, customer: customer || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

function ComprasOrdenesAnaliticaReport() {
  const [fromDate, setFromDate] = useState(monthStart())
  const [toDate, setToDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [supplier, setSupplier] = useState('')
  const supplierFilter = useSupplierFilter(supplier)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.compras.ordenes-analitica.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-compras-ordenes-analitica', fromDate, toDate, branch, department, supplier],
    queryFn: () => getComprasOrdenesAnalitica({ fromDate, toDate, branch: branch || undefined, department: department || undefined, supplier: supplier || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Desde">
                <DatePicker className="filter-select" clearable value={fromDate} onChange={setFromDate} />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="filter-select" clearable value={toDate} onChange={setToDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Proveedor" style={{ width: 200 }}>
                <SearchSelect
                  value={supplier}
                  selectedLabel={supplierFilter.label}
                  onChange={setSupplier}
                  options={supplierFilter.options}
                  onSearch={supplierFilter.onSearch}
                  loading={supplierFilter.isLoading}
                  placeholder="Todos los proveedores"
                />
              </FilterField>
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadComprasOrdenesAnaliticaPdf({ fromDate, toDate, branch: branch || undefined, department: department || undefined, supplier: supplier || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// Corte a una fecha ("¿cómo está el inventario a esta fecha?"), no un rango.
function InventarioAntiguedadReport() {
  const [date, setDate] = useState(today())
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [itemCode, setItemCode] = useState('')
  const warehouseFilter = useWarehouseFilter(warehouse)
  const itemFilter = useItemFilter(itemCode)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.inventario.antiguedad.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-inventario-antiguedad', date, branch, department, warehouse, itemCode],
    queryFn: () => getInventarioAntiguedad({ date, branch: branch || undefined, department: department || undefined, warehouse: warehouse || undefined, itemCode: itemCode || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Fecha de corte">
                <DatePicker className="filter-select" clearable value={date} onChange={setDate} />
              </FilterField>
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Almacén" style={{ width: 200 }}>
                <SearchSelect
                  value={warehouse}
                  selectedLabel={warehouseFilter.label}
                  onChange={setWarehouse}
                  options={warehouseFilter.options}
                  onSearch={warehouseFilter.onSearch}
                  placeholder="Todos los almacenes"
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadInventarioAntiguedadPdf({ date, branch: branch || undefined, department: department || undefined, warehouse: warehouse || undefined, itemCode: itemCode || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// Foto en vivo del stock actual/reservado/proyectado — sin fechas, es intencional.
function InventarioProyeccionReport() {
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [itemCode, setItemCode] = useState('')
  const warehouseFilter = useWarehouseFilter(warehouse)
  const itemFilter = useItemFilter(itemCode)
  const puedeImprimir = usePermissionsStore((s) => s.acciones['reportes.inventario.proyeccion.imprimir'] === true)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-inventario-proyeccion', branch, department, warehouse, itemCode],
    queryFn: () => getInventarioProyeccion({ branch: branch || undefined, department: department || undefined, warehouse: warehouse || undefined, itemCode: itemCode || undefined }),
    retry: false,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <BranchDepartmentFilters
                branch={branch} onBranchChange={setBranch}
                department={department} onDepartmentChange={setDepartment}
              />
              <FilterField label="Almacén" style={{ width: 200 }}>
                <SearchSelect
                  value={warehouse}
                  selectedLabel={warehouseFilter.label}
                  onChange={setWarehouse}
                  options={warehouseFilter.options}
                  onSearch={warehouseFilter.onSearch}
                  placeholder="Todos los almacenes"
                />
              </FilterField>
              <FilterField label="Artículo" style={{ width: 220 }}>
                <SearchSelect
                  value={itemCode}
                  selectedLabel={itemFilter.label}
                  onChange={setItemCode}
                  options={itemFilter.options}
                  onSearch={itemFilter.onSearch}
                  loading={itemFilter.isLoading}
                  placeholder="Todos los artículos"
                />
              </FilterField>
            </div>
            {puedeImprimir && (
              <div className="filter-bar-right">
                <DownloadPdfButton
                  onDownload={() => downloadInventarioProyeccionPdf({ branch: branch || undefined, department: department || undefined, warehouse: warehouse || undefined, itemCode: itemCode || undefined })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && <AutoTable data={data} />}
      </div>
    </div>
  )
}

// ─── Reportes Solicitados (ejecución en background) ──────────────────────────
// docs/tasks/62_reportes_solicitados_y_reportes_nuevos.md §Parte 1. Solo existe /solicitar
// para Movimientos de Inventario (Stock Ledger) — por eso "Reintentar" en una fila con error
// vuelve a encolar sin filtros (el listado no devuelve los filtros originales de la solicitud).

const SOLICITUD_STATUS_LABEL: Record<SolicitudReporte['status'], string> = {
  Queued: 'En cola',
  Started: 'Procesando',
  Completed: 'Listo',
  Error: 'Error',
}

function SolicitudEstadoBadge({ status }: { status: SolicitudReporte['status'] }) {
  const color = status === 'Completed' ? 'var(--success-text)' : status === 'Error' ? 'var(--error-text)' : 'var(--text-secondary)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color }}>
      {(status === 'Queued' || status === 'Started') && <Loader2 size={12} className="spin" />}
      {SOLICITUD_STATUS_LABEL[status]}
    </span>
  )
}

function SolicitudDetalle({ solicitudId }: { solicitudId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reporte-solicitud-detalle', solicitudId],
    queryFn: () => getSolicitud(solicitudId),
  })

  if (isLoading) return <LoadingRows />
  if (error) return <ErrorBanner err={error} />
  if (!data?.report) return null

  return <ReportTable data={data.report.rows} columns={data.report.columns} />
}

function SolicitudesReport() {
  const [limit, setLimit] = useState(20)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reporte-solicitudes', limit],
    queryFn: () => listSolicitudes({ limit }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? []
      return rows.some((r) => r.status === 'Queued' || r.status === 'Started') ? 8000 : false
    },
  })

  const retryMutation = useMutation({
    mutationFn: () => solicitarInventarioMovimientos({}),
    onSuccess: () => {
      toast.success('Reporte encolado de nuevo. Puedes seguir trabajando — te avisamos cuando esté listo.')
      refetch()
    },
    onError: () => toast.error('No se pudo reintentar la solicitud'),
  })

  const solicitudes = data?.data ?? []
  const hayMas = solicitudes.length >= limit

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Reportes encolados para generarse en segundo plano. Las filas en curso se
                actualizan solas.
              </p>
            </div>
            <div className="filter-bar-right">
              <button className="btn btn-secondary btn-size-sm" onClick={() => refetch()}>
                <RefreshCw size={13} aria-hidden="true" /> Refrescar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        {isLoading && <LoadingRows />}
        {error && <ErrorBanner err={error} />}
        {!isLoading && !error && solicitudes.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon"><FileText size={20} /></span>
            <p className="empty-title">Sin solicitudes</p>
            <p className="empty-sub">Todavía no encolaste ningún reporte en segundo plano.</p>
          </div>
        )}
        {!isLoading && !error && solicitudes.length > 0 && (
          <div className="table-scroll">
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <th>Reporte</th>
                  <th>Estado</th>
                  <th>Solicitado</th>
                  <th>Completado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => (
                  <Fragment key={s.solicitudId}>
                    <tr>
                      <td>{s.reportName}</td>
                      <td><SolicitudEstadoBadge status={s.status} /></td>
                      <td className="td-muted" style={{ fontSize: 12 }}>{s.queuedAt ? formatDateTime(s.queuedAt) : '—'}</td>
                      <td className="td-muted" style={{ fontSize: 12 }}>{s.completedAt ? formatDateTime(s.completedAt) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {s.status === 'Completed' && (
                          <button
                            className="btn btn-ghost btn-size-sm"
                            onClick={() => setViewingId(viewingId === s.solicitudId ? null : s.solicitudId)}
                          >
                            {viewingId === s.solicitudId ? 'Ocultar' : 'Ver'}
                          </button>
                        )}
                        {s.status === 'Error' && (
                          <button
                            className="btn btn-ghost btn-size-sm"
                            onClick={() => retryMutation.mutate()}
                            disabled={retryMutation.isPending}
                          >
                            {retryMutation.isPending ? <Loader2 size={13} className="spin" /> : 'Reintentar'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {s.status === 'Error' && s.errorMessage && (
                      <tr>
                        <td colSpan={5}>
                          <div className="inline-alert inline-alert-error" style={{ margin: '4px 0' }}>
                            <AlertCircle size={14} aria-hidden="true" /> {s.errorMessage}
                          </div>
                        </td>
                      </tr>
                    )}
                    {viewingId === s.solicitudId && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <SolicitudDetalle solicitudId={s.solicitudId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && !error && hayMas && (
        <button className="btn btn-secondary btn-size-sm" style={{ alignSelf: 'center' }} onClick={() => setLimit((l) => l + 20)}>
          Cargar más
        </button>
      )}
    </div>
  )
}

const REPORT_NAV = [
  { key: '606',         group: 'DGII',       label: '606 – Compras' },
  { key: '607',         group: 'DGII',       label: '607 – Ventas' },
  { key: '608',         group: 'DGII',       label: '608 – Anulaciones' },
  { key: 'facturacion-fiscal', group: 'DGII', label: 'Facturación Fiscal' },
  { key: 'ventas',      group: 'Ventas',     label: 'Ventas' },
  { key: 'balance',     group: 'Financiero', label: 'Balance General' },
  { key: 'pl',          group: 'Financiero', label: 'Estado de Resultados' },
  { key: 'flujo-efectivo', group: 'Financiero', label: 'Flujo de Efectivo' },
  { key: 'stock',       group: 'Inventario', label: 'Valoración de Stock' },
  { key: 'movimientos', group: 'Inventario', label: 'Movimientos de Stock' },
  { key: 'inventario-antiguedad', group: 'Inventario', label: 'Antigüedad de Inventario' },
  { key: 'inventario-proyeccion', group: 'Inventario', label: 'Proyección de Inventario' },
  { key: 'cxcaging',   group: 'CxC',        label: 'Antiguedad de saldos CxC' },
  { key: 'cxpaging',   group: 'CXP',        label: 'Antiguedad de saldos CxP' },
  { key: 'caja',        group: 'Caja',       label: 'Cuadre de Caja' },
  { key: 'cuadreTurno', group: 'Caja',       label: 'Cuadre por Turno' },
  { key: 'corteCajaDia', group: 'Caja',      label: 'Corte de Caja del Día' },
  { key: 'libroDiario', group: 'Contabilidad', label: 'Libro Diario' },
  { key: 'libroMayor',  group: 'Contabilidad', label: 'Libro Mayor' },
  { key: 'compras-analitica', group: 'Compras', label: 'Analítica de Compras' },
  { key: 'compras-registro', group: 'Compras', label: 'Registro de Compras' },
  { key: 'compras-item-wise', group: 'Compras', label: 'Registro de Compras por Artículo' },
  { key: 'compras-ordenes-analitica', group: 'Compras', label: 'Analítica de Órdenes de Compra' },
  { key: 'ventas-item-wise', group: 'Ventas', label: 'Registro de Ventas por Artículo' },
  { key: 'pedidos-analitica', group: 'Pedidos', label: 'Analítica de Pedidos' },
  { key: 'solicitudes', group: 'Sistema', label: 'Reportes Solicitados' },
  { key: 'farmacia-lotes', group: 'Farmacia ARS', label: 'Listado de Lotes' },
  { key: 'farmacia-facturas-ars', group: 'Farmacia ARS', label: 'Facturas con cobertura ARS' },
  { key: 'despacho-margen', group: 'Despacho', label: 'Margen Real' },
  { key: 'despacho-reservas', group: 'Despacho', label: 'Reservas de Stock' },
  { key: 'despacho-faltantes', group: 'Despacho', label: 'Faltantes' },
  { key: 'despacho-pendientes-compra', group: 'Despacho', label: 'Pendientes de Comprar' },
]

// Reportes que solo tienen sentido con el módulo POS habilitado (Facturacion Config.usaModuloPos).
const POS_ONLY_REPORT_KEYS = new Set(['caja', 'cuadreTurno', 'corteCajaDia'])

// Reportes gateados por una acción propia del catálogo (a diferencia del resto de reportes, que
// todavía no están migrados a `acciones` y solo se gatean por la ruta en rutas.ts) — la entrada
// del menú se oculta (no solo se deshabilita) si la acción es `false`.
const REPORT_VER_ACCIONES: Record<string, string> = {
  'farmacia-lotes': 'farmacia.reportes.lotes.listar',
  'farmacia-facturas-ars': 'farmacia.reportes.facturas-ars.listar',
  'facturacion-fiscal': 'reportes.dgii.facturacion-fiscal.ver',
  'flujo-efectivo': 'reportes.contabilidad.flujo-efectivo.ver',
  'compras-analitica': 'reportes.compras.analitica.ver',
  'compras-registro': 'reportes.compras.registro.ver',
  'compras-item-wise': 'reportes.compras.item-wise.ver',
  'compras-ordenes-analitica': 'reportes.compras.ordenes-analitica.ver',
  'ventas-item-wise': 'reportes.ventas.item-wise.ver',
  'pedidos-analitica': 'reportes.pedidos.analitica.ver',
  'inventario-antiguedad': 'reportes.inventario.antiguedad.ver',
  'inventario-proyeccion': 'reportes.inventario.proyeccion.ver',
  solicitudes: 'reportes.solicitudes.ver',
  'despacho-margen': 'reportes.despacho.margen.ver',
  'despacho-reservas': 'reportes.despacho.reservas.ver',
  'despacho-faltantes': 'reportes.despacho.faltantes.ver',
  'despacho-pendientes-compra': 'reportes.despacho.pendientes-compra.ver',
}

// Gateados en conjunto por el flag despachoHabilitado (§1.2) — igual que POS_ONLY_REPORT_KEYS.
const DESPACHO_ONLY_REPORT_KEYS = new Set([
  'despacho-margen', 'despacho-reservas', 'despacho-faltantes', 'despacho-pendientes-compra',
])

// Solo visibles con tenant.vertical === "farmacia" (docs/PROMPT_FARMACIA_V2_FRONTEND.md §1).
const FARMACIA_ONLY_REPORT_KEYS = new Set(['farmacia-lotes', 'farmacia-facturas-ars'])

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const { tipo } = useParams<{ tipo: string }>()
  const navigate = useNavigate()
  const active = tipo ?? '606'
  const meta = REPORT_META[active]

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false
  const despachoHabilitado = facturacionConfig?.despachoHabilitado ?? false
  const esFarmacia = usePermissionsStore((s) => s.vertical) === 'farmacia'
  const acciones = usePermissionsStore((s) => s.acciones)
  const puedeVerReporte = (key: string) => {
    const accion = REPORT_VER_ACCIONES[key]
    return !accion || acciones[accion] === true
  }

  const reportNav = (usaModuloPos ? REPORT_NAV : REPORT_NAV.filter((n) => !POS_ONLY_REPORT_KEYS.has(n.key)))
    .filter((n) => despachoHabilitado || !DESPACHO_ONLY_REPORT_KEYS.has(n.key))
    .filter((n) => esFarmacia || !FARMACIA_ONLY_REPORT_KEYS.has(n.key))
    .filter((n) => puedeVerReporte(n.key))
  const groups = [...new Set(reportNav.map((n) => n.group))]

  function renderReport() {
    if (!usaModuloPos && POS_ONLY_REPORT_KEYS.has(active)) {
      return <ServiceUnavailable message="Este reporte requiere el módulo POS habilitado." />
    }
    if (!despachoHabilitado && DESPACHO_ONLY_REPORT_KEYS.has(active)) {
      return <ServiceUnavailable message="Este reporte requiere el despacho habilitado (Configuración → Despacho)." />
    }
    if (REPORT_VER_ACCIONES[active] && !puedeVerReporte(active)) {
      return <ServiceUnavailable message="No tenés permiso para ver este reporte." />
    }
    if (!esFarmacia && FARMACIA_ONLY_REPORT_KEYS.has(active)) {
      return <ServiceUnavailable message="Este reporte requiere el vertical Farmacia ARS." />
    }
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
      case 'corteCajaDia': return <CorteCajaDiaReport />
      case 'libroDiario': return <LibroDiarioReport />
      case 'libroMayor':  return <LibroMayorReport />
      case 'farmacia-lotes': return <FarmaciaLotesReport />
      case 'farmacia-facturas-ars': return <FarmaciaFacturasArsReport />
      case 'despacho-margen': return <DespachoMargenReport />
      case 'despacho-reservas': return <DespachoReservasReport />
      case 'despacho-faltantes': return <DespachoFaltantesReport />
      case 'despacho-pendientes-compra': return <DespachoPendientesCompraReport />
      case 'facturacion-fiscal': return <FacturacionFiscalReport />
      case 'flujo-efectivo': return <FlujoEfectivoReport />
      case 'compras-analitica': return <ComprasAnaliticaReport />
      case 'compras-registro': return <ComprasRegistroReport />
      case 'compras-item-wise': return <ComprasItemWiseReport />
      case 'compras-ordenes-analitica': return <ComprasOrdenesAnaliticaReport />
      case 'ventas-item-wise': return <VentasItemWiseReport />
      case 'pedidos-analitica': return <PedidosAnaliticaReport />
      case 'inventario-antiguedad': return <InventarioAntiguedadReport />
      case 'inventario-proyeccion': return <InventarioProyeccionReport />
      case 'solicitudes': return <SolicitudesReport />
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
            {reportNav.filter((n) => n.group === group).map((n) => (
              <button
                key={n.key}
                className={`report-nav-item${active === n.key ? ' active' : ''}`}
                style={{ width: '100%', justifyContent: 'flex-start' }}
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
          title={<><span className="page-title-dot" />{meta?.label ?? active}</>}
          description={meta?.description}
        />
        {renderReport()}
      </div>
    </div>
  )
}
