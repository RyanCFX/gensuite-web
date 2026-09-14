import { client } from './client'
import { ENDPOINTS } from './endpoints'

// Mismo reporte nativo `General Ledger` que Libro Diario, con `group_by: "Group by Account"` —
// shape genérico `{columns, rows}`, con filas sintéticas de Apertura/Total/Cierre por cuenta y
// una separadora entre cuentas (docs/tasks/61_migracion_libro_diario_mayor_general_ledger.md §2.2).
export interface GlReportColumn {
  fieldname: string
  label: string
}

export type GlReportRow = Record<string, unknown>

export interface LibroMayorData {
  columns: GlReportColumn[]
  rows: GlReportRow[]
  totalRows: number
}

export interface LibroMayorParams {
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
  account?: string
}

export async function getLibroMayor(params?: LibroMayorParams): Promise<LibroMayorData> {
  const res = await client.get<{ success: true; data: LibroMayorData }>(
    ENDPOINTS.reportes.libroMayor,
    { params }
  )
  return res.data.data
}

export async function downloadLibroMayorPdf(params?: LibroMayorParams): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.reportes.libroMayorPdf, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `libro-mayor_${params?.fromDate ?? ''}_${params?.toDate ?? ''}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
