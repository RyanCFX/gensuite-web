// ─── Universal API Response Shapes ───────────────────────────────────────────

export interface ApiError {
  code: string
  message: string
  statusCode: number
}

export interface ApiResponse<T> {
  success: true
  data: T
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  meta: PaginationMeta
}

export interface PaginationMeta {
  total: number
  limit: number
  offset: number
  hasMore: boolean
  defaultPriceTier?: 'A' | 'B' | 'C'
}

export interface ApiErrorResponse {
  success: false
  error: ApiError
}

// ─── Generic Pagination Params ────────────────────────────────────────────────

export interface PaginationParams {
  limit?: number
  offset?: number
  search?: string
  orderBy?: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string
  password: string
  tenant?: string
}

export interface AuthTenant {
  slug: string
  siteUrl: string
  id: string
}

export interface AuthUser {
  email: string
  full_name: string
  roles: string[]
  defaultWarehouse?: string
  warehouses?: string[]
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  tenant: AuthTenant
  user: AuthUser
}

export interface JwtPayload {
  sub: string
  tenant: string
  ak: string
  ask: string
  defaultWarehouse?: string
  warehouses?: string[]
  iat: number
  exp: number
}

// ─── Customer ─────────────────────────────────────────────────────────────────
// API schema: CreateCustomerDto does NOT have tipoIdentificacion.
// Identification type is inferred from rnc/cedula presence.

export interface Customer {
  id: string
  customerName: string
  customerType: 'Company' | 'Individual'
  rnc?: string
  cedula?: string
  email?: string
  phone?: string
  address?: string
  isCompany: boolean
  hasCredit: boolean
  isGovernment: boolean
  creditLimit: number
  creditDays: number
  emailInvoice?: string
  birthday?: string
  photo?: string
  disabled: boolean
  customerGroup?: string
  priceTier?: 'A' | 'B' | 'C'
  createdAt: string
  modifiedAt: string
}

export interface CreateCustomerDto {
  customerName: string
  customerType: 'Company' | 'Individual'
  // NOTE: tipoIdentificacion does NOT exist in BFF — removed.
  rnc?: string
  cedula?: string
  email?: string
  phone?: string
  address?: string
  isCompany?: boolean
  hasCredit?: boolean
  isGovernment?: boolean
  creditLimit?: number
  creditDays?: number
  emailInvoice?: string
  birthday?: string
  photo?: string
  customerGroup?: string
}

export type UpdateCustomerDto = Partial<Omit<CreateCustomerDto, 'customerType'>> & {
  customerType?: 'Company' | 'Individual'
}

// ─── Supplier ─────────────────────────────────────────────────────────────────
// tipoIdentificacion IS required for suppliers.

export interface Supplier {
  id: string
  supplierName: string
  supplierType: 'Company' | 'Individual'
  tipoIdentificacion?: 'RNC' | 'Cedula' | 'Pasaporte' | 'NIT'
  rnc?: string
  cedula?: string
  esProveedorExterior: boolean
  paisOrigen?: string
  banco?: string
  tipoCuenta?: string         // 'Corriente' | 'Ahorro'
  numeroCuenta?: string
  abaSwift?: string
  tipoProveedor606?: string
  diasCredito: number
  supplierGroup?: string
  paymentTerms?: string
  emailId?: string
  emailPagos?: string
  mobileNo?: string
  address?: string
  disabled: boolean
  balance: number
  createdAt: string
  modifiedAt: string
}

export interface CreateProveedorDto {
  supplierName: string
  supplierType: 'Company' | 'Individual'
  tipoIdentificacion: 'RNC' | 'Cedula' | 'Pasaporte' | 'NIT'   // required for suppliers
  rnc?: string
  cedula?: string
  esProveedorExterior?: boolean
  paisOrigen?: string
  banco?: string
  tipoCuenta?: 'Corriente' | 'Ahorro'
  numeroCuenta?: string
  abaSwift?: string
  tipoProveedor606?: string
  diasCredito?: number
  supplierGroup?: string
  paymentTerms?: string
  emailId?: string
  emailPagos?: string
  mobileNo?: string
  address?: string
}

export type UpdateProveedorDto = Partial<CreateProveedorDto>

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  itemCode: string
  description?: string
  qty: number
  rate: number
  discountPct?: number
  discountedRate?: number
  amount: number
  uom: string
  warehouse?: string
  notes?: string
}

export interface Invoice {
  id: string
  status: 'draft' | 'submitted' | 'cancelled'
  paymentStatus?: 'unpaid' | 'partly_paid' | 'paid' | null
  customer: string
  customerName: string
  postingDate: string
  dueDate: string
  ncf?: string
  ncfType?: string
  subtotal: number
  grandTotal: number
  outstandingAmount: number
  items: InvoiceItem[]
  notes?: string
  amendedFrom?: string
  sequence: number
  history?: AmendmentEntry[]
  createdAt: string
  modifiedAt: string
}

export interface CreateInvoiceDto {
  customer: string
  postingDate: string
  dueDate?: string
  ncfType: 'B01' | 'B02' | 'B14' | 'B15' | 'B16'
  items: {
    itemCode: string
    description?: string
    qty: number
    rate: number
    uom?: string
    discountPct?: number
  }[]
  notes?: string
}

export interface UpdateInvoiceDto {
  customer?: string
  postingDate?: string
  dueDate?: string
  ncfType?: 'B01' | 'B02' | 'B14' | 'B15' | 'B16'
  items?: {
    itemCode: string
    description?: string
    qty: number
    rate: number
    uom?: string
    discountPct?: number
  }[]
  notes?: string
}

// POST /invoices/:id/submit — optional body to control cash vs. credit at submit time
export interface SubmitInvoiceDto {
  /** Force cash payment even if the customer has credit. */
  payCash?: boolean
  /** ERPNext Mode of Payment name. Required whenever the invoice is paid cash (forced or automatic). */
  modeOfPayment?: string
}

// ─── Quotation ────────────────────────────────────────────────────────────────

export interface QuotationItem {
  itemCode: string
  description?: string
  qty: number
  rate: number
  discountPct?: number
  discountedRate?: number
  amount: number
  uom: string
  notes?: string
}

export interface Quotation {
  id: string
  customer: string
  customerName: string
  date: string
  validTill: string
  status: 'draft' | 'submitted' | 'ordered' | 'lost' | 'cancelled'
  items: QuotationItem[]
  notes?: string
  amendedFrom?: string
  sequence: number
  history?: AmendmentEntry[]
  grandTotal?: number
  message?: string
}

export interface CreateQuotationDto {
  customer: string
  date: string               // required per API
  validTill?: string
  items: {
    itemCode: string
    description?: string
    qty: number
    rate: number
    uom?: string
    discountPct?: number
  }[]
  notes?: string
}

export type UpdateQuotationDto = Partial<CreateQuotationDto>

// ─── Credit / Debit Notes ─────────────────────────────────────────────────────
// CreateCreditNoteDto: originalInvoice (not invoiceId), postingDate required.
// CreateDebitNoteDto: uses customer (not invoiceId).

export interface CreditNote {
  id: string
  status: 'Draft' | 'Submitted' | 'Cancelled'
  originalInvoice: string
  reason?: string
  grandTotal: number
  ncf?: string
  postingDate: string
  createdAt: string
}

export interface CreateCreditNoteDto {
  originalInvoice: string    // field name corrected from invoiceId
  postingDate: string        // required
  items: {
    itemCode: string
    qty: number
    rate: number
    uom?: string
  }[]
  reason?: string
}

export interface DebitNote {
  id: string
  status: 'Draft' | 'Submitted' | 'Cancelled'
  customer: string
  grandTotal: number
  ncf?: string
  postingDate: string
  createdAt: string
}

export interface CreateDebitNoteDto {
  customer: string           // debit notes use customer, not invoiceId
  postingDate: string        // required
  items: {
    itemCode: string
    qty: number
    rate: number
    uom?: string
  }[]
  notes?: string
}

// ─── Item / Catalog ───────────────────────────────────────────────────────────

export interface ItemUomConversion {
  uom: string
  conversionFactor: number
}

// Barcode entry
export interface ItemBarcode {
  barcode: string
  barcodeType: string
}

// Bundle / Combo
export interface BundleComponent {
  itemCode: string
  itemName?: string
  qty: number
  stockQty?: number
}

export interface Bundle {
  id: string
  itemName: string
  totalItems?: number
  components: BundleComponent[]
  prices?: { A?: number; B?: number; C?: number }
  disabled: boolean
}

export interface CreateBundleDto {
  itemCode?: string
  itemName: string
  components: { itemCode: string; qty: number }[]
  priceA?: number
  priceB?: number
  priceC?: number
}

export type UpdateBundleDto = Partial<CreateBundleDto>

// Item Prices
export interface ItemPrices {
  A?: number
  B?: number
  C?: number
}

export interface Item {
  id: string
  itemName: string
  category: string
  categoryName?: string
  subcategory?: string
  subcategoryName?: string
  brand?: string
  brandName?: string
  type: 'product' | 'service'
  standardRate: number
  prices?: ItemPrices
  valuationRate?: number
  currentStock?: number
  internalDescription?: string
  shortName?: string
  notes?: string
  hasWarranty?: boolean
  warrantyPeriod?: number
  barcodes?: ItemBarcode[]
  image?: string
  disabled: boolean
  stockUom?: string
  uoms?: ItemUomConversion[]
  hasVariants?: boolean
  variantOf?: string
  attributes?: TemplateAttribute[]
  priceMode?: 'manual' | 'cost_plus'
  marginA?: number
  marginB?: number
  marginC?: number
  allowsDiscount?: boolean
  maxDiscountPct?: number
  trackingType?: 'none' | 'batch' | 'serial'
  purchaseTaxTemplate?: string
  purchaseTaxPct?: number
  salesTaxTemplate?: string
  salesTaxPct?: number
  purchasePriceDate?: string
  salesPriceDate?: string
}

export interface CreateItemDto {
  itemCode?: string           // optional, BFF can auto-generate
  itemName: string
  category: string
  subcategory?: string
  brand?: string
  type: 'product' | 'service'
  standardRate?: number       // deprecated — use prices
  prices?: ItemPrices
  priceA?: number
  priceB?: number
  priceC?: number
  valuationRate?: number
  internalDescription?: string
  shortName?: string
  notes?: string
  hasWarranty?: boolean
  warrantyPeriod?: number
  barcodes?: ItemBarcode[]
  image?: string
  defaultWarehouse?: string
  stockUom?: string
  hasVariants?: boolean
  attributes?: { attribute: string }[]  // for templates: just attribute names
  priceMode?: 'manual' | 'cost_plus'
  marginA?: number
  marginB?: number
  marginC?: number
  allowsDiscount?: boolean
  maxDiscountPct?: number
  trackingType?: 'none' | 'batch' | 'serial'
  purchaseTaxTemplate?: string
  salesTaxTemplate?: string
}

export type UpdateItemDto = Partial<CreateItemDto>

// Brand with price tier on customer groups
export interface GrupoCliente extends Grupo {
  priceTier?: 'A' | 'B' | 'C'
}

export interface DraftVersion {
  sequence: number
  savedAt: string
  id: string
  grandTotal: number
  items: Array<{ itemCode: string; description: string; qty: number; rate: number; amount: number }>
  status: string
}

// Amendment history for quotations / pedidos / invoices
export interface AmendmentEntry {
  id: string
  date?: string
  status: string
  total?: number
  grandTotal?: number
  items?: Array<{ itemCode: string; description: string; qty: number; rate: number; amount: number; notes?: string }>
  amendedFrom?: string | null
  createdAt?: string
  sequence?: number
}

/* @deprecated Use AmendmentEntry[] directly */
export interface DocumentHistory {
  drafts?: Array<{ version: number; savedAt: string; id: string; grandTotal?: number }>
  amendments?: AmendmentEntry[]
}

// Pedido de Venta (Sales Order)
export interface PedidoItem {
  itemCode: string
  description: string
  qty: number
  rate: number
  amount: number
  uom?: string
  discountPct?: number
  notes?: string
}

export interface Pedido {
  id: string
  customer: string
  customerName: string
  transactionDate: string
  deliveryDate?: string
  status: 'draft' | 'submitted' | 'cancelled' | 'completed'
  items: PedidoItem[]
  notes?: string
  amendedFrom?: string
  sequence: number
  history?: AmendmentEntry[]
  quotation?: string
  facturaId?: string
  createdAt: string
  modifiedAt: string
}

export interface CreatePedidoDto {
  customer: string
  transactionDate?: string
  deliveryDate?: string
  items: {
    itemCode: string
    qty: number
    rate: number
    discountPct?: number
    warehouse?: string
  }[]
  quotation?: string
}

export type UpdatePedidoDto = Partial<CreatePedidoDto>

// Batch / Serial inventory tracking
export interface InventoryLote {
  id: string
  item: string
  itemName: string
  expiryDate?: string
  qty: number
  disabled: boolean
}

export interface InventorySerial {
  id: string
  itemCode: string
  itemName: string
  status: string
  purchaseDate?: string
  deliveryDate?: string
}

// Document line items with discount
export interface DocumentItemWithDiscount {
  itemCode: string
  description: string
  qty: number
  rate: number
  discountPct?: number
  discountedRate?: number
  amount: number
  uom?: string
  warehouse?: string
}

// Verify PIN response
export interface VerifyPinResponse {
  valid: boolean
  userId: string
  canOverridePrice: boolean
}

export interface Category {
  id: string
  name: string
  parentCategory: string | null
  isGroup: boolean
  image?: string
  incomeAccount?: string
  expenseAccount?: string
  itemCodePrefix?: string
  children?: Category[]
}

export interface CreateCategoryDto {
  name: string
  parentCategory?: string
  isGroup?: boolean
  image?: string
}

export interface UpdateCategoryDto {
  name?: string
  parentCategory?: string
  isGroup?: boolean
  image?: string
  incomeAccount?: string
  expenseAccount?: string
  itemCodePrefix?: string
}

export interface Brand {
  id: string
  name: string
  description?: string
  categoryId?: string
  categoryName?: string
  image?: string
}

export interface CreateBrandDto {
  name: string
  description?: string
  categoryId?: string
  image?: string
}

export type UpdateBrandDto = Partial<CreateBrandDto>

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface ItemStockWarehouse {
  warehouse: string
  qty: number
  valuationRate: number
  stockValue: number
}

export interface ItemStock {
  itemCode: string
  totalQty: number
  warehouses: ItemStockWarehouse[]
}

export interface InventoryItem {
  itemCode: string
  itemName: string
  category?: string
  brand?: string
  warehouse: string
  actualQty: number
  valuationRate: number    // costo unitario
  standardRate: number     // precio de venta unitario
  investmentValue: number  // qty × costo
  saleValue: number        // qty × precio venta
  potentialProfit: number
}

export interface InventorySummary {
  totalInvestment: number
  totalSaleValue: number
  totalPotentialProfit: number
  totalItems: number
  totalUnits: number
}

export interface InventoryListResult {
  items: InventoryItem[]
  summary: InventorySummary
  meta: PaginationMeta
}

// API returns: { id, name, parent } — NOT warehouseName/isGroup/disabled
export interface Warehouse {
  id: string
  name: string
  parent?: string
}

export interface InventoryHistory {
  itemCode: string
  itemName: string
  warehouse: string
  voucherType: string
  voucherNo: string
  movementQty: number
  stockAfter: number
  valuationRate: number
  postingDate: string
}

// ─── Physical Count ───────────────────────────────────────────────────────────
// API: CreateCountDto requires postingDate (root), items have {itemCode, warehouse, qty}
// The "countedQty" concept is just "qty" in the BFF.

export interface InventoryCount {
  id: string
  status: 'Draft' | 'Submitted'
  postingDate: string
  remarks?: string
  items: {
    itemCode: string
    warehouse: string
    qty: number              // this is the counted qty
    valuationRate?: number
  }[]
  createdAt: string
  modifiedAt: string
}

export interface InventoryCountTemplate {
  itemCode: string
  itemName: string
  warehouse: string
  currentQty: number         // current system stock
}

export interface CreateCountDto {
  postingDate: string        // required
  remarks?: string
  items: {
    itemCode: string
    warehouse: string
    qty: number              // counted qty (was countedQty — renamed to match API)
    valuationRate?: number
  }[]
}

// ─── Compra (Purchase Invoice — update_stock=1) ───────────────────────────────
// CompraItemDto has NO description field.

export interface CompraItem {
  itemCode: string
  qty: number
  rate: number
  amount: number
  warehouse?: string
  uom?: string
  serials?: string[]
  batches?: { batchId: string; expiryDate?: string; qty: number }[]
  // NOTE: no "description" in CompraItemDto per BFF schema
}

export interface Compra {
  id: string
  supplier: string
  supplierName: string
  postingDate: string
  dueDate: string
  status: 'draft' | 'submitted' | 'cancelled'
  currency: string
  items: CompraItem[]
  grandTotal: number
  ncfProveedor?: string
  tipoBienes606?: string
  formaPago606?: string
  retencionIsr?: number
  tipoPago?: 'Contado' | 'Crédito'
  amendedFrom?: string
}

export interface CreateCompraDto {
  supplier: string
  postingDate: string
  dueDate?: string
  currency?: string
  conversionRate?: number
  items: {
    itemCode: string
    qty: number
    rate: number
    warehouse?: string
    uom?: string
    serials?: string[]
    batches?: { batchId: string; expiryDate?: string; qty: number }[]
    // NO description
  }[]
  ncfProveedor?: string
  tipoBienes606?: string
  formaPago606?: string
  retencionIsr?: number
  tipoPago?: 'Contado' | 'Crédito'
}

export type UpdateCompraDto = Partial<CreateCompraDto>

// ─── Gasto (Purchase Invoice — update_stock=0) ────────────────────────────────
// GastoItemDto: itemCode, qty, rate, uom?, description? (description is allowed)

export interface GastoItem {
  itemCode: string
  qty: number
  rate: number
  amount: number
  uom?: string
  description?: string
}

export interface Gasto {
  id: string
  supplier: string
  supplierName: string
  postingDate: string
  dueDate: string
  status: 'Draft' | 'Submitted' | 'Cancelled'
  currency: string
  items: GastoItem[]
  grandTotal: number
  ncfProveedor?: string
  tipoComprobante?: 'B01' | 'B13' | 'B14' | 'B15' | 'B16' | 'B17' | 'E31'
  tipoBienes606?: string
  formaPago606?: string
  retencionIsr?: number
  categoriaGasto?: 'Operativo' | 'Administrativo' | 'Ventas' | 'Financiero'
  esDeducible?: boolean
  amendedFrom?: string
}

export interface CreateGastoDto {
  supplier: string
  postingDate: string
  dueDate?: string
  currency?: string
  conversionRate?: number
  items: {
    itemCode: string
    qty: number
    rate: number
    uom?: string
    description?: string     // allowed in GastoItemDto
  }[]
  ncfProveedor?: string
  tipoComprobante?: 'B01' | 'B13' | 'B14' | 'B15' | 'B16' | 'B17' | 'E31'
  tipoBienes606?: string
  formaPago606?: string
  retencionIsr?: number
  categoriaGasto?: 'Operativo' | 'Administrativo' | 'Ventas' | 'Financiero'
  esDeducible?: boolean
}

export type UpdateGastoDto = Partial<CreateGastoDto>

// ─── Usuario ──────────────────────────────────────────────────────────────────

export interface Usuario {
  email: string
  firstName: string
  lastName?: string
  fullName: string
  enabled: boolean
  roles: string[]
  language?: string
  timeZone?: string
  mobileNo?: string
  lastActive?: string
  maxDiscountPct?: number
  warehouses?: string[]
  defaultWarehouse?: string
}

export interface CreateUsuarioDto {
  email: string
  firstName: string
  lastName?: string
  mobileNo?: string
  roles: string[]
  language?: string
  timeZone?: string
  sendWelcomeEmail?: boolean
  warehouses?: string[]
  maxDiscountPct?: number
}

export interface UpdateUsuarioDto {
  firstName?: string
  lastName?: string
  mobileNo?: string
  roles?: string[]
  warehouses?: string[]
  defaultWarehouse?: string
  maxDiscountPct?: number
}

export interface Role {
  name: string
}

// ─── Tax Templates ────────────────────────────────────────────────────────────

export type TaxChargeType =
  | 'On Net Total'
  | 'Actual'
  | 'On Previous Row Amount'
  | 'On Previous Row Total'
  | 'On Item Quantity'

export interface TaxTemplateLine {
  chargeType: TaxChargeType
  accountHead: string
  rate: number
  description?: string
}

export interface TaxTemplate {
  id: string
  title: string
  isDefault: boolean
  taxes: TaxTemplateLine[]
}

export interface CreateTaxTemplateDto {
  title: string
  isDefault?: boolean
  taxes: TaxTemplateLine[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface Empresa {
  companyName: string
  rnc?: string
  regimenFiscal?: 'Ordinario' | 'Simplificado' | 'RST'
  actividadEconomica?: string
  representanteLegal?: string
  cedulaRepresentante?: string
  logoUrl?: string
  telefono?: string
  email?: string
  website?: string
  direccion?: string
  defaultCurrency?: string
  country?: string
  itemCodeMode?: 'manual' | 'auto' | 'prefix_auto'
  defaultWarehouse?: string
  defaultPriceTipo?: 'A' | 'B' | 'C'
}

export interface UpdateEmpresaDto {
  rnc?: string
  regimenFiscal?: 'Ordinario' | 'Simplificado' | 'RST'
  actividadEconomica?: string
  representanteLegal?: string
  cedulaRepresentante?: string
  logoUrl?: string
  telefono?: string
  email?: string
  website?: string
  direccion?: string
  itemCodeMode?: 'manual' | 'auto' | 'prefix_auto'
  defaultWarehouse?: string
  defaultPriceTipo?: 'A' | 'B' | 'C'
}

export interface CobrosConfig {
  limiteCreditoAmarilloPct: number
  limiteCreditoRojoPct: number
  diasAlertaVencimiento: number
  rangoAging1Dias: number
  rangoAging2Dias: number
  rangoAging3Dias: number
  rangoAging4Label: string
  enviarRecordatorioAutomatico: boolean
}

export interface MetodoPago {
  name: string
  type: 'Cash' | 'Bank' | 'General'
  codigo606?: string
  disabled: boolean
}

export interface ListaPrecio {
  name: string
  currency: string
  buying: boolean
  selling: boolean
  enabled: boolean
}

export interface UOM {
  name: string
  mustBeWholeNumber: boolean
}

export interface UomConversionEntry {
  id?: string
  toUom: string
  factor: number
}

export interface UOMDetail extends UOM {
  conversions: UomConversionEntry[]
}

export interface CreateUOMDto {
  name: string
  conversions?: { toUom: string; factor: number }[]
}

export interface UpdateUOMDto {
  name?: string
  conversions?: { toUom: string; factor: number }[]
}

export interface Grupo {
  name: string
  parentGroup?: string
}

// NcfSerie — matches actual BFF response exactly.
// id is an integer (ERPNext autoincrement), NOT a UUID.
// nextNcf = -1 is a special signal meaning "exhausted" — never display -1 to users.
export interface NcfSerie {
  id: number
  ncfType: 'B01' | 'B02' | 'B14' | 'B15'
  start: number
  end: number
  nextNcf: number        // -1 means exhausted
  expirationDate: string
  disabled: boolean
  remaining: number
  // Detail-only fields (GET /config/ncf/:id)
  exhausted?: boolean
  used?: number
  usedPct?: number
}

export interface CreateNcfSerieDto {
  ncfType: 'B01' | 'B02' | 'B14' | 'B15'
  start: number
  end: number
  nextNcf: number        // should equal start on creation
  expirationDate: string // must be a future date
}

export interface UpdateNcfSerieDto {
  ncfType?: 'B01' | 'B02' | 'B14' | 'B15'  // only if used === 0
  end?: number           // can only extend (increase), never reduce
  expirationDate?: string
  // start is also updatable if used === 0, but omit from PUT for simplicity
}

// Response shape from disable/enable actions
export interface NcfActionResult {
  message: string
  ncfType: string
  remaining?: number
  nextNcf?: number
  warnings: string[]
}

// ─── Cobros ───────────────────────────────────────────────────────────────────

export interface AgingEntry {
  customer: string
  customerName: string
  totalOutstanding: number
  current: number
  range1: number
  range2: number
  range3: number
  range4: number
}

export interface SemaforoEntry {
  customer: string
  customerName: string
  creditLimit: number
  balance: number
  pctUsado?: number
  semaforo: 'verde' | 'amarillo' | 'rojo'
}

export interface SemaforoResumen {
  total: number
  verde: number
  amarillo: number
  rojo: number
}

export interface SemaforoResult {
  resumen: SemaforoResumen
  clientes: SemaforoEntry[]
}

export interface PaymentEntryReferencia {
  invoiceId: string
  invoiceName?: string
  allocatedAmount: number
}

export interface PaymentEntry {
  id: string
  status: 'draft' | 'submitted' | 'cancelled'
  customer: string
  customerName: string
  postingDate: string
  paidAmount: number
  modeOfPayment: string
  referenceNo?: string
  referenceDate?: string
  remarks?: string
  referencias?: PaymentEntryReferencia[]
  createdAt: string
  modifiedAt?: string
}

// CreateCobroDto — matches BFF's CreateCobroDto exactly
export interface CreateCobroDto {
  customer: string
  postingDate: string
  paidAmount: number
  modeOfPayment: string
  referenceNo?: string
  referenceDate?: string
  remarks?: string
  referencias?: {
    invoiceId: string
    allocatedAmount: number
  }[]
}

// Alias for backward compat in existing pages
export type RegisterPagoDto = CreateCobroDto

// ─── Reportes ─────────────────────────────────────────────────────────────────

export interface Reporte606Entry {
  rncProveedor: string
  proveedor: string
  ncf: string
  ncfType: string
  fecha: string
  montoFacturado: number
  itbisFacturado: number
}

export interface Reporte607Entry {
  rncProveedor: string
  proveedor: string
  ncf: string
  tipoRenta: string
  montoRetenido: number
  fecha: string
}

export interface Reporte608Entry {
  rncCliente: string
  cliente: string
  ncf: string
  ncfType: string
  fecha: string
  montoFacturado: number
  itbisFacturado: number
}

// ─── Cuenta (Chart of Accounts) ────────────────────────────────────────────

export interface Cuenta {
  id: string                    // full ERPNext name e.g. "Ventas - JB"
  accountName: string
  accountNumber?: string
  accountType?: string
  rootType: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
  parentAccount?: string
  isGroup: boolean
  disabled: boolean
  currency: string
  debit: number
  credit: number
  balance: number
  children?: Cuenta[]           // only in tree response
}

export interface CreateCuentaDto {
  accountName: string           // required
  parentAccount: string         // required
  accountType?: string
  accountNumber?: string
  currency?: string             // default 'DOP'
  isGroup?: boolean
}

export interface UpdateCuentaDto {
  accountName?: string
  accountNumber?: string
  disabled?: boolean
  // Only editable when no GL movements:
  accountType?: string
  parentAccount?: string
  currency?: string
}

// ─── Cuentas de la Empresa ──────────────────────────────────────────────────

export interface CuentasEmpresa {
  defaultReceivableAccount?: string
  defaultPayableAccount?: string
  defaultIncomeAccount?: string
  defaultExpenseAccount?: string
  defaultBankAccount?: string
  writeOffAccount?: string
  roundOffAccount?: string
}

export type UpdateCuentasEmpresaDto = CuentasEmpresa

// ─── Journal Entry ──────────────────────────────────────────────────────────

export interface JournalEntryLine {
  account: string
  debit: number
  credit: number
  description?: string
}

export interface JournalEntry {
  id: string
  postingDate: string
  voucherType?: string
  remarks?: string
  status: 'Draft' | 'Submitted' | 'Cancelled'
  totalDebit: number
  totalCredit: number
  entries?: JournalEntryLine[]  // only in detail
  createdAt: string
}

export interface CreateJournalEntryDto {
  postingDate: string           // required
  entries: JournalEntryLine[]  // required - must balance (sum debit = sum credit)
  remarks?: string
  voucherType?: string
}

// ─── Ejercicio Fiscal ──────────────────────────────────────────────────────────

export interface EjercicioFiscal {
  id: string
  year: string
  yearStartDate: string
  yearEndDate: string
  isClosed: boolean
  disabled: boolean
}

export interface CreateEjercicioFiscalDto {
  year: string
  yearStartDate: string
  yearEndDate: string
}

// ─── Cierre de Período ─────────────────────────────────────────────────────────

export interface CierrePeriodo {
  id: string
  transactionDate: string
  postingDate: string
  periodEndDate: string
  closingFiscalYear: string
  costCenter: string
  closingAccountHead: string
  remarks?: string
  status: 'draft' | 'submitted'
  warning?: string
  createdAt: string
  modifiedAt: string
}

export interface CreateCierrePeriodoDto {
  periodEndDate: string
  closingFiscalYear: string
  costCenter: string
  closingAccountHead: string
  postingDate: string
  remarks?: string
}

// ─── Item Attributes (Variants) ───────────────────────────────────────────────

export interface AttributeValue {
  value: string    // "Red", "Blue", "Small", "Large"
  abbr: string     // "RED", "BLU", "S", "L" — used in variant code generation
}

export interface ItemAttribute {
  id: string
  name: string
  numeric: boolean
  // Only in detail response:
  fromRange?: number
  toRange?: number
  increment?: number
  values?: AttributeValue[]
}

export interface CreateAttributeDto {
  name: string
  numeric?: boolean
  // For discrete values:
  values?: AttributeValue[]
  // For numeric range:
  fromRange?: number
  toRange?: number
  increment?: number
}

export interface UpdateAttributeDto {
  name?: string
  values?: AttributeValue[]
}

// Template attribute reference (in item.attributes[])
export interface TemplateAttribute {
  attribute: string          // attribute id/name, e.g. "Colour"
  attributeValue?: string    // only on variants: "Red", "Blue"
}

// Generate variants result
export interface GenerateVariantsResult {
  templateId: string
  totalCombinations: number
  created: number
  skipped: number
  variants: Item[]
}
