import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { queryClient } from '@/shared/api/queryClient'

/**
 * Re-consulta los GETs al cambiar de pantalla — equivale a pulsar "Recargar"
 * (RecargarButton). Aplica con pestañas habilitadas (las pantallas viven en KeepAlive
 * y nunca se desmontan) y también deshabilitadas (el remount reutilizaría el caché
 * fresco del staleTime de 5min).
 *
 * Solo se re-piden las queries con observadores montados; se salta la carga inicial
 * para no pedir todo dos veces.
 */
export function RefetchOnNavigate() {
  const location = useLocation()
  const prevPathRef = useRef<string | null>(null)

  useEffect(() => {
    const fullPath = location.pathname + (location.search || '')
    if (prevPathRef.current !== null && prevPathRef.current !== fullPath) {
      void queryClient.invalidateQueries()
    }
    prevPathRef.current = fullPath
  }, [location.pathname, location.search])

  return null
}
