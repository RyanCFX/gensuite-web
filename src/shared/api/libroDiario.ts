import { client } from './client'
import { ENDPOINTS } from './endpoints'

// Reporte nativo `General Ledger` de ERPNext — shape genérico `{columns, rows}`, no camelCase
// propio (docs/tasks/61_migracion_libro_diario_mayor_general_ledger.md §2.1). Cada fila trae
// los campos que el backend haya incluido en `columns` (snake_case, ej. `posting_date`,
// `voucher_no`, `debit`); tratarla como bolsa genérica en vez de tipar cada fieldname.
export interface GlReportColumn {
  fieldname: string
  label: string
}

export type GlReportRow = Record<string, unknown>

export interface LibroDiarioData {
  columns: GlReportColumn[]
  rows: GlReportRow[]
  totalRows: number
}

export interface LibroDiarioResponse {
  success: true
  data: LibroDiarioData
}

export interface LibroDiarioParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  account?: string
  voucherNo?: string
  voucherType?: string
  /** Requiere valor exacto (no substring) y va siempre acompañado de `partyType` — el reporte
   *  nativo no filtra bien sin ambos (docs/tasks/61_migracion_libro_diario_mayor_general_ledger.md §3). */
  party?: string
  /** "Customer" | "Supplier" — valores en inglés, no traducir. */
  partyType?: 'Customer' | 'Supplier'
  groupBy?:
    | 'Group by Voucher'
    | 'Group by Voucher (Consolidated)'
    | 'Group by Account'
    | 'Group by Sucursal'
    | 'Group by Departamento'
}

export async function getLibroDiario(params?: LibroDiarioParams): Promise<LibroDiarioData> {
  const res = await client.get<LibroDiarioResponse>(ENDPOINTS.reportes.libroDiario, { params })
  return res.data.data
}

export async function downloadLibroDiarioPdf(params?: LibroDiarioParams): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.reportes.libroDiarioPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `libro-diario_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
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
