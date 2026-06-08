import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  InventoryItem,
  InventorySummary,
  InventoryHistory,
  Warehouse,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface InventoryFilterParams extends PaginationParams {
  warehouse?: string
  category?: string
  brand?: string
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
  sortBy?: 'investment' | 'value' | 'profit'
}

export interface HistoryFilterParams extends PaginationParams {
  warehouse?: string
  voucherType?: string
  fromDate?: string
  toDate?: string
}

export async function listInventory(params?: InventoryFilterParams) {
  const res = await client.get<PaginatedResponse<InventoryItem>>(ENDPOINTS.inventory.list, { params })
  return unwrapPaginated(res)
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
