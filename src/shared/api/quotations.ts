import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Quotation,
  CreateQuotationDto,
  DraftVersion,
  DuplicateQuotationSource,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListQuotationsParams extends PaginationParams {
  customer?: string
  status?: 'draft' | 'submitted' | 'ordered' | 'lost' | 'cancelled' | 'all'
  fromDate?: string
  toDate?: string
}

export async function listQuotations(params?: ListQuotationsParams) {
  const res = await client.get<PaginatedResponse<Quotation>>(ENDPOINTS.quotations.list, { params })
  return unwrapPaginated(res)
}

export async function getQuotation(id: string) {
  const res = await client.get<{ success: true; data: Quotation }>(ENDPOINTS.quotations.byId(id))
  return unwrap(res)
}

export async function createQuotation(data: CreateQuotationDto) {
  const res = await client.post<{ success: true; data: Quotation }>(ENDPOINTS.quotations.list, data)
  return unwrap(res)
}

export async function updateQuotation(id: string, data: Partial<CreateQuotationDto>) {
  const res = await client.put<{ success: true; data: Quotation }>(ENDPOINTS.quotations.byId(id), data)
  return unwrap(res)
}

export async function deleteQuotation(id: string) {
  await client.delete(ENDPOINTS.quotations.byId(id))
}

export async function submitQuotation(id: string) {
  const res = await client.post<{ success: true; data: Quotation }>(ENDPOINTS.quotations.submit(id))
  return unwrap(res)
}

export async function convertQuotationToInvoice(id: string, ncfType?: string) {
  const res = await client.post<{ success: true; data: Quotation }>(
    ENDPOINTS.quotations.convert(id),
    undefined,
    { params: ncfType ? { ncfType } : undefined },
  )
  return unwrap(res)
}

export async function getQuotationVersion(id: string, sequence: number) {
  const res = await client.get<{ success: true; data: DraftVersion }>(ENDPOINTS.quotations.version(id, sequence))
  return unwrap(res)
}

export async function amendQuotation(id: string) {
  const res = await client.post<{ success: true; data: { newId: string; amendedFrom: string } }>(ENDPOINTS.quotations.amend(id))
  return unwrap(res)
}

export async function cancelQuotation(id: string) {
  const res = await client.post<{ success: true; data: Quotation }>(ENDPOINTS.quotations.cancel(id))
  return unwrap(res)
}

// GET /quotations/:id/duplicate-source — read-only, no side effects
export async function getQuotationDuplicateSource(id: string) {
  const res = await client.get<{ success: true; data: DuplicateQuotationSource }>(
    ENDPOINTS.quotations.duplicateSource(id),
  )
  return unwrap(res)
}

export async function downloadQuotationPdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.quotations.pdf(id), {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `cotizacion-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
