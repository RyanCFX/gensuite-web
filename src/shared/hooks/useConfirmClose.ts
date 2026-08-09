import { useState, useCallback } from 'react'

/**
 * Envuelve el cierre de un modal de formulario para pedir confirmación cuando
 * hay cambios sin guardar. Reemplaza el `onClick` de overlay/X/Cancelar por
 * `requestClose` — si `isDirty` es true abre un `ConfirmModal` en vez de cerrar
 * directo; si no hay cambios, cierra inmediatamente igual que antes.
 */
export function useConfirmClose(isDirty: boolean, close: () => void) {
  const [confirming, setConfirming] = useState(false)

  const requestClose = useCallback(() => {
    if (isDirty) setConfirming(true)
    else close()
  }, [isDirty, close])

  const confirmDiscard = useCallback(() => {
    setConfirming(false)
    close()
  }, [close])

  const cancelDiscard = useCallback(() => setConfirming(false), [])

  return { requestClose, confirming, confirmDiscard, cancelDiscard }
}
