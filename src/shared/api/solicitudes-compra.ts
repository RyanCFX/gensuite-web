import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  SolicitudCompra,
  CreateSolicitudCompraDto,
  UpdateSolicitudCompraDto,
  CreateOrdenFromSolicitudDto,
  OrdenCompra,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListSolicitudesCompraParams extends PaginationParams {
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  erpStatus?: 'Draft' | 'Submitted' | 'Stopped' | 'Cancelled' | 'Pending' | 'Partially Ordered' | 'Ordered'
  orderingStatus?: 'pending' | 'partial' | 'ordered' | 'all'
  fromDate?: string
  toDate?: string
}

export async function listSolicitudesCompra(params?: ListSolicitudesCompraParams) {
  const res = await client.get<PaginatedResponse<SolicitudCompra>>(ENDPOINTS.solicitudesCompra.list, { params })
  return unwrapPaginated(res)
}

export async function getSolicitudCompra(id: string) {
  const res = await client.get<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.byId(id))
  return unwrap(res)
}

export async function createSolicitudCompra(data: CreateSolicitudCompraDto) {
  const res = await client.post<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.list, data)
  return unwrap(res)
}

export async function updateSolicitudCompra(id: string, data: UpdateSolicitudCompraDto) {
  const res = await client.put<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.byId(id), data)
  return unwrap(res)
}

export async function deleteSolicitudCompra(id: string) {
  await client.delete(ENDPOINTS.solicitudesCompra.byId(id))
}

export async function submitSolicitudCompra(id: string) {
  const res = await client.post<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.submit(id))
  return unwrap(res)
}

export async function cancelSolicitudCompra(id: string) {
  const res = await client.post<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.cancel(id))
  return unwrap(res)
}

export async function amendSolicitudCompra(id: string) {
  const res = await client.post<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.amend(id))
  return unwrap(res)
}

/** Deja de contar como pendiente de ordenar, sin cancelarla. */
export async function detenerSolicitudCompra(id: string) {
  const res = await client.post<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.detener(id))
  return unwrap(res)
}

export async function reanudarSolicitudCompra(id: string) {
  const res = await client.post<{ success: true; data: SolicitudCompra }>(ENDPOINTS.solicitudesCompra.reanudar(id))
  return unwrap(res)
}

/** Genera una Orden de Compra (Draft) a partir del remanente pendiente de ordenar — se puede
 *  llamar varias veces sobre la misma solicitud, cada vez trae solo lo que falte. */
export async function generarOrdenDesdeSolicitud(id: string, data: CreateOrdenFromSolicitudDto) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.solicitudesCompra.generarOrden(id), data)
  return unwrap(res)
}

export async function getSolicitudCompraPdfBlobUrl(id: string): Promise<string> {
  const res = await client.get<Blob>(ENDPOINTS.solicitudesCompra.pdf(id), { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}
