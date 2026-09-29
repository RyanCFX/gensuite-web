import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  InventoryItem,
  InventoryListResult,
  InventorySummary,
  InventoryHistory,
  InventoryLote,
  LoteSugerido,
  InventorySerial,
  Warehouse,
  PaginatedResponse,
  PaginationParams,
  CreateRepostValuacionDto,
  CreateRepostValuacionResult,
  RepostValuacionItem,
  StockPorDimensionResponse,
  GetStockPorDimensionParams,
  VerificarStockPorDimensionDto,
  VerificarStockPorDimensionFaltante,
  AjusteDimensionDto,
  AjusteDimensionResult,
  ReclasificacionDimensionDto,
  ReclasificacionDimensionResult,
} from './types'

export interface InventoryFilterParams extends PaginationParams {
  search?: string
  warehouse?: string
  branch?: string
  category?: string
  brand?: string
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
  sortBy?: 'investment' | 'value' | 'profit'
  /** docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md §7.1 — sin `warehouse`, una fila por almacén
   *  con movimiento de este artículo; con `warehouse` además, como máximo una fila. */
  itemCode?: string
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

// ─── Recálculo de valuación (Repost Item Valuation) ────────────────────────────

export async function createRepostValuacion(data: CreateRepostValuacionDto) {
  const res = await client.post<{ success: true; data: CreateRepostValuacionResult }>(
    ENDPOINTS.inventory.repostValuacion,
    data,
  )
  return unwrap(res)
}

export async function listRepostsValuacion(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<RepostValuacionItem>>(ENDPOINTS.inventory.repostValuacion, { params })
  return unwrapPaginated(res)
}

// ─── Lotes (Batches) ────────────────────────────────────────────────────────

export async function listLotes(params?: PaginationParams & {
  itemCode?: string
  /** Solo lotes con expiryDate hoy o antes. */
  soloVencidos?: boolean
  /** Lotes que vencen dentro de N días desde hoy (incluye los ya vencidos). */
  venceEnDias?: number
}) {
  const res = await client.get<PaginatedResponse<InventoryLote>>(ENDPOINTS.inventory.lotes, { params })
  return unwrapPaginated(res)
}

// FEFO real por almacén — a diferencia de listLotes (lista plana, sin cruzar con stock real de
// un almacén concreto), delega en el nativo de ERPNext y ya excluye vencidos (docs/FARMACIA_ARS_FRONTEND.md §6.3).
export async function getLoteSugerido(params: { itemCode: string; warehouse: string }) {
  const res = await client.get<{ success: true; data: LoteSugerido[] }>(ENDPOINTS.inventory.lotesSugerido, { params })
  return unwrap(res)
}

// ─── Seriales ───────────────────────────────────────────────────────────────

export async function listSeriales(params?: PaginationParams & { itemCode?: string; status?: string }) {
  const res = await client.get<PaginatedResponse<InventorySerial>>(ENDPOINTS.inventory.seriales, { params })
  return unwrapPaginated(res)
}

// ─── Dimensiones de Inventario — docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §8.3-§8.6 ──

/** Los filtros por dimensión son query params DINÁMICOS (la clave es el `codigo` de la dimensión,
 *  varía por tenant) — no aparecen tipados en `GetStockPorDimensionParams` más que por índice, por
 *  eso se arman aparte acá en vez de mandar el objeto de filtros tal cual (§8.3). */
export async function getStockPorDimension(itemCode: string, params?: GetStockPorDimensionParams) {
  const res = await client.get<{ success: true; data: StockPorDimensionResponse; meta: { limit: number; offset: number; totalRegistros: number } }>(
    ENDPOINTS.inventory.stockPorDimension(itemCode),
    { params },
  )
  return { data: res.data.data, meta: res.data.meta }
}

/** Solo un aviso — nunca bloquea nada por sí solo, la autoridad final sigue siendo el servidor al
 *  someter el documento real (§8.4). Array vacío = todo alcanza. */
export async function verificarStockPorDimension(data: VerificarStockPorDimensionDto) {
  const res = await client.post<{ success: true; data: VerificarStockPorDimensionFaltante[] }>(
    ENDPOINTS.inventory.verificarStockPorDimension,
    data,
  )
  return unwrap(res)
}

/** Único mecanismo para corregir el saldo de UNA combinación puntual — el Conteo/Stock
 *  Reconciliation estándar no funciona con artículos dimensionados (§8.5). */
export async function ajustarDimension(data: AjusteDimensionDto) {
  const res = await client.post<{ success: true; data: AjusteDimensionResult }>(
    ENDPOINTS.inventory.ajustesDimension,
    data,
  )
  return unwrap(res)
}

/** Corrige una combinación mal elegida en el mismo almacén, sin mover valuación (§8.6). */
export async function reclasificarDimension(data: ReclasificacionDimensionDto) {
  const res = await client.post<{ success: true; data: ReclasificacionDimensionResult }>(
    ENDPOINTS.inventory.reclasificaciones,
    data,
  )
  return unwrap(res)
}
