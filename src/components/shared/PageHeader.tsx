import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useEsFeatureAdicional } from '@/shared/features/can'
import { featureKeyForPath } from '@/shared/features/catalog'
import { AdicionalBadge } from './AdicionalBadge'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  overline?: string
  action?: ReactNode
  /**
   * Acceso adicional (docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md §4.1): etiqueta
   * "Adicional" junto al título. `undefined` = autodetectar por la ruta actual (el feature de
   * la ruta figura en `featuresAdicionales`); pasar `false` para suprimirlo o `true` para
   * forzarlo en pantallas sin mapeo de feature.
   */
  adicional?: boolean
}

export function PageHeader({ title, description, overline, action, adicional }: PageHeaderProps) {
  const { pathname } = useLocation()
  const featureKey = featureKeyForPath(pathname)
  const esAdicionalPorRuta = useEsFeatureAdicional(featureKey)
  const mostrarAdicional = adicional ?? esAdicionalPorRuta
  return (
    <div className="page-header">
      <div>
        {overline && <p className="overline">{overline}</p>}
        <h1 className="page-title">
          {title}
          {mostrarAdicional && <AdicionalBadge />}
        </h1>
        {description && <p className="page-sub">{description as ReactNode}</p>}
      </div>
      {action && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>{action}</div>}
    </div>
  )
}
