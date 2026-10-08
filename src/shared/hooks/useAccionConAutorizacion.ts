import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ApiError, PinOverrideDto } from '@/shared/api/types'
import {
  AUTORIZACION_INVALIDA_MSG,
  esAutorizacionInvalida,
  esPermisoRequeridoConPin,
} from '@/lib/creditoVencimiento'

/**
 * Envuelve las tres acciones de créditos (reactivar / cambiar vencimiento / dar de
 * baja, en sus dos familias de rutas) con el flujo de autorización con el código
 * de otro usuario — §6 docs/tasks/PROMPT_VENCIMIENTO_SALDOS_A_FAVOR_FRONTEND.md.
 *
 * ```
 * ejecutar(work) ──► work(undefined)
 *   ├─ ok ──► onSuccess
 *   └─ 403 PERMISO_REQUERIDO + admiteAutorizacionPin ──► abre el modal de código
 *        └─ PinModal onSubmitInline(pin, identidad) ──► work({ pin, ...identidad })
 *             ├─ ok ──► onSuccess (con `autorizadoConCodigo = true`)
 *             └─ 401 AUTORIZACION_INVALIDA ──► mensaje genérico, deja reintentar
 * ```
 *
 * Reutiliza el `PinModal` existente en modo `onSubmitInline` (verificación DENTRO
 * del mismo request, nunca un POST previo a `/auth/verify-admin-pin` — §6.2, §9).
 * El PIN nunca se guarda en estado global / localStorage / logs: vive solo en el
 * modal y se limpia al cerrarlo; cada acción pide su propio código (§6.2).
 */
export function useAccionConAutorizacion<TResult>({
  tituloAccion,
  onSuccess,
  onErrorFinal,
}: {
  /** Ej. «Reactivar crédito». Va en el título del modal de código. */
  tituloAccion: string
  onSuccess?: (result: TResult) => void
  /** Errores que NO son del flujo de código (400, 409, …). Si se omite: toast genérico. */
  onErrorFinal?: (err: ApiError) => void
} = { tituloAccion: '' }) {
  const [pinOpen, setPinOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const workRef = useRef<((pinOverride?: PinOverrideDto) => Promise<TResult>) | null>(null)

  const cerrarPin = useCallback(() => {
    setPinOpen(false)
    workRef.current = null
  }, [])

  const ejecutar = useCallback(
    async (work: (pinOverride?: PinOverrideDto) => Promise<TResult>) => {
      setPending(true)
      try {
        const result = await work(undefined)
        onSuccess?.(result)
        return result
      } catch (err) {
        if (esPermisoRequeridoConPin(err)) {
          // Sin permiso pero la ruta admite código: guardar el trabajo y pedirlo.
          workRef.current = work
          setPinOpen(true)
          return undefined
        }
        const apiErr = err as ApiError
        if (onErrorFinal) onErrorFinal(apiErr)
        else toast.error(apiErr?.message ?? 'No se pudo completar la acción')
        throw err
      } finally {
        setPending(false)
      }
    },
    [onSuccess, onErrorFinal],
  )

  /** Para `PinModal onSubmitInline`: reenvía LA MISMA petición con `pinOverride` (§6.1). */
  const reintentarConPin = useCallback(
    async (pin: string, identidad: { usuario?: string; codigoTarjeta?: string }) => {
      const work = workRef.current
      if (!work) throw new Error('Sin acción pendiente de autorización')
      try {
        const result = await work({ pin, ...identidad })
        setPinOpen(false)
        workRef.current = null
        onSuccess?.(result)
      } catch (err) {
        if (esAutorizacionInvalida(err)) {
          // Mensaje genérico a propósito (§6.3): no revela si falló el PIN, el
          // usuario, el permiso o si era el mismo usuario que pide. El modal deja
          // reintentar sin perder el formulario.
          toast.error(AUTORIZACION_INVALIDA_MSG)
          throw err
        }
        if (esPermisoRequeridoConPin(err)) {
          // No debería pasar en estas 6 rutas (siempre admiten código), pero si
          // pasa se deja reintentar en vez de cerrar el modal en silencio.
          toast.error((err as ApiError)?.message ?? 'No tiene permiso para esta acción')
          throw err
        }
        const apiErr = err as ApiError
        if (onErrorFinal) onErrorFinal(apiErr)
        else toast.error(apiErr?.message ?? 'No se pudo completar la acción')
        throw err
      }
    },
    [onSuccess, onErrorFinal],
  )

  return {
    ejecutar,
    isPending: pending,
    /** Props listas para `<PinModal open={pin.open} … />`. */
    pin: {
      open: pinOpen,
      onClose: cerrarPin,
      onSubmitInline: reintentarConPin,
      title: `Autorización requerida — ${tituloAccion}`,
      description: 'Pida a un supervisor que ingrese su código.',
    },
  }
}
