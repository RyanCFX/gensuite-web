import type { ReactNode } from 'react'
import { usePuede } from '@/shared/permissions/can'

interface PermitidoProps {
  accion: string | string[]
  fallback?: ReactNode
  children: ReactNode
}

/** Envuelve un botón/sección: si el usuario no tiene la(s) acción(es), renderiza `fallback` (por defecto nada). */
export function Permitido({ accion, fallback = null, children }: PermitidoProps) {
  const ids = Array.isArray(accion) ? accion : [accion]
  const puede = usePuede(...ids)
  return puede ? <>{children}</> : <>{fallback}</>
}
