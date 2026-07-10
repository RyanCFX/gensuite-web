import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { Transferencia, CreateTransferenciaDto, PaginatedResponse, PaginationParams } from './types'

export interface ListTransferenciasParams extends PaginationParams {
  status?: 'draft' | 'in_transit' | 'completed' | 'cancelled'
  warehouse?: string
}

export async function listTransferencias(params?: ListTransferenciasParams) {
  const res = await client.get<PaginatedResponse<Transferencia>>(ENDPOINTS.transferencias.list, { params })
  return unwrapPaginated(res)
}

export async function getTransferencia(id: string) {
  const res = await client.get<{ success: true; data: Transferencia }>(ENDPOINTS.transferencias.byId(id))
  return unwrap(res)
}

export async function createTransferencia(data: CreateTransferenciaDto) {
  const res = await client.post<{ success: true; data: Transferencia }>(ENDPOINTS.transferencias.list, data)
  return unwrap(res)
}

export async function confirmarTransferencia(id: string) {
  const res = await client.post<{ success: true; data: Transferencia }>(ENDPOINTS.transferencias.confirmar(id))
  return unwrap(res)
}

export async function cancelarTransferencia(id: string) {
  const res = await client.post<{ success: true; data: Transferencia }>(ENDPOINTS.transferencias.cancelar(id))
  return unwrap(res)
}
