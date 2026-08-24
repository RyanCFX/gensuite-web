import { client, BASE_URL } from './client'
import { ENDPOINTS } from './endpoints'
import { getToken, getTenant } from './storage'
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

  const token = getToken()
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

export async function getCajaCuadre(params?: { date?: string; branch?: string; department?: string }) {
  const res = await client.get(ENDPOINTS.reportes.cajaCuadre, { params })
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
  party?: string
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

  const token = getToken()
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
