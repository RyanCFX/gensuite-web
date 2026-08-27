import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type { Caja, CreateCajaDto, UpdateCajaDto } from './types'

export async function listCajas() {
  const res = await client.get<{ success: true; data: Caja[] }>(ENDPOINTS.cajas.list)
  return unwrap(res)
}

export async function createCaja(data: CreateCajaDto) {
  const res = await client.post<{ success: true; data: Caja }>(ENDPOINTS.cajas.list, data)
  return unwrap(res)
}

export async function updateCaja(id: string, data: UpdateCajaDto) {
  const res = await client.put<{ success: true; data: Caja }>(ENDPOINTS.cajas.byId(id), data)
  return unwrap(res)
}

export async function deleteCaja(id: string) {
  await client.delete(ENDPOINTS.cajas.byId(id))
}
