import { useLocation } from 'react-router-dom'
import { AlertTriangle, Clock } from 'lucide-react'
import { useFeaturesAdicionales } from '@/shared/features/can'
import { featureKeyForPath } from '@/shared/features/catalog'
import {
  adicionalesPorVencer,
  esVencimientoUrgente,
  textoAvisoVencimiento,
} from '@/shared/features/adicionales'

/**
 * Aviso de vencimiento del acceso adicional (docs/tasks/
 * PROMPT_FEATURES_ADICIONALES_FRONTEND.md §4.2): si `expiraEn` no es null y faltan ≤ 7 días,
 * banner discreto "Tu acceso adicional a {nombre} vence el {fecha}. Contactá a GenSuite para
 * renovarlo." Menos de 24 h: tono de urgencia. Se calcula en el cliente con `expiraEn` (ISO)
 * y la zona horaria del usuario.
 *
 * Sin `featureKey` muestra los avisos de TODOS los adicionales por vencer (uso global en
 * AppLayout); con `featureKey` solo el de ese módulo (uso en pantallas). Se limpia solo al
 * cambiar de tenant porque el store se resetea (§7).
 */
export function AvisoVencimientoAcceso({ featureKey }: { featureKey?: string | null }) {
  const adicionales = useFeaturesAdicionales()
  const { pathname } = useLocation()
  const efectiva = featureKey ?? featureKeyForPath(pathname)
  const porVencer = adicionalesPorVencer(adicionales)
  const visibles = efectiva ? porVencer.filter((a) => a.key === efectiva) : porVencer
  if (visibles.length === 0) return null
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, padding: '12px 16px 0' }} role="status" aria-live="polite">
      {visibles.map((a) => {
        const urgente = esVencimientoUrgente(a.expiraEn)
        return (
          <div
            key={a.key}
            className={urgente ? 'inline-alert inline-alert-error' : 'inline-alert inline-alert-warn'}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {urgente ? <AlertTriangle size={15} aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}
            <span style={{ fontSize: 13 }}>{textoAvisoVencimiento(a, timeZone)}</span>
          </div>
        )
      })}
    </div>
  )
}
