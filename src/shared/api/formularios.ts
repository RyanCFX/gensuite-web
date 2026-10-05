// Lecturas de FORMULARIO vía /opciones/... — no exigen permiso de pantalla de administración: las
// autoriza el recurso `lookup.*` que reciben quienes tienen la acción del formulario (crear factura,
// cobrar en caja, compras, gastos…). Mismas formas que los endpoints de administración, salvo el
// detalle de cliente/proveedor (solo campos comerciales; un campo ausente = "no disponible").
// Las pantallas de administración siguen usando sus endpoints de siempre.
import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { CatalogosFiscales, CatalogosFiscalesCompra, CatalogosFiscalesType, CatalogosFiscalesVenta } from './config'
import type {
  Banco, Bundle, ItemStock, ItemUbicacionResponseDto, Item, PaginatedResponse,
  ClienteDetalle, Denominacion, EcfConfig, FacturacionConfig, ItemTaxTemplate, LayawayConfig, ProveedorDetalle,
  RetencionListItem, SemaforoEntry, StockSettings, TaxTemplate,
} from './types'

const E = ENDPOINTS.opcionesForm

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await client.get<{ success: true; data: T }>(url, { params })
  return unwrap(res)
}

export const getFacturacionConfigLookup = () => get<FacturacionConfig>(E.facturacion)
export const getEcfConfigLookup = () => get<EcfConfig>(E.ecf)
export const getStockSettingsLookup = () => get<StockSettings>(E.stockSettings)
export const listDenominacionesLookup = () => get<Denominacion[]>(E.denominaciones)
export const getLayawayConfigLookup = () => get<LayawayConfig>(E.apartados)

export async function getCatalogosFiscalesLookup(params: { type: 'venta' }): Promise<CatalogosFiscalesVenta>
export async function getCatalogosFiscalesLookup(params: { type: 'compra' }): Promise<CatalogosFiscalesCompra>
export async function getCatalogosFiscalesLookup(params?: { type?: CatalogosFiscalesType }): Promise<CatalogosFiscales>
export async function getCatalogosFiscalesLookup(params?: { type?: CatalogosFiscalesType }) {
  return get<CatalogosFiscales>(E.catalogosFiscales, params?.type ? { type: params.type } : undefined)
}

// /opciones/config/impuestos trae los cuatro catálogos juntos: una sola consulta compartida por
// quienes los piden a la vez (impuestos de venta/compra, plantillas de ítem y retenciones).
// Cada bloque se lee por separado: uno que el rol de ERPNext no puede leer viene `null` con su error en
// `errores`, sin tumbar el resto. Un bloque `null` se trata como lista vacía (sin toast).
interface ImpuestosLookup {
  impuestosVentas: TaxTemplate[] | null
  impuestosCompras: TaxTemplate[] | null
  itemTaxTemplates: ItemTaxTemplate[] | null
  retenciones: RetencionListItem[] | { items?: RetencionListItem[]; data?: RetencionListItem[] } | null
  errores?: Record<string, { code?: string; message?: string; statusCode?: number }>
}
let impuestosEnCurso: Promise<ImpuestosLookup> | null = null
function getImpuestosLookup(): Promise<ImpuestosLookup> {
  if (impuestosEnCurso) return impuestosEnCurso
  impuestosEnCurso = get<ImpuestosLookup>(E.impuestos).finally(() => { setTimeout(() => { impuestosEnCurso = null }, 0) })
  return impuestosEnCurso
}
export async function listImpuestosVentasLookup(): Promise<TaxTemplate[]> {
  return (await getImpuestosLookup()).impuestosVentas ?? []
}
export async function listImpuestosComprasLookup(): Promise<TaxTemplate[]> {
  return (await getImpuestosLookup()).impuestosCompras ?? []
}
export async function listItemTaxTemplatesLookup(): Promise<ItemTaxTemplate[]> {
  return (await getImpuestosLookup()).itemTaxTemplates ?? []
}
/** Misma forma que `listRetenciones` (`{ items, meta }`), para no tocar a los consumidores. */
export async function listRetencionesLookup(_params?: unknown) {
  const r = (await getImpuestosLookup()).retenciones ?? []
  const items = Array.isArray(r) ? r : (r?.items ?? r?.data ?? [])
  return { items, meta: { total: items.length, limit: items.length, offset: 0, hasMore: false }, note: undefined as string | undefined }
}

export const getClienteDetalle = (id: string) => get<ClienteDetalle>(E.clienteDetalle(id))
export const getClienteSemaforo = (id: string) => get<SemaforoEntry>(E.clienteSemaforo(id))
export const getProveedorDetalle = (id: string) => get<ProveedorDetalle>(E.proveedorDetalle(id))

// ─── Artículo: variantes, stock y ubicación (sin permisos de Productos/Existencias/Inventario) ──
export const listItemVariantsLookup = (id: string) => get<Item[]>(E.itemVariants(id))

/** Disponibilidad por almacén (`disponible` = físico − reservado). `warehouse` limita y recalcula
 *  totales. Sin costos ni valuación. */
export const getItemStockLookup = (id: string, warehouse?: string) =>
  get<ItemStock>(E.itemStock(id), warehouse ? { warehouse } : undefined)

/** Ubicaciones de un artículo (solo cuando el tenant exige ubicación de venta). `itemCode` obligatorio. */
export async function getItemUbicacionesLookup(itemCode: string, warehouse?: string) {
  const res = await client.get<{ success: true; data: ItemUbicacionResponseDto[]; note?: string }>(E.ubicaciones, {
    params: { itemCode, ...(warehouse ? { warehouse } : {}) },
  })
  return { items: res.data.data ?? [], note: res.data.note }
}

// ─── Combos (buscador de artículos y detalle del combo elegido) ────────────────────────────────
export async function listCombosLookup(params?: { search?: string; limit?: number; offset?: number }) {
  const res = await client.get<PaginatedResponse<Bundle>>(E.combos, { params })
  return unwrapPaginated(res)
}
export const getComboLookup = (id: string) => get<Bundle>(E.comboById(id))

// ─── Bancos (campo Banco de tarjeta/cheque en el cobro) ────────────────────────────────────────
export const listBancosLookup = () => get<Banco[]>(E.bancos)
