import { client } from './client'
import { ENDPOINTS } from './endpoints'

export interface LibroDiarioRow {
  postingDate: string
  account: string
  voucherType: string
  voucherNo: string
  debit: number
  credit: number
  balance: number
  remarks?: string | null
  party?: string | null
  partyType?: string | null
  costCenter?: string | null
}

export interface LibroDiarioData {
  fromDate: string
  toDate: string
  rows: LibroDiarioRow[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
  totalRows: number
}

export interface LibroDiarioResponse {
  success: true
  data: LibroDiarioData
  meta: { fromDate: string; toDate: string }
}

export interface LibroDiarioParams {
  fromDate?: string
  toDate?: string
  account?: string
  voucherNo?: string
  voucherType?: string
  party?: string
  groupBy?: string
}

export async function getLibroDiario(params?: LibroDiarioParams): Promise<LibroDiarioData> {
  const res = await client.get<LibroDiarioResponse>(ENDPOINTS.reportes.libroDiario, { params })
  return res.data.data
}

export interface CuentaMovimientoRow {
  postingDate: string
  voucherType: string
  voucherNo: string
  debit: number
  credit: number
  balance: number
  remarks?: string | null
  party?: string
  partyType?: string
}

export interface CuentaMovimientosData {
  account: string
  fromDate: string
  toDate: string
  rows: CuentaMovimientoRow[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
  totalRows: number
}

export interface CuentaMovimientosParams {
  fromDate?: string
  toDate?: string
  voucherNo?: string
}

export async function getCuentaMovimientos(accountId: string, params?: CuentaMovimientosParams): Promise<CuentaMovimientosData> {
  const res = await client.get<{ success: true; data: CuentaMovimientosData }>(
    ENDPOINTS.cuentasMovimientos.byId(accountId),
    { params }
  )
  return res.data.data
}
