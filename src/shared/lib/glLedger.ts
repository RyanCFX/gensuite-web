import { formatDate, formatDOP } from '@/lib/formatters'

// Reporte nativo `General Ledger` de ERPNext, usado por Libro Diario y Libro Mayor
// (docs/tasks/61_migracion_libro_diario_mayor_general_ledger.md). Inserta filas de
// Apertura/Total/Cierre (Libro Mayor: una por cuenta; Libro Diario: un solo trío global) y,
// en Libro Mayor, una fila separadora 100% null entre cuentas (§2.2).

export interface GlColumn {
  fieldname: string
  label: string
}

export type GlRowKind = 'movement' | 'subtotal' | 'separator'

export function classifyGlRow(row: Record<string, unknown>): GlRowKind {
  const account = row.account
  if (account === null || account === undefined) return 'separator'
  // Comparación por `.includes` en vez de igualdad exacta: Frappe formatea estos labels con
  // comillas simples literales embebidas (ej. "'Apertura'").
  if (typeof account === 'string' && (account.includes('Apertura') || account.includes('Total') || account.includes('Cierre'))) {
    return 'subtotal'
  }
  return 'movement'
}

export function glCellValue(fieldname: string, val: unknown): string {
  const f = fieldname.toLowerCase()
  const isAmount = typeof val === 'number' && (f.includes('debit') || f.includes('credit') || f.includes('balance') || f.includes('monto') || f.includes('total'))
  if (isAmount) return formatDOP(val as number)
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return formatDate(val)
  if (val === null || val === undefined || val === '') return '—'
  return String(val)
}
