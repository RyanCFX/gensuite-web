import type { ReactNode } from 'react'
import { useFeature, useReporteHabilitado } from '@/shared/features/can'
import type { FeatureKey } from '@/shared/features/types'

interface FeatureGateProps {
  feature: FeatureKey
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Envuelve un botón/sección embebida de un módulo gateado (§6): si el tenant no tiene el feature
 * contratado, renderiza `fallback` (por defecto nada). Para pantallas núcleo con secciones
 * internas de otro módulo (estado de cuenta en Cliente, historial en Proveedor, widgets del
 * Dashboard, secciones de Configuración).
 *
 * Análogo a `Permitido` (ese es por PERMISO del usuario; este es por PLAN del tenant) — un
 * fragmento se muestra solo si las DOS capas lo permiten.
 */
export function FeatureGate({ feature, fallback = null, children }: FeatureGateProps) {
  const tiene = useFeature(feature)
  return tiene ? <>{children}</> : <>{fallback}</>
}

interface ReporteGateProps {
  /** Clave de `REPORT_NAV` en ReportesPage (ej. 'balance', 'ventas', '606'). */
  tipo: string
  fallback?: ReactNode
  children: ReactNode
}

/** Igual que `FeatureGate` pero por `reportesHabilitados` (§4.2 / §6). */
export function ReporteGate({ tipo, fallback = null, children }: ReporteGateProps) {
  const habilitado = useReporteHabilitado(tipo)
  return habilitado ? <>{children}</> : <>{fallback}</>
}
