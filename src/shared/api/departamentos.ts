import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { Departamento, CreateDepartamentoDto, UpdateDepartamentoDto, PaginatedResponse, PaginationParams } from './types'

export interface ListDepartamentosParams extends PaginationParams {
  includeDisabled?: boolean
}

export async function listDepartamentos(params?: ListDepartamentosParams) {
  const res = await client.get<PaginatedResponse<Departamento>>(ENDPOINTS.departamentos.list, { params })
  return unwrapPaginated(res)
}

export async function getDepartamentosTree() {
  const res = await client.get<{ success: true; data: Departamento[] }>(ENDPOINTS.departamentos.tree)
  return unwrap(res)
}

export async function getDepartamento(id: string) {
  const res = await client.get<{ success: true; data: Departamento }>(ENDPOINTS.departamentos.byId(id))
  return unwrap(res)
}

export async function createDepartamento(data: CreateDepartamentoDto) {
  const res = await client.post<{ success: true; data: Departamento }>(ENDPOINTS.departamentos.list, data)
  return unwrap(res)
}

export async function updateDepartamento(id: string, data: UpdateDepartamentoDto) {
  const res = await client.put<{ success: true; data: Departamento }>(ENDPOINTS.departamentos.byId(id), data)
  return unwrap(res)
}

export async function deleteDepartamento(id: string) {
  await client.delete(ENDPOINTS.departamentos.byId(id))
}
