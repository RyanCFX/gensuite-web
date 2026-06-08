import { client } from './client'
import { ENDPOINTS } from './endpoints'

// ─── DGII (606 / 607 / 608) ──────────────────────────────────────────────────

export interface DgiiParams {
  year?: number
  month?: number
  format?: 'json' | 'txt'
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

// ─── FINANCIEROS ─────────────────────────────────────────────────────────────

export interface FinancialParams {
  fromDate?: string
  toDate?: string
  periodicity?: 'monthly' | 'quarterly' | 'yearly'
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

export async function getCajaCuadre(params?: { date?: string }) {
  const res = await client.get(ENDPOINTS.reportes.cajaCuadre, { params })
  return res.data
}
