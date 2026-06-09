import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { CierrePeriodo, CreateCierrePeriodoDto, PaginatedResponse, PaginationParams } from './types'

export interface ListCierrePeriodoParams extends PaginationParams {
  fiscalYear?: string
}

export async function listCierresPeriodo(params?: ListCierrePeriodoParams) {
  const res = await client.get<PaginatedResponse<CierrePeriodo>>(ENDPOINTS.cierrePeriodo.list, { params })
  return unwrapPaginated(res)
}

export async function getCierrePeriodo(id: string) {
  const res = await client.get<{ success: true; data: CierrePeriodo }>(ENDPOINTS.cierrePeriodo.byId(id))
  return unwrap(res)
}

export async function createCierrePeriodo(data: CreateCierrePeriodoDto): Promise<CierrePeriodo> {
  const res = await client.post<{ success: true; data: CierrePeriodo }>(ENDPOINTS.cierrePeriodo.list, data)
  return unwrap(res)
}

export async function submitCierrePeriodo(id: string): Promise<CierrePeriodo & { warning?: string }> {
  const res = await client.post<{ success: true; data: CierrePeriodo & { warning?: string } }>(ENDPOINTS.cierrePeriodo.submit(id))
  return unwrap(res)
}
