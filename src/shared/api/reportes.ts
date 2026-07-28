import { client, BASE_URL } from './client'
import { ENDPOINTS } from './endpoints'
import { getToken, getTenant } from './storage'
import type { CuadreTurnoResult } from './types'

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

export async function getIngresosEgresos(params?: FinancialParams) {
  const res = await client.get(ENDPOINTS.reportes.ingresosEgresos, { params })
  return res.data
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

export async function getInventarioMovimientos(params?: InventarioParams) {
  const res = await client.get(ENDPOINTS.reportes.inventarioMovimientos, { params })
  return res.data
}

// ─── CXC / CAJA ──────────────────────────────────────────────────────────────

export async function getCxcAging() {
  const res = await client.get(ENDPOINTS.reportes.cxcAging)
  return res.data
}

export async function getCajaCuadre(params?: { date?: string; branch?: string; department?: string }) {
  const res = await client.get(ENDPOINTS.reportes.cajaCuadre, { params })
  return res.data
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
