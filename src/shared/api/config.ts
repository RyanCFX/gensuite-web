import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Empresa,
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
  UpdateSeguridadSettingsDto,
} from './types'

export async function getEmpresa() {
  const res = await client.get<{ success: true; data: Empresa }>(ENDPOINTS.config.empresa)
  return unwrap(res)
}

export async function updateEmpresa(data: Partial<Empresa>) {
  const res = await client.put<{ success: true; data: Empresa }>(ENDPOINTS.config.empresa, data)
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
  const res = await client.put<{ success: true; data: MetodoPago }>(`${ENDPOINTS.config.metodosPago}/${id}`, data)
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
  const res = await client.put<{ success: true; data: { id: string } }>(ENDPOINTS.config.uomById(id), data)
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

export async function getSeguridadSettings() {
  const res = await client.get<{ success: true; data: SeguridadSettings }>(ENDPOINTS.settings.seguridad)
  return unwrap(res)
}

export async function updateSeguridadSettings(data: UpdateSeguridadSettingsDto) {
  const res = await client.put<{ success: true; data: SeguridadSettings }>(ENDPOINTS.settings.seguridad, data)
  return unwrap(res)
}

export interface CatalogoFiscalItem {
  value: string
  label: string
}

export interface CatalogosFiscales {
  ncfTypes: CatalogoFiscalItem[]
  ncfTypesCompra: CatalogoFiscalItem[]
  tipoBienes606: CatalogoFiscalItem[]
  formaPago606: CatalogoFiscalItem[]
}

export async function getCatalogosFiscales() {
  const res = await client.get<{ success: true; data: CatalogosFiscales }>(ENDPOINTS.config.catalogosFiscales)
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
