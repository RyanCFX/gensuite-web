// ─── Universal API Response Shapes ───────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
  /** Presente cuando el doctype subyacente aún no fue migrado en ERPNext — no es un error. */
  note?: string;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  defaultPriceTier?: "A" | "B" | "C";
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

// ─── Generic Pagination Params ────────────────────────────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
  tenant?: string;
}

export interface AuthTenant {
  slug: string;
  siteUrl: string;
  id: string;
}

export interface AuthUser {
  email: string;
  full_name: string;
  roles: string[];
  defaultWarehouse?: string;
  warehouses?: string[];
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  tenant: AuthTenant;
  user: AuthUser;
}

export interface JwtPayload {
  sub: string;
  tenant: string;
  ak: string;
  ask: string;
  defaultWarehouse?: string;
  warehouses?: string[];
  iat: number;
  exp: number;
}

// ─── Customer ─────────────────────────────────────────────────────────────────
// API schema: CreateCustomerDto does NOT have tipoIdentificacion.
// Identification type is inferred from rnc/cedula presence.

export interface Customer {
  id: string;
  customerName: string;
  customerType: "Company" | "Individual";
  rnc?: string;
  cedula?: string;
  email?: string;
  phone?: string;
  address?: string;
  isCompany: boolean;
  hasCredit: boolean;
  isGovernment: boolean;
  creditLimit: number;
  creditDays: number;
  emailInvoice?: string;
  birthday?: string;
  photo?: string;
  disabled: boolean;
  customerGroup?: string;
  priceTier?: "A" | "B" | "C";
  createdAt: string;
  modifiedAt: string;
}

export interface CreateCustomerDto {
  customerName: string;
  customerType: "Company" | "Individual";
  // NOTE: tipoIdentificacion does NOT exist in BFF — removed.
  rnc?: string;
  cedula?: string;
  email?: string;
  phone?: string;
  address?: string;
  isCompany?: boolean;
  hasCredit?: boolean;
  isGovernment?: boolean;
  creditLimit?: number;
  creditDays?: number;
  emailInvoice?: string;
  birthday?: string;
  photo?: string;
  customerGroup?: string;
}

export type UpdateCustomerDto = Partial<
  Omit<CreateCustomerDto, "customerType">
> & {
  customerType?: "Company" | "Individual";
};

// ─── Supplier ─────────────────────────────────────────────────────────────────
// tipoIdentificacion IS required for suppliers.

export interface Supplier {
  id: string;
  supplierName: string;
  supplierType: "Company" | "Individual";
  tipoIdentificacion?: "RNC" | "Cedula" | "Pasaporte" | "NIT";
  rnc?: string;
  cedula?: string;
  esProveedorExterior: boolean;
  paisOrigen?: string;
  banco?: string;
  tipoCuenta?: string; // 'Corriente' | 'Ahorro'
  numeroCuenta?: string;
  abaSwift?: string;
  tipoProveedor606?: string;
  diasCredito: number;
  supplierGroup?: string;
  paymentTerms?: string;
  emailId?: string;
  emailPagos?: string;
  mobileNo?: string;
  address?: string;
  disabled: boolean;
  balance: number;
  defaultTipoBienes606?: string | null;
  defaultFormaPago606?: string | null;
  defaultTipoPagoProveedor?: "Contado" | "Crédito" | null;
  cuentaCxpDefault?: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface CreateProveedorDto {
  supplierName: string;
  supplierType: "Company" | "Individual";
  tipoIdentificacion: "RNC" | "Cedula" | "Pasaporte" | "NIT"; // required for suppliers
  rnc?: string;
  cedula?: string;
  esProveedorExterior?: boolean;
  paisOrigen?: string;
  banco?: string;
  tipoCuenta?: "Corriente" | "Ahorro";
  numeroCuenta?: string;
  abaSwift?: string;
  tipoProveedor606?: string;
  diasCredito?: number;
  supplierGroup?: string;
  paymentTerms?: string;
  emailId?: string;
  emailPagos?: string;
  mobileNo?: string;
  address?: string;
  defaultTipoBienes606?: string | null;
  defaultFormaPago606?: string | null;
  defaultTipoPagoProveedor?: "Contado" | "Crédito" | null;
  cuentaCxpDefault?: string | null;
}

export type UpdateProveedorDto = Partial<CreateProveedorDto>;

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  itemCode: string;
  description?: string;
  qty: number;
  rate: number;
  discountPct?: number;
  discountedRate?: number;
  amount: number;
  uom: string;
  warehouse?: string;
  /** Ubicación/rack específico dentro del almacén desde donde se descontó el stock, si se especificó. */
  ubicacion?: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  status: "draft" | "submitted" | "cancelled";
  paymentStatus?: "unpaid" | "partly_paid" | "paid" | null;
  customer: string;
  customerName: string;
  postingDate: string;
  dueDate: string;
  branch?: string | null;
  department?: string | null;
  ncf?: string;
  ncfType?: string;
  /** Para facturas normales, siempre igual a `ncf` (una factura no afecta a otro comprobante). */
  ncfAfectado?: string | null;
  subtotal: number;
  grandTotal: number;
  /** Monto total de impuestos del documento (Sales Taxes and Charges), si se aplicó un template */
  taxAmount?: number;
  outstandingAmount: number;
  items: InvoiceItem[];
  notes?: string;
  amendedFrom?: string;
  sequence: number;
  history?: AmendmentEntry[];
  createdAt: string;
  modifiedAt: string;
  /** Present when status === 'cancelled' and the cancellation was registered with a reason. */
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  /** Notas de crédito enlazadas mientras esta factura sigue en Draft (sin efecto contable aún) — se vacía sola al someter */
  pendingCreditNotes?: { creditNoteId: string; amount: number }[];
  /** Solo presente cuando status === 'draft'. Artículos (o componentes de combo) que aún necesitan
   *  que se les asigne serial/lote manualmente — vacío si no hay nada pendiente. */
  pendingTracking?: PendingTrackingEntry[];
  /** Líneas de pago realmente cobradas al someter (vacío si quedó a crédito, sin cobrar). */
  paymentLines?: PaymentLine[];
  /** Desglose de vuelto entregado (vacío si no aplica o el flujo es "directo"). */
  vueltoDetalle?: VueltoLine[];
  /** Indica si la factura fue sometida como venta al contado nativa (is_pos=1 en ERPNext).
   *  Cuando es true, no existe un Payment Entry asociado — el pago vive en paymentLines/cobro. */
  isPos?: boolean;
  /** Resumen del cobro registrado al someter (presente cuando se enviaron payments). */
  cobro?: CobroResumen;
}

export interface PendingTrackingEntry {
  itemCode: string;
  /** Si viene de un Combo, el itemCode del combo (ej. "COMBO-0001") */
  parentItem?: string;
  warehouse: string;
  qty: number;
  trackingType: "serial" | "batch";
}

export interface BatchAllocation {
  batchId: string;
  qty: number;
}

export interface ComponentTracking {
  /** Código del componente del combo (no el del combo en sí) */
  itemCode: string;
  /** Seriales específicos a vender de este componente (debe coincidir en cantidad con lo que aporta el combo) */
  serials?: string[];
  batches?: BatchAllocation[];
}

export interface CreateInvoiceDto {
  customer: string;
  postingDate: string;
  dueDate?: string;
  branch?: string;
  department?: string;
  ncfType: "B01" | "B02" | "B14" | "B15" | "B16";
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    uom?: string;
    discountPct?: number;
    /** Almacén desde el que se descuenta el stock. Si se omite, ERPNext usa el almacén por defecto del artículo. */
    warehouse?: string;
    /** Ubicación/rack específico dentro del almacén. Si se envía, el descuento de stock ocurre exactamente ahí en vez del almacén general. */
    ubicacion?: string;
    /** Solo cuando itemCode es un Combo y algún componente tiene tracking de serial/lote. */
    componentTracking?: ComponentTracking[];
  }[];
  notes?: string;
  /** ID de un Sales Taxes and Charges Template (/config/impuestos-ventas). Si se omite, se usa el default de la compañía si existe. */
  taxesTemplate?: string;
}

// POST /invoices/:id/cancel — reason is mandatory, 10-500 chars.
// motivoAnulacion (código DGII, Formato 608) es obligatorio solo si la factura ya tiene NCF asignado.
export interface CancelInvoiceDto {
  reason: string;
  motivoAnulacion?: string;
}

// POST /invoices/:id/submit — optional body to control cash vs. credit at submit time
export interface SubmitInvoiceDto {
  /** Force cash payment even if the customer has credit. */
  payCash?: boolean;
  /** @deprecated usar `payments`. No enviar junto con `payments` — el backend rechaza con 400 si ambos vienen. */
  modeOfPayment?: string;
  /** Líneas de pago (uno o más métodos). La suma debe coincidir con el monto a cobrar. */
  payments?: PaymentLine[];
  /** Desglose de denominaciones del vuelto entregado. Solo aplica si flujoCobro==="caja". Requiere `tenderedCash`. */
  vuelto?: VueltoLine[];
  /** Efectivo entregado por el cliente. Requerido si se envía `vuelto`. */
  tenderedCash?: number;
}

// ─── Quotation ────────────────────────────────────────────────────────────────

export interface QuotationItem {
  itemCode: string;
  description?: string;
  qty: number;
  rate: number;
  discountPct?: number;
  discountedRate?: number;
  amount: number;
  uom: string;
  notes?: string;
  taxRate: number;
  taxAmount: number;
}

export interface Quotation {
  id: string;
  customer: string;
  customerName: string;
  date: string;
  validTill: string;
  branch?: string | null;
  status: "draft" | "submitted" | "ordered" | "lost" | "cancelled";
  items: QuotationItem[];
  notes?: string;
  amendedFrom?: string;
  sequence: number;
  history?: AmendmentEntry[];
  grandTotal?: number;
  taxAmount?: number;
  message?: string;
}

export interface CreateQuotationDto {
  customer: string;
  date: string; // required per API
  validTill?: string;
  branch?: string;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    uom?: string;
    discountPct?: number;
    /** Almacén de entrega. Si se omite, se usa el almacén por defecto del usuario. */
    warehouse?: string;
  }[];
  notes?: string;
  /** ID de un Sales Taxes and Charges Template (/config/impuestos-ventas). Si se omite, se usa el default de la compañía si existe. */
  taxesTemplate?: string;
}

export type UpdateQuotationDto = Partial<CreateQuotationDto>;

// GET /quotations/:id/duplicate-source
export interface DuplicateQuotationSource {
  customer: string;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    uom?: string;
    discountPct?: number;
    warehouse?: string;
  }[];
  notes?: string;
}

// ─── Credit / Debit Notes ─────────────────────────────────────────────────────
// CreateCreditNoteDto: originalInvoice (not invoiceId), postingDate required.
// CreateDebitNoteDto: uses customer (not invoiceId).

export interface CreditNote {
  id: string;
  /**
   * 'Draft' | 'Cancelled' se mantienen literales. Una vez Sometida, el backend reemplaza el valor
   * por un resumen de uso listo para badge — ya no llega 'Submitted' en ese caso.
   */
  status:
    | "Draft"
    | "Submitted"
    | "Cancelled"
    | "available"
    | "partially_used"
    | "fully_used";
  originalInvoice: string;
  reason?: string;
  grandTotal: number;
  ncf?: string;
  /** NCF de la factura original que esta nota corrige (resuelto de `returnAgainst`) — distinto de `ncf`, que es el propio de la nota. */
  ncfAfectado?: string | null;
  postingDate: string;
  createdAt: string;
  /** true si ya fue reembolsada en efectivo/transferencia; false = sigue como saldo a favor pendiente */
  refunded?: boolean;
  /** Los siguientes solo vienen presentes para notas ya Sometidas (Draft no los incluye) */
  refundedAmount?: number;
  appliedAmount?: number;
  availableAmount?: number;
  appliedTo?: CreditNoteAppliedTo[];
}

export interface CreateCreditNoteDto {
  originalInvoice: string; // field name corrected from invoiceId
  postingDate: string; // required
  items: {
    itemCode: string;
    qty: number;
    rate: number;
    uom?: string;
  }[];
  reason?: string;
}

// POST /credit-notes/:id/refund — reembolsa una nota de crédito existente (refunded: false)
export interface RefundCreditNoteDto {
  modeOfPayment: string;
  amount: number;
}

// POST /credit-notes/:id/aplicar-a-factura — invoiceId es obligatorio, siempre se enlaza a una factura
export interface AplicarCreditNoteDto {
  invoiceId: string;
  amount?: number;
}

// La respuesta es siempre la Invoice actualizada (ver tipo Invoice)
export type AplicarCreditNoteResult = Invoice;

// GET /credit-notes/saldo-favor/:customerId
export interface CreditNoteAppliedTo {
  invoiceId: string;
  amount: number;
  /** 'pending' = factura destino aún en Draft (enlace sin efecto contable); 'reconciled' = factura sometida y ya reconciliada contra ERPNext */
  status: "pending" | "reconciled";
  /** Journal Entry real de la reconciliación — solo presente cuando status === 'reconciled' */
  journalEntryId: string | null;
}

export interface CreditNoteSaldoFavorEntry {
  creditNoteId: string;
  ncf?: string;
  postingDate: string;
  grandTotal: number;
  refundedAmount: number;
  appliedAmount: number;
  availableAmount: number;
  appliedTo: CreditNoteAppliedTo[];
}

export interface CreditNoteSaldoFavorResult {
  customer: string;
  balance: number;
  entries: CreditNoteSaldoFavorEntry[];
}

// ─── Devoluciones (return flow) ────────────────────────────────────────────────

// POST /devoluciones
export interface DevolucionDto {
  invoiceId: string;
  /** Si se omite, se devuelve la factura completa (todas las líneas, cantidad total) */
  items?: {
    itemCode: string;
    qty: number;
  }[];
  resolution: "refund" | "credit_note_only";
  /** Obligatorio solo si resolution === 'refund' */
  refundModeOfPayment?: string;
  reason: string;
}

export interface DevolucionResult {
  creditNoteId: string;
  ncf?: string;
  /** NCF de la factura original devuelta — distinto de `ncf`, que es el propio de la nota de crédito. */
  ncfAfectado?: string | null;
  resolution: "refund" | "credit_note_only";
  grandTotal: number;
  /** true si la nota de crédito se concilió automáticamente contra el saldo pendiente de la factura original */
  appliedToOriginalInvoice: boolean;
  /** Monto aplicado a la factura original (0 si no aplicó) */
  appliedAmount: number;
  /** grandTotal - appliedAmount — lo que quedó disponible sin aplicar (saldo a favor) */
  remainingAvailable: number;
  /** Solo presente si resolution === 'refund' tuvo éxito (sin pendiente en la factura) */
  paymentEntryId?: string;
  message?: string;
}

// GET /devoluciones (lista) — mismo shape que GET /credit-notes
export type DevolucionListItem = CreditNote;

// GET /devoluciones/:id (detalle)
export interface DevolucionOriginalInvoice {
  id: string;
  customer: string;
  customerName: string;
  postingDate: string;
  ncf?: string;
  ncfType?: string;
  grandTotal: number;
  outstandingAmount: number;
  status: "draft" | "submitted" | "cancelled";
}

export interface DevolucionItem {
  itemCode: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
  uom?: string;
}

export interface DevolucionDetail {
  creditNoteId: string;
  ncf?: string;
  ncfType?: string;
  /** NCF de la factura original devuelta — distinto de `ncf`, que es el propio de la nota de crédito. */
  ncfAfectado?: string | null;
  postingDate: string;
  reason: string;
  documentStatus: "draft" | "submitted" | "cancelled";
  customer: string;
  customerName: string;
  items: DevolucionItem[];
  grandTotal: number;
  refunded: boolean;
  refundedAmount: number;
  appliedAmount: number;
  availableAmount: number;
  appliedTo: CreditNoteAppliedTo[];
  /** Solo presente si documentStatus === 'submitted' */
  usageStatus?: "available" | "partially_used" | "fully_used";
  /** null solo si falló traer la factura original (raro) */
  originalInvoice: DevolucionOriginalInvoice | null;
  createdAt: string;
  modifiedAt: string;
}

export interface DebitNote {
  id: string;
  status: "Draft" | "Submitted" | "Cancelled";
  customer: string;
  grandTotal: number;
  ncf?: string;
  /** NCF de la factura original que esta nota afecta — distinto de `ncf`, que es el propio de la nota. */
  ncfAfectado?: string | null;
  postingDate: string;
  branch?: string | null;
  department?: string | null;
  createdAt: string;
}

export interface CreateDebitNoteDto {
  customer: string; // debit notes use customer, not invoiceId
  postingDate: string; // required
  branch?: string;
  department?: string;
  items: {
    itemCode: string;
    qty: number;
    rate: number;
    uom?: string;
  }[];
  notes?: string;
}

// ─── Item / Catalog ───────────────────────────────────────────────────────────

export interface ItemUomConversion {
  uom: string;
  conversionFactor: number;
}

// Barcode entry
export interface ItemBarcode {
  barcode: string;
  barcodeType: string;
}

// Bundle / Combo
export interface BundleComponent {
  itemCode: string;
  itemName?: string;
  qty: number;
  stockQty?: number;
  uom?: string;
}

export interface Bundle {
  id: string;
  itemName: string;
  totalItems?: number;
  components: BundleComponent[];
  prices?: { A?: number; B?: number; C?: number };
  disabled: boolean;
  /** UdM del artículo combo en sí (no de sus componentes). Default backend: 'Nos'. */
  itemUom?: string;
}

export interface CreateBundleDto {
  itemCode?: string;
  itemName: string;
  components: { itemCode: string; qty: number; uom?: string }[];
  priceA?: number;
  priceB?: number;
  priceC?: number;
  /** UdM del artículo combo en sí. Opcional, default backend: 'Nos'. */
  itemUom?: string;
}

export type UpdateBundleDto = Partial<CreateBundleDto>;

// Item Prices
export interface ItemPrices {
  A?: number;
  B?: number;
  C?: number;
}

export interface Item {
  id: string;
  itemName: string;
  category: string;
  categoryName?: string;
  subcategory?: string;
  subcategoryName?: string;
  brand?: string;
  brandName?: string;
  type: "product" | "service";
  standardRate: number;
  prices?: ItemPrices;
  valuationRate?: number;
  currentStock?: number;
  /** Presente solo cuando se filtra GET /catalog/items?branch=... — stock por almacén de esa sucursal */
  stockByWarehouse?: Record<string, number>;
  internalDescription?: string;
  shortName?: string;
  notes?: string;
  hasWarranty?: boolean;
  warrantyPeriod?: number;
  barcodes?: ItemBarcode[];
  image?: string;
  disabled: boolean;
  stockUom?: string;
  uoms?: ItemUomConversion[];
  hasVariants?: boolean;
  variantOf?: string;
  attributes?: TemplateAttribute[];
  priceMode?: "manual" | "cost_plus";
  marginA?: number;
  marginB?: number;
  marginC?: number;
  allowsDiscount?: boolean;
  maxDiscountPct?: number;
  trackingType?: "none" | "batch" | "serial";
  purchaseTaxTemplate?: string;
  purchaseTaxPct?: number;
  salesTaxTemplate?: string;
  salesTaxPct?: number;
  purchasePriceDate?: string;
  salesPriceDate?: string;
}

export interface CreateItemDto {
  itemCode?: string; // optional, BFF can auto-generate
  itemName: string;
  category: string;
  subcategory?: string;
  brand?: string;
  type: "product" | "service";
  standardRate?: number; // deprecated — use prices
  prices?: ItemPrices;
  priceA?: number;
  priceB?: number;
  priceC?: number;
  valuationRate?: number;
  internalDescription?: string;
  shortName?: string;
  notes?: string;
  hasWarranty?: boolean;
  warrantyPeriod?: number;
  barcodes?: ItemBarcode[];
  image?: string;
  defaultWarehouse?: string;
  stockUom?: string;
  hasVariants?: boolean;
  attributes?: { attribute: string }[]; // for templates: just attribute names
  priceMode?: "manual" | "cost_plus";
  marginA?: number;
  marginB?: number;
  marginC?: number;
  allowsDiscount?: boolean;
  maxDiscountPct?: number;
  trackingType?: "none" | "batch" | "serial";
  purchaseTaxTemplate?: string;
  salesTaxTemplate?: string;
}

export type UpdateItemDto = Partial<CreateItemDto>;

// PUT /catalog/items/:id/precios — atajo para actualizar solo precios (y modo de precio/márgenes),
// sin el payload completo de edición. Todos los campos opcionales; solo se actualiza lo que se
// manda. Si el modo efectivo es 'cost_plus', el backend ignora priceA/B/C y calcula los precios
// a partir de purchasePrice + los márgenes; si es 'manual', priceA/B/C se guardan tal cual.
export interface UpdateItemPricesDto {
  /** Precio de compra (valuation_rate) */
  purchasePrice?: number;
  /** Precio de venta general/base */
  standardRate?: number;
  /** Solo aplica si el modo efectivo es 'manual' — se ignora en 'cost_plus' */
  priceA?: number;
  priceB?: number;
  priceC?: number;
  priceMode?: "manual" | "cost_plus";
  /** % de margen — solo relevante si priceMode (efectivo) es 'cost_plus' */
  marginA?: number;
  marginB?: number;
  marginC?: number;
}

export interface ItemPricesResult {
  id: string;
  purchasePrice: number;
  standardRate: number;
  priceMode: "manual" | "cost_plus";
  prices: ItemPrices;
}

// Brand with price tier on customer groups
export interface GrupoCliente extends Grupo {
  priceTier?: "A" | "B" | "C";
}

export interface DraftVersion {
  sequence: number;
  savedAt: string;
  id: string;
  grandTotal: number;
  items: Array<{
    itemCode: string;
    description: string;
    qty: number;
    rate: number;
    amount: number;
  }>;
  status: string;
}

// Amendment history for quotations / pedidos / invoices
export interface AmendmentEntry {
  id: string;
  date?: string;
  status: string;
  total?: number;
  grandTotal?: number;
  items?: Array<{
    itemCode: string;
    description: string;
    qty: number;
    rate: number;
    amount: number;
    notes?: string;
    taxRate?: number;
    taxAmount?: number;
  }>;
  amendedFrom?: string | null;
  createdAt?: string;
  sequence?: number;
}

/* @deprecated Use AmendmentEntry[] directly */
export interface DocumentHistory {
  drafts?: Array<{
    version: number;
    savedAt: string;
    id: string;
    grandTotal?: number;
  }>;
  amendments?: AmendmentEntry[];
}

// Pedido de Venta (Sales Order)
export interface PedidoItem {
  itemCode: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  uom?: string;
  discountPct?: number;
  notes?: string;
  taxRate: number;
  taxAmount: number;
}

export interface Pedido {
  id: string;
  customer: string;
  customerName: string;
  transactionDate: string;
  deliveryDate?: string;
  branch?: string | null;
  department?: string | null;
  status: "draft" | "submitted" | "cancelled" | "completed";
  items: PedidoItem[];
  notes?: string;
  amendedFrom?: string;
  sequence: number;
  history?: AmendmentEntry[];
  quotation?: string;
  facturaId?: string;
  createdAt: string;
  modifiedAt: string;
  grandTotal?: number;
  taxAmount?: number;
  /** Apartado (layaway) — presentes cuando isLayaway === true */
  isLayaway?: boolean;
  layawayVencido?: boolean;
  layawayDiasRestantes?: number;
}

export interface CreatePedidoDto {
  customer: string;
  transactionDate?: string;
  deliveryDate?: string;
  branch?: string;
  department?: string;
  items: {
    itemCode: string;
    qty: number;
    rate: number;
    discountPct?: number;
    warehouse?: string;
  }[];
  quotation?: string;
  /** Marca el pedido como apartado (layaway) — reserva stock al someter, no genera factura de inmediato */
  isLayaway?: boolean;
}

export type UpdatePedidoDto = Partial<CreatePedidoDto>;

// POST /pedidos/:id/submit — respuesta distinta cuando el pedido es un apartado
export interface SubmitPedidoResult {
  facturaId?: string;
  pedidoId?: string;
  isLayaway?: boolean;
  stockReserved?: boolean;
  message?: string;
  warning?: string;
}

// POST /pedidos/:id/facturar-apartado
export interface FacturarApartadoResult {
  pedidoId: string;
  facturaId: string;
  message?: string;
}

// POST /pedidos/:id/cancelar-apartado
export interface CancelarApartadoDto {
  reason: string;
  remanente?: "saldo_favor" | "devolucion";
  modeOfPayment?: string;
}

// GET/PUT /config/apartados
export interface LayawayConfig {
  porcentajeMinimoAnticipo: number;
  diasMaximoApartado: number;
  remanenteDefault: "saldo_favor" | "devolucion";
}

// GET /pedidos/:id/duplicate-source — no notes at document level, items have no uom
export interface DuplicatePedidoSource {
  customer: string;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    discountPct?: number;
    warehouse?: string;
  }[];
}

// Batch / Serial inventory tracking
export interface InventoryLote {
  id: string;
  item: string;
  itemName: string;
  expiryDate?: string;
  qty: number;
  disabled: boolean;
}

export interface InventorySerial {
  id: string;
  itemCode: string;
  itemName: string;
  status: string;
  purchaseDate?: string;
  deliveryDate?: string;
}

// Document line items with discount
export interface DocumentItemWithDiscount {
  itemCode: string;
  description: string;
  qty: number;
  rate: number;
  discountPct?: number;
  discountedRate?: number;
  amount: number;
  uom?: string;
  warehouse?: string;
}

// Verify PIN response
export interface VerifyPinResponse {
  valid: boolean;
  userId: string;
  canOverridePrice: boolean;
}

export interface Category {
  id: string;
  name: string;
  parentCategory: string | null;
  isGroup: boolean;
  image?: string;
  incomeAccount?: string;
  expenseAccount?: string;
  /** El que realmente controla el Costo de Mercancía Vendida en facturas/notas de entrega */
  defaultCogsAccount?: string;
  itemCodePrefix?: string;
  children?: Category[];
}

export interface CreateCategoryDto {
  name: string;
  parentCategory?: string;
  isGroup?: boolean;
  image?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  parentCategory?: string;
  isGroup?: boolean;
  image?: string;
  incomeAccount?: string;
  expenseAccount?: string;
  defaultCogsAccount?: string;
  itemCodePrefix?: string;
}

export interface Brand {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  image?: string;
}

export interface CreateBrandDto {
  name: string;
  description?: string;
  categoryId?: string;
  image?: string;
}

export type UpdateBrandDto = Partial<CreateBrandDto>;

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface ItemStockWarehouse {
  warehouse: string;
  qty: number;
  valuationRate: number;
  stockValue: number;
}

export interface ItemStock {
  itemCode: string;
  totalQty: number;
  warehouses: ItemStockWarehouse[];
}

export interface InventoryItem {
  itemCode: string;
  itemName: string;
  category?: string;
  brand?: string;
  warehouse: string;
  actualQty: number;
  valuationRate: number; // costo unitario
  standardRate: number; // precio de venta unitario
  investmentValue: number; // qty × costo
  saleValue: number; // qty × precio venta
  potentialProfit: number;
  /** Nombres de las ubicaciones (Zona/Rack) asignadas a este artículo en este almacén */
  ubicaciones?: string[];
}

// ─── Zonas y Ubicaciones (organización física dentro del almacén) ─────────────
// Puramente organizacional — NO afecta el stock (que sigue siendo por Almacén).
// Jerarquía fija: Almacén → Zona → Ubicación/Rack.

export interface ZonaResponseDto {
  id: string;
  zonaName: string;
  warehouse: string;
  code?: string;
  descripcion?: string;
  disabled: boolean;
  ubicacionCount?: number;
}

export interface CreateZonaDto {
  zonaName: string;
  warehouse: string;
  code?: string;
  descripcion?: string;
}

export interface UpdateZonaDto {
  zonaName?: string;
  code?: string;
  descripcion?: string;
  disabled?: boolean;
}

export interface UbicacionResponseDto {
  id: string;
  ubicacionName: string;
  zona: string;
  /** Heredado de la zona — solo lectura */
  warehouse: string;
  code?: string;
  descripcion?: string;
  disabled: boolean;
}

export interface CreateUbicacionDto {
  ubicacionName: string;
  zona: string;
  code?: string;
  descripcion?: string;
}

export interface UpdateUbicacionDto {
  ubicacionName?: string;
  code?: string;
  descripcion?: string;
  disabled?: boolean;
}

export interface ItemUbicacionResponseDto {
  id: string;
  itemCode: string;
  warehouse: string;
  ubicacionId: string;
  ubicacionName?: string;
  zonaName?: string;
  esPrincipal: boolean;
  notas?: string;
}

export interface AssignItemUbicacionDto {
  itemCode: string;
  warehouse: string;
  ubicacionId: string;
  esPrincipal?: boolean;
  notas?: string;
}

export interface UpdateItemUbicacionDto {
  esPrincipal?: boolean;
  notas?: string;
}

// GET /inventory/ubicaciones/pendientes?warehouse=... — artículos con stock en el almacén sin ninguna ubicación asignada
export interface ItemPendienteUbicar {
  itemCode: string;
  itemName: string;
  warehouse: string;
  actualQty: number;
}

// POST /inventory/ubicaciones/distribuir
export interface DistribuirUbicacionItemDto {
  itemCode: string;
  warehouse: string;
  ubicacion: string;
  cantidad: number;
  esPrincipal?: boolean;
}

export interface DistribuirUbicacionDto {
  items: DistribuirUbicacionItemDto[];
}

export interface DistribuirUbicacionResult {
  itemCode: string;
  ubicacion: string;
  cantidad: number;
  stockEntry: string;
}

// POST /inventory/ubicaciones/mover — solo entre ubicaciones del mismo almacén
export interface MoverUbicacionDto {
  itemCode: string;
  cantidad: number;
  ubicacionOrigen: string;
  ubicacionDestino: string;
  notas?: string;
}

export interface MoverUbicacionResult {
  itemCode: string;
  cantidad: number;
  stockEntry: string;
}

// GET /inventory/ubicaciones/movimientos — historial de distribuciones y movimientos internos entre ubicaciones
export interface MovimientoUbicacion {
  id: string;
  /** "distribuir": origen era el almacén general (sin ubicación previa). "mover": de una ubicación a otra. */
  tipo: "distribuir" | "mover";
  itemCode: string;
  qty: number;
  almacen: string;
  /** null solo cuando tipo === "distribuir" */
  ubicacionOrigen: string | null;
  ubicacionDestino: string;
  notas?: string;
  fecha: string;
}

export interface InventorySummary {
  totalInvestment: number;
  totalSaleValue: number;
  totalPotentialProfit: number;
  totalItems: number;
  totalUnits: number;
}

export interface InventoryListResult {
  items: InventoryItem[];
  summary: InventorySummary;
  meta: PaginationMeta;
}

// API returns: { id, name, parent } — NOT warehouseName/isGroup/disabled
export interface Warehouse {
  id: string;
  name: string;
  parent?: string;
}

// ─── Sucursales (Branches) ─────────────────────────────────────────────────────

export interface Sucursal {
  id: string;
  name: string;
  warehouseCount: number;
}

export interface CreateSucursalDto {
  name: string;
}

export type UpdateSucursalDto = Partial<CreateSucursalDto>;

export interface UsuarioSucursales {
  branches: string[];
  defaultBranch: string | null;
}

export interface UsuarioAlmacenesPermitidos {
  warehouses: string[];
}

// ─── Transferencias (Warehouse Transfers) ──────────────────────────────────────

export interface TransferenciaItem {
  itemCode: string;
  itemName?: string;
  qty: number;
}

export interface Transferencia {
  id: string;
  status: "draft" | "in_transit" | "completed" | "cancelled";
  fromWarehouse: string;
  toWarehouse: string;
  notes?: string;
  items: TransferenciaItem[];
  confirmationId: string | null;
  createdAt: string;
}

export interface CreateTransferenciaDto {
  fromWarehouse: string;
  toWarehouse: string;
  items: { itemCode: string; qty: number }[];
  notes?: string;
}

// Config → Almacenes (distinct resource/endpoint from Inventory → Warehouse)
export interface AlmacenListItem {
  /** Nombre completo del almacén en ERPNext (ej. "Bodega Principal - JB") — es lo que hay que
   *  mandar como `warehouse` en líneas de documentos y lo que usa `stockByWarehouse`. */
  id: string;
  /** Nombre corto/amigable para mostrar (ej. "Bodega Principal") */
  name: string;
  disabled: boolean;
  branch?: string | null;
  warehouseType?: string;
  /** Cuenta de inventario asociada — antes solo se veía consultando uno por uno */
  account?: string | null;
}

export interface CreateAlmacenDto {
  warehouseName: string;
  warehouseType?: string;
  city?: string;
  parentWarehouse?: string;
  account?: string;
  branch?: string;
}

export type UpdateAlmacenDto = Partial<CreateAlmacenDto>;

export interface InventoryHistory {
  itemCode: string;
  itemName: string;
  warehouse: string;
  voucherType: string;
  voucherNo: string;
  movementQty: number;
  stockAfter: number;
  valuationRate: number;
  postingDate: string;
}

// ─── Physical Count ───────────────────────────────────────────────────────────
// API: CreateCountDto requires postingDate (root), items have {itemCode, warehouse, qty}
// The "countedQty" concept is just "qty" in the BFF.

export interface InventoryCount {
  id: string;
  status: "Draft" | "Submitted";
  postingDate: string;
  remarks?: string;
  branch?: string | null;
  department?: string | null;
  items: {
    itemCode: string;
    warehouse: string;
    qty: number; // this is the counted qty
    valuationRate?: number;
  }[];
  createdAt: string;
  modifiedAt: string;
}

export interface InventoryCountTemplate {
  itemCode: string;
  itemName: string;
  warehouse: string;
  currentQty: number; // current system stock
}

export interface CreateCountDto {
  postingDate: string; // required
  remarks?: string;
  branch?: string;
  department?: string;
  items: {
    itemCode: string;
    warehouse: string;
    qty: number; // counted qty (was countedQty — renamed to match API)
    valuationRate?: number;
  }[];
}

// ─── Compra (Purchase Invoice — update_stock=1) ───────────────────────────────
// CompraItemDto has NO description field.

export interface CompraItem {
  itemCode: string;
  qty: number;
  rate: number;
  amount: number;
  warehouse?: string;
  uom?: string;
  serials?: string[];
  batches?: { batchId: string; expiryDate?: string; qty: number }[];
  // NOTE: no "description" in CompraItemDto per BFF schema
}

export interface Compra {
  id: string;
  supplier: string;
  supplierName: string;
  postingDate: string;
  dueDate: string;
  branch?: string | null;
  department?: string | null;
  status: "draft" | "submitted" | "cancelled";
  currency: string;
  items: CompraItem[];
  grandTotal: number;
  /** Monto total de impuestos del documento (Purchase Taxes and Charges), si se aplicó un template */
  taxAmount?: number;
  ncfProveedor?: string;
  tipoBienes606?: string;
  formaPago606?: string;
  retencionIsr?: number;
  tipoPago?: "Contado" | "Crédito";
  amendedFrom?: string;
}

export interface CreateCompraDto {
  supplier: string;
  postingDate: string;
  dueDate?: string;
  branch?: string;
  department?: string;
  currency?: string;
  conversionRate?: number;
  items: {
    itemCode: string;
    qty: number;
    rate: number;
    warehouse?: string;
    uom?: string;
    serials?: string[];
    batches?: { batchId: string; expiryDate?: string; qty: number }[];
    // NO description
  }[];
  ncfProveedor?: string;
  tipoBienes606?: string;
  formaPago606?: string;
  retencionIsr?: number;
  tipoPago?: "Contado" | "Crédito";
  /** ID de un Purchase Taxes and Charges Template (/config/impuestos-compras). Si se omite, se usa el default de la compañía si existe. */
  taxesTemplate?: string;
}

export type UpdateCompraDto = Partial<CreateCompraDto>;

// ─── Gasto (Purchase Invoice — update_stock=0) ────────────────────────────────
// GastoItemDto: itemCode, qty, rate, uom?, description? (description is allowed)

export interface GastoItem {
  itemCode: string;
  itemName?: string;
  qty: number;
  rate: number;
  amount: number;
  uom?: string;
  description?: string;
}

export interface Gasto {
  id: string;
  supplier: string;
  supplierName: string;
  postingDate: string;
  dueDate: string;
  branch?: string | null;
  department?: string | null;
  status: "draft" | "submitted" | "cancelled";
  currency: string;
  items: GastoItem[];
  total: number;
  grandTotal: number;
  outstandingAmount: number;
  ncfProveedor?: string;
  tipoComprobante?: "B01" | "B13" | "B14" | "B15" | "B16" | "B17" | "E31";
  tipoBienes606?: string;
  formaPago606?: string;
  retencionItbis?: number;
  retencionIsr?: number;
  categoriaGasto?: "Operativo" | "Administrativo" | "Ventas" | "Financiero";
  esDeducible?: boolean;
  amendedFrom?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export interface CreateGastoDto {
  supplier: string;
  postingDate: string;
  dueDate?: string;
  branch?: string;
  department?: string;
  currency?: string;
  conversionRate?: number;
  items: {
    itemCode: string;
    qty: number;
    rate: number;
    uom?: string;
    description?: string; // allowed in GastoItemDto
  }[];
  ncfProveedor?: string;
  tipoComprobante?: "B01" | "B13" | "B14" | "B15" | "B16" | "B17" | "E31";
  tipoBienes606?: string;
  formaPago606?: string;
  retencionItbis?: number;
  retencionIsr?: number;
  categoriaGasto?: "Operativo" | "Administrativo" | "Ventas" | "Financiero";
  esDeducible?: boolean;
}

export type UpdateGastoDto = Partial<CreateGastoDto>;

// ─── Usuario ──────────────────────────────────────────────────────────────────

export interface Usuario {
  email: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  enabled: boolean;
  roles: string[];
  language?: string;
  timeZone?: string;
  mobileNo?: string;
  lastActive?: string;
  maxDiscountPct?: number;
  warehouses?: string[];
  defaultWarehouse?: string;
  branches?: string[];
  defaultBranch?: string;
}

export interface CreateUsuarioDto {
  email: string;
  firstName: string;
  lastName?: string;
  mobileNo?: string;
  roles: string[];
  language?: string;
  timeZone?: string;
  sendWelcomeEmail?: boolean;
  warehouses?: string[];
  maxDiscountPct?: number;
}

export interface UpdateUsuarioDto {
  firstName?: string;
  lastName?: string;
  mobileNo?: string;
  roles?: string[];
  warehouses?: string[];
  defaultWarehouse?: string;
  maxDiscountPct?: number;
  branches?: string[];
  defaultBranch?: string;
}

export interface Role {
  name: string;
}

// ─── Tax Templates ────────────────────────────────────────────────────────────

export type TaxChargeType =
  | "On Net Total"
  | "Actual"
  | "On Previous Row Amount"
  | "On Previous Row Total"
  | "On Item Quantity";

export type TaxLineCategory = "Valuation and Total" | "Valuation" | "Total";
export type TaxLineAddDeduct = "Add" | "Deduct";

export interface TaxTemplateLine {
  chargeType: TaxChargeType;
  accountHead: string;
  rate: number;
  description?: string;
  /** Solo aplica a impuestos de COMPRA. Se ignora si el template es de ventas. */
  category?: TaxLineCategory;
  /** Solo aplica a impuestos de COMPRA. Se ignora si el template es de ventas. */
  addDeductTax?: TaxLineAddDeduct;
}

export interface TaxTemplate {
  id: string;
  title: string;
  isDefault: boolean;
  taxes: TaxTemplateLine[];
}

export interface CreateTaxTemplateDto {
  title: string;
  isDefault?: boolean;
  taxes: TaxTemplateLine[];
}

// ─── Item Tax Templates (impuesto por artículo — distinto de TaxTemplate de documento) ────────

export interface ItemTaxLine {
  /** Cuenta contable del impuesto */
  taxType: string;
  rate: number;
  /** Si es true, el artículo queda exento de este impuesto (tasa 0 explícita) */
  notApplicable?: boolean;
}

export interface ItemTaxTemplate {
  id: string;
  title: string;
  taxes: ItemTaxLine[];
}

export interface CreateItemTaxTemplateDto {
  title: string;
  taxes: ItemTaxLine[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface Empresa {
  companyName: string;
  rnc?: string;
  regimenFiscal?: "Ordinario" | "Simplificado" | "RST";
  actividadEconomica?: string;
  representanteLegal?: string;
  cedulaRepresentante?: string;
  logoUrl?: string;
  telefono?: string;
  email?: string;
  website?: string;
  direccion?: string;
  defaultCurrency?: string;
  country?: string;
  itemCodeMode?: "manual" | "auto" | "prefix_auto";
  defaultWarehouse?: string;
  defaultPriceTipo?: "A" | "B" | "C";
  transitWarehouse?: string | null;
}

export interface UpdateEmpresaDto {
  rnc?: string;
  regimenFiscal?: "Ordinario" | "Simplificado" | "RST";
  actividadEconomica?: string;
  representanteLegal?: string;
  cedulaRepresentante?: string;
  logoUrl?: string;
  telefono?: string;
  email?: string;
  website?: string;
  direccion?: string;
  itemCodeMode?: "manual" | "auto" | "prefix_auto";
  defaultWarehouse?: string;
  defaultPriceTipo?: "A" | "B" | "C";
  transitWarehouse?: string;
}

export interface CobrosConfig {
  limiteCreditoAmarilloPct: number;
  limiteCreditoRojoPct: number;
  diasAlertaVencimiento: number;
  rangoAging1Dias: number;
  rangoAging2Dias: number;
  rangoAging3Dias: number;
  rangoAging4Label: string;
  enviarRecordatorioAutomatico: boolean;
}

// GET/PUT /config/facturacion
export interface FacturacionConfig {
  rolesCancelacionFactura: string[];
  /** "directo": un solo método de pago al cobrar (default, histórico). "caja": múltiples métodos + vuelto. */
  flujoCobro: "directo" | "caja";
  /** Si está activo, no se puede vender un artículo de inventario sin una Ubicación asignada dentro del almacén de facturación. */
  requiereUbicacionVenta?: boolean;
  /** true si el módulo POS (turnos de caja) está activo para este tenant. */
  usaModuloPos?: boolean;
  /** Nombre del POS Profile provisionado — solo informativo, no editable desde aquí. */
  posProfileDefault?: string | null;
  /** Si está activo, cerrar un turno de caja exige el desglose de denominaciones contadas para el/los modos de pago en efectivo. */
  arqueoEfectivoRequerido?: boolean;
}

// POST /config/pos/habilitar
export interface HabilitarPosDto {
  warehouse: string;
}

export interface HabilitarPosResult {
  posProfile: string;
  cajeroRole: string;
}

// ─── Turnos de caja (POS) ──────────────────────────────────────────────────

export interface BalanceDetailLine {
  modeOfPayment: string;
  openingAmount: number;
}

// GET /pos/turnos/actual — null si el cajero no tiene turno abierto
export interface TurnoCaja {
  openingEntryId: string;
  posProfile: string;
  company: string;
  periodStartDate: string;
}

// POST /pos/turnos/abrir
export interface AbrirTurnoDto {
  /** Si se omite, usa el POS Profile default del tenant. */
  posProfile?: string;
  balanceDetails: BalanceDetailLine[];
}

export interface PaymentReconciliationLine {
  modeOfPayment: string;
  openingAmount: number;
  expectedAmount: number;
  /** En la vista previa siempre es 0 — el cajero todavía no ha contado nada. */
  closingAmount: number;
  /** closingAmount - expectedAmount. Negativo = faltante, positivo = sobrante. */
  difference: number;
}

// GET /pos/turnos/:openingEntryId/preview-cierre
export interface PreviewCierreTurno {
  posOpeningEntry: string;
  periodStartDate: string;
  periodEndDate: string;
  grandTotal: number;
  netTotal: number;
  totalQuantity: number;
  paymentReconciliation: PaymentReconciliationLine[];
}

export interface DenominacionCierreDto {
  denominacion: string;
  cantidad: number;
}

export interface ClosingAmountLine {
  modeOfPayment: string;
  amount: number;
  /** Desglose de billetes/monedas contados para este modo de pago (arqueo). Solo para efectivo. */
  denominaciones?: DenominacionCierreDto[];
}

// POST /pos/turnos/:openingEntryId/cerrar
export interface CerrarTurnoDto {
  closingAmounts: ClosingAmountLine[];
}

export interface CierreTurnoResult {
  id: string;
  status: string;
  paymentReconciliation: PaymentReconciliationLine[];
}

// GET /pos/turnos — fila del historial de turnos
export interface TurnoListItem {
  id: string;
  cajero: string;
  posProfile: string;
  company: string;
  periodStartDate: string;
  status: "Open" | "Closed";
  closingEntryId?: string;
  periodEndDate?: string;
  grandTotal?: number;
  totalDifference?: number;
}

// GET /pos/turnos/:id — detalle completo
export interface TurnoDetail {
  id: string;
  status: "Open" | "Closed";
  posProfile: string;
  company: string;
  user: string;
  periodStartDate: string;
  balanceDetails: BalanceDetailLine[];
  closing?: TurnoClosing | null;
}

export interface TurnoClosing {
  id: string;
  status: string;
  posOpeningEntry: string;
  posProfile: string;
  user: string;
  periodStartDate: string;
  periodEndDate: string;
  grandTotal: number;
  netTotal: number;
  totalQuantity: number;
  paymentReconciliation: PaymentReconciliationLine[];
  denominacionesEfectivo: DenominacionCierreDto[];
}

// GET /reportes/pos/cuadre-turno — una fila por combinación turno + modo de pago
export interface CuadreTurnoRow {
  closingEntryId: string;
  cajero: string;
  posProfile: string;
  periodStartDate: string;
  periodEndDate: string;
  grandTotal: number;
  modeOfPayment: string;
  openingAmount: number;
  expectedAmount: number;
  closingAmount: number;
  difference: number;
}

export interface CuadreTurnoResult {
  rows: CuadreTurnoRow[];
  totalRows: number;
}

export interface MetodoPago {
  name: string;
  type: "Cash" | "Bank" | "General";
  codigo606?: string;
  disabled: boolean;
}

// GET /config/bancos — catálogo nativo ERPNext (Bank), solo lectura
export interface Banco {
  id: string;
  name: string;
}

// GET/POST/PUT /config/denominaciones — catálogo de billetes/monedas para el desglose de vuelto
export interface Denominacion {
  id: string;
  denominacion: string;
  valor: number;
  activo: boolean;
}

export interface CreateDenominacionDto {
  denominacion: string;
  valor: number;
  activo?: boolean;
}

export interface UpdateDenominacionDto {
  valor?: number;
  activo?: boolean;
}

export interface PaymentLine {
  modeOfPayment: string;
  amount: number;
  cardNumber?: string;
  authorizationCode?: string;
  bank?: string;
  checkNumber?: string;
}

export interface VueltoLine {
  denominacion: string;
  cantidad: number;
}

// POST /caja/facturas/:id/cobrar
export interface CobrarFacturaDto {
  payments: PaymentLine[]
  vuelto?: VueltoLine[]
  tenderedCash?: number
}

/** Resumen del cobro registrado al someter una factura (presente cuando se enviaron payments). */
export interface CobroResumen {
  invoiceId: string;
  paymentEntryIds: string[];
  outstandingAmount: number;
  fullyPaid: boolean;
  vuelto: VueltoLine[];
}

/** Respuesta de POST /invoices/:id/submit cuando usaModuloPos=true y se envían payments.
 *  La factura no recibe NCF todavía — pasa a la cola de "por cobrar" en Caja. */
export interface PendienteCobroSubmitResult {
  invoiceId: string;
  status: "pendiente_cobro";
  message: string;
}

/** Fila de GET /caja/por-cobrar — factura en borrador que espera completar cobro (sin NCF aún). */
export interface PendienteCobroItem {
  id: string;
  customer: string;
  customerName: string;
  grandTotal: number;
  postingDate: string;
}

/** Respuesta de POST /caja/facturas/:id/completar-cobro. */
export interface CompletarCobroResult {
  invoiceId: string;
  ncf: string;
  isPos: boolean;
  paymentEntryIds: string[];
  outstandingAmount: number;
  fullyPaid: boolean;
  vuelto: VueltoLine[];
}

export type SubmitInvoiceResult = Invoice | PendienteCobroSubmitResult;

export interface ListaPrecio {
  name: string;
  currency: string;
  buying: boolean;
  selling: boolean;
  enabled: boolean;
}

export interface UOM {
  name: string;
  mustBeWholeNumber: boolean;
}

export interface UomConversionEntry {
  id?: string;
  toUom: string;
  factor: number;
}

export interface UOMDetail extends UOM {
  conversions: UomConversionEntry[];
}

export interface CreateUOMDto {
  name: string;
  conversions?: { toUom: string; factor: number }[];
}

export interface UpdateUOMDto {
  name?: string;
  conversions?: { toUom: string; factor: number }[];
}

export interface Grupo {
  name: string;
  parentGroup?: string;
}

// NcfSerie — matches actual BFF response exactly.
// id is an integer (ERPNext autoincrement), NOT a UUID.
// nextNcf = -1 is a special signal meaning "exhausted" — never display -1 to users.
export interface NcfSerie {
  id: number;
  ncfType: "B01" | "B02" | "B14" | "B15";
  start: number;
  end: number;
  nextNcf: number; // -1 means exhausted
  expirationDate: string;
  disabled: boolean;
  remaining: number;
  // Detail-only fields (GET /config/ncf/:id)
  exhausted?: boolean;
  used?: number;
  usedPct?: number;
}

export interface CreateNcfSerieDto {
  ncfType: "B01" | "B02" | "B14" | "B15";
  start: number;
  end: number;
  nextNcf: number; // should equal start on creation
  expirationDate: string; // must be a future date
}

export interface UpdateNcfSerieDto {
  ncfType?: "B01" | "B02" | "B14" | "B15"; // only if used === 0
  end?: number; // can only extend (increase), never reduce
  expirationDate?: string;
  // start is also updatable if used === 0, but omit from PUT for simplicity
}

// Response shape from disable/enable actions
export interface NcfActionResult {
  message: string;
  ncfType: string;
  remaining?: number;
  nextNcf?: number;
  warnings: string[];
}

// ─── Cobros ───────────────────────────────────────────────────────────────────

export interface AgingEntry {
  customer: string;
  customerName: string;
  totalOutstanding: number;
  current: number;
  range1: number;
  range2: number;
  range3: number;
  range4: number;
}

export interface SemaforoEntry {
  customer: string;
  customerName: string;
  creditLimit: number;
  balance: number;
  pctUsado?: number;
  semaforo: "verde" | "amarillo" | "rojo";
}

export interface SemaforoResumen {
  total: number;
  verde: number;
  amarillo: number;
  rojo: number;
}

export interface SemaforoResult {
  resumen: SemaforoResumen;
  clientes: SemaforoEntry[];
}

export interface PaymentEntryReferencia {
  invoiceId: string;
  invoiceName?: string;
  allocatedAmount: number;
}

export interface PaymentEntry {
  id: string;
  status: "draft" | "submitted" | "cancelled";
  customer: string;
  customerName: string;
  postingDate: string;
  paidAmount: number;
  modeOfPayment: string;
  referenceNo?: string;
  referenceDate?: string;
  remarks?: string;
  branch?: string | null;
  department?: string | null;
  referencias?: PaymentEntryReferencia[];
  createdAt: string;
  modifiedAt?: string;
  /** true when this row comes from a POS sale (is_pos=1) — id is a Sales Invoice, not a Payment Entry */
  isPosSale?: boolean;
}

// CreateCobroDto — matches BFF's CreateCobroDto exactly
export interface CreateCobroDto {
  customer: string;
  postingDate: string;
  paidAmount: number;
  modeOfPayment: string;
  referenceNo?: string;
  referenceDate?: string;
  remarks?: string;
  branch?: string;
  department?: string;
  referencias?: {
    invoiceId: string;
    allocatedAmount: number;
    /** Requerido en 'Sales Order' para aplicar el anticipo a un pedido de apartado; default (factura) si se omite */
    referenceDoctype?: "Sales Order" | "Sales Invoice";
  }[];
}

// Alias for backward compat in existing pages
export type RegisterPagoDto = CreateCobroDto;

// ─── Saldo a favor (cobro anticipado / sobrepago) ────────────────────────────

// GET /cobros/saldo-favor/:customerId
export interface SaldoFavorAppliedTo {
  invoiceId: string;
  allocatedAmount: number;
}

export interface SaldoFavorEntry {
  paymentEntryId: string;
  unallocatedAmount: number;
  postingDate: string;
  modeOfPayment: string;
  /** Monto ya comprometido/aplicado a facturas (via appliedTo) */
  committedAmount: number;
  /** Monto realmente libre para aplicar a una factura nueva (unallocatedAmount neto de lo ya comprometido) */
  availableAmount: number;
  /** Facturas a las que ya se aplicó este Payment Entry */
  appliedTo: SaldoFavorAppliedTo[];
}

export interface SaldoFavorResult {
  customer: string;
  balance: number;
  entries: SaldoFavorEntry[];
}

// POST /invoices/:id/aplicar-saldo-favor
export interface AplicarSaldoFavorDto {
  paymentEntryId: string;
  amount: number;
}

// ─── Reportes ─────────────────────────────────────────────────────────────────

export interface Reporte606Entry {
  rncProveedor: string;
  proveedor: string;
  ncf: string;
  ncfType: string;
  fecha: string;
  montoFacturado: number;
  itbisFacturado: number;
}

export interface Reporte607Entry {
  rncProveedor: string;
  proveedor: string;
  ncf: string;
  tipoRenta: string;
  montoRetenido: number;
  fecha: string;
}

export interface Reporte608Entry {
  rncCliente: string;
  cliente: string;
  ncf: string;
  ncfType: string;
  fecha: string;
  montoFacturado: number;
  itbisFacturado: number;
}

// ─── Cuenta (Chart of Accounts) ────────────────────────────────────────────

export interface Cuenta {
  id: string; // full ERPNext name e.g. "Ventas - JB"
  accountName: string;
  accountNumber?: string;
  accountType?: string;
  rootType: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  /** Derivado: Income/Expense → 'Profit and Loss', el resto → 'Balance Sheet'. Solo lectura. */
  reportType?: "Profit and Loss" | "Balance Sheet";
  parentAccount?: string;
  isGroup: boolean;
  disabled: boolean;
  currency: string;
  debit: number;
  credit: number;
  balance: number;
  children?: Cuenta[]; // only in tree response
}

export interface CreateCuentaDto {
  accountName: string; // required
  /** Requerido salvo que se envíe rootType (cuenta raíz nueva, junto con isGroup: true) */
  parentAccount?: string;
  /** Solo para crear una cuenta raíz (sin parentAccount), junto con isGroup: true */
  rootType?: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  accountType?: string;
  accountNumber?: string;
  currency?: string; // default 'DOP'
  isGroup?: boolean;
}

export interface UpdateCuentaDto {
  accountName?: string;
  accountNumber?: string;
  disabled?: boolean;
  // Only editable when no GL movements:
  accountType?: string;
  parentAccount?: string;
  currency?: string;
}

// ─── Cuentas de la Empresa ──────────────────────────────────────────────────

export interface ItemProps {
  id: string;
  name: string;
}

export interface CuentasEmpresa {
  defaultReceivableAccount?: string;
  defaultPayableAccount?: string;
  defaultIncomeAccount?: string;
  defaultExpenseAccount?: string;
  defaultBankAccount?: string;
  writeOffAccount?: string;
  roundOffAccount?: string;
  // 🆕 16 campos nuevos (ver plan/IMPLEMENTACION.md sección 6)
  defaultCashAccount?: string;
  defaultInventoryAccount?: string;
  stockReceivedButNotBilled?: string;
  stockAdjustmentAccount?: string;
  defaultDeferredRevenueAccount?: string | null;
  defaultDeferredExpenseAccount?: string | null;
  exchangeGainLossAccount?: string | null;
  unrealizedExchangeGainLossAccount?: string | null;
  accumulatedDepreciationAccount?: string | null;
  depreciationExpenseAccount?: string | null;
  disposalAccount?: string | null;
  defaultDiscountAccount?: string | null;
  costCenter?: ItemProps;
  roundOffCostCenter?: ItemProps;
  depreciationCostCenter?: ItemProps;
  enablePerpetualInventory?: boolean;
}

export type UpdateCuentasEmpresaDto = CuentasEmpresa;

// ─── Journal Entry ──────────────────────────────────────────────────────────

export interface JournalEntryLine {
  account: string;
  debit: number;
  credit: number;
  description?: string;
  /** Dimensión por línea — obligatoria si la cuenta es de tipo Ingreso/Gasto (reportType "Profit and Loss") */
  branch?: string;
  department?: string;
  costCenter?: string;
}

export interface JournalEntry {
  id: string;
  postingDate: string;
  voucherType?: string;
  remarks?: string;
  status: "Draft" | "Submitted" | "Cancelled";
  totalDebit: number;
  totalCredit: number;
  entries?: JournalEntryLine[]; // only in detail
  createdAt: string;
}

export interface CreateJournalEntryDto {
  postingDate: string; // required
  entries: JournalEntryLine[]; // required - must balance (sum debit = sum credit)
  remarks?: string;
  voucherType?: string;
  /** Defaults aplicados a las líneas que no traigan su propio valor */
  branch?: string;
  department?: string;
  costCenter?: string;
}

// ─── Ejercicio Fiscal ──────────────────────────────────────────────────────────

export interface EjercicioFiscal {
  id: string;
  year: string;
  yearStartDate: string;
  yearEndDate: string;
  isClosed: boolean;
  disabled: boolean;
}

export interface CreateEjercicioFiscalDto {
  year: string;
  yearStartDate: string;
  yearEndDate: string;
}

// ─── Cierre de Período ─────────────────────────────────────────────────────────

export interface CierrePeriodo {
  id: string;
  transactionDate: string;
  postingDate: string;
  periodEndDate: string;
  closingFiscalYear: string;
  costCenter: string;
  closingAccountHead: string;
  remarks?: string;
  status: "draft" | "submitted";
  warning?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface CreateCierrePeriodoDto {
  periodEndDate: string;
  closingFiscalYear: string;
  costCenter: string;
  closingAccountHead: string;
  postingDate: string;
  remarks?: string;
}

// ─── Item Attributes (Variants) ───────────────────────────────────────────────

export interface AttributeValue {
  value: string; // "Red", "Blue", "Small", "Large"
  abbr: string; // "RED", "BLU", "S", "L" — used in variant code generation
}

export interface ItemAttribute {
  id: string;
  name: string;
  numeric: boolean;
  // Only in detail response:
  fromRange?: number;
  toRange?: number;
  increment?: number;
  values?: AttributeValue[];
}

export interface CreateAttributeDto {
  name: string;
  numeric?: boolean;
  // For discrete values:
  values?: AttributeValue[];
  // For numeric range:
  fromRange?: number;
  toRange?: number;
  increment?: number;
}

export interface UpdateAttributeDto {
  name?: string;
  values?: AttributeValue[];
}

// Template attribute reference (in item.attributes[])
export interface TemplateAttribute {
  attribute: string; // attribute id/name, e.g. "Colour"
  attributeValue?: string; // only on variants: "Red", "Blue"
}

// Generate variants result
export interface GenerateVariantsResult {
  templateId: string;
  totalCombinations: number;
  created: number;
  skipped: number;
  variants: Item[];
}

// ─── Centros de Costo (Cost Center) ────────────────────────────────────────────

export interface CostCenter {
  id: string;
  name: string;
  number?: string;
  parentCostCenter?: string;
  isGroup: boolean;
  disabled: boolean;
  children?: CostCenter[]; // only in tree response
}

export interface CreateCostCenterDto {
  costCenterName: string;
  costCenterNumber?: string;
  parentCostCenter?: string;
  isGroup?: boolean;
}

export interface UpdateCostCenterDto {
  costCenterName?: string;
  costCenterNumber?: string;
}

// ─── Departamentos (Department) ────────────────────────────────────────────────

export interface Departamento {
  id: string;
  name: string;
  parentDepartment?: string | null;
  isGroup: boolean;
  disabled: boolean;
  children?: Departamento[]; // only in tree response
}

export interface CreateDepartamentoDto {
  name: string;
  parentDepartment?: string;
}

export type UpdateDepartamentoDto = Partial<CreateDepartamentoDto>;

// ─── Settings singletons (Accounts / Stock / Selling / Buying) ────────────────

export interface AccountsSettings {
  enableAccountingDimensions?: boolean;
  enableImmutableLedger?: boolean;
  defaultAgeingRange?: string;
  creditController?: string;
  roleAllowedToOverBill?: string;
  /** El backend siempre rechaza este campo en `true` — no editable */
  deleteLinkedLedgerEntries?: boolean;
  [key: string]: unknown;
}
export type UpdateAccountsSettingsDto = Partial<AccountsSettings>;

export interface StockSettings {
  valuationMethod?: "FIFO" | "Moving Average" | "LIFO";
  defaultWarehouse?: string;
  allowNegativeStock?: boolean;
  enableStockReservation?: boolean;
  [key: string]: unknown;
}
export type UpdateStockSettingsDto = Partial<StockSettings>;

export interface SellingSettings {
  customerGroup?: string;
  territory?: string;
  maintainSameSellingRate?: boolean;
  editableItemRate?: boolean;
  allowMultiplePricingRules?: boolean;
  [key: string]: unknown;
}
export type UpdateSellingSettingsDto = Partial<SellingSettings>;

export interface BuyingSettings {
  supplierGroup?: string;
  maintainSameRateThroughPurchaseCycle?: boolean;
  disableLastPurchaseRate?: boolean;
  allowMultiplePricingRules?: boolean;
  [key: string]: unknown;
}
export type UpdateBuyingSettingsDto = Partial<BuyingSettings>;

// ─── Retenciones (Tax Withholding Category) ───────────────────────────────────

export interface RetencionRate {
  taxWithholdingRate: number;
  fromDate: string;
  toDate: string;
  singleThreshold?: number | null;
  cumulativeThreshold?: number | null;
  taxWithholdingGroup?: string | null;
}

export interface RetencionListItem {
  id: string;
  categoryName: string;
  taxDeductionBasis?: string;
}

export interface Retencion {
  id: string;
  categoryName: string;
  taxDeductionBasis?: string;
  rates: RetencionRate[];
  accounts: { company: string; account: string }[];
}

export interface CreateRetencionDto {
  name: string;
  taxDeductionBasis?: string;
  rates: RetencionRate[];
  account?: string;
}

export type UpdateRetencionDto = Partial<CreateRetencionDto>;

// ─── Costos de Importación (Landed Cost Voucher) ──────────────────────────────

export interface LandedCostReceiptRef {
  receiptDocumentType: "Purchase Receipt" | "Purchase Invoice" | "Stock Entry";
  receiptDocument: string;
}

export interface LandedCostTax {
  description: string;
  amount: number;
  expenseAccount?: string;
}

export interface LandedCostItem {
  itemCode: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
  applicableCharges: number;
  receiptDocumentType: string;
  receiptDocument: string;
}

export interface LandedCostVoucherListItem {
  id: string;
  status: "draft" | "submitted" | "cancelled";
  postingDate: string;
  totalTaxesAndCharges?: number;
}

export interface LandedCostVoucher {
  id: string;
  status: "draft" | "submitted" | "cancelled";
  postingDate: string;
  purchaseReceipts: LandedCostReceiptRef[];
  taxes: LandedCostTax[];
  distributeChargesBasedOn?: "Qty" | "Amount" | "Distribute Manually";
  items?: LandedCostItem[];
}

export interface CreateLandedCostVoucherDto {
  postingDate: string;
  purchaseReceipts: LandedCostReceiptRef[];
  taxes: LandedCostTax[];
  distributeChargesBasedOn?: "Qty" | "Amount" | "Distribute Manually";
}

// ─── Libro Diario (GL) / Libro Mayor ────────────────────────────────────────

/** Fila de movimiento contable (GL Entry) usada en Libro Diario y Libro Mayor. */
export interface GlEntryRow {
  account?: string;
  postingDate?: string;
  voucherType?: string;
  voucherNo?: string;
  party?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  branch?: string;
  department?: string;
  [key: string]: unknown;
}

/** Resumen por dimensión (Sucursal/Departamento) cuando groupBy = 'Group by Sucursal' | 'Group by Departamento'. */
export interface LibroDiarioByDimension {
  key: string;
  totalDebit: number;
  totalCredit: number;
  count: number;
}

export interface LibroDiarioResult {
  rows?: GlEntryRow[];
  byDimension?: LibroDiarioByDimension[];
  [key: string]: unknown;
}

// ─── Notificaciones ─────────────────────────────────────────────────────────

export type NotificacionCategoria =
  | "Contabilidad"
  | "Cuentas por Cobrar"
  | "Cuentas por Pagar"
  | "Inventario"
  | "Compras"
  | "Ventas"
  | "Logística"
  | "Seguridad";

export interface NotificacionDestinatario {
  email: string;
  nombre?: string;
}

export interface NotificacionTipoListItem {
  codigo: string;
  categoria: NotificacionCategoria;
  nombre: string;
  descripcion: string;
  activo: boolean;
  canalEmail: boolean;
  destinatarios: NotificacionDestinatario[];
}

export interface NotificacionTipo extends NotificacionTipoListItem {
  destinatarios: NotificacionDestinatario[];
}

export interface UpdateNotificacionTipoDto {
  activo?: boolean;
  canalEmail?: boolean;
  destinatarios?: NotificacionDestinatario[];
}

export interface NotificacionCanalEmail {
  configurado: boolean;
  email?: string;
  host?: string;
  puerto?: number;
  tls?: boolean;
  ssl?: boolean;
  habilitado?: boolean;
}

export interface UpdateNotificacionCanalEmailDto {
  email: string;
  host: string;
  puerto: number;
  tls?: boolean;
  ssl?: boolean;
  habilitado?: boolean;
  usuario: string;
  password?: string;
}

// ─── Notificaciones — Historial de envíos (observabilidad) ──────────────────

export interface NotificacionLogEntry {
  id: string;
  tipo: string;
  referencia: string | null;
  destinatarios: string[];
  estado: "Enviado" | "Fallido";
  fecha: string;
  error: string | null;
}

export interface NotificacionLogResumen {
  dias: number;
  total: number;
  enviados: number;
  fallidos: number;
  ultimoIntento: {
    tipo: string;
    estado: "Enviado" | "Fallido";
    fecha: string;
  } | null;
}

export interface ListNotificacionLogsParams {
  limit?: number;
  offset?: number;
  tipo?: string;
  estado?: "Enviado" | "Fallido";
  referencia?: string;
  desde?: string;
  hasta?: string;
  orderBy?: string;
}

export interface ProbarNotificacionDto {
  email: string;
  nombre?: string;
}
