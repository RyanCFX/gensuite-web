import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatDate(isoDate?: string | null): string {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: es })
  } catch {
    return isoDate
  }
}

/** Días calendario transcurridos entre una fecha ISO y hoy — null si no se pudo parsear. */
export function daysSince(isoDate?: string | null): number | null {
  if (!isoDate) return null
  try {
    return differenceInCalendarDays(new Date(), parseISO(isoDate))
  } catch {
    return null
  }
}

export function formatDateTime(isoDate?: string | null): string {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'dd/MM/yyyy HH:mm', { locale: es })
  } catch {
    return isoDate
  }
}

export function formatDOP(amount?: number | null, opts?: { trimZeros?: boolean }): string {
  if (amount == null) return opts?.trimZeros ? 'RD$0' : 'RD$0.00'
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: opts?.trimZeros ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Redondea a 2 decimales — usar para mostrar precios crudos sin arrastrar residuos de punto flotante. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatNumber(n?: number | null): string {
  if (n == null) return '0'
  return new Intl.NumberFormat('es-DO').format(n)
}

export function formatPct(n?: number | null): string {
  if (n == null) return '0%'
  return `${n.toFixed(1)}%`
}

export function displayId(id: string, sequence?: number | null): string {
  if (sequence && sequence > 0) return `${id}-${sequence}`
  return id
}
