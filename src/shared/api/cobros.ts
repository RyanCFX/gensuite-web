import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  AgingEntry,
  SemaforoEntry,
  PaymentEntry,
  RegisterPagoDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

// ─── Aging ────────────────────────────────────────────────────────────────────

export async function getAging() {
  const res = await client.get<{ success: true; data: AgingEntry[] }>(ENDPOINTS.cobros.aging)
  return unwrap(res)
}

// ─── Semáforo ─────────────────────────────────────────────────────────────────
// GET /cobros/semaforo           → todos los clientes
// GET /cobros/semaforo/:id       → un cliente específico

export async function getSemaforo() {
  const res = await client.get<{ success: true; data: SemaforoEntry[] }>(ENDPOINTS.cobros.semaforo)
  return unwrap(res)
}

export async function getSemaforoByCustomer(customerId: string) {
  const res = await client.get<{ success: true; data: SemaforoEntry }>(
    ENDPOINTS.cobros.semaforoByCustomer(customerId),
  )
  return unwrap(res)
}

// ─── Pendientes ───────────────────────────────────────────────────────────────

export interface PendientesParams extends PaginationParams {
  customer?: string
  overdueOnly?: boolean
}

export async function getCobrosPendientes(params?: PendientesParams) {
  const res = await client.get<PaginatedResponse<PaymentEntry>>(ENDPOINTS.cobros.pendientes, { params })
  return unwrapPaginated(res)
}

// ─── Historial ────────────────────────────────────────────────────────────────

export async function getHistorialPagos(customerId: string, params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<PaymentEntry>>(
    ENDPOINTS.cobros.historial(customerId),
    { params },
  )
  return unwrapPaginated(res)
}

// ─── Registrar Pago ───────────────────────────────────────────────────────────
// POST /cobros  → registrar pago

export async function registerPago(data: RegisterPagoDto) {
  const res = await client.post<{ success: true; data: PaymentEntry }>(ENDPOINTS.cobros.list, data)
  return unwrap(res)
}
