import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  DevolucionCompra,
  CreateDevolucionCompraDto,
  UpdateDevolucionCompraDto,
  SaldoFavorDevolucionCompraResult,
  AplicarCxpResult,
  PaginatedResponse,
  PaginationParams,
  FormatoImpresion,
} from './types'

export interface ListDevolucionesComprasParams extends PaginationParams {
  supplier?: string
  status?: string
  branch?: string
  department?: string
  fromDate?: string
  toDate?: string
  ncf?: string
  grandTotalMin?: number
  grandTotalMax?: number
}

// GET /devoluciones-compras — listado paginado
export async function listDevolucionesCompras(params?: ListDevolucionesComprasParams) {
  const res = await client.get<PaginatedResponse<DevolucionCompra>>(ENDPOINTS.devolucionesCompras.list, { params })
  return unwrapPaginated(res)
}

// GET /devoluciones-compras/saldo-favor/{supplierId}
export async function getDevolucionesSaldoFavor(supplierId: string) {
  const res = await client.get<{ success: true; data: SaldoFavorDevolucionCompraResult }>(
    ENDPOINTS.devolucionesCompras.saldoFavor(supplierId),
  )
  return unwrap(res)
}

// GET /devoluciones-compras/{id}
export async function getDevolucionCompra(id: string) {
  const res = await client.get<{ success: true; data: DevolucionCompra }>(ENDPOINTS.devolucionesCompras.byId(id))
  return unwrap(res)
}

// POST /devoluciones-compras (Draft)
export async function createDevolucionCompra(data: CreateDevolucionCompraDto) {
  const res = await client.post<{ success: true; data: DevolucionCompra }>(ENDPOINTS.devolucionesCompras.create, data)
  return unwrap(res)
}

// PUT /devoluciones-compras/{id} (edición en Draft)
export async function updateDevolucionCompra(id: string, data: UpdateDevolucionCompraDto) {
  const res = await client.put<{ success: true; data: DevolucionCompra }>(ENDPOINTS.devolucionesCompras.update(id), data)
  return unwrap(res)
}

// DELETE /devoluciones-compras/{id} (eliminar en Draft)
export async function deleteDevolucionCompra(id: string) {
  const res = await client.delete<{ success: true; data: DevolucionCompra }>(ENDPOINTS.devolucionesCompras.remove(id))
  return unwrap(res)
}

// POST /devoluciones-compras/{id}/submit
export async function submitDevolucionCompra(id: string) {
  const res = await client.post<{ success: true; data: DevolucionCompra }>(ENDPOINTS.devolucionesCompras.submit(id))
  return unwrap(res)
}

// POST /devoluciones-compras/{id}/cancel
export async function cancelDevolucionCompra(id: string) {
  const res = await client.post<{ success: true; data: DevolucionCompra }>(ENDPOINTS.devolucionesCompras.cancel(id))
  return unwrap(res)
}

// POST /devoluciones-compras/{id}/amend
export async function amendDevolucionCompra(id: string) {
  const res = await client.post<{ success: true; data: DevolucionCompra }>(ENDPOINTS.devolucionesCompras.amend(id))
  return unwrap(res)
}

// GET /devoluciones-compras/{id}/pdf?formato=...
export async function getDevolucionCompraPdfBlobUrl(id: string, formato?: FormatoImpresion): Promise<string> {
  const params = new URLSearchParams()
  if (formato) params.set('formato', formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.devolucionesCompras.pdf(id)}?${qs}` : ENDPOINTS.devolucionesCompras.pdf(id)
  const res = await client.get<Blob>(url, { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

export async function downloadDevolucionCompraPdf(
  id: string,
  filename?: string,
  formato?: FormatoImpresion,
): Promise<void> {
  const params = new URLSearchParams()
  if (formato) params.set('formato', formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.devolucionesCompras.pdf(id)}?${qs}` : ENDPOINTS.devolucionesCompras.pdf(id)
  const res = await client.get<Blob>(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `devolucion-compra-${id}.pdf`
  a.click()
  URL.revokeObjectURL(blobUrl)
}

// POST /devoluciones-compras/{id}/aplicar-a-cxp
export async function applyDevolucionToCxp(id: string, data: { invoiceId: string; amount?: number }) {
  const res = await client.post<{ success: true; data: AplicarCxpResult }>(
    ENDPOINTS.devolucionesCompras.applyToCxp(id),
    data,
  )
  return unwrap(res)
}

// DELETE /devoluciones-compras/{id}/aplicar-a-cxp/{invoiceId}
export async function unapplyDevolucionFromCxp(id: string, invoiceId: string) {
  const res = await client.delete<{ success: true; data: DevolucionCompra }>(
    ENDPOINTS.devolucionesCompras.unapplyCxp(id, invoiceId),
  )
  return unwrap(res)
}
