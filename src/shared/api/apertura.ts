import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  AperturaPreflight,
  PrepararAperturaDto,
  AperturaPrepararResult,
  CrearFacturaAperturaVentaDto,
  FacturaAperturaVenta,
  ListAperturaVentasParams,
  ImportarAperturaVentasDto,
  ImportarAperturaVentasResult,
  CrearFacturaAperturaCompraDto,
  FacturaAperturaCompra,
  ListAperturaComprasParams,
  ImportarAperturaComprasDto,
  ImportarAperturaComprasResult,
  AperturaResumen,
  PaginatedResponse,
} from './types'

// Facturas de Apertura (Migración de Saldos) — docs/tasks/PROMPT_APERTURA_FRONTEND.md
// Todos los endpoints crean Y confirman en una sola llamada: no hay borrador ni PUT de edición.

export async function getAperturaPreflight(params: { desde: string; hasta: string }) {
  const res = await client.get<{ success: true; data: AperturaPreflight }>(ENDPOINTS.apertura.preflight, { params })
  return unwrap(res)
}

export async function prepararApertura(dto: PrepararAperturaDto) {
  const res = await client.post<{ success: true; data: AperturaPrepararResult }>(ENDPOINTS.apertura.preparar, dto)
  return unwrap(res)
}

// ── Ventas (CxC) ────────────────────────────────────────────────────────────

export async function crearAperturaVenta(dto: CrearFacturaAperturaVentaDto) {
  const res = await client.post<{ success: true; data: FacturaAperturaVenta }>(ENDPOINTS.apertura.ventas.list, dto)
  return unwrap(res)
}

export async function listAperturaVentas(params?: ListAperturaVentasParams) {
  const res = await client.get<PaginatedResponse<FacturaAperturaVenta>>(ENDPOINTS.apertura.ventas.list, { params })
  return unwrapPaginated(res)
}

export async function getAperturaVenta(id: string) {
  const res = await client.get<{ success: true; data: FacturaAperturaVenta }>(ENDPOINTS.apertura.ventas.byId(id))
  return unwrap(res)
}

export async function cancelarAperturaVenta(id: string) {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.apertura.ventas.cancel(id))
  return unwrap(res)
}

export async function importarAperturaVentas(dto: ImportarAperturaVentasDto) {
  const res = await client.post<{ success: true; data: ImportarAperturaVentasResult }>(
    ENDPOINTS.apertura.ventas.importar,
    dto,
  )
  return unwrap(res)
}

// ── Compras (CxP) ───────────────────────────────────────────────────────────

export async function crearAperturaCompra(dto: CrearFacturaAperturaCompraDto) {
  const res = await client.post<{ success: true; data: FacturaAperturaCompra }>(ENDPOINTS.apertura.compras.list, dto)
  return unwrap(res)
}

export async function listAperturaCompras(params?: ListAperturaComprasParams) {
  const res = await client.get<PaginatedResponse<FacturaAperturaCompra>>(ENDPOINTS.apertura.compras.list, { params })
  return unwrapPaginated(res)
}

export async function getAperturaCompra(id: string) {
  const res = await client.get<{ success: true; data: FacturaAperturaCompra }>(ENDPOINTS.apertura.compras.byId(id))
  return unwrap(res)
}

export async function cancelarAperturaCompra(id: string) {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.apertura.compras.cancel(id))
  return unwrap(res)
}

export async function importarAperturaCompras(dto: ImportarAperturaComprasDto) {
  const res = await client.post<{ success: true; data: ImportarAperturaComprasResult }>(
    ENDPOINTS.apertura.compras.importar,
    dto,
  )
  return unwrap(res)
}

// ── Cuadre ───────────────────────────────────────────────────────────────────

export async function getAperturaResumen() {
  const res = await client.get<{ success: true; data: AperturaResumen }>(ENDPOINTS.apertura.resumen)
  return unwrap(res)
}
