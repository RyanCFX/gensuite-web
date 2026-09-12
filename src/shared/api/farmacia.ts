import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CreateLoteDto,
  FacturaElegibleArs,
  FacturarLoteResult,
  FacturasElegiblesResult,
  LoteFacturacionArs,
  LoteFarmaciaEstado,
  PaginatedResponse,
  PaginationParams,
  VincularFacturasDto,
  VincularFacturasResult,
} from './types'

// ─── Lotes de Facturación ARS (docs/PROMPT_FARMACIA_V2_FRONTEND.md §6) ──────
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

export interface FacturasElegiblesParams {
  aseguradora: string
  periodoInicio: string
  periodoFin: string
}

/**
 * Facturas de paciente que el lote puede tomar: sometidas, `estadoArs = "Pendiente"`, sin lote,
 * con `montoCoberturaNeta > 0` y con la cobertura ya cobrada/posteada. Es exactamente lo que
 * acepta `vincularFacturasALote` — el backend devuelve `meta: { total, montoTotal }` además de
 * `data`, así que no se puede usar `unwrapPaginated` (que asume `meta.hasMore`).
 */
export async function listFacturasElegibles(params: FacturasElegiblesParams): Promise<FacturasElegiblesResult> {
  const res = await client.get<{
    success: true
    data: FacturaElegibleArs[]
    meta?: { total?: number; montoTotal?: number }
  }>(ENDPOINTS.farmacia.lotes.facturasElegibles, { params })
  const items = res.data.data ?? []
  return {
    items,
    total: res.data.meta?.total ?? items.length,
    montoTotal: res.data.meta?.montoTotal ?? items.reduce((s, f) => s + (f.montoCoberturaNeta ?? 0), 0),
  }
}

/**
 * Vincula facturas en bloque (1–100). NO aborta por las rechazadas: la respuesta trae
 * `vinculadas` y `rechazadas: [{ factura, motivo }]` — la UI debe mostrar ambas listas.
 */
export async function vincularFacturasALote(id: string, data: VincularFacturasDto) {
  const res = await client.post<{ success: true; data: VincularFacturasResult }>(
    ENDPOINTS.farmacia.lotes.facturas(id),
    data,
  )
  return unwrap(res)
}

export async function desvincularFacturaDeLote(id: string, facturaId: string) {
  const res = await client.delete<{ success: true; data: LoteFacturacionArs }>(
    ENDPOINTS.farmacia.lotes.facturaById(id, facturaId),
  )
  return unwrap(res)
}

export async function marcarLoteEnRevision(id: string) {
  const res = await client.put<{ success: true; data: LoteFacturacionArs }>(ENDPOINTS.farmacia.lotes.enRevision(id))
  return unwrap(res)
}

/**
 * Irreversible: emite la consolidada B01/E31 a la ARS y cierra el lote. Reintentar tras un error
 * de red es seguro — nunca emite dos consolidadas; si ya se creó, la retoma y cierra el lote.
 */
export async function facturarLoteFarmacia(id: string) {
  const res = await client.post<{ success: true; data: FacturarLoteResult }>(ENDPOINTS.farmacia.lotes.facturar(id))
  return unwrap(res)
}

/** Solo A4, y solo con el lote ya `Facturado` (400 en cualquier otro estado). */
export async function downloadLoteFarmaciaPdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.farmacia.lotes.pdf(id), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `lote-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
