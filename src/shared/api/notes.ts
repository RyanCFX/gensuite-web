import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CreateCreditNoteDto,
  CreateDebitNoteDto,
  CreditNote,
  RefundCreditNoteDto,
  PaginationParams,
} from './types'

export interface ListNotesParams extends PaginationParams {
  search?: string
  status?: string
  fromDate?: string
  toDate?: string
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
