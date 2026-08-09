import { useEffect, useRef } from 'react'

/**
 * Detecta cambios sin guardar en formularios de modal que usan `useState`
 * por campo (en vez de react-hook-form, que ya trae `formState.isDirty`).
 *
 * Toma una "foto" de `values` cada vez que `active` pasa a `true` (el modal
 * se abre) y compara contra esa foto en cada render mientras siga activo.
 * `values` debe ser un objeto plano con los campos relevantes del formulario.
 */
export function useDirtyCheck<T>(values: T, active: boolean): boolean {
  const snapshotRef = useRef<T | undefined>(undefined)
  const wasActive = useRef(false)

  useEffect(() => {
    if (active) snapshotRef.current = values
    else snapshotRef.current = undefined
    wasActive.current = active
    // Solo se re-captura cuando `active` cambia (al abrir el modal), no en cada tecleo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!active || snapshotRef.current === undefined) return false
  return JSON.stringify(values) !== JSON.stringify(snapshotRef.current)
}
