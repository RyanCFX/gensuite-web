import type { PedidoEstadoFlujo } from '@/shared/api/types'

// docs/tasks/79_confirmacion_despacho_pedido.md §6 — `estadoFlujo` es la fuente única de verdad
// de "en qué está" el pedido; esta tabla es la única traducción a texto/color que debe usarse en
// toda la UI de Pedidos (lista y detalle), para no duplicar el mapeo en varios lugares.
export const ESTADO_FLUJO_LABEL: Record<PedidoEstadoFlujo, string> = {
  borrador: 'Borrador',
  pendiente_confirmacion_despacho: 'Pendiente de confirmar despacho',
  apartado_reservado: 'Apartado reservado',
  facturando: 'Facturando',
  facturado: 'Facturado',
  despachado: 'Despachado',
  cerrado: 'Cerrado',
  sometido: 'Sometido',
  cancelado: 'Cancelado',
}

export const ESTADO_FLUJO_BADGE: Record<PedidoEstadoFlujo, string> = {
  borrador: 'badge-draft',
  pendiente_confirmacion_despacho: 'badge-warning',
  apartado_reservado: 'badge-info',
  facturando: 'badge-info',
  facturado: 'badge-submitted',
  despachado: 'badge-success',
  cerrado: 'badge-neutral',
  sometido: 'badge-submitted',
  cancelado: 'badge-cancelled',
}
