import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { Sucursal, CreateSucursalDto, UpdateSucursalDto, PaginatedResponse, PaginationParams } from './types'

export async function listSucursales(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<Sucursal>>(ENDPOINTS.sucursales.list, { params })
  return unwrapPaginated(res)
}

export async function getSucursal(id: string) {
  const res = await client.get<{ success: true; data: Sucursal }>(ENDPOINTS.sucursales.byId(id))
  return unwrap(res)
}

export async function createSucursal(data: CreateSucursalDto) {
  const res = await client.post<{ success: true; data: Sucursal }>(ENDPOINTS.sucursales.list, data)
  return unwrap(res)
}

export async function updateSucursal(id: string, data: UpdateSucursalDto) {
  const res = await client.put<{ success: true; data: Sucursal }>(ENDPOINTS.sucursales.byId(id), data)
  return unwrap(res)
}

export async function deleteSucursal(id: string) {
  await client.delete(ENDPOINTS.sucursales.byId(id))
}
