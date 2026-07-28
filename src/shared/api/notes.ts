import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CreateCreditNoteDto,
  CreateDebitNoteDto,
  CreditNote,
  RefundCreditNoteDto,
  AplicarCreditNoteDto,
  AplicarCreditNoteResult,
  CreditNoteSaldoFavorResult,
  PaginationParams,
} from './types'

export interface ListNotesParams extends PaginationParams {
  search?: string
  status?: string
  fromDate?: string
  toDate?: string
  customer?: string
  branch?: string
  department?: string
}

export async function listCreditNotes(params?: ListNotesParams) {
  const res = await client.get<{ success: true; data: CreditNote[] }>(ENDPOINTS.creditNotes.list, { params })
  return unwrap(res)
}

export async function getCreditNote(id: string) {
  const res = await client.get<{ success: true; data: CreditNote }>(ENDPOINTS.creditNotes.byId(id))
  return unwrap(res)
}

export async function createCreditNote(data: CreateCreditNoteDto) {
  const res = await client.post<{ success: true; data: CreditNote }>(ENDPOINTS.creditNotes.list, data)
  return unwrap(res)
}

export async function submitCreditNote(id: string) {
  const res = await client.post<{ success: true; data: CreditNote }>(ENDPOINTS.creditNotes.submit(id))
  return unwrap(res)
}

// POST /credit-notes/:id/refund — reembolsa una nota de crédito que quedó como saldo a favor
export async function refundCreditNote(id: string, data: RefundCreditNoteDto) {
  const res = await client.post<{ success: true; data: CreditNote }>(ENDPOINTS.creditNotes.refund(id), data)
  return unwrap(res)
}

// POST /credit-notes/:id/aplicar-a-factura — invoiceId obligatorio, se enlaza y aplica de inmediato a esa factura
export async function aplicarCreditNoteAFactura(id: string, data: AplicarCreditNoteDto) {
  const res = await client.post<{ success: true; data: AplicarCreditNoteResult }>(
    ENDPOINTS.creditNotes.aplicarAFactura(id),
    data,
  )
  return unwrap(res)
}

// DELETE /credit-notes/:id/aplicar-a-factura/:invoiceId — deshace la aplicación a esa factura (solo si sigue en Draft)
export async function removerCreditNoteAplicada(id: string, invoiceId: string) {
  await client.delete(ENDPOINTS.creditNotes.removerAplicacion(id, invoiceId))
}

// GET /credit-notes/saldo-favor/:customerId
export async function getCreditNoteSaldoFavor(customerId: string) {
  const res = await client.get<{ success: true; data: CreditNoteSaldoFavorResult }>(
    ENDPOINTS.creditNotes.saldoFavor(customerId),
  )
  return unwrap(res)
}

export async function downloadCreditNotePdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.creditNotes.pdf(id), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `nota-credito-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function listDebitNotes(params?: ListNotesParams) {
  const res = await client.get(ENDPOINTS.debitNotes.list, { params })
  return unwrap(res)
}

export async function getDebitNote(id: string) {
  const res = await client.get(ENDPOINTS.debitNotes.byId(id))
  return unwrap(res)
}

export async function createDebitNote(data: CreateDebitNoteDto) {
  const res = await client.post(ENDPOINTS.debitNotes.list, data)
  return unwrap(res)
}

export async function submitDebitNote(id: string) {
  const res = await client.post(ENDPOINTS.debitNotes.submit(id))
  return unwrap(res)
}

export async function downloadDebitNotePdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.debitNotes.pdf(id), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `nota-debito-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
