import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  UbicacionResponseDto,
  CreateUbicacionDto,
  UpdateUbicacionDto,
  ItemUbicacionResponseDto,
  AssignItemUbicacionDto,
  UpdateItemUbicacionDto,
  PaginationParams,
} from './types'

export interface ListUbicacionesParams extends PaginationParams {
  zona?: string
  warehouse?: string
  includeDisabled?: boolean
}

export async function listUbicaciones(params?: ListUbicacionesParams) {
  const res = await client.get<{ success: true; data: UbicacionResponseDto[]; meta: { limit: number; offset: number; hasMore: boolean }; note?: string }>(
    ENDPOINTS.inventory.ubicaciones.list,
    { params },
  )
  return {
    items: res.data.data ?? [],
    meta: res.data.meta,
    note: res.data.note,
  }
}

export async function getUbicacion(id: string) {
  const res = await client.get<{ success: true; data: UbicacionResponseDto }>(ENDPOINTS.inventory.ubicaciones.byId(id))
  return unwrap(res)
}

export async function createUbicacion(data: CreateUbicacionDto) {
  const res = await client.post<{ success: true; data: UbicacionResponseDto }>(ENDPOINTS.inventory.ubicaciones.list, data)
  return unwrap(res)
}

export async function updateUbicacion(id: string, data: UpdateUbicacionDto) {
  const res = await client.put<{ success: true; data: UbicacionResponseDto }>(ENDPOINTS.inventory.ubicaciones.byId(id), data)
  return unwrap(res)
}

export async function deleteUbicacion(id: string) {
  await client.delete(ENDPOINTS.inventory.ubicaciones.byId(id))
}

// ─── Asignación Artículo ↔ Ubicación ──────────────────────────────────────────

export async function getItemUbicaciones(itemCode: string, warehouse?: string) {
  const res = await client.get<{ success: true; data: ItemUbicacionResponseDto[]; note?: string }>(
    ENDPOINTS.inventory.ubicaciones.byItem(itemCode),
    { params: warehouse ? { warehouse } : undefined },
  )
  return { items: res.data.data ?? [], note: res.data.note }
}

export async function assignItemUbicacion(data: AssignItemUbicacionDto) {
  const res = await client.post<{ success: true; data: ItemUbicacionResponseDto }>(ENDPOINTS.inventory.ubicaciones.asignar, data)
  return unwrap(res)
}

export async function updateItemUbicacionAssignment(id: string, data: UpdateItemUbicacionDto) {
  const res = await client.put<{ success: true; data: ItemUbicacionResponseDto }>(ENDPOINTS.inventory.ubicaciones.asignarById(id), data)
  return unwrap(res)
}

export async function unassignItemUbicacion(id: string) {
  await client.delete(ENDPOINTS.inventory.ubicaciones.asignarById(id))
}
