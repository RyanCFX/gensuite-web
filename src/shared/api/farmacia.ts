import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CobrarDespachoDto,
  CobrarDespachoResult,
  CreateDespachoDto,
  CreateLoteDto,
  CreatePreaprobacionDto,
  DespachoEstado,
  DespachoProvisionalArs,
  LoteFacturacionArs,
  LoteFarmaciaEstado,
  PaginatedResponse,
  PaginationParams,
  Preaprobacion,
  PreaprobacionEstado,
  UpdatePreaprobacionDto,
  VincularDespachoDto,
} from './types'

// ─── Preaprobaciones ────────────────────────────────────────────────────────

export interface ListPreaprobacionesParams extends PaginationParams {
  estado?: PreaprobacionEstado
  aseguradora?: string
  cliente?: string
}

export async function listPreaprobaciones(params?: ListPreaprobacionesParams) {
  const res = await client.get<PaginatedResponse<Preaprobacion>>(ENDPOINTS.farmacia.preaprobaciones.list, { params })
  return unwrapPaginated(res)
}

export async function getPreaprobacion(id: string) {
  const res = await client.get<{ success: true; data: Preaprobacion }>(ENDPOINTS.farmacia.preaprobaciones.byId(id))
  return unwrap(res)
}

export async function createPreaprobacion(data: CreatePreaprobacionDto) {
  const res = await client.post<{ success: true; data: Preaprobacion }>(ENDPOINTS.farmacia.preaprobaciones.list, data)
  return unwrap(res)
}

export async function updatePreaprobacion(id: string, data: UpdatePreaprobacionDto) {
  const res = await client.put<{ success: true; data: Preaprobacion }>(ENDPOINTS.farmacia.preaprobaciones.byId(id), data)
  return unwrap(res)
}

export async function recalcularPreaprobacion(id: string) {
  const res = await client.post<{ success: true; data: Preaprobacion }>(ENDPOINTS.farmacia.preaprobaciones.recalcular(id))
  return unwrap(res)
}

export async function confirmarPreaprobacion(id: string) {
  const res = await client.post<{ success: true; data: Preaprobacion }>(ENDPOINTS.farmacia.preaprobaciones.confirmar(id))
  return unwrap(res)
}

// ─── Despachos ──────────────────────────────────────────────────────────────

export interface ListDespachosParams extends PaginationParams {
  estado?: DespachoEstado
  preaprobacion?: string
  lote?: string
  sinLote?: boolean
}

export async function listDespachos(params?: ListDespachosParams) {
  const res = await client.get<PaginatedResponse<DespachoProvisionalArs>>(ENDPOINTS.farmacia.despachos.list, { params })
  return unwrapPaginated(res)
}

export async function getDespacho(id: string) {
  const res = await client.get<{ success: true; data: DespachoProvisionalArs }>(ENDPOINTS.farmacia.despachos.byId(id))
  return unwrap(res)
}

export async function createDespacho(data: CreateDespachoDto) {
  const res = await client.post<{ success: true; data: DespachoProvisionalArs }>(ENDPOINTS.farmacia.despachos.list, data)
  return unwrap(res)
}

export async function cobrarDespacho(id: string, data: CobrarDespachoDto) {
  const res = await client.post<{ success: true; data: CobrarDespachoResult }>(ENDPOINTS.farmacia.despachos.cobrar(id), data)
  return unwrap(res)
}

export async function downloadDespachoPdf(id: string, formato?: 'a4' | 'carta' | 'a6', filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.farmacia.despachos.pdf(id), {
    params: formato ? { formato } : undefined,
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `despacho-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Lotes de Facturación ───────────────────────────────────────────────────
// Nombradas explícitamente con sufijo "Farmacia" — `listLotes`/`getLote` ya existen en
// `./inventory.ts` para lotes de inventario (batch), un concepto completamente distinto.

export interface ListLotesFarmaciaParams extends PaginationParams {
  estado?: LoteFarmaciaEstado
  aseguradora?: string
}

export async function listLotesFarmacia(params?: ListLotesFarmaciaParams) {
  const res = await client.get<PaginatedResponse<LoteFacturacionArs>>(ENDPOINTS.farmacia.lotes.list, { params })
  return unwrapPaginated(res)
}

export async function getLoteFarmacia(id: string) {
  const res = await client.get<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.byId(id))
  return unwrap(res)
}

export async function createLoteFarmacia(data: CreateLoteDto) {
  const res = await client.post<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.list, data)
  return unwrap(res)
}

export async function recalcularLoteFarmacia(id: string) {
  const res = await client.post<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.recalcular(id))
  return unwrap(res)
}

export async function vincularDespachoALote(id: string, data: VincularDespachoDto) {
  const res = await client.post<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.despachos(id), data)
  return unwrap(res)
}

export async function desvincularDespachoDeLote(id: string, despachoId: string) {
  const res = await client.delete<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.despachoById(id, despachoId))
  return unwrap(res)
}

export async function marcarLoteEnRevision(id: string) {
  const res = await client.put<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.enRevision(id))
  return unwrap(res)
}

export async function facturarLoteFarmacia(id: string) {
  const res = await client.post<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.facturar(id))
  return unwrap(res)
}

export async function downloadLoteFarmaciaPdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.farmacia.lotes.pdf(id), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `lote-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
