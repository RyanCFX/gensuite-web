import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Invoice,
  CobrarFacturaDto,
  CobroResumen,
  PaginatedResponse,
  PaginationParams,
  PendienteCobroItem,
  CompletarCobroResult,
} from './types'

export interface ListPendientesParams extends PaginationParams {}

export async function listPendientes(params?: ListPendientesParams) {
  const res = await client.get<PaginatedResponse<Invoice>>(ENDPOINTS.caja.pendientes, { params })
  return unwrapPaginated(res)
}

export async function cobrarFactura(id: string, data: CobrarFacturaDto) {
  const res = await client.post<{ success: true; data: CobroResumen }>(ENDPOINTS.caja.cobrar(id), data)
  return unwrap(res)
}

export interface ListPorCobrarParams extends PaginationParams {}

export async function listPorCobrar(params?: ListPorCobrarParams) {
  const res = await client.get<PaginatedResponse<PendienteCobroItem>>(ENDPOINTS.caja.porCobrar, { params })
  return unwrapPaginated(res)
}

export async function completarCobro(id: string, data: CobrarFacturaDto) {
  const res = await client.post<{ success: true; data: CompletarCobroResult }>(ENDPOINTS.caja.completarCobro(id), data)
  return unwrap(res)
}

export async function descartarFactura(id: string) {
  const res = await client.delete<{ success: true; data: { message: string } }>(ENDPOINTS.caja.descartar(id))
  return unwrap(res)
}
