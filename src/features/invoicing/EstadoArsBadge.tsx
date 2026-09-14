import type { EstadoArs } from '@/shared/api/types'

/**
 * Badge del estado de la aprobación ARS de una factura
 * (docs/PROMPT_FARMACIA_V2_FRONTEND.md §3.8). `null` = borrador, sin badge.
 */
const ESTADO_ARS_BADGE: Record<EstadoArs, string> = {
  Pendiente: 'badge-warning',
  'En Lote': 'badge-info',
  Facturado: 'badge-success',
  Anulada: 'badge-cancelled',
}

const ESTADO_ARS_TITULO: Record<EstadoArs, string> = {
  Pendiente: 'Sometida y cobrada al paciente; la ARS todavía no fue facturada',
  'En Lote': 'Vinculada a un lote de facturación abierto',
  Facturado: 'Incluida en una consolidada ya emitida a la ARS — bloque ARS inmutable',
  Anulada: 'Devolución total antes de facturar a la ARS',
}

export function EstadoArsBadge({ estado }: { estado?: EstadoArs | null }) {
  if (!estado) return null
  return (
    <span className={`badge ${ESTADO_ARS_BADGE[estado] ?? 'badge-neutral'}`} title={ESTADO_ARS_TITULO[estado]}>
      ARS: {estado}
    </span>
  )
}
