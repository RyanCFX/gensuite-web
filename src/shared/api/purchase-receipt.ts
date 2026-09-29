import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  PurchaseReceipt,
  CreatePurchaseReceiptDto,
  UpdatePurchaseReceiptDto,
  FacturarPurchaseReceiptDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListPurchaseReceiptsParams extends PaginationParams {
  supplier?: string
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  billingStatus?: 'pending' | 'billed' | 'all'
  fromDate?: string
  toDate?: string
  branch?: string
  department?: string
}

export async function listPurchaseReceipts(params?: ListPurchaseReceiptsParams) {
  const res = await client.get<PaginatedResponse<PurchaseReceipt>>(ENDPOINTS.purchaseReceipt.list, { params })
  return unwrapPaginated(res)
}

export async function getPurchaseReceipt(id: string) {
  const res = await client.get<{ success: true; data: PurchaseReceipt }>(ENDPOINTS.purchaseReceipt.byId(id))
  return unwrap(res)
}

export async function createPurchaseReceipt(data: CreatePurchaseReceiptDto) {
  const res = await client.post<{ success: true; data: PurchaseReceipt }>(ENDPOINTS.purchaseReceipt.list, data)
  return unwrap(res)
}

export async function updatePurchaseReceipt(id: string, data: UpdatePurchaseReceiptDto) {
  const res = await client.put<{ success: true; data: PurchaseReceipt }>(ENDPOINTS.purchaseReceipt.byId(id), data)
  return unwrap(res)
}

export async function submitPurchaseReceipt(id: string) {
  const res = await client.post<{ success: true; data: PurchaseReceipt }>(ENDPOINTS.purchaseReceipt.submit(id))
  return unwrap(res)
}

export async function cancelPurchaseReceipt(id: string) {
  const res = await client.post<{ success: true; data: PurchaseReceipt }>(ENDPOINTS.purchaseReceipt.cancel(id))
  return unwrap(res)
}

export async function amendPurchaseReceipt(id: string) {
  const res = await client.post<{ success: true; data: PurchaseReceipt }>(ENDPOINTS.purchaseReceipt.amend(id))
  return unwrap(res)
}

export async function facturarPurchaseReceipt(id: string, data: FacturarPurchaseReceiptDto) {
  // Respuesta cruda de ERPNext (Purchase Invoice) — no sigue el shape de Compra.
  const res = await client.post<{ success: true; data: { name: string } & Record<string, unknown> }>(
    ENDPOINTS.purchaseReceipt.facturar(id),
    data,
  )
  return unwrap(res)
}

// GET /compras/purchase-receipt/:id/pdf — PDF de la recepción (docs/tasks/81 §3). Sin parámetros
// de query: siempre página completa, sin variante POS ni toggle de moneda. Requiere el permiso
// `compras.recepcion.imprimir`.
export async function getPurchaseReceiptPdfBlobUrl(id: string): Promise<string> {
  const res = await client.get<Blob>(ENDPOINTS.purchaseReceipt.pdf(id), { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

export async function downloadPurchaseReceiptPdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.purchaseReceipt.pdf(id), { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `recepcion-${id}.pdf`
  a.click()
  URL.revokeObjectURL(blobUrl)
}
