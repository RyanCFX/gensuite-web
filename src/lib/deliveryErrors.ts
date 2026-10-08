import type { ApiError } from '@/shared/api/types'

/**
 * Errores de delivery — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §9.
 * Formato estándar `{ code, message, details? }`: mostrar `message`, usar `code` para la lógica.
 *
 * En algunos caminos el mensaje llega como `"[DELIVERY_DIRECCION_REQUERIDA] …"` (código entre
 * corchetes desde ERPNext): `codigoDelivery` extrae el código del prefijo cuando `code` falta.
 */

/** Extrae `[CODIGO]` del inicio del mensaje (ERPNext). `undefined` si no hay. */
export function codigoEntreCorchetes(message?: string | null): string | undefined {
  if (!message) return undefined
  const m = /^\s*\[([A-Z0-9_]+)\]/.exec(message)
  return m ? m[1] : undefined
}

/** Código efectivo del error: `code` o el prefijo `[CODIGO]` del mensaje. */
export function codigoDelivery(err: unknown): string | undefined {
  const e = err as Partial<ApiError> | null | undefined
  if (typeof e?.code === 'string' && e.code) return e.code
  return codigoEntreCorchetes(typeof e?.message === 'string' ? e.message : undefined)
}

/** `true` si el error trae alguno de estos códigos (por `code` o por prefijo). */
export function esErrorDelivery(err: unknown, ...codes: string[]): boolean {
  const c = codigoDelivery(err)
  return c !== undefined && (codes as string[]).includes(c)
}

/** `details.facturas[]` del 409 `TURNO_CON_COBROS_DELIVERY_POR_CONCILIAR` (§3.4). */
export interface TurnoBloqueoDeliveryFactura {
  invoiceId: string
  customer?: string
  customerName?: string
  monto?: number
  estadoEntrega?: string
  viaje?: string
}

export function facturasBloqueoTurno(err: unknown): TurnoBloqueoDeliveryFactura[] {
  const d = (err as Partial<ApiError>)?.details as Record<string, unknown> | undefined
  const f = d?.facturas
  return Array.isArray(f) ? (f as TurnoBloqueoDeliveryFactura[]) : []
}
