import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Invoice,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  SubmitInvoiceDto,
  DraftVersion,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListInvoicesParams extends PaginationParams {
  customer?: string
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  fromDate?: string
  toDate?: string
  paymentStatus?: 'paid' | 'unpaid' | 'partly_paid' | 'overdue'
  ncfType?: string
}

export async function listInvoices(params?: ListInvoicesParams) {
  const res = await client.get<PaginatedResponse<Invoice>>(ENDPOINTS.invoices.list, { params })
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

export async function updateInvoice(id: string, data: UpdateInvoiceDto) {
  const res = await client.put<{ success: true; data: Invoice }>(ENDPOINTS.invoices.byId(id), data)
  return unwrap(res)
}

export async function submitInvoice(id: string, data?: SubmitInvoiceDto) {
  const res = await client.post<{ success: true; data: Invoice }>(ENDPOINTS.invoices.submit(id), data)
  return unwrap(res)
}

export async function cancelInvoice(id: string) {
  const res = await client.post<{ success: true; data: Invoice }>(ENDPOINTS.invoices.cancel(id))
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

export async function downloadInvoicePdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.invoices.pdf(id), {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `factura-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
