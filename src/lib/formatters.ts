import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { es } from 'date-fns/locale'

/** Fecha de hoy en `yyyy-MM-dd`, en la hora LOCAL del navegador — nunca usar
 *  `new Date().toISOString().split('T')[0]` para esto: `toISOString()` convierte a UTC, así que
 *  en cualquier zona horaria detrás de UTC (ej. RD, UTC-4) esto se adelanta un día entre la
 *  medianoche local y la medianoche UTC (ej. 8pm local del 29 ya es 30 en UTC). */
export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function formatDate(isoDate?: string | null): string {
  if (!isoDate) return '—'
  try {
    return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: es })
  } catch {
    return isoDate
  }
}

/** Fecha compacta sin año (dd/MM) — para listas angostas como Acciones Pendientes del dashboard. */
export function formatShortDate(isoDate?: string | null): string {
  if (!isoDate) return ''
  try {
    return format(parseISO(isoDate), 'dd/MM', { locale: es })
  } catch {
    return ''
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

/** Igual que `formatDOP` pero para cualquiera de las 3 monedas soportadas (DOP/USD/EUR) — ver
 *  docs/tasks/64_multimoneda_completo.md. Mantiene el estilo es-DO (agrupación/decimales)
 *  independientemente de la moneda, solo cambia el símbolo (ej. "US$1,234.56"). Un código no
 *  reconocido cae a DOP. */
export function formatMoney(amount?: number | null, currency?: string | null, opts?: { trimZeros?: boolean }): string {
  const code = currency === 'USD' || currency === 'EUR' ? currency : 'DOP'
  if (amount == null) amount = 0
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: code,
    // 'symbol' (default) da "RD$"/"US$" correctamente para DOP/USD, pero en locale es-DO
    // renderiza EUR como el texto literal "EUR" en vez de "€" — 'narrowSymbol' sí da "€", pero a
    // cambio colapsa DOP y USD al mismo "$" ambiguo. Por eso solo se usa narrowSymbol para EUR.
    currencyDisplay: code === 'EUR' ? 'narrowSymbol' : 'symbol',
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
