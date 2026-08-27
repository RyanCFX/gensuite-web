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
