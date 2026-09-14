// Helpers compartidos del módulo de Despachos (Delivery Note).
// docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §2.

import type { DespachoDeliveryStatus, DespachoStatus } from '@/shared/api/types'

export const DESPACHO_STATUS_BADGE: Record<DespachoStatus, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}

export const DESPACHO_STATUS_LABEL: Record<DespachoStatus, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

// Informativo únicamente — nunca usar para decidir qué botones mostrar (§2.1).
export const DELIVERY_STATUS_LABEL: Record<DespachoDeliveryStatus, string> = {
  Draft: 'Borrador',
  'To Bill': 'Por facturar',
  Completed: 'Completado',
  Return: 'Devuelto',
  'Return Issued': 'Devolución emitida',
  Cancelled: 'Cancelado',
  Closed: 'Cerrado',
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Extrae un docname de factura (SINV-...) del texto de un mensaje de error del servidor — usado
 *  para las redirecciones de flujo de §2.10 (devolución con factura ya sometida encima) y §3.4/§2.12
 *  (cancelaciones cruzadas). El backend no expone estos IDs como campo estructurado todavía. */
export function extractInvoiceId(message: string): string | null {
  const m = message.match(/[A-Z]+-SINV-[\w-]+|APER-SINV-[\w-]+/)
  return m?.[0] ?? null
}

/** Extrae un docname de despacho (...-DN-...) del texto de un mensaje de error. */
export function extractDespachoId(message: string): string | null {
  const m = message.match(/[A-Z]+-DN-[\w-]+/)
  return m?.[0] ?? null
}
