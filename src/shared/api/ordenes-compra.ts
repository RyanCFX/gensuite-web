import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  OrdenCompra,
  CreateOrdenCompraDto,
  UpdateOrdenCompraDto,
  CreateReceiptFromOrdenDto,
  CreateInvoiceFromOrdenDto,
  FacturarOrdenResult,
  PurchaseReceipt,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListOrdenesCompraParams extends PaginationParams {
  supplier?: string
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  erpStatus?: 'Draft' | 'On Hold' | 'To Receive and Bill' | 'To Bill' | 'To Receive' | 'Completed' | 'Cancelled' | 'Closed' | 'Delivered'
  receiptStatus?: 'pending' | 'received' | 'all'
  billingStatus?: 'pending' | 'billed' | 'all'
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
}

export async function listOrdenesCompra(params?: ListOrdenesCompraParams) {
  const res = await client.get<PaginatedResponse<OrdenCompra>>(ENDPOINTS.ordenesCompra.list, { params })
  return unwrapPaginated(res)
}

export async function getOrdenCompra(id: string) {
  const res = await client.get<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.byId(id))
  return unwrap(res)
}

export async function createOrdenCompra(data: CreateOrdenCompraDto) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.list, data)
  return unwrap(res)
}

export async function updateOrdenCompra(id: string, data: UpdateOrdenCompraDto) {
  const res = await client.put<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.byId(id), data)
  return unwrap(res)
}

export async function deleteOrdenCompra(id: string) {
  await client.delete(ENDPOINTS.ordenesCompra.byId(id))
}

export async function submitOrdenCompra(id: string) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.submit(id))
  return unwrap(res)
}

export async function cancelOrdenCompra(id: string) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.cancel(id))
  return unwrap(res)
}

export async function amendOrdenCompra(id: string) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.amend(id))
  return unwrap(res)
}

/** Saca la orden del pendiente SIN cancelarla — para cuando el proveedor nunca va a entregar el
 *  resto. No revierte lo ya recibido/facturado. */
export async function cerrarOrdenCompra(id: string) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.cerrar(id))
  return unwrap(res)
}

export async function reabrirOrdenCompra(id: string) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.reabrir(id))
  return unwrap(res)
}

export async function ponerEnEsperaOrdenCompra(id: string) {
  const res = await client.post<{ success: true; data: OrdenCompra }>(ENDPOINTS.ordenesCompra.enEspera(id))
  return unwrap(res)
}

/** Genera un Purchase Receipt (conduce) por el remanente pendiente de recibir — se puede llamar
 *  varias veces (recepciones parciales), cada vez trae solo lo que falte. */
export async function recibirOrdenCompra(id: string, data: CreateReceiptFromOrdenDto) {
  const res = await client.post<{ success: true; data: PurchaseReceipt }>(ENDPOINTS.ordenesCompra.recibir(id), data)
  return unwrap(res)
}

/** Genera y somete una Purchase Invoice por el remanente pendiente de facturar. `warning` en la
 *  respuesta es informativo (la orden ya tenía recepción parcial/total) — no es un error. */
export async function facturarOrdenCompra(id: string, data: CreateInvoiceFromOrdenDto): Promise<FacturarOrdenResult> {
  const res = await client.post<FacturarOrdenResult>(ENDPOINTS.ordenesCompra.facturar(id), data)
  return res.data
}

export async function getOrdenCompraPdfBlobUrl(id: string): Promise<string> {
  const res = await client.get<Blob>(ENDPOINTS.ordenesCompra.pdf(id), { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}
