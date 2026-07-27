import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  DevolucionDto,
  DevolucionResult,
  DevolucionDetail,
  DevolucionListItem,
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
