import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  InventoryItem,
  InventoryListResult,
  InventorySummary,
  InventoryHistory,
  InventoryLote,
  InventorySerial,
  Warehouse,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface InventoryFilterParams extends PaginationParams {
  warehouse?: string
  branch?: string
  category?: string
  brand?: string
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
  sortBy?: 'investment' | 'value' | 'profit'
}

export interface HistoryFilterParams extends PaginationParams {
  warehouse?: string
  branch?: string
  voucherType?: string
  fromDate?: string
  toDate?: string
}

export async function listInventory(params?: InventoryFilterParams): Promise<InventoryListResult> {
  // Response shape: { success, data: { items: T[], summary: {} }, meta: {} }
  const res = await client.get<{ success: true; data: { items: InventoryItem[]; summary: InventorySummary }; meta: { total: number; limit: number; offset: number; hasMore: boolean } }>(
    ENDPOINTS.inventory.list,
    { params },
  )
  return {
    items: res.data.data.items ?? [],
    summary: res.data.data.summary,
    meta: res.data.meta,
  }
}

export async function getInventorySummary() {
  const res = await client.get<{ success: true; data: InventorySummary }>(ENDPOINTS.inventory.summary)
  return unwrap(res)
}

export async function listWarehouses() {
  const res = await client.get<{ success: true; data: Warehouse[] }>(ENDPOINTS.inventory.warehouses)
  return unwrap(res)
}

export async function getInventoryHistory(params?: HistoryFilterParams) {
  const res = await client.get<PaginatedResponse<InventoryHistory>>(ENDPOINTS.inventory.history, { params })
  return unwrapPaginated(res)
}

export async function getItemHistory(itemCode: string, params?: HistoryFilterParams) {
  const res = await client.get<PaginatedResponse<InventoryHistory>>(ENDPOINTS.inventory.historyByItem(itemCode), { params })
  return unwrapPaginated(res)
}

// ─── Lotes (Batches) ────────────────────────────────────────────────────────

export async function listLotes(params?: PaginationParams & { itemCode?: string }) {
  const res = await client.get<PaginatedResponse<InventoryLote>>(ENDPOINTS.inventory.lotes, { params })
  return unwrapPaginated(res)
}

// ─── Seriales ───────────────────────────────────────────────────────────────

export async function listSeriales(params?: PaginationParams & { itemCode?: string; status?: string }) {
  const res = await client.get<PaginatedResponse<InventorySerial>>(ENDPOINTS.inventory.seriales, { params })
  return unwrapPaginated(res)
}
