import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { CostCenter, CreateCostCenterDto, UpdateCostCenterDto, PaginatedResponse, PaginationParams } from './types'

export interface ListCentrosCostoParams extends PaginationParams {
  isGroup?: boolean
  includeDisabled?: boolean
}

export async function listCentrosCosto(params?: ListCentrosCostoParams) {
  const res = await client.get<PaginatedResponse<CostCenter>>(ENDPOINTS.centrosCosto.list, { params })
  return unwrapPaginated(res)
}

export async function getCentrosCostoTree() {
  const res = await client.get<{ success: true; data: CostCenter[] }>(ENDPOINTS.centrosCosto.tree)
  return unwrap(res)
}

export async function getCentroCosto(id: string) {
  const res = await client.get<{ success: true; data: CostCenter }>(ENDPOINTS.centrosCosto.byId(id))
  return unwrap(res)
}

export async function createCentroCosto(data: CreateCostCenterDto) {
  const res = await client.post<{ success: true; data: CostCenter }>(ENDPOINTS.centrosCosto.list, data)
  return unwrap(res)
}

export async function updateCentroCosto(id: string, data: UpdateCostCenterDto) {
  const res = await client.put<{ success: true; data: CostCenter }>(ENDPOINTS.centrosCosto.byId(id), data)
  return unwrap(res)
}

export async function deleteCentroCosto(id: string) {
  await client.delete(ENDPOINTS.centrosCosto.byId(id))
}
