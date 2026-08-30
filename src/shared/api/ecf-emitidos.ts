import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  VoucherEmitido,
  EcfEmitidoDetail,
  RefreshEcfEmitidoResult,
  EcfStatusDgii,
  EcfTipoElectronico,
  EcfEnv,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListEcfEmitidosParams extends PaginationParams {
  /** Estado DGII del voucher en Aura. */
  estado?: EcfStatusDgii
  /** RNC/Cédula del comprador (contraparte). */
  rnc?: string
  /** e-NCF exacto (13 chars). El BFF lo filtra sobre la página ya traída. */
  ncf?: string
  typeId?: EcfTipoElectronico
  env?: EcfEnv
  /** yyyy-MM-dd */
  from?: string
  /** yyyy-MM-dd */
  to?: string
  /** Incluir comprobantes archivados. */
  archived?: boolean
  /** Solo si el tenant tiene más de un Client de Aura; normalmente se omite. */
  company?: string
}

// GET /ecf/emitidos — bandeja paginada de e-CF que emitimos (origin: ISSUED).
export async function listEcfEmitidos(params?: ListEcfEmitidosParams) {
  const res = await client.get<PaginatedResponse<VoucherEmitido>>(ENDPOINTS.ecfEmitidos.list, { params })
  return unwrapPaginated(res)
}

// GET /ecf/emitidos/:voucherId — detalle: agrega `items[]` (líneas) y `flujo`.
export async function getEcfEmitido(voucherId: string) {
  const res = await client.get<{ success: true; data: EcfEmitidoDetail }>(ENDPOINTS.ecfEmitidos.byId(voucherId))
  return unwrap(res)
}

// POST /ecf/emitidos/:voucherId/refresh — fuerza consulta de estado en la DGII.
// Devuelve el voucher actualizado + `statusPrevio` + `cambio` (boolean).
export async function refreshEcfEmitido(voucherId: string) {
  const res = await client.post<{ success: true; data: RefreshEcfEmitidoResult }>(
    ENDPOINTS.ecfEmitidos.refresh(voucherId),
  )
  return unwrap(res)
}
