import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Invoice,
  CreateInvoiceDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListInvoicesParams extends PaginationParams {
  customer?: string
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  fromDate?: string
  toDate?: string
  paymentStatus?: 'paid' | 'unpaid' | 'overdue' | 'partial'
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

export async function submitInvoice(id: string) {
  const res = await client.post<{ success: true; data: Invoice }>(ENDPOINTS.invoices.submit(id))
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

export function getInvoicePdfUrl(id: string): string {
  return `${client.defaults.baseURL}${ENDPOINTS.invoices.pdf(id)}`
}
