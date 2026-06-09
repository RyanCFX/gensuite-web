import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { EjercicioFiscal, CreateEjercicioFiscalDto, PaginatedResponse, PaginationParams } from './types'

export interface ListEjerciciosParams extends PaginationParams {
  soloAbiertos?: boolean
}

export async function listEjerciciosFiscales(params?: ListEjerciciosParams) {
  const res = await client.get<PaginatedResponse<EjercicioFiscal>>(ENDPOINTS.ejercicioFiscal.list, { params })
  return unwrapPaginated(res)
}

export async function getEjercicioVigente(): Promise<EjercicioFiscal | null> {
  const res = await client.get<{ success: true; data: EjercicioFiscal | null }>(ENDPOINTS.ejercicioFiscal.vigente)
  return unwrap(res)
}

export async function getEjercicioFiscal(id: string) {
  const res = await client.get<{ success: true; data: EjercicioFiscal }>(ENDPOINTS.ejercicioFiscal.byId(id))
  return unwrap(res)
}

export async function createEjercicioFiscal(data: CreateEjercicioFiscalDto) {
  const res = await client.post<{ success: true; data: EjercicioFiscal }>(ENDPOINTS.ejercicioFiscal.list, data)
  return unwrap(res)
}

export async function updateEjercicioFiscal(id: string, data: Partial<CreateEjercicioFiscalDto>) {
  const res = await client.put<{ success: true; data: EjercicioFiscal }>(ENDPOINTS.ejercicioFiscal.byId(id), data)
  return unwrap(res)
}

export async function closeEjercicioFiscal(id: string) {
  const res = await client.post<{ success: true; data: EjercicioFiscal }>(ENDPOINTS.ejercicioFiscal.close(id))
  return unwrap(res)
}

export async function reopenEjercicioFiscal(id: string) {
  const res = await client.post<{ success: true; data: EjercicioFiscal }>(ENDPOINTS.ejercicioFiscal.reopen(id))
  return unwrap(res)
}
