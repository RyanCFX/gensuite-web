import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Empresa,
  LogoEmpresaUploadResult,
  CobrosConfig,
  MetodoPago,
  ListaPrecio,
  UOM,
  UOMDetail,
  CreateUOMDto,
  UpdateUOMDto,
  Grupo,
  NcfSerie,
  CreateNcfSerieDto,
  UpdateNcfSerieDto,
  NcfActionResult,
  CuentasEmpresa,
  UpdateCuentasEmpresaDto,
  TaxTemplate,
  ItemTaxTemplate,
  TasaImpuesto,
  CreateTasaImpuestoDto,
  UpdateTasaImpuestoDto,
  FacturacionConfig,
  HabilitarPosDto,
  HabilitarPosResult,
  DeshabilitarPosResult,
  HabilitarDespachoResult,
  DeshabilitarDespachoResult,
  UpdateDespachoFuturoDto,
  LayawayConfig,
  AlmacenListItem,
  CreateAlmacenDto,
  UpdateAlmacenDto,
  PaisCatalogo,
  CurrencyOption,
  Banco,
  Denominacion,
  CreateDenominacionDto,
  UpdateDenominacionDto,
  AccountsSettings,
  UpdateAccountsSettingsDto,
  StockSettings,
  UpdateStockSettingsDto,
  SellingSettings,
  UpdateSellingSettingsDto,
  BuyingSettings,
  UpdateBuyingSettingsDto,
  SeguridadSettings,
  UpdateUOMResult,
  EcfConfig,
  UpdateEcfConfigDto,
  HabilitarFarmaciaResult,
} from './types'

export async function getEmpresa() {
  const res = await client.get<{ success: true; data: Empresa & { phone?: string; address?: string; taxId?: string } }>(ENDPOINTS.config.empresa)
  // El BFF devuelve `phone`/`address`/`taxId`; la UI trabaja con `telefono`/`direccion`/`rnc`.
  const { phone, address, taxId, ...empresa } = unwrap(res)
  return {
    ...empresa,
    telefono: empresa.telefono ?? phone,
    direccion: empresa.direccion ?? address,
    rnc: empresa.rnc ?? taxId,
  } as Empresa
}

export async function updateEmpresa(data: Partial<Empresa>) {
  const res = await client.put<{ success: true; data: Empresa }>(ENDPOINTS.config.empresa, data)
  return unwrap(res)
}

/** Sube/reemplaza el logo de la empresa (multipart). No hay endpoint de eliminar — para quitarlo
 *  hay que subir uno nuevo. El archivo previo queda huérfano en el servidor, no es relevante acá. */
export async function uploadLogoEmpresa(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await client.post<{ success: true; data: LogoEmpresaUploadResult }>(
    ENDPOINTS.config.empresaLogo,
    formData,
    // El cliente fuerza `Content-Type: application/json` por default en toda request — hay que
    // quitarlo para que el navegador ponga el `multipart/form-data; boundary=...` real.
    { headers: { 'Content-Type': undefined } },
  )
  return unwrap(res)
}

export async function getCobrosConfig() {
  const res = await client.get<{ success: true; data: CobrosConfig }>(ENDPOINTS.config.cobros)
  return unwrap(res)
}

export async function updateCobrosConfig(data: Partial<CobrosConfig>) {
  const res = await client.put<{ success: true; data: CobrosConfig }>(ENDPOINTS.config.cobros, data)
  return unwrap(res)
}

export async function getFacturacionConfig() {
  const res = await client.get<{ success: true; data: FacturacionConfig }>(ENDPOINTS.config.facturacion)
  return unwrap(res)
}

export async function updateFacturacionConfig(data: Partial<FacturacionConfig>) {
  const res = await client.put<{ success: true; data: FacturacionConfig }>(ENDPOINTS.config.facturacion, data)
  return unwrap(res)
}

// Idempotente: activa el módulo POS (o reintenta si algo falló a mitad de camino).
export async function habilitarPos(data: HabilitarPosDto) {
  const res = await client.post<{ success: true; data: HabilitarPosResult }>(ENDPOINTS.config.posHabilitar, data)
  return unwrap(res)
}

export async function deshabilitarPos() {
  const res = await client.post<{ success: true; data: DeshabilitarPosResult }>(ENDPOINTS.config.posDeshabilitar)
  return unwrap(res)
}

// Idempotente del lado servidor. Éxito: refrescar `['facturacion-config']` antes de navegar (§1.3).
export async function habilitarDespacho() {
  const res = await client.post<{ success: true; data: HabilitarDespachoResult }>(ENDPOINTS.config.despachoHabilitar)
  return unwrap(res)
}

// Puede fallar con 409 — `error.details` trae `DesactivarDespachoBloqueos` (IDs concretos a resolver).
export async function deshabilitarDespacho() {
  const res = await client.post<{ success: true; data: DeshabilitarDespachoResult }>(ENDPOINTS.config.despachoDeshabilitar)
  return unwrap(res)
}

// docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md §2.1 — la respuesta es solo un mensaje, no el
// estado final: volver a pedir getFacturacionConfig() después de un PUT exitoso para refrescar.
export async function actualizarDespachoFuturo(data: UpdateDespachoFuturoDto) {
  const res = await client.put<{ success: true; data: { message: string } }>(ENDPOINTS.config.despachoFuturo, data)
  return unwrap(res)
}

export async function getLayawayConfig() {
  const res = await client.get<{ success: true; data: LayawayConfig }>(ENDPOINTS.config.apartados)
  return unwrap(res)
}

export async function updateLayawayConfig(data: Partial<LayawayConfig>) {
  const res = await client.put<{ success: true; data: LayawayConfig }>(ENDPOINTS.config.apartados, data)
  return unwrap(res)
}

export async function listMetodosPago() {
  const res = await client.get<{ success: true; data: MetodoPago[] }>(ENDPOINTS.config.metodosPago)
  return unwrap(res)
}

export async function createMetodoPago(data: Omit<MetodoPago, 'disabled'>) {
  const res = await client.post<{ success: true; data: MetodoPago }>(ENDPOINTS.config.metodosPago, data)
  return unwrap(res)
}

export async function updateMetodoPago(id: string, data: Partial<MetodoPago>) {
  const res = await client.put<{ success: true; data: MetodoPago }>(ENDPOINTS.config.metodosPagoById(id), data)
  return unwrap(res)
}

export async function listBancos() {
  const res = await client.get<{ success: true; data: Banco[] }>(ENDPOINTS.config.bancos)
  return unwrap(res)
}

export async function listDenominaciones() {
  const res = await client.get<{ success: true; data: Denominacion[] }>(ENDPOINTS.config.denominaciones)
  return unwrap(res)
}

export async function createDenominacion(data: CreateDenominacionDto) {
  const res = await client.post<{ success: true; data: Denominacion }>(ENDPOINTS.config.denominaciones, data)
  return unwrap(res)
}

export async function updateDenominacion(id: string, data: UpdateDenominacionDto) {
  const res = await client.put<{ success: true; data: Denominacion }>(ENDPOINTS.config.denominacionesById(id), data)
  return unwrap(res)
}

export async function listAlmacenes(params?: { branch?: string }) {
  // GET /config/almacenes devuelve el tipo de almacén como `type`, no `warehouseType`
  // (a diferencia de Create/UpdateAlmacenDto, que sí usan `warehouseType` en el body) —
  // normalizamos acá para que el resto del frontend use un solo nombre de campo.
  const res = await client.get<{ success: true; data: (AlmacenListItem & { type?: string | null })[] }>(
    ENDPOINTS.config.almacenes,
    { params },
  )
  const items = unwrap(res)
  return items.map(({ type, ...item }) => ({ ...item, warehouseType: item.warehouseType ?? type ?? undefined }))
}

export async function createAlmacen(data: CreateAlmacenDto) {
  const res = await client.post<{ success: true; data: unknown }>(ENDPOINTS.config.almacenes, data)
  return unwrap(res)
}

export async function updateAlmacen(id: string, data: UpdateAlmacenDto) {
  const res = await client.put<{ success: true; data: unknown }>(`${ENDPOINTS.config.almacenes}/${id}`, data)
  return unwrap(res)
}

export async function deleteAlmacen(id: string) {
  await client.delete(`${ENDPOINTS.config.almacenes}/${id}`)
}

export async function listUOMs() {
  const res = await client.get<{ success: true; data: UOM[] }>(ENDPOINTS.config.uom)
  return unwrap(res)
}

export async function createUOM(data: CreateUOMDto) {
  const res = await client.post<{ success: true; data: UOM }>(ENDPOINTS.config.uom, data)
  return unwrap(res)
}

export async function getUOM(id: string) {
  const res = await client.get<{ success: true; data: UOMDetail }>(ENDPOINTS.config.uomById(id))
  return unwrap(res)
}

export async function updateUOM(id: string, data: UpdateUOMDto) {
  const res = await client.put<{ success: true; data: UpdateUOMResult }>(ENDPOINTS.config.uomById(id), data)
  return unwrap(res)
}

export async function getEcfConfig() {
  const res = await client.get<{ success: true; data: EcfConfig }>(ENDPOINTS.config.ecf)
  return unwrap(res)
}

export async function updateEcfConfig(data: UpdateEcfConfigDto) {
  const res = await client.put<{ success: true; data: EcfConfig }>(ENDPOINTS.config.ecf, data)
  return unwrap(res)
}

export async function listListasPrecio() {
  const res = await client.get<{ success: true; data: ListaPrecio[] }>(ENDPOINTS.config.listasPrecio)
  return unwrap(res)
}

export async function createListaPrecio(data: Pick<ListaPrecio, 'name' | 'currency' | 'buying' | 'selling'>) {
  const res = await client.post<{ success: true; data: ListaPrecio }>(ENDPOINTS.config.listasPrecio, data)
  return unwrap(res)
}

export async function listGruposClientes() {
  const res = await client.get<{ success: true; data: Grupo[] }>(ENDPOINTS.config.gruposClientes)
  return unwrap(res)
}

export async function getGrupoCliente(id: string) {
  const res = await client.get<{ success: true; data: Grupo }>(`${ENDPOINTS.config.gruposClientes}/${id}`)
  return unwrap(res)
}

export async function createGrupoCliente(data: Grupo) {
  const res = await client.post<{ success: true; data: Grupo }>(ENDPOINTS.config.gruposClientes, data)
  return unwrap(res)
}

export async function updateGrupoCliente(id: string, data: Partial<Grupo & { priceTier?: 'A' | 'B' | 'C' }>) {
  const res = await client.put<{ success: true; data: Grupo }>(`${ENDPOINTS.config.gruposClientes}/${id}`, data)
  return unwrap(res)
}

export async function deleteGrupoCliente(id: string) {
  await client.delete(`${ENDPOINTS.config.gruposClientes}/${id}`)
}

export async function listGruposProveedores() {
  const res = await client.get<{ success: true; data: Grupo[] }>(ENDPOINTS.config.gruposProveedores)
  return unwrap(res)
}

export async function createGrupoProveedor(data: Grupo) {
  const res = await client.post<{ success: true; data: Grupo }>(ENDPOINTS.config.gruposProveedores, data)
  return unwrap(res)
}

export async function getNcfSeries() {
  const res = await client.get<{ success: true; data: NcfSerie[] }>(ENDPOINTS.config.ncf)
  return unwrap(res)
}

export async function getNcfSerie(id: number) {
  const res = await client.get<{ success: true; data: NcfSerie }>(ENDPOINTS.config.ncfById(id))
  return unwrap(res)
}

export async function createNcfSerie(data: CreateNcfSerieDto) {
  const res = await client.post<{ success: true; data: { id: number } }>(ENDPOINTS.config.ncf, data)
  return unwrap(res)
}

export async function updateNcfSerie(id: number, data: UpdateNcfSerieDto) {
  const res = await client.put<{ success: true; data: NcfSerie & { warnings?: string[] } }>(
    ENDPOINTS.config.ncfById(id),
    data,
  )
  return unwrap(res)
}

export async function disableNcfSerie(id: number) {
  const res = await client.post<{ success: true; data: NcfActionResult }>(ENDPOINTS.config.ncfDisable(id))
  return unwrap(res)
}

export async function enableNcfSerie(id: number) {
  const res = await client.post<{ success: true; data: NcfActionResult }>(ENDPOINTS.config.ncfEnable(id))
  return unwrap(res)
}

export async function getPerfil() {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.config.perfil)
  return unwrap(res)
}

export async function updatePerfil(data: Record<string, unknown>) {
  const res = await client.put<{ success: true; data: unknown }>(ENDPOINTS.config.perfil, data)
  return unwrap(res)
}

export async function getCuentasEmpresa() {
  const res = await client.get<{ success: true; data: CuentasEmpresa }>(ENDPOINTS.config.cuentasEmpresa)
  return unwrap(res)
}

export async function updateCuentasEmpresa(data: UpdateCuentasEmpresaDto) {
  const res = await client.put<{ success: true; data: CuentasEmpresa }>(ENDPOINTS.config.cuentasEmpresa, data)
  return unwrap(res)
}

// ─── Tax Templates — Ventas (solo lectura: ahora se gestionan desde tasas-impuesto) ─────

export async function listImpuestosVentas(): Promise<TaxTemplate[]> {
  const res = await client.get<{ success: true; data: TaxTemplate[] }>(ENDPOINTS.config.impuestosVentas)
  return unwrap(res)
}

// ─── Tax Templates — Compras (solo lectura: ahora se gestionan desde tasas-impuesto) ────

export async function listImpuestosCompras(): Promise<TaxTemplate[]> {
  const res = await client.get<{ success: true; data: TaxTemplate[] }>(ENDPOINTS.config.impuestosCompras)
  return unwrap(res)
}

// ─── Item Tax Templates (solo lectura: ahora se gestionan desde tasas-impuesto) ─────────

export async function listItemTaxTemplates(): Promise<ItemTaxTemplate[]> {
  const res = await client.get<{ success: true; data: ItemTaxTemplate[] }>(ENDPOINTS.config.itemTaxTemplates)
  return unwrap(res)
}

export async function getItemTaxTemplate(id: string): Promise<ItemTaxTemplate> {
  const res = await client.get<{ success: true; data: ItemTaxTemplate }>(ENDPOINTS.config.itemTaxTemplatesById(id))
  return unwrap(res)
}

// ─── Tasas de Impuesto (catálogo base + combos) ───────────────────────────────

export async function listTasasImpuesto(): Promise<TasaImpuesto[]> {
  const res = await client.get<{ success: true; data: TasaImpuesto[] }>(ENDPOINTS.config.tasasImpuesto)
  return unwrap(res)
}

export async function getTasaImpuesto(id: string): Promise<TasaImpuesto> {
  const res = await client.get<{ success: true; data: TasaImpuesto }>(ENDPOINTS.config.tasasImpuestoById(id))
  return unwrap(res)
}

export async function createTasaImpuesto(data: CreateTasaImpuestoDto): Promise<TasaImpuesto> {
  const res = await client.post<{ success: true; data: TasaImpuesto }>(ENDPOINTS.config.tasasImpuesto, data)
  return unwrap(res)
}

export async function updateTasaImpuesto(id: string, data: UpdateTasaImpuestoDto): Promise<TasaImpuesto> {
  const res = await client.put<{ success: true; data: TasaImpuesto }>(ENDPOINTS.config.tasasImpuestoById(id), data)
  return unwrap(res)
}

export async function deleteTasaImpuesto(id: string): Promise<void> {
  await client.delete(ENDPOINTS.config.tasasImpuestoById(id))
}

// ─── Ajustes avanzados (Settings singletons) ──────────────────────────────────

export async function getAccountsSettings() {
  const res = await client.get<{ success: true; data: AccountsSettings }>(ENDPOINTS.settings.accounts)
  return unwrap(res)
}

export async function updateAccountsSettings(data: UpdateAccountsSettingsDto) {
  const res = await client.put<{ success: true; data: AccountsSettings }>(ENDPOINTS.settings.accounts, data)
  return unwrap(res)
}

export async function getStockSettings() {
  const res = await client.get<{ success: true; data: StockSettings }>(ENDPOINTS.settings.stock)
  return unwrap(res)
}

export async function updateStockSettings(data: UpdateStockSettingsDto) {
  const res = await client.put<{ success: true; data: StockSettings }>(ENDPOINTS.settings.stock, data)
  return unwrap(res)
}

export async function getSellingSettings() {
  const res = await client.get<{ success: true; data: SellingSettings }>(ENDPOINTS.settings.selling)
  return unwrap(res)
}

export async function updateSellingSettings(data: UpdateSellingSettingsDto) {
  const res = await client.put<{ success: true; data: SellingSettings }>(ENDPOINTS.settings.selling, data)
  return unwrap(res)
}

export async function getBuyingSettings() {
  const res = await client.get<{ success: true; data: BuyingSettings }>(ENDPOINTS.settings.buying)
  return unwrap(res)
}

export async function updateBuyingSettings(data: UpdateBuyingSettingsDto) {
  const res = await client.put<{ success: true; data: BuyingSettings }>(ENDPOINTS.settings.buying, data)
  return unwrap(res)
}

/** Solo lectura — docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §9, no hay PUT: no queda nada
 *  configurable por tenant en Seguridad. */
export async function getSeguridadSettings() {
  const res = await client.get<{ success: true; data: SeguridadSettings }>(ENDPOINTS.settings.seguridad)
  return unwrap(res)
}

export interface CatalogoFiscalItem {
  value: string
  label: string
}

// GET /config/catalogos-fiscales — la forma depende de `?type` (ver descripción del endpoint
// en openapi.json, tag Configuración, operación catalogos-fiscales):
// - `?type=venta`: solo el bloque de venta (`ncfTypes` + `ncfTypesFisicos`).
// - `?type=compra`: solo el bloque de compra (`ncfTypesCompra`, con B0x y sus E0x).
// - sin `type`: ambos bloques (no usar en pantallas nuevas).
// `tipoBienes606`, `formaPago606` y `facturacionElectronicaHabilitada` vienen siempre,
// sin importar el `type`.
export interface CatalogosFiscalesBase {
  tipoBienes606: CatalogoFiscalItem[]
  formaPago606: CatalogoFiscalItem[]
  facturacionElectronicaHabilitada: boolean
}

/** Respuesta con `?type=venta` — `ncfTypes` trae E31/E32… si e-CF está habilitado, B0x si no. */
export interface CatalogosFiscalesVenta extends CatalogosFiscalesBase {
  /** Tipos para emitir en venta (electrónicos E3x/E4x o físicos B0x según el tenant). */
  ncfTypes: CatalogoFiscalItem[]
  /** Siempre B0x — solo para el selector de tipo al crear una secuencia en /config/ncf. */
  ncfTypesFisicos: CatalogoFiscalItem[]
}

/** Respuesta con `?type=compra` — selector de tipo de comprobante del proveedor. */
export interface CatalogosFiscalesCompra extends CatalogosFiscalesBase {
  /** Siempre B0x + sus equivalentes E0x. */
  ncfTypesCompra: CatalogoFiscalItem[]
}

/** Respuesta sin `type` (ambos bloques). Ninguna pantalla nueva debe pedirla así. */
export interface CatalogosFiscales extends CatalogosFiscalesBase {
  ncfTypes?: CatalogoFiscalItem[]
  /** Ausente cuando se pide con `?type=compra`. */
  ncfTypesFisicos?: CatalogoFiscalItem[]
  /** Ausente cuando se pide con `?type=venta` (docs/tasks/
   *  PROMPT_NCF_DEFAULT_REGIMENES_ESPECIALES_REDONDEO_FRONTEND.md §3). */
  ncfTypesCompra?: CatalogoFiscalItem[]
}

export type CatalogosFiscalesType = 'venta' | 'compra'

export async function getCatalogosFiscales(params: { type: 'venta' }): Promise<CatalogosFiscalesVenta>
export async function getCatalogosFiscales(params: { type: 'compra' }): Promise<CatalogosFiscalesCompra>
export async function getCatalogosFiscales(params?: { type?: CatalogosFiscalesType }): Promise<CatalogosFiscales>
export async function getCatalogosFiscales(params?: { type?: CatalogosFiscalesType }) {
  const res = await client.get<{ success: true; data: CatalogosFiscales }>(ENDPOINTS.config.catalogosFiscales, {
    params: params?.type ? { type: params.type } : undefined,
  })
  return unwrap(res)
}

export async function listPaises(): Promise<PaisCatalogo[]> {
  const res = await client.get<{ success: true; data: PaisCatalogo[] }>(ENDPOINTS.config.paises)
  return unwrap(res)
}

export async function listCurrencies(): Promise<CurrencyOption[]> {
  const res = await client.get<{ success: true; data: CurrencyOption[] }>(ENDPOINTS.config.currencies)
  return unwrap(res)
}

// POST /config/farmacia/habilitar — sin body, idempotente (docs/PROMPT_FARMACIA_V2_FRONTEND.md §9).
// Response no documentada en openapi.json.
/**
 * Idempotente: crea en ERPNext todo lo que el vertical Farmacia ARS necesita — cuenta puente,
 * modo de pago "Cobertura ARS", grupo de clientes "ARS", perfiles, ítem de reclasificación del
 * lote y la plantilla de impresión "Factura Farmacia"
 * (docs/PROMPT_FARMACIA_V2_FRONTEND.md §9). Devuelve lo que quedó provisionado.
 */
export async function habilitarFarmacia(): Promise<HabilitarFarmaciaResult> {
  const res = await client.post<{ success: true; data?: HabilitarFarmaciaResult }>(ENDPOINTS.config.farmaciaHabilitar)
  return res.data?.data ?? {}
}
