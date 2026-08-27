import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Invoice,
  CreateInvoiceDto,
  CancelInvoiceDto,
  SubmitInvoiceDto,
  SubmitInvoiceResult,
  AplicarSaldoFavorDto,
  DraftVersion,
  PaginatedResponse,
  PaginationParams,
  ComponentTracking,
  FormatoImpresion,
} from './types'

export interface ListInvoicesParams extends PaginationParams {
  customer?: string
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  fromDate?: string
  toDate?: string
  paymentStatus?: 'paid' | 'unpaid' | 'partly_paid' | ('paid' | 'unpaid' | 'partly_paid')[]
  ncfType?: string
  branch?: string
  ncf?: string
  grandTotalMin?: number
  grandTotalMax?: number
}

export async function listInvoices(params?: ListInvoicesParams) {
  const { paymentStatus, ...rest } = params ?? {}
  const res = await client.get<PaginatedResponse<Invoice>>(ENDPOINTS.invoices.list, {
    params: {
      ...rest,
      // El backend espera un string separado por comas, no repetir la key ni corchetes.
      paymentStatus: Array.isArray(paymentStatus) ? paymentStatus.join(',') : paymentStatus,
    },
  })
  return unwrapPaginated(res)
}

export async function getInvoice(id: string) {
  const res = await client.get<{ success: true; data: Invoice }>(ENDPOINTS.invoices.byId(id))
  return unwrap(res)
}

export async function createInvoice(data: CreateInvoiceDto) {
  const res = await client.post<{ success: true; data: Invoice }>(ENDPOINTS.invoices.list, data)
  return unwrap(res)
}

export async function submitInvoice(id: string, data?: SubmitInvoiceDto) {
  const res = await client.post<{ success: true; data: SubmitInvoiceResult }>(ENDPOINTS.invoices.submit(id), data)
  return unwrap(res)
}

export async function cancelInvoice(id: string, data: CancelInvoiceDto) {
  const res = await client.post<{ success: true; data: { message: string; reason: string } }>(
    ENDPOINTS.invoices.cancel(id),
    data,
  )
  return unwrap(res)
}

export async function amendInvoice(id: string) {
  const res = await client.post<{ success: true; data: Invoice }>(ENDPOINTS.invoices.amend(id))
  return unwrap(res)
}

export async function getInvoiceVersion(id: string, sequence: number) {
  const res = await client.get<{ success: true; data: DraftVersion }>(ENDPOINTS.invoices.version(id, sequence))
  return unwrap(res)
}

// POST /invoices/:id/aplicar-saldo-favor — solo funciona con la factura en Draft
export async function aplicarSaldoFavor(id: string, data: AplicarSaldoFavorDto) {
  const res = await client.post<{ success: true; data: Invoice }>(
    ENDPOINTS.invoices.aplicarSaldoFavor(id),
    data,
  )
  return unwrap(res)
}

// DELETE /invoices/:id/aplicar-saldo-favor/:paymentEntryId — deshace la aplicación de un saldo a favor
export async function removerSaldoFavor(id: string, paymentEntryId: string) {
  await client.delete(ENDPOINTS.invoices.removerSaldoFavor(id, paymentEntryId))
}

/**
 * Asigna seriales/lotes específicos a un artículo (o componente de un Combo) de una factura en
 * Draft — pensado para recuperar el submit cuando ERPNext no pudo auto-asignar el tracking
 * (sin stock disponible en el almacén de la línea, o el usuario necesita elegir uno puntual).
 */
export async function asignarTrackingFactura(id: string, items: ComponentTracking[]) {
  const res = await client.post<{ success: true; data: Invoice }>(ENDPOINTS.invoices.asignarTracking(id), { items })
  return unwrap(res)
}

export async function getInvoicePdfBlobUrl(id: string, formato?: FormatoImpresion): Promise<string> {
  const params = new URLSearchParams()
  if (formato) params.set("formato", formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.invoices.pdf(id)}?${qs}` : ENDPOINTS.invoices.pdf(id)
  const res = await client.get<Blob>(url, {
    responseType: "blob",
  })
  return URL.createObjectURL(res.data)
}

export async function downloadInvoicePdf(id: string, filename?: string, formato?: FormatoImpresion): Promise<void> {
  const params = new URLSearchParams()
  if (formato) params.set("formato", formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.invoices.pdf(id)}?${qs}` : ENDPOINTS.invoices.pdf(id)
  const res = await client.get<Blob>(url, {
    responseType: "blob",
  })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement("a")
  a.href = blobUrl
  a.download = filename ?? `factura-${id}.pdf`
  a.click()
  URL.revokeObjectURL(blobUrl)
}
