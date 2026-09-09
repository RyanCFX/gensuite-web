import { usePermissionsStore } from '@/stores/permissions.store'

/**
 * Semántica AND: `usePuede('a', 'b')` es `true` solo si el usuario tiene ambas acciones.
 * Ver docs/PROMPT_PERMISOS_FRONTEND.md §10. Alcance acotado a las acciones nuevas del vertical
 * Farmacia ARS (docs/FARMACIA_ARS_FRONTEND.md §7.1) — el resto de la app no se migró todavía.
 */
export function usePuede(...ids: string[]): boolean {
  const acciones = usePermissionsStore((s) => s.acciones)
  return ids.every((id) => {
    if (import.meta.env.DEV && !(id in acciones)) {
      // eslint-disable-next-line no-console
      console.error(`[permisos] acción desconocida: "${id}" — typo, o falta agregarla al catálogo del backend`)
    }
    return acciones[id] === true
  })
}
