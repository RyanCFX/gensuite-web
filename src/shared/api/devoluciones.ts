import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  DevolucionDto,
  DevolucionResult,
  DevolucionDetail,
  DevolucionListItem,
  CancelDevolucionDto,
  CancelDevolucionResult,
  EmitirNcAseguradoraDto,
  EmitirNcAseguradoraResult,
  PaginatedResponse,
  PaginationParams,
} from './types'

// POST /devoluciones — orquesta la devolución completa: nota de crédito + reembolso opcional + stock
export async function createDevolucion(data: DevolucionDto) {
  const res = await client.post<{ success: true; data: DevolucionResult }>(
    ENDPOINTS.devoluciones.create,
    data,
  )
  return unwrap(res)
}

export interface ListDevolucionesParams extends PaginationParams {
  branch?: string
  department?: string
  customer?: string
  status?: string
  createdAtFrom?: string
  createdAtTo?: string
  postingDateFrom?: string
  postingDateTo?: string
  ncf?: string
  ncfType?: string
  grandTotalMin?: number
  grandTotalMax?: number
  refundedAmountMin?: number
  refundedAmountMax?: number
}

// GET /devoluciones — listado paginado
export async function listDevoluciones(params?: ListDevolucionesParams) {
  const res = await client.get<PaginatedResponse<DevolucionListItem>>(ENDPOINTS.devoluciones.list, { params })
  return unwrapPaginated(res)
}

// GET /devoluciones/:id — detalle, incluye la factura original devuelta
export async function getDevolucion(id: string) {
  const res = await client.get<{ success: true; data: DevolucionDetail }>(ENDPOINTS.devoluciones.byId(id))
  return unwrap(res)
}

// POST /devoluciones/:id/cancelar — cancela una devolución en borrador (no la elimina).
// Mismo patrón que cancelInvoice (Facturación). El backend valida estado y permisos.
export async function cancelDevolucion(id: string, data: CancelDevolucionDto) {
  const res = await client.post<{ success: true; data: CancelDevolucionResult }>(
    ENDPOINTS.devoluciones.cancelar(id),
    data,
  )
  return unwrap(res)
}

/**
 * POST /devoluciones/:id/emitir-nc-aseguradora — reintento idempotente del paso ARS cuando el
 * `POST /devoluciones` devolvió 500 tras haber emitido ya la NC del paciente. Emite la NC a la
 * ARS si no existe, o devuelve la existente. NUNCA reintentar el POST /devoluciones en ese caso:
 * duplicaría la nota de crédito del paciente (§5.4).
 */
export async function emitirNcAseguradora(id: string, data?: EmitirNcAseguradoraDto) {
  const res = await client.post<{ success: true; data: EmitirNcAseguradoraResult }>(
    ENDPOINTS.devoluciones.emitirNcAseguradora(id),
    data,
  )
  return unwrap(res)
}
