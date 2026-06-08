import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatDate(isoDate?: string | null): string {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: es })
  } catch {
    return isoDate
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

export function formatDOP(amount?: number | null): string {
  if (amount == null) return 'RD$0.00'
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(n?: number | null): string {
  if (n == null) return '0'
  return new Intl.NumberFormat('es-DO').format(n)
}

export function formatPct(n?: number | null): string {
  if (n == null) return '0%'
  return `${n.toFixed(1)}%`
}
