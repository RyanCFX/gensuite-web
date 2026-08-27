import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Retencion,
  RetencionListItem,
  CreateRetencionDto,
  UpdateRetencionDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

export async function listRetenciones(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<RetencionListItem>>(ENDPOINTS.retenciones.list, { params })
  return unwrapPaginated(res)
}

export async function getRetencion(id: string) {
  const res = await client.get<{ success: true; data: Retencion }>(ENDPOINTS.retenciones.byId(id))
  return unwrap(res)
}

export async function createRetencion(data: CreateRetencionDto) {
  const res = await client.post<{ success: true; data: Retencion }>(ENDPOINTS.retenciones.list, data)
  return unwrap(res)
}

export async function updateRetencion(id: string, data: UpdateRetencionDto) {
  const res = await client.put<{ success: true; data: Retencion }>(ENDPOINTS.retenciones.byId(id), data)
  return unwrap(res)
}

export async function deleteRetencion(id: string) {
  await client.delete(ENDPOINTS.retenciones.byId(id))
}
