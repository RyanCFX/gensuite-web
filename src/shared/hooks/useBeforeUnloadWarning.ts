import { useEffect } from 'react'

/**
 * Mientras `dirty` es true, muestra el diálogo nativo del navegador al cerrar la
 * pestaña, recargar, o navegar fuera de la SPA ("¿Seguro que quieres salir? Los
 * cambios no se guardarán"). El texto exacto lo controla el navegador — `returnValue`
 * solo dispara el diálogo, los navegadores modernos ignoran su contenido.
 *
 * Complementa (no reemplaza) el modal de confirmación en-app para navegación dentro
 * de la SPA — ver `useConfirmClose`, que ya llama a este hook internamente.
 */
export function useBeforeUnloadWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
