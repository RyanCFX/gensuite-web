import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Pago,
  CreatePagoDto,
  PendientePago,
  AgingProveedorEntry,
  AgingProveedorInvoiceEntry,
  AgingProveedorConfig,
  AgingProveedorResult,
  AgingGroupBy,
  SaldoFavorProveedorResult,
  AplicarSaldosFavorBulkDto,
  AplicarSaldosFavorResultItem,
  PaginatedResponse,
  PaginationParams,
} from './types'

// ─── List Pagos ───────────────────────────────────────────────────────────────

export interface ListPagosParams extends PaginationParams {
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  supplier?: string
  fromDate?: string
  toDate?: string
  modeOfPayment?: string
  branch?: string
  department?: string
  paidAmountMin?: number
  paidAmountMax?: number
  referenceNo?: string
}

export async function listPagos(params?: ListPagosParams) {
  const res = await client.get<PaginatedResponse<Pago>>(ENDPOINTS.pagos.list, { params })
  return unwrapPaginated(res)
}

export async function getPago(id: string) {
  const res = await client.get<{ success: true; data: Pago }>(ENDPOINTS.pagos.byId(id))
  return unwrap(res)
}

export async function submitPago(id: string) {
  const res = await client.post<{ success: true; data: Pago }>(ENDPOINTS.pagos.submit(id), {})
  return unwrap(res)
}

export async function cancelPago(id: string) {
  const res = await client.post<{ success: true; data: Pago }>(ENDPOINTS.pagos.cancel(id), {})
  return unwrap(res)
}

// ─── Aging ────────────────────────────────────────────────────────────────────
// GET /pagos/aging responde { success, groupBy, data: AgingProveedorEntry[] | AgingProveedorInvoiceEntry[], config, note? }
// — groupBy/config/note van al mismo nivel que data, no anidados — por eso no se usa
// el helper `unwrap` genérico acá.
// Sin `groupBy` en la request, el backend asume "party" (una fila por proveedor).

export interface AgingProveedoresParams {
  /** Filtra el reporte a un solo proveedor. Omitir trae todos. */
  supplier?: string
  /** "party" (default, una fila por proveedor) | "invoice" (una fila por factura pendiente). */
  groupBy?: AgingGroupBy
}

export async function getAgingProveedores(params?: AgingProveedoresParams): Promise<AgingProveedorResult> {
  const res = await client.get<{
    success: true
    groupBy: AgingGroupBy
    data: AgingProveedorEntry[] | AgingProveedorInvoiceEntry[]
    config: AgingProveedorConfig
    note?: string
  }>(ENDPOINTS.pagos.aging, { params })
  return { groupBy: res.data.groupBy ?? 'party', rows: res.data.data, config: res.data.config, note: res.data.note }
}

// ─── Pendientes ───────────────────────────────────────────────────────────────

export interface PendientesPagoParams extends PaginationParams {
  supplier?: string
  overdueOnly?: boolean
}

export async function getPagosPendientes(params?: PendientesPagoParams) {
  const res = await client.get<PaginatedResponse<PendientePago>>(ENDPOINTS.pagos.pendientes, { params })
  return unwrapPaginated(res)
}

// ─── Historial ────────────────────────────────────────────────────────────────

export async function getHistorialPagos(supplierId: string, params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<Pago>>(ENDPOINTS.pagos.historial(supplierId), { params })
  return unwrapPaginated(res)
}

// ─── Registrar pago ───────────────────────────────────────────────────────────

export async function createPago(data: CreatePagoDto) {
  const res = await client.post<{ success: true; data: Pago }>(ENDPOINTS.pagos.list, data)
  return unwrap(res)
}

// ─── Saldo a favor ────────────────────────────────────────────────────────────

export async function getSaldoFavorProveedor(supplierId: string) {
  const res = await client.get<{ success: true; data: SaldoFavorProveedorResult }>(
    ENDPOINTS.pagos.saldoFavor(supplierId),
  )
  return unwrap(res)
}

export async function aplicarSaldosFavor(dto: AplicarSaldosFavorBulkDto) {
  const res = await client.post<{ success: true; data: AplicarSaldosFavorResultItem[] }>(
    ENDPOINTS.pagos.aplicarSaldoFavor,
    dto,
  )
  return unwrap(res)
}
