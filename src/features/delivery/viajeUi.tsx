// Piezas compartidas de Viajes/Entregas de delivery — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §4-§5.

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ApiError, DeliveryViajeEstado } from '@/shared/api/types'
import { codigoDelivery } from '@/lib/deliveryErrors'
import { VIAJE_ESTADO_LABEL, lineasFaltantes, requisitosDesdeError } from './viajeLib'

const VIAJE_ESTADO_BADGE: Record<DeliveryViajeEstado, string> = {
  borrador: 'badge-neutral',
  programado: 'badge-info',
  en_ruta: 'badge-warning',
  completado: 'badge-success',
  cancelado: 'badge-error',
}

export function ViajeEstadoBadge({ estado }: { estado?: string | null }) {
  if (!estado) return null
  const e = estado as DeliveryViajeEstado
  return <span className={`badge ${VIAJE_ESTADO_BADGE[e] ?? 'badge-neutral'}`}>{VIAJE_ESTADO_LABEL[e] ?? estado}</span>
}

export function DeliveryErrorAlert({ err, children }: { err: unknown; children?: ReactNode }) {
  const e = err as Partial<ApiError> | null
  if (!e) return null
  const faltantes = lineasFaltantes(err)
  const reqs = codigoDelivery(err) === 'DELIVERY_TRACKING_PENDIENTE' ? requisitosDesdeError(err) : []
  return (
    <div className="inline-alert inline-alert-error" style={{ margin: 0, alignItems: 'flex-start' }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>{e.message ?? 'Ocurrió un error'}</span>
        {faltantes.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {faltantes.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        {reqs.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {reqs.map((r, i) => (
              <li key={i}>{r.invoiceId} · {r.itemCode}{r.qty != null ? ` ×${r.qty}` : ''} — falta {r.tipo === 'serial' ? 'serial(es)' : 'lote(s)'}</li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </div>
  )
}

