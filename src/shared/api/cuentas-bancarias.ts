import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  BancoCatalogo,
  CreateBancoDto,
  UpdateBancoDto,
  CuentaBancaria,
  CreateCuentaBancariaDto,
  UpdateCuentaBancariaDto,
  CuentaBancariaBalance,
  PaginatedResponse,
  PaginationParams,
} from './types'

// ─── Bancos (catálogo propio, CRUD) ─────────────────────────────────────────

export async function listBancosCatalogo() {
  const res = await client.get<{ success: true; data: BancoCatalogo[] }>(ENDPOINTS.cuentasBancarias.bancos.list)
  return unwrap(res)
}

export async function createBancoCatalogo(data: CreateBancoDto) {
  const res = await client.post<{ success: true; data: BancoCatalogo }>(ENDPOINTS.cuentasBancarias.bancos.list, data)
  return unwrap(res)
}

export async function updateBancoCatalogo(id: string, data: UpdateBancoDto) {
  const res = await client.put<{ success: true; data: BancoCatalogo }>(ENDPOINTS.cuentasBancarias.bancos.byId(id), data)
  return unwrap(res)
}

// ─── Cuentas Bancarias ──────────────────────────────────────────────────────

export interface ListCuentasBancariasParams extends PaginationParams {
  estado?: 'Activa' | 'Inactiva' | 'Cerrada'
}

export async function listCuentasBancarias(params?: ListCuentasBancariasParams) {
  const res = await client.get<PaginatedResponse<CuentaBancaria>>(ENDPOINTS.cuentasBancarias.list, { params })
  return unwrapPaginated(res)
}

export async function getCuentaBancaria(id: string, withBalance = false) {
  const res = await client.get<{ success: true; data: CuentaBancaria }>(ENDPOINTS.cuentasBancarias.byId(id), {
    params: withBalance ? { withBalance: true } : undefined,
  })
  return unwrap(res)
}

export async function getCuentaBancariaBalance(id: string) {
  const res = await client.get<{ success: true; data: CuentaBancariaBalance }>(ENDPOINTS.cuentasBancarias.balance(id))
  return unwrap(res)
}

export async function createCuentaBancaria(data: CreateCuentaBancariaDto) {
  const res = await client.post<{ success: true; data: CuentaBancaria }>(ENDPOINTS.cuentasBancarias.list, data)
  return unwrap(res)
}

export async function updateCuentaBancaria(id: string, data: UpdateCuentaBancariaDto) {
  const res = await client.put<{ success: true; data: CuentaBancaria }>(ENDPOINTS.cuentasBancarias.byId(id), data)
  return unwrap(res)
}

export async function deleteCuentaBancaria(id: string) {
  await client.delete(ENDPOINTS.cuentasBancarias.byId(id))
}
