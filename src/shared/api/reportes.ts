import { client, BASE_URL } from './client'
import { ENDPOINTS } from './endpoints'
import { getAccessToken, getTenant } from './storage'
import type { CuadreTurnoResult, CorteCajaDiaResult } from './types'

// ─── DGII (606 / 607 / 608) ──────────────────────────────────────────────────

export interface DgiiParams {
  year?: number
  month?: number
  format?: 'json' | 'txt'
  branch?: string
  department?: string
}

export async function getReporte606(params?: DgiiParams) {
  const res = await client.get(ENDPOINTS.reportes.r606, { params })
  return res.data
}

export async function getReporte607(params?: DgiiParams) {
  const res = await client.get(ENDPOINTS.reportes.r607, { params })
  return res.data
}

export async function getReporte608(params?: DgiiParams) {
  const res = await client.get(ENDPOINTS.reportes.r608, { params })
  return res.data
}

const ENDPOINT_MAP: Record<string, string> = {
  '606': ENDPOINTS.reportes.r606,
  '607': ENDPOINTS.reportes.r607,
  '608': ENDPOINTS.reportes.r608,
}

export async function downloadReporteExcel(tipo: string, year: number, month: number, branch?: string) {
  const params = new URLSearchParams({ year: String(year), month: String(month), format: 'excel' })
  if (branch) params.set('branch', branch)

  const token = getAccessToken()
  const tenant = getTenant()

  const res = await fetch(`${BASE_URL}${ENDPOINT_MAP[tipo]}?${params}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'X-Tenant': tenant.slug } : {}),
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const err = (body as { error?: { message?: string } })?.error
    throw new Error(err?.message ?? `Error al descargar el reporte (${res.status})`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${tipo}_${year}-${String(month).padStart(2, '0')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── FINANCIEROS ─────────────────────────────────────────────────────────────

export interface FinancialParams {
  fromDate?: string
  toDate?: string
  periodicity?: 'monthly' | 'quarterly' | 'yearly'
  branch?: string
  department?: string
}

export async function getBalanceGeneral(params?: FinancialParams) {
  const res = await client.get(ENDPOINTS.reportes.balanceGeneral, { params })
  return res.data
}

export async function downloadBalanceGeneralPdf(params?: FinancialParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.balanceGeneralPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `balance-general_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function getIngresosEgresos(params?: FinancialParams) {
  const res = await client.get(ENDPOINTS.reportes.ingresosEgresos, { params })
  return res.data
}

export async function downloadIngresosEgresosPdf(params?: FinancialParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.ingresosEgresosPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `ingresos-egresos_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── VENTAS ──────────────────────────────────────────────────────────────────

export interface VentasParams {
  fromDate?: string
  toDate?: string
  groupBy?: 'day' | 'week' | 'month'
  customer?: string
  itemCode?: string
  branch?: string
  department?: string
}

export async function getReporteVentas(params?: VentasParams) {
  const res = await client.get(ENDPOINTS.reportes.ventas, { params })
  return res.data
}

export async function downloadVentasPdf(params?: VentasParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.ventasPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `ventas_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── INVENTARIO ──────────────────────────────────────────────────────────────

export interface InventarioParams {
  fromDate?: string
  toDate?: string
  warehouse?: string
  itemCode?: string
  date?: string
  branch?: string
  department?: string
}

export async function getInventarioValoracion(params?: InventarioParams) {
  const res = await client.get(ENDPOINTS.reportes.inventarioValoracion, { params })
  return res.data
}

export async function downloadInventarioValoracionPdf(params?: InventarioParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.inventarioValoracionPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `valoracion-inventario_${params?.fromDate ?? params?.date ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function getInventarioMovimientos(params?: InventarioParams) {
  const res = await client.get(ENDPOINTS.reportes.inventarioMovimientos, { params })
  return res.data
}

export async function downloadInventarioMovimientosPdf(params?: InventarioParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.inventarioMovimientosPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `movimientos-inventario_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── CXC / CAJA ──────────────────────────────────────────────────────────────

export interface CxcAgingParams {
  /** Filtra el reporte a un solo cliente. Omitir trae todos. */
  customer?: string
  /** "party" (default, reporte nativo agrupado por cliente) | "invoice" (una fila por factura). */
  groupBy?: 'party' | 'invoice'
}

export async function getCxcAging(params?: CxcAgingParams) {
  const res = await client.get(ENDPOINTS.reportes.cxcAging, { params })
  return res.data
}

export async function downloadCxcAgingPdf(params?: CxcAgingParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.cxcAgingPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = 'aging-cxc.pdf'
  a.click()
  URL.revokeObjectURL(url)
}

export interface CxpAgingParams {
  /** Filtra el reporte a un solo proveedor. Omitir trae todos. */
  supplier?: string
  /** "party" (default, reporte nativo agrupado por proveedor) | "invoice" (una fila por factura). */
  groupBy?: 'party' | 'invoice'
}

export async function getCxpAging(params?: CxpAgingParams) {
  const res = await client.get(ENDPOINTS.reportes.cxpAging, { params })
  return res.data
}

export async function downloadCxpAgingPdf(params?: CxpAgingParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.cxpAgingPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = 'aging-cxp.pdf'
  a.click()
  URL.revokeObjectURL(url)
}

export interface CajaCuadrePorMoneda {
  moneda: string
  totalCobrado: number
  totalFacturado: number
  numCobros: number
  numFacturas: number
  diferencia: number
  porMetodoDePago: { metodo: string; total: number }[]
}

/** GET /reportes/caja/cuadre. Los campos "legacy" a nivel raíz (totalCobrado, totalFacturado,
 *  porMetodoDePago, diferencia) son la SUMA CRUDA entre todas las monedas — solo tienen sentido
 *  si el tenant opera en una sola moneda. `porMoneda` es la fuente de verdad cuando hay más de
 *  una moneda operando en el día — nunca sumar montos de monedas distintas en el cliente. Ver
 *  docs/tasks/64_multimoneda_completo.md §6.3. */
export interface CajaCuadreResult {
  date: string
  cashier: string
  totalCobrado: number
  totalFacturado: number
  numCobros: number
  numFacturas: number
  porMetodoDePago: { metodo: string; total: number }[]
  diferencia: number
  porMoneda?: CajaCuadrePorMoneda[]
}

export async function getCajaCuadre(params?: { date?: string; branch?: string; department?: string }) {
  const res = await client.get<{ success: true; data: CajaCuadreResult }>(ENDPOINTS.reportes.cajaCuadre, { params })
  return res.data
}

export async function downloadCajaCuadrePdf(params?: { date?: string; branch?: string; department?: string }) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.cajaCuadrePdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `cuadre-caja_${params?.date ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── LIBRO DIARIO / LIBRO MAYOR ──────────────────────────────────────────────

export interface LibroDiarioParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  account?: string
  voucherNo?: string
  voucherType?: 'Sales Invoice' | 'Purchase Invoice' | 'Payment Entry' | 'Journal Entry' | 'Stock Entry'
  /** Requiere valor exacto (no substring) y va siempre acompañado de `partyType` — el reporte
   *  nativo `General Ledger` de ERPNext no filtra bien sin ambos (docs/tasks/61_migracion_libro_diario_mayor_general_ledger.md §3). */
  party?: string
  /** "Customer" | "Supplier" — valores en inglés, no traducir (van tal cual en el query param). */
  partyType?: 'Customer' | 'Supplier'
  groupBy?:
    | 'Group by Voucher'
    | 'Group by Voucher (Consolidated)'
    | 'Group by Account'
    | 'Group by Sucursal'
    | 'Group by Departamento'
}

export async function getLibroDiario(params?: LibroDiarioParams) {
  const res = await client.get(ENDPOINTS.reportes.libroDiario, { params })
  return res.data
}

export interface LibroMayorParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  account?: string
}

export async function getLibroMayor(params?: LibroMayorParams) {
  const res = await client.get(ENDPOINTS.reportes.libroMayor, { params })
  return res.data
}

// ─── POS — Cuadre por Turno ──────────────────────────────────────────────────

export interface CuadreTurnoParams {
  fromDate?: string
  toDate?: string
  cajero?: string
}

export async function getCuadreTurno(params?: CuadreTurnoParams) {
  const res = await client.get<{ success: true; data: CuadreTurnoResult; meta?: { fromDate: string; toDate: string } }>(
    ENDPOINTS.reportes.cuadreTurno,
    { params },
  )
  return res.data
}

// Separate route from the Excel export above — /pdf always returns the PDF
// regardless of any `format` query param, so it goes through the same
// axios-blob pattern as the other report PDFs, not the raw-fetch Excel one.
export async function downloadCuadreTurnoPdf(params?: CuadreTurnoParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.cuadreTurnoPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `cuadre-turno_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadCuadreTurnoExcel(params?: CuadreTurnoParams) {
  const search = new URLSearchParams({ format: 'excel' })
  if (params?.fromDate) search.set('fromDate', params.fromDate)
  if (params?.toDate) search.set('toDate', params.toDate)
  if (params?.cajero) search.set('cajero', params.cajero)

  const token = getAccessToken()
  const tenant = getTenant()

  const res = await fetch(`${BASE_URL}${ENDPOINTS.reportes.cuadreTurno}?${search}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'X-Tenant': tenant.slug } : {}),
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const err = (body as { error?: { message?: string } })?.error
    throw new Error(err?.message ?? `Error al descargar el reporte (${res.status})`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cuadre-turno_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── POS — Corte de Caja del Día ──────────────────────────────────────────────

export interface CorteCajaDiaParams {
  date: string
  cajero?: string
}

export async function getCorteCajaDia(params: CorteCajaDiaParams) {
  const res = await client.get<{ success: true; data: CorteCajaDiaResult }>(
    ENDPOINTS.reportes.corteCajaDia,
    { params },
  )
  return res.data
}

export async function downloadCorteCajaDiaPdf(params: CorteCajaDiaParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.corteCajaDiaPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `corte-caja-dia_${params.date}${params.cajero ? `_${params.cajero}` : ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── DGII — Facturación Fiscal (E31/E32 por forma de pago) ────────────────────

export interface FacturacionFiscalParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
}

export async function getFacturacionFiscal(params?: FacturacionFiscalParams) {
  const res = await client.get(ENDPOINTS.reportes.facturacionFiscal, { params })
  return res.data
}

export async function downloadFacturacionFiscalPdf(params?: FacturacionFiscalParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.facturacionFiscalPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `facturacion-fiscal_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Flujo de Efectivo (Cash Flow) ────────────────────────────────────────────
// docs/tasks/62_reportes_solicitados_y_reportes_nuevos.md §Parte 2

export interface FlujoEfectivoParams {
  fromDate?: string
  toDate?: string
  /** Nótese que este endpoint usa capitalización distinta a Balance General/Estado de
   *  Resultados (`monthly`/`quarterly`/`yearly`) — este va en PascalCase. */
  periodicity?: 'Monthly' | 'Quarterly' | 'Yearly'
  branch?: string
  department?: string
}

export async function getFlujoEfectivo(params?: FlujoEfectivoParams) {
  const res = await client.get(ENDPOINTS.reportes.flujoEfectivo, { params })
  return res.data
}

export async function downloadFlujoEfectivoPdf(params?: FlujoEfectivoParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.flujoEfectivoPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `flujo-efectivo_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Analítica de Compras (Purchase Analytics) ────────────────────────────────

export interface ComprasAnaliticaParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  supplier?: string
  itemCode?: string
}

export async function getComprasAnalitica(params?: ComprasAnaliticaParams) {
  const res = await client.get(ENDPOINTS.reportes.comprasAnalitica, { params })
  return res.data
}

export async function downloadComprasAnaliticaPdf(params?: ComprasAnaliticaParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.comprasAnaliticaPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `compras-analitica_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Registro de Compras (Purchase Register) ──────────────────────────────────

export interface ComprasRegistroParams {
  fromDate?: string
  toDate?: string
  supplier?: string
  branch?: string
  department?: string
}

export async function getComprasRegistro(params?: ComprasRegistroParams) {
  const res = await client.get(ENDPOINTS.reportes.comprasRegistro, { params })
  return res.data
}

export async function downloadComprasRegistroPdf(params?: ComprasRegistroParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.comprasRegistroPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `compras-registro_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Registro de Ventas por Artículo (Item-wise Sales Register) ─────────────

export interface VentasItemWiseParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  customer?: string
  itemCode?: string
}

export async function getVentasItemWise(params?: VentasItemWiseParams) {
  const res = await client.get(ENDPOINTS.reportes.ventasItemWise, { params })
  return res.data
}

export async function downloadVentasItemWisePdf(params?: VentasItemWiseParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.ventasItemWisePdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `ventas-item-wise_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Registro de Compras por Artículo (Item-wise Purchase Register) ─────────

export interface ComprasItemWiseParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  supplier?: string
  itemCode?: string
}

export async function getComprasItemWise(params?: ComprasItemWiseParams) {
  const res = await client.get(ENDPOINTS.reportes.comprasItemWise, { params })
  return res.data
}

export async function downloadComprasItemWisePdf(params?: ComprasItemWiseParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.comprasItemWisePdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `compras-item-wise_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Analítica de Pedidos (Sales Order Analysis) ──────────────────────────────
// Reporte de funnel: cantidad pedida vs. entregada vs. facturada (columnas pending_qty,
// billed_qty, qty_to_bill, etc.), no montos contables.

export interface PedidosAnaliticaParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  customer?: string
}

export async function getPedidosAnalitica(params?: PedidosAnaliticaParams) {
  const res = await client.get(ENDPOINTS.reportes.pedidosAnalitica, { params })
  return res.data
}

export async function downloadPedidosAnaliticaPdf(params?: PedidosAnaliticaParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.pedidosAnaliticaPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `pedidos-analitica_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Analítica de Órdenes de Compra (Purchase Order Analysis) ────────────────
// Mismo tipo de reporte de funnel que Analítica de Pedidos, pero del lado de compras.

export interface ComprasOrdenesAnaliticaParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  supplier?: string
}

export async function getComprasOrdenesAnalitica(params?: ComprasOrdenesAnaliticaParams) {
  const res = await client.get(ENDPOINTS.reportes.comprasOrdenesAnalitica, { params })
  return res.data
}

export async function downloadComprasOrdenesAnaliticaPdf(params?: ComprasOrdenesAnaliticaParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.comprasOrdenesAnaliticaPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `compras-ordenes-analitica_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Antigüedad de Inventario (Stock Ageing) ──────────────────────────────────
// Corte a una fecha, no un rango: "¿cómo está el inventario a esta fecha?".

export interface InventarioAntiguedadParams {
  /** Fecha de corte. Default: hoy. */
  date?: string
  branch?: string
  department?: string
  warehouse?: string
  itemCode?: string
}

export async function getInventarioAntiguedad(params?: InventarioAntiguedadParams) {
  const res = await client.get(ENDPOINTS.reportes.inventarioAntiguedad, { params })
  return res.data
}

export async function downloadInventarioAntiguedadPdf(params?: InventarioAntiguedadParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.inventarioAntiguedadPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `inventario-antiguedad_${params?.date ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Proyección de Inventario (Stock Projected Qty) ──────────────────────────
// Foto en vivo del stock actual/reservado/proyectado — intencionalmente sin fechas.

export interface InventarioProyeccionParams {
  branch?: string
  department?: string
  warehouse?: string
  itemCode?: string
}

export async function getInventarioProyeccion(params?: InventarioProyeccionParams) {
  const res = await client.get(ENDPOINTS.reportes.inventarioProyeccion, { params })
  return res.data
}

export async function downloadInventarioProyeccionPdf(params?: InventarioProyeccionParams) {
  const res = await client.get<Blob>(ENDPOINTS.reportes.inventarioProyeccionPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = 'inventario-proyeccion.pdf'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Reportes Solicitados (ejecución en background) ──────────────────────────
// docs/tasks/62_reportes_solicitados_y_reportes_nuevos.md §Parte 1. Hoy SOLO existe el
// endpoint /solicitar para Movimientos de Inventario — no hay "solicitar" genérico para
// ningún otro reporte todavía (ni los 9 de arriba, ni Libro Diario/Mayor, ni los existentes).

export interface SolicitudReporte {
  solicitudId: string
  reportName: string
  status: 'Queued' | 'Started' | 'Completed' | 'Error'
  queuedAt?: string
  completedAt?: string | null
  errorMessage?: string | null
}

export interface SolicitudReporteDetalle extends SolicitudReporte {
  /** Solo viene cuando `status === 'Completed'` — mismo shape `{columns, rows}` de siempre. */
  report?: { columns: { fieldname: string; label: string }[]; rows: Record<string, unknown>[]; totalRows: number }
}

/** Encola el mismo reporte de `GET /reportes/inventario/movimientos` para correr en background;
 *  responde de inmediato con el `solicitudId` a consultar después. */
export async function solicitarInventarioMovimientos(params?: InventarioParams) {
  const res = await client.post<{ success: true; data: SolicitudReporte }>(
    ENDPOINTS.reportes.inventarioMovimientosSolicitar,
    undefined,
    { params },
  )
  return res.data.data
}

export interface ListSolicitudesParams {
  /** Filtrar por reporte, ej. "Stock Ledger". */
  reportName?: string
  /** Default 20, máx 100. */
  limit?: number
  offset?: number
}

/** No trae total — para paginar, pedir una página más y ver si `data.length < limit`. */
export async function listSolicitudes(params?: ListSolicitudesParams) {
  const res = await client.get<{ success: true; data: SolicitudReporte[]; meta: { limit: number; offset: number } }>(
    ENDPOINTS.reportes.solicitudes,
    { params },
  )
  return res.data
}

export async function getSolicitud(id: string) {
  const res = await client.get<{ success: true; data: SolicitudReporteDetalle }>(
    ENDPOINTS.reportes.solicitudById(id),
  )
  return res.data.data
}

// ─── Farmacia ARS — reportes de auditoría (docs/PROMPT_FARMACIA_V2_FRONTEND.md §7) ─────────
// Prefijo real /farmacia/reportes/*, no /reportes — por eso viven bajo ENDPOINTS.farmacia.reportes,
// no ENDPOINTS.reportes. Sin PDF: el doc no documenta un endpoint de descarga para estos dos.

export interface ReporteFarmaciaLotesParams {
  aseguradora?: string
  estado?: string
  desde?: string
  hasta?: string
}

export async function getReporteFarmaciaLotes(params?: ReporteFarmaciaLotesParams) {
  const res = await client.get(ENDPOINTS.farmacia.reportes.lotes, { params })
  return res.data
}

/** Reemplaza al reporte "Despacho / Lote / NCF" de la v1 (docs/PROMPT_FARMACIA_V2_FRONTEND.md §7). */
export interface ReporteFacturasArsParams {
  aseguradora?: string
  estadoArs?: string
  /** Fecha de la factura. */
  desde?: string
  hasta?: string
  limit?: number
  offset?: number
}

export async function getReporteFacturasArs(params?: ReporteFacturasArsParams) {
  const res = await client.get(ENDPOINTS.farmacia.reportes.facturasArs, { params })
  return res.data
}

// ─── Despacho — 4 reportes nativos de ERPNext, sin PDF ────────────────────────
// docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §9. Todos devuelven la forma
// genérica { columns, rows, totalRows } que ya consume AutoTable/extractRows en ReportesPage.tsx —
// no hay columnas/DTOs custom del BFF más allá de lo que ERPNext ya define.

export interface DespachoMargenParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  groupBy?: 'day' | 'week' | 'month'
  customer?: string
  itemCode?: string
}

export async function getDespachoMargen(params?: DespachoMargenParams) {
  const res = await client.get(ENDPOINTS.reportes.despachoMargen, { params })
  return res.data
}

export interface DespachoReservasParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  warehouse?: string
  itemCode?: string
  /** Fecha de corte para valoración — default hoy. */
  date?: string
}

export async function getDespachoReservas(params?: DespachoReservasParams) {
  const res = await client.get(ENDPOINTS.reportes.despachoReservas, { params })
  return res.data
}

export interface DespachoFaltantesParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  /** Obligatorio — el reporte nativo de ERPNext no consolida "todos los almacenes". */
  warehouse: string
  itemCode?: string
  date?: string
}

export async function getDespachoFaltantes(params: DespachoFaltantesParams) {
  const res = await client.get(ENDPOINTS.reportes.despachoFaltantes, { params })
  return res.data
}

// Sin query params — GET /reportes/despacho/pendientes-compra no acepta filtros.
export async function getDespachoPendientesCompra() {
  const res = await client.get(ENDPOINTS.reportes.despachoPendientesCompra)
  return res.data
}
