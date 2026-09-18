// Semántica del badge de EstadoTransaccionB2B — docs/tasks/relaciones_comerciales, Fase 06 §3.
//
// NUNCA derivar el significado del estado por otra vía: usar exactamente esta tabla. Compartido
// entre TransaccionesPage (bandeja) y TransaccionDetail para que ambas pantallas nunca diverjan.
import type { BadgeVariant } from '@/shared/ui/Badge'
import type { EstadoTransaccionB2B } from '@/shared/api/types'

export const ESTADO_TRANSACCION_BADGE: Record<EstadoTransaccionB2B, { label: string; variant: BadgeVariant }> = {
  'Pendiente de entrega': { label: 'Pendiente de entrega', variant: 'info' },
  'Pendiente': { label: 'Pendiente', variant: 'warning' },
  'Requiere Mapeo': { label: 'Requiere Mapeo', variant: 'warning' },
  'Requiere Configuración': { label: 'Requiere Configuración', variant: 'warning' },
  'Aceptada': { label: 'Aceptada', variant: 'success' },
  'Editada': { label: 'Editada', variant: 'warning' },
  'Enlazada': { label: 'Enlazada', variant: 'info' },
  'Rechazada': { label: 'Rechazada', variant: 'error' },
  'Cancelada': { label: 'Cancelada', variant: 'neutral' },
  'Error': { label: 'Error', variant: 'error' },
}

/** Las 10 opciones válidas, en el orden en que se muestran en los selects de filtro. */
export const ESTADOS_TRANSACCION_B2B: EstadoTransaccionB2B[] = [
  'Pendiente de entrega',
  'Pendiente',
  'Requiere Mapeo',
  'Requiere Configuración',
  'Aceptada',
  'Editada',
  'Enlazada',
  'Rechazada',
  'Cancelada',
  'Error',
]

/** Un estado "necesita acción" cuando la bandeja/detalle deben ofrecer Aceptar/Rechazar/Enlazar. */
export function estadoNecesitaAccion(estado: EstadoTransaccionB2B): boolean {
  return estado === 'Pendiente' || estado === 'Requiere Mapeo'
}
