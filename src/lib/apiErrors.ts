// Helpers compartidos para el contrato de errores comerciales del backend —
// docs/PROMPT_ERRORES_COMERCIALES_FRONTEND.md.
//
// Regla de oro (§2): bifurcar SIEMPRE por `error.code`, nunca por el texto de `error.message` —
// el texto ya viene comercial y en español, listo para mostrarse tal cual, pero su redacción
// puede cambiar sin aviso; el `code` es el contrato estable.
import { toast } from 'sonner'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import type { ApiError } from '@/shared/api/types'

/** `PARTY_CURRENCY_LOCKED` es el único código del catálogo (§4/§5.3) donde reintentar el MISMO
 *  payload nunca va a funcionar (el cliente/proveedor quedó atado para siempre a otra moneda,
 *  aunque esté saldado). Cualquier pantalla que ofrezca un botón de "reintentar" genérico ante un
 *  error de guardado debe chequear esto antes de mostrarlo. */
export function permiteReintentar(err: unknown): boolean {
  return !isApiErrorCode(err, ERROR_CODES.PARTY_CURRENCY_LOCKED)
}

/** Toast genérico de catch-all para cualquier error de la API — usar como default en un
 *  `onError` después de chequear los códigos que sí necesitan una acción de UI puntual
 *  (`POS_TURNO_DESACTUALIZADO`, `DOC_SUBMITTED_IMMUTABLE`, `PARTY_CURRENCY_LOCKED` — ver §5.3).
 *  El `message` del backend ya es comercial/en español (§1/§2): se muestra tal cual, sin
 *  reescribirlo. `fallback` solo aplica si por algún motivo no vino `message` (no debería pasar). */
export function mostrarErrorApi(err: unknown, fallback = 'Ocurrió un error inesperado'): void {
  const message = (err as Partial<ApiError> | undefined)?.message || fallback
  toast.error(message)
}
