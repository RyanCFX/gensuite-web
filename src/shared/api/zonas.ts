import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  ZonaResponseDto,
  CreateZonaDto,
  UpdateZonaDto,
  PaginationParams,
} from './types'

export interface ListZonasParams extends PaginationParams {
  warehouse?: string
  includeDisabled?: boolean
}

export async function listZonas(params?: ListZonasParams) {
  const res = await client.get<{ success: true; data: ZonaResponseDto[]; meta: { limit: number; offset: number; hasMore: boolean }; note?: string }>(
    ENDPOINTS.inventory.zonas.list,
    { params },
  )
  return {
    items: res.data.data ?? [],
    meta: res.data.meta,
    note: res.data.note,
  }
}

export async function getZona(id: string) {
  const res = await client.get<{ success: true; data: ZonaResponseDto }>(ENDPOINTS.inventory.zonas.byId(id))
  return unwrap(res)
}

export async function createZona(data: CreateZonaDto) {
  const res = await client.post<{ success: true; data: ZonaResponseDto }>(ENDPOINTS.inventory.zonas.list, data)
  return unwrap(res)
}

export async function updateZona(id: string, data: UpdateZonaDto) {
  const res = await client.put<{ success: true; data: ZonaResponseDto }>(ENDPOINTS.inventory.zonas.byId(id), data)
  return unwrap(res)
}

export async function deleteZona(id: string) {
  await client.delete(ENDPOINTS.inventory.zonas.byId(id))
}
