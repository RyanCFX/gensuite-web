import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Despacho,
  CreateDespachoDto,
  UpdateDespachoDto,
  AssignDespachoTrackingDto,
  CancelarDespachoDto,
  ConfirmarStockDespachoDto,
  ConfirmarStockDespachoResult,
  ListDespachosParams,
  ListDespachosPendientesParams,
  DespachoPendienteLinea,
  FacturarDespachoResult,
  PaginatedResponse,
} from './types'

// Despachos (Delivery Note) — docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §2.
// Los tres caminos de creación (crearDespacho, crearDespachoDesdePedido, crearDespachoDesdeFactura)
// NO son intercambiables — cada uno vive en el contexto donde tiene sentido (ver §2.2). Los tres
// devuelven el despacho recién creado en estado "draft", nunca se somete automáticamente.

export async function listDespachos(params?: ListDespachosParams) {
  const res = await client.get<PaginatedResponse<Despacho>>(ENDPOINTS.despachos.list, { params })
  return unwrapPaginated(res)
}

export async function listDespachosPendientes(params?: ListDespachosPendientesParams) {
  const res = await client.get<PaginatedResponse<DespachoPendienteLinea>>(ENDPOINTS.despachos.pendientes, { params })
  return unwrapPaginated(res)
}

export async function getDespacho(id: string) {
  const res = await client.get<{ success: true; data: Despacho }>(ENDPOINTS.despachos.byId(id))
  return unwrap(res)
}

/** Venta mostrador sin pedido previo — el único de los 3 caminos donde el frontend arma el body. */
export async function crearDespacho(dto: CreateDespachoDto) {
  const res = await client.post<{ success: true; data: Despacho }>(ENDPOINTS.despachos.list, dto)
  return unwrap(res)
}

/** Un solo click — el servidor arma el Despacho con todo lo pendiente de ese pedido (aún sin factura). */
export async function crearDespachoDesdePedido(soId: string) {
  const res = await client.post<{ success: true; data: Despacho }>(ENDPOINTS.despachos.desdePedido(soId))
  return unwrap(res)
}

/** Recomendado siempre que exista factura — deja el delivered_qty de la factura exacto. */
export async function crearDespachoDesdeFactura(siId: string) {
  const res = await client.post<{ success: true; data: Despacho }>(ENDPOINTS.despachos.desdeFactura(siId))
  return unwrap(res)
}

/** Reemplazo completo de `items` cuando se envía — solo despachos en Borrador. */
export async function updateDespacho(id: string, dto: UpdateDespachoDto) {
  const res = await client.put<{ success: true; data: Despacho }>(ENDPOINTS.despachos.byId(id), dto)
  return unwrap(res)
}

export async function asignarTrackingDespacho(id: string, dto: AssignDespachoTrackingDto) {
  const res = await client.post<{ success: true; data: Despacho }>(ENDPOINTS.despachos.asignarTracking(id), dto)
  return unwrap(res)
}

/** Solo aplica a un despacho en Borrador — resuelve el faltante de stock transfiriendo desde
 *  `sourceWarehouse` hacia el almacén destino de cada línea. NO somete el despacho; "Someter"
 *  sigue siendo un paso separado y explícito después — docs/tasks/
 *  75_almacen_venta_confirmar_stock_uoms_permitidas.md §2. */
export async function confirmarStockDespacho(id: string, dto: ConfirmarStockDespachoDto) {
  const res = await client.post<{ success: true; data: ConfirmarStockDespachoResult }>(ENDPOINTS.despachos.confirmarStock(id), dto)
  return unwrap(res)
}

/** Solo aplica a un despacho en Borrador (nunca sometido) — un despacho ya sometido se cancela con
 *  cancelarDespacho, nunca se elimina. */
export async function deleteDespacho(id: string) {
  await client.delete(ENDPOINTS.despachos.byId(id))
}

/** Aquí ocurre la salida física real de inventario. */
export async function submitDespacho(id: string) {
  const res = await client.post<{ success: true; data: Despacho }>(ENDPOINTS.despachos.submit(id))
  return unwrap(res)
}

export async function cancelarDespacho(id: string, dto: CancelarDespachoDto) {
  const res = await client.post<{ success: true; data: Despacho }>(ENDPOINTS.despachos.cancel(id), dto)
  return unwrap(res)
}

/** Caso inverso: despachar primero, facturar después. Factura queda en Borrador. */
export async function facturarDespacho(id: string) {
  const res = await client.post<{ success: true; data: FacturarDespachoResult }>(ENDPOINTS.despachos.facturar(id))
  return unwrap(res)
}

/** Solo funciona si el despacho NO tiene una factura sometida encima — ver §2.10 (si ya está
 *  facturado, el servidor rechaza con 400 y hay que redirigir a POST /devoluciones en su lugar). */
export async function devolucionDespacho(id: string) {
  const res = await client.post<{ success: true; data: Despacho }>(ENDPOINTS.despachos.devolucion(id))
  return unwrap(res)
}

export async function downloadDespachoPdf(id: string) {
  const res = await client.get<Blob>(ENDPOINTS.despachos.print(id), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `despacho-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
