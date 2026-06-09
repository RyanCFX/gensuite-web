import { client, unwrap, unwrapPaginated } from './client'
import type { Cuenta, CreateCuentaDto, UpdateCuentaDto, PaginatedResponse, PaginationParams } from './types'

export interface ListCuentasParams extends PaginationParams {
  rootType?: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
  accountType?: string
  isGroup?: boolean
  includeDisabled?: boolean
}

export async function listCuentas(params?: ListCuentasParams) {
  const res = await client.get<PaginatedResponse<Cuenta>>('/cuentas', { params })
  return unwrapPaginated(res)
}

export async function getCuentasTree() {
  const res = await client.get<{ success: true; data: Cuenta[] }>('/cuentas/tree')
  return unwrap(res)
}

export async function getCuenta(id: string) {
  const res = await client.get<{ success: true; data: Cuenta }>(`/cuentas/${encodeURIComponent(id)}`)
  return unwrap(res)
}

export async function createCuenta(data: CreateCuentaDto) {
  const res = await client.post<{ success: true; data: Cuenta }>('/cuentas', data)
  return unwrap(res)
}

export async function updateCuenta(id: string, data: UpdateCuentaDto) {
  const res = await client.put<{ success: true; data: Cuenta }>(`/cuentas/${encodeURIComponent(id)}`, data)
  return unwrap(res)
}
