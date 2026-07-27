import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  UbicacionResponseDto,
  CreateUbicacionDto,
  UpdateUbicacionDto,
  ItemUbicacionResponseDto,
  AssignItemUbicacionDto,
  UpdateItemUbicacionDto,
  PaginationParams,
  ItemPendienteUbicar,
  DistribuirUbicacionDto,
  DistribuirUbicacionResult,
  MoverUbicacionDto,
  MoverUbicacionResult,
  MovimientoUbicacion,
  PaginatedResponse,
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

// ─── Distribución de artículos sin ubicación asignada ─────────────────────────

export async function listUbicacionesPendientes(warehouse: string) {
  const res = await client.get<{ success: true; data: ItemPendienteUbicar[]; note?: string }>(
    ENDPOINTS.inventory.ubicaciones.pendientes,
    { params: { warehouse } },
  )
  return { items: res.data.data ?? [], note: res.data.note }
}

export async function distribuirUbicaciones(data: DistribuirUbicacionDto) {
  const res = await client.post<{ success: true; data: DistribuirUbicacionResult[] }>(
    ENDPOINTS.inventory.ubicaciones.distribuir,
    data,
  )
  return unwrap(res)
}

// ─── Mover stock entre ubicaciones del mismo almacén ──────────────────────────

export async function moverStockUbicacion(data: MoverUbicacionDto) {
  const res = await client.post<{ success: true; data: MoverUbicacionResult }>(
    ENDPOINTS.inventory.ubicaciones.mover,
    data,
  )
  return unwrap(res)
}

// ─── Historial de movimientos (distribuciones + movimientos internos) ─────────

export interface ListMovimientosUbicacionParams extends PaginationParams {
  itemCode?: string
  ubicacion?: string
  warehouse?: string
  fromDate?: string
  toDate?: string
}

export async function listMovimientosUbicaciones(params?: ListMovimientosUbicacionParams) {
  const res = await client.get<PaginatedResponse<MovimientoUbicacion>>(
    ENDPOINTS.inventory.ubicaciones.movimientos,
    { params },
  )
  return unwrapPaginated(res)
}
