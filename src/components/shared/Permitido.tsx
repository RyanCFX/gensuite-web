import type { ReactNode } from 'react'
import { usePuede, type AccionId } from '@/shared/permissions/can'

interface PermitidoProps {
  accion: AccionId | AccionId[]
  fallback?: ReactNode
  children: ReactNode
}

/** Envuelve un botón/sección: si el usuario no tiene la(s) acción(es), renderiza `fallback` (por defecto nada). */
export function Permitido({ accion, fallback = null, children }: PermitidoProps) {
  const ids = Array.isArray(accion) ? accion : [accion]
  const puede = usePuede(...ids)
  return puede ? <>{children}</> : <>{fallback}</>
}
