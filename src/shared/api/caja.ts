import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CajaPendienteItem,
  CobrarFacturaDto,
  CobrarFacturaResult,
  PaginatedResponse,
  PaginationParams,
} from './types'

// ─── Facturas pendientes de cobro ──────────────────────────────────────────────

export type ListCajaPendientesParams = PaginationParams

// GET /caja/pendientes
export async function listCajaPendientes(params?: ListCajaPendientesParams) {
  const res = await client.get<PaginatedResponse<CajaPendienteItem>>(ENDPOINTS.caja.pendientes, { params })
  return unwrapPaginated(res)
}

// POST /caja/facturas/:id/cobrar — uno o más métodos de pago; la suma puede ser menor al pendiente (cobro parcial)
export async function cobrarFactura(id: string, data: CobrarFacturaDto) {
  const res = await client.post<{ success: true; data: CobrarFacturaResult }>(ENDPOINTS.caja.cobrar(id), data)
  return unwrap(res)
}
