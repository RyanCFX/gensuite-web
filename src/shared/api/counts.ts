import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  InventoryCount,
  CreateCountDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

export async function listCounts(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<InventoryCount>>(ENDPOINTS.inventory.counts.list, { params })
  return unwrapPaginated(res)
}

export interface CountTemplateItem {
  itemCode: string
  itemName: string
  warehouse: string
  actualQty: number
  valuationRate?: number
}

export async function getCountTemplate(warehouse: string) {
  const res = await client.get<{ success: true; data: CountTemplateItem[] | { items: CountTemplateItem[] } }>(
    ENDPOINTS.inventory.counts.template,
    { params: { warehouse } },
  )
  const raw = unwrap(res)
  // BFF may return array directly or { items: [] }
  return Array.isArray(raw) ? raw : (raw as { items: CountTemplateItem[] }).items ?? []
}

export async function getCount(id: string) {
  const res = await client.get<{ success: true; data: InventoryCount }>(ENDPOINTS.inventory.counts.byId(id))
  return unwrap(res)
}

export async function createCount(data: CreateCountDto) {
  const res = await client.post<{ success: true; data: InventoryCount }>(ENDPOINTS.inventory.counts.list, data)
  return unwrap(res)
}

export async function submitCount(id: string) {
  const res = await client.post<{ success: true; data: InventoryCount }>(ENDPOINTS.inventory.counts.submit(id))
  return unwrap(res)
}
