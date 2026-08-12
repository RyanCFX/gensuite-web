import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  AgingEntry,
  AgingConfig,
  AgingResult,
  SemaforoEntry,
  SemaforoResult,
  PaymentEntry,
  RegisterPagoDto,
  SaldoFavorResult,
  PaginatedResponse,
  PaginationParams,
  EstadoCuentaResponse,
  FormatoImpresion,
} from './types'

// ─── List Cobros ──────────────────────────────────────────────────────────────

export interface ListCobrosParams extends PaginationParams {
  status?: 'Draft' | 'Submitted' | 'Cancelled'
  customer?: string
  fromDate?: string
  toDate?: string
  modeOfPayment?: string
  bankAccount?: string
  paidAmountMin?: number
  paidAmountMax?: number
}

export async function listCobros(params?: ListCobrosParams) {
  const res = await client.get<PaginatedResponse<PaymentEntry>>(ENDPOINTS.cobros.list, { params })
  return unwrapPaginated(res)
}

export async function getCobro(id: string) {
  const res = await client.get<{ success: true; data: PaymentEntry }>(ENDPOINTS.cobros.byId(id))
  return unwrap(res)
}

export async function submitCobro(id: string) {
  const res = await client.post<{ success: true; data: PaymentEntry }>(ENDPOINTS.cobros.submit(id), {})
  return unwrap(res)
}

export async function getCobroPdfBlobUrl(id: string, formato?: FormatoImpresion): Promise<string> {
  const params = new URLSearchParams()
  if (formato) params.set('formato', formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.cobros.pdf(id)}?${qs}` : ENDPOINTS.cobros.pdf(id)
  const res = await client.get<Blob>(url, {
    responseType: 'blob',
  })
  return URL.createObjectURL(res.data)
}

export async function downloadCobroPdf(id: string, filename?: string, formato?: FormatoImpresion): Promise<void> {
  const params = new URLSearchParams()
  if (formato) params.set('formato', formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.cobros.pdf(id)}?${qs}` : ENDPOINTS.cobros.pdf(id)
  const res = await client.get<Blob>(url, {
    responseType: 'blob',
  })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `cobro-${id}.pdf`
  a.click()
  URL.revokeObjectURL(blobUrl)
}

// ─── Aging ────────────────────────────────────────────────────────────────────
// GET /cobros/aging responde { success, data: AgingEntry[], config, note? }
// — config y note NO están anidados dentro de `data`, van al mismo nivel.

export async function getAging(): Promise<AgingResult> {
  const res = await client.get<{
    success: true
    data: AgingEntry[]
    config: AgingConfig
    note?: string
  }>(ENDPOINTS.cobros.aging)
  return { rows: res.data.data, config: res.data.config, note: res.data.note }
}

// ─── Semáforo ─────────────────────────────────────────────────────────────────
// GET /cobros/semaforo           → todos los clientes
// GET /cobros/semaforo/:id       → un cliente específico

export async function getSemaforo(): Promise<SemaforoResult> {
  const res = await client.get<{ success: true; data: SemaforoResult }>(ENDPOINTS.cobros.semaforo)
  return res.data.data
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

// ─── Saldo a favor ────────────────────────────────────────────────────────────
// GET /cobros/saldo-favor/:customerId

export async function getSaldoFavor(customerId: string) {
  const res = await client.get<{ success: true; data: SaldoFavorResult }>(
    ENDPOINTS.cobros.saldoFavor(customerId),
  )
  return unwrap(res)
}

// ─── Estado de Cuenta ──────────────────────────────────────────
// GET /cobros/estado-cuenta/:customerId — JSON preview
// GET /cobros/estado-cuenta/:customerId/pdf — PDF download

export async function getEstadoCuenta(customerId: string) {
  const res = await client.get<{ success: true; data: EstadoCuentaResponse }>(
    ENDPOINTS.cobros.estadoCuenta(customerId),
  )
  return unwrap(res)
}

export async function downloadEstadoCuentaPdf(
  customerId: string,
  filename?: string,
): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.cobros.estadoCuentaPdf(customerId), {
    responseType: 'blob',
  })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `estado-cuenta-${customerId}.pdf`
  a.click()
  URL.revokeObjectURL(blobUrl)
}
