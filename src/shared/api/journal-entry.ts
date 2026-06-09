import { client, unwrap, unwrapPaginated } from './client'
import type { JournalEntry, CreateJournalEntryDto, PaginatedResponse, PaginationParams } from './types'

export async function listJournalEntries(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<JournalEntry>>('/journal-entry', { params })
  return unwrapPaginated(res)
}

export async function getJournalEntry(id: string) {
  const res = await client.get<{ success: true; data: JournalEntry }>(`/journal-entry/${encodeURIComponent(id)}`)
  return unwrap(res)
}

export async function createJournalEntry(data: CreateJournalEntryDto) {
  const res = await client.post<{ success: true; data: JournalEntry }>('/journal-entry', data)
  return unwrap(res)
}

export async function submitJournalEntry(id: string) {
  const res = await client.post<{ success: true; data: JournalEntry }>(`/journal-entry/${encodeURIComponent(id)}/submit`)
  return unwrap(res)
}

export async function cancelJournalEntry(id: string) {
  const res = await client.post<{ success: true; data: JournalEntry }>(`/journal-entry/${encodeURIComponent(id)}/cancel`)
  return unwrap(res)
}
