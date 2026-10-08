import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  PaginatedResponse,
  PaginationParams,
  DeliveryPendiente,
  DeliveryCobroFila,
  DeliveryCobroResumen,
  DeliveryConciliacionItem,
  DeliveryConciliacionResultItem,
  DeliveryConfirmarItem,
  DeliveryConfirmarResultItem,
  DeliveryAnularDto,
  DeliveryAnularResult,
  DeliveryViaje,
  CreateViajeDto,
  UpdateViajeDto,
  DespacharViajeDto,
  CancelarViajeDto,
  DeliveryRepartidor,
  CreateRepartidorDto,
  UpdateRepartidorDto,
  DeliveryVehiculo,
  CreateVehiculoDto,
  UpdateVehiculoDto,
  DeliveryEstadoEntrega,
  DeliveryViajeEstado,
} from './types'

// Delivery con cobro contra entrega — docs/tasks/PROMPT_DELIVERY_FRONTEND.md.
// Respuestas según el documento (openapi.json no trae schemas para estas rutas).

// ─── Pendientes (§4.1) ───────────────────────────────────────────────────────

export interface ListDeliveryPendientesParams extends PaginationParams {
  branch?: string
  customer?: string
  /** `pendiente` | `no_entregado` */
  estado?: DeliveryEstadoEntrega | string
  fechaDesde?: string
  fechaHasta?: string
  q?: string
}

export async function listDeliveryPendientes(params?: ListDeliveryPendientesParams) {
  const res = await client.get<PaginatedResponse<DeliveryPendiente>>(ENDPOINTS.delivery.pendientes, { params })
  return unwrapPaginated(res)
}

// ─── Cobros por conciliar (§3.3) ─────────────────────────────────────────────

export interface ListDeliveryCobrosParams extends PaginationParams {
  /** `por_conciliar` (default) | `conciliado` | `revertido` | `no_aplica` | `todos` */
  estado?: string
  repartidor?: string
  viaje?: string
  turno?: string
  estadoEntrega?: string
  fechaDesde?: string
  fechaHasta?: string
  q?: string
}

export async function listDeliveryCobros(params?: ListDeliveryCobrosParams) {
  const res = await client.get<PaginatedResponse<DeliveryCobroFila>>(ENDPOINTS.delivery.cobros, { params })
  return unwrapPaginated(res)
}

export async function getDeliveryCobrosResumen() {
  const res = await client.get<{ success: true; data: DeliveryCobroResumen }>(ENDPOINTS.delivery.cobrosResumen)
  return unwrap(res)
}

/** POST /delivery/cobros/conciliar — 1..100 ítems. HTTP 200 aunque un ítem falle. */
export async function conciliarDeliveryCobros(conciliaciones: DeliveryConciliacionItem[]) {
  const res = await client.post<{ success: true; data: DeliveryConciliacionResultItem[] }>(
    ENDPOINTS.delivery.conciliar,
    { conciliaciones },
  )
  return unwrap(res)
}

// ─── Entregas (§5) ───────────────────────────────────────────────────────────

export async function confirmarDeliveryEntregas(entregas: DeliveryConfirmarItem[]) {
  const res = await client.post<{ success: true; data: DeliveryConfirmarResultItem[] }>(
    ENDPOINTS.delivery.confirmarEntregas,
    { entregas },
  )
  return unwrap(res)
}

/** Anula una venta con entrega fallida/cancelada (NC total + devolución despacho). */
export async function anularFacturaDelivery(invoiceId: string, data: DeliveryAnularDto) {
  const res = await client.post<{ success: true; data: DeliveryAnularResult }>(
    ENDPOINTS.delivery.anularFactura(invoiceId),
    data,
  )
  return unwrap(res)
}

// ─── Viajes (§4.2) ───────────────────────────────────────────────────────────

export interface ListViajesParams extends PaginationParams {
  estado?: DeliveryViajeEstado | string
  repartidor?: string
  fechaDesde?: string
  fechaHasta?: string
  branch?: string
}

export async function listViajes(params?: ListViajesParams) {
  const res = await client.get<PaginatedResponse<DeliveryViaje>>(ENDPOINTS.delivery.viajes, { params })
  return unwrapPaginated(res)
}

export async function getViaje(id: string) {
  const res = await client.get<{ success: true; data: DeliveryViaje }>(ENDPOINTS.delivery.viajeById(id))
  return unwrap(res)
}

export async function createViaje(data: CreateViajeDto) {
  const res = await client.post<{ success: true; data: DeliveryViaje }>(ENDPOINTS.delivery.viajes, data)
  return unwrap(res)
}

/** Solo borrador — 409 `DELIVERY_VIAJE_NO_EDITABLE` si ya se sometió. */
export async function updateViaje(id: string, data: UpdateViajeDto) {
  const res = await client.put<{ success: true; data: DeliveryViaje }>(ENDPOINTS.delivery.viajeById(id), data)
  return unwrap(res)
}

/** Solo borrador — DELETE. */
export async function deleteViaje(id: string) {
  await client.delete(ENDPOINTS.delivery.viajeById(id))
}

export async function despacharViaje(id: string, data?: DespacharViajeDto) {
  const res = await client.post<{ success: true; data: DeliveryViaje }>(
    ENDPOINTS.delivery.viajeDespachar(id),
    data ?? {},
  )
  return unwrap(res)
}

/** Solo si no hay paradas visitadas — motivo 10..500. */
export async function cancelarViaje(id: string, data: CancelarViajeDto) {
  const res = await client.post<{ success: true; data: DeliveryViaje }>(
    ENDPOINTS.delivery.viajeCancelar(id),
    data,
  )
  return unwrap(res)
}

/** Hoja de ruta (PDF). */
export async function getViajePdfBlobUrl(id: string): Promise<string> {
  const res = await client.get<Blob>(ENDPOINTS.delivery.viajePdf(id), { responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

export async function downloadViajePdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.delivery.viajePdf(id), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `hoja-ruta-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Repartidores y vehículos (§4.3) ─────────────────────────────────────────

export interface ListRepartidoresParams extends PaginationParams {
  estado?: string
  q?: string
}

export async function listRepartidores(params?: ListRepartidoresParams) {
  const res = await client.get<PaginatedResponse<DeliveryRepartidor>>(ENDPOINTS.delivery.repartidores, { params })
  return unwrapPaginated(res)
}

export async function getRepartidor(id: string) {
  const res = await client.get<{ success: true; data: DeliveryRepartidor }>(ENDPOINTS.delivery.repartidorById(id))
  return unwrap(res)
}

export async function createRepartidor(data: CreateRepartidorDto) {
  const res = await client.post<{ success: true; data: DeliveryRepartidor }>(ENDPOINTS.delivery.repartidores, data)
  return unwrap(res)
}

export async function updateRepartidor(id: string, data: UpdateRepartidorDto) {
  const res = await client.put<{ success: true; data: DeliveryRepartidor }>(ENDPOINTS.delivery.repartidorById(id), data)
  return unwrap(res)
}

export async function listVehiculos(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<DeliveryVehiculo>>(ENDPOINTS.delivery.vehiculos, { params })
  return unwrapPaginated(res)
}

export async function getVehiculo(id: string) {
  const res = await client.get<{ success: true; data: DeliveryVehiculo }>(ENDPOINTS.delivery.vehiculoById(id))
  return unwrap(res)
}

export async function createVehiculo(data: CreateVehiculoDto) {
  const res = await client.post<{ success: true; data: DeliveryVehiculo }>(ENDPOINTS.delivery.vehiculos, data)
  return unwrap(res)
}

export async function updateVehiculo(id: string, data: UpdateVehiculoDto) {
  const res = await client.put<{ success: true; data: DeliveryVehiculo }>(ENDPOINTS.delivery.vehiculoById(id), data)
  return unwrap(res)
}
