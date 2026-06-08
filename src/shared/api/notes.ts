import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CreateCreditNoteDto,
  CreateDebitNoteDto,
} from './types'

export async function listCreditNotes() {
  const res = await client.get(ENDPOINTS.creditNotes.list)
  return unwrap(res)
}

export async function getCreditNote(id: string) {
  const res = await client.get(ENDPOINTS.creditNotes.byId(id))
  return unwrap(res)
}

export async function createCreditNote(data: CreateCreditNoteDto) {
  const res = await client.post(ENDPOINTS.creditNotes.list, data)
  return unwrap(res)
}

export async function submitCreditNote(id: string) {
  const res = await client.post(ENDPOINTS.creditNotes.submit(id))
  return unwrap(res)
}

export async function listDebitNotes() {
  const res = await client.get(ENDPOINTS.debitNotes.list)
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
