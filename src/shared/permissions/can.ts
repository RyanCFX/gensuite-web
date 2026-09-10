import { usePermissionsStore } from '@/stores/permissions.store'
import type { AccionId } from './acciones.generated'

export type { AccionId }

/**
 * Semántica AND: `usePuede('a', 'b')` es `true` solo si el usuario tiene ambas acciones.
 * Ver docs/PROMPT_PERMISOS_FRONTEND.md §10.
 *
 * Los ids están tipados contra el catálogo generado (`acciones.generated.ts`), así que un typo
 * como `ventas.factura.sometter` no compila. En DEV, además, se registra un error ruidoso si el
 * backend no devolvió esa clave (debería traer siempre las 368 — su ausencia es un bug del BFF,
 * no un permiso denegado).
 */
export function usePuede(...ids: AccionId[]): boolean {
  const acciones = usePermissionsStore((s) => s.acciones)
  return ids.every((id) => {
    if (import.meta.env.DEV && !(id in acciones)) {
      console.error(`[permisos] acción ausente en /me/permissions: "${id}" — bug del catálogo del backend`)
    }
    return acciones[id] === true
  })
}

/** Versión no-hook para usar fuera del render (loaders de router, capa de axios). */
export function puede(acciones: Record<string, boolean>, ...ids: AccionId[]): boolean {
  return ids.every((id) => acciones[id] === true)
}
