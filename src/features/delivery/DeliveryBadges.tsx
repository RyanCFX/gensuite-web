import type { DeliveryEstadoCobro, DeliveryEstadoEntrega } from '@/shared/api/types'

/**
 * Insignias de entrega y cobro — §2.3 docs/tasks/PROMPT_DELIVERY_FRONTEND.md.
 * Sin bloque delivery no renderizan nada (venta común, igual que antes).
 */

const ENTREGA_BADGE: Record<DeliveryEstadoEntrega, string> = {
  pendiente: 'badge-neutral',
  asignado: 'badge-info',
  en_ruta: 'badge-info',
  entregado: 'badge-success',
  no_entregado: 'badge-error',
  retirado: 'badge-neutral',
  cancelado: 'badge-neutral',
}

const ENTREGA_LABEL: Record<DeliveryEstadoEntrega, string> = {
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_ruta: 'En ruta',
  entregado: 'Entregado',
  no_entregado: 'No entregado',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
}

const COBRO_BADGE: Record<DeliveryEstadoCobro, string> = {
  no_aplica: 'badge-neutral',
  por_conciliar: 'badge-warning',
  conciliado: 'badge-success',
  revertido: 'badge-neutral',
}

const COBRO_LABEL: Record<DeliveryEstadoCobro, string> = {
  no_aplica: 'No aplica',
  por_conciliar: 'Por conciliar',
  conciliado: 'Conciliado',
  revertido: 'Revertido',
}

export function DeliveryEntregaBadge({ estado }: { estado?: DeliveryEstadoEntrega | null }) {
  if (!estado) return null
  return (
    <span className={`badge ${ENTREGA_BADGE[estado] ?? 'badge-neutral'}`}>
      {ENTREGA_LABEL[estado] ?? estado}
    </span>
  )
}

export function DeliveryCobroBadge({ estado }: { estado?: DeliveryEstadoCobro | null }) {
  if (!estado) return null
  return (
    <span className={`badge ${COBRO_BADGE[estado] ?? 'badge-neutral'}`}>
      {COBRO_LABEL[estado] ?? estado}
    </span>
  )
}
