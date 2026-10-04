import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

/** Espera antes de consultar al API mientras el usuario escribe (buscadores y selects remotos). */
export const REMOTE_SEARCH_DEBOUNCE_MS = 2000

/** `debounced` es el valor a consultar; `pending` es true mientras el usuario sigue escribiendo
 *  y todavía no se lanzó la consulta (para mostrar el input como "cargando"). */
export function useDebouncedValue<T>(value: T, delay: number = REMOTE_SEARCH_DEBOUNCE_MS): { debounced: T; pending: boolean } {
  const debounced = useDebounce(value, delay)
  return { debounced, pending: debounced !== value }
}
