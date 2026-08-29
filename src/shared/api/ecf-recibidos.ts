import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  EcfRecibidoListItem,
  EcfRecibidoDetail,
  VincularEcfRecibidoDto,
  AprobacionComercialDto,
  CargarManualEcfDto,
  EcfStatusDgii,
  EcfTipoElectronico,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListEcfRecibidosParams extends PaginationParams {
  search?: string
  /** Estado DGII del voucher en Aura. */
  estado?: EcfStatusDgii
  /** RNC/Cédula del emisor (contraparte). */
  rnc?: string
  typeId?: EcfTipoElectronico
  /** yyyy-MM-dd */
  from?: string
  /** yyyy-MM-dd */
  to?: string
  company?: string
}

// GET /ecf/recibidos — bandeja paginada de e-CF que terceros nos emitieron.
export async function listEcfRecibidos(params?: ListEcfRecibidosParams) {
  const res = await client.get<PaginatedResponse<EcfRecibidoListItem>>(ENDPOINTS.ecfRecibidos.list, { params })
  return unwrapPaginated(res)
}

// GET /ecf/recibidos/:voucherId — detalle: líneas del proveedor, conciliación y ACECF.
export async function getEcfRecibido(voucherId: string) {
  const res = await client.get<{ success: true; data: EcfRecibidoDetail }>(ENDPOINTS.ecfRecibidos.byId(voucherId))
  return unwrap(res)
}

// POST /ecf/recibidos/:voucherId/vincular — vincular a una Purchase Invoice existente.
export async function vincularEcfRecibido(voucherId: string, data: VincularEcfRecibidoDto) {
  const res = await client.post<{ success: true; data: EcfRecibidoDetail }>(
    ENDPOINTS.ecfRecibidos.vincular(voucherId),
    data,
  )
  return unwrap(res)
}

// POST /ecf/recibidos/:voucherId/aprobacion-comercial — ACECF: aceptar/rechazar (irreversible).
export async function aprobacionComercialEcf(voucherId: string, data: AprobacionComercialDto) {
  const res = await client.post<{ success: true; data: EcfRecibidoDetail }>(
    ENDPOINTS.ecfRecibidos.aprobacionComercial(voucherId),
    data,
  )
  return unwrap(res)
}

// POST /ecf/recibidos/cargar-manual — fallback: pegar el XML descargado del portal DGII.
export async function cargarManualEcf(data: CargarManualEcfDto) {
  const res = await client.post<{ success: true; data: EcfRecibidoDetail }>(
    ENDPOINTS.ecfRecibidos.cargarManual,
    data,
  )
  return unwrap(res)
}
