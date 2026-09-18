// ─── Universal API Response Shapes ───────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  /** Presente en algunos 409 (ej. Client de Vega duplicado, bloqueos al desactivar el módulo POS). */
  details?: Record<string, unknown>;
}

/** `details` de un error `STOCK_INSUFFICIENT_OR_RESERVED` con estructura completa — solo viene así
 *  desde `/transferencias` y `/despachos` (vía `assertDisponibleNoReservado`). El mismo código
 *  también puede llegar SIN `details` desde el submit nativo de ERPNext (Factura/Delivery Note con
 *  update_stock=1) — ver docs/tasks/73_alertas_stock_disponible_reservado.md §4.1. */
export interface StockInsufficientOrReservedDetails {
  itemCode: string;
  warehouse: string;
  actualQty: number;
  reservedStock: number;
  disponible: number;
  solicitado: number;
  faltante: number;
}

/** `details` de un error `UOM_NOT_ALLOWED` — docs/tasks/
 *  75_almacen_venta_confirmar_stock_uoms_permitidas.md §3.4. */
export interface UomNotAllowedDetails {
  itemCode: string;
  uom: string;
  direction: "purchase" | "sale";
  permitidas: string[];
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

// ─── Identidad Global — docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md ────────
// Reemplaza por completo el modelo anterior de un solo JWT atado a un tenant: ahora un login
// devuelve un `refresh_token` (la sesión, global, 30 días) + un `access_token` (JWT, 8h, por
// TENANT ACTIVO, puede venir `null`) — ver §1 del prompt para el modelo mental completo.

export interface LoginRequest {
  email: string;
  password: string;
  /** Opcional — slug del tenant a activar de una vez. Si el usuario no tiene una membresía
   *  `accepted` con ese slug, el login sigue siendo válido pero responde sin `access_token`. */
  tenant?: string | null;
}

/** Tenant activo resuelto por el login/refresh/switch-tenant — NUNCA null cuando viene dentro de
 *  un `AuthResult.tenant` con `access_token` no nulo (van siempre juntos). */
export interface AuthTenant {
  slug: string;
  siteUrl: string;
  id: string;
  vertical: "general" | "farmacia";
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
}

/** Una fila de `AuthResult.tenants[]` — TODAS las membresías de la persona, sin filtrar, sin
 *  importar el estado (§3.3). Solo `status === 'accepted'` da acceso real. */
export interface AuthMembership {
  slug: string;
  name: string;
  vertical: "general" | "farmacia";
  status: MembershipStatus;
  isDefault: boolean;
  roles: string[];
}

export type MembershipStatus = "invited" | "accepted" | "rejected" | "revoked" | "suspended";

/** Shape completo devuelto por los 5 endpoints que autologuean: /auth/login (sin 2FA),
 *  /auth/mfa/verify, /auth/invitations/:token/accept, /auth/oauth/exchange, /auth/reset-password. */
export interface AuthResult {
  refresh_token: string;
  /** `null` si el backend no pudo determinar automáticamente qué tenant activar — ver §3.4/§3.5
   *  del prompt. En ese caso `tenant` también viene `null` y hay que mostrar un selector. */
  access_token: string | null;
  token_type: string;
  expires_in: number;
  user: AuthUser;
  tenants: AuthMembership[];
  tenant: AuthTenant | null;
}

/** `POST /auth/login` responde esto (200, no 401) cuando la contraseña era correcta pero la
 *  cuenta tiene 2FA confirmado — no hay tokens todavía, hay que completar POST /auth/mfa/verify. */
export interface MfaRequiredResult {
  mfaRequired: true;
  mfaToken: string;
  factors: { id: string; type: MfaFactorType; label?: string }[];
}

export type LoginResult = AuthResult | MfaRequiredResult;

export function isMfaRequired(result: LoginResult): result is MfaRequiredResult {
  return (result as MfaRequiredResult).mfaRequired === true;
}

export interface MfaVerifyDto {
  mfaToken: string;
  /** Solo hace falta si `factors` del login traía más de uno. */
  factorId?: string;
  /** TOTP de 6 dígitos, código de email de 6 dígitos, o código de recuperación (XXXXX-XXXXX) —
   *  un solo campo de texto en la UI, el backend distingue el formato. */
  code: string;
  /** Mismo valor (si lo hubo) que se mandó en el POST /auth/login original. */
  tenant?: string | null;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

/** `POST /auth/refresh` — mismo criterio de resolución de tenant que el login sin `tenant`
 *  explícito (§3.4 puntos 3-5), nunca el §3.4 punto 1/2 (no hay forma de pedir un tenant acá). */
export interface RefreshTokenResult {
  refresh_token: string;
  access_token: string | null;
  token_type: string;
  expires_in: number;
  tenant: AuthTenant | null;
}

export interface LogoutDto {
  refreshToken: string;
  /** `true` = cerrar TODAS las sesiones de la persona, en todos los dispositivos. */
  all?: boolean;
}

export interface SwitchTenantDto {
  refreshToken: string;
  tenant: string;
}

export interface SwitchTenantResult {
  access_token: string;
  token_type: string;
  expires_in: number;
  tenant: AuthTenant;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ForgotPasswordResult {
  message: string;
}

/** Global — ya no lleva `email`/`key`/`tenant`, un solo `token` de la URL del correo. */
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

// ─── 2FA (Doble factor de autenticación) — §5 ─────────────────────────────────

export type MfaFactorType = "totp" | "email";

export interface MfaFactor {
  id: string;
  type: MfaFactorType;
  label?: string;
  /** `false` = alta de TOTP iniciada pero nunca confirmada — no cuenta para el login todavía. */
  confirmed: boolean;
  /** Cuál factor se usa por defecto si hay más de uno confirmado — lo asigna el backend solo. */
  isPreferred: boolean;
}

export interface TotpEnrollResult {
  secret: string;
  otpauthUrl: string;
}

export interface TotpConfirmDto {
  code: string;
}

/** `recoveryCodes` viene UNA SOLA VEZ en esta respuesta — no se puede volver a pedir. */
export interface TotpConfirmResult {
  message: string;
  recoveryCodes: string[];
  recoveryCodesWarning: string;
}

// ─── Perfil propio — §7 ────────────────────────────────────────────────────────

export interface MeProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  locale?: string;
  timeZone?: string;
  mfaEnabled: boolean;
  tenants: AuthMembership[];
}

export interface PatchMeProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface ChangeMyPasswordDto {
  currentPassword: string;
  newPassword: string;
}

// ─── Invitaciones — §6.3, §7.4 ─────────────────────────────────────────────────

export interface InvitationDetail {
  tenantName: string;
  tenantSlug: string;
  email: string;
  purpose: "registration" | "invitation";
  /** `true` = la persona todavía no tiene contraseña fijada, hay que pedirla al aceptar. */
  requiresPassword: boolean;
  expiresAt: string;
}

export interface AcceptInvitationDto {
  /** Solo si `InvitationDetail.requiresPassword` era `true`. */
  password?: string;
}

// ─── Login con Google (OAuth2) — §8 ────────────────────────────────────────────

export interface OauthExchangeDto {
  ticket: string;
}

export interface LinkedIdentity {
  id: string;
  provider: "google";
  emailAtLink: string;
  linkedAt: string;
}

// ─── Customer ─────────────────────────────────────────────────────────────────
// API schema: CreateCustomerDto does NOT have tipoIdentificacion.
// Identification type is inferred from rnc/cedula presence.

export interface TelefonoCliente {
  telefono: string;
  /** Libre — solo para identificarlo en la UI (ej. "Oficina", "Celular", "WhatsApp"). No es un enum fijo. */
  etiqueta?: string;
}

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
  isSystemManaged?: boolean;
  customerGroup?: string;
  priceTier?: "A" | "B" | "C";
  /** Reemplaza conceptualmente a `phone` para múltiples teléfonos — solo viene poblado en GET /customers/:id. */
  telefonos?: TelefonoCliente[];
  /** Nombre del Branch — solo para filtrar/agrupar clientes en la UI, sin efecto contable. */
  branch?: string;
  /** Mode of Payment por defecto — prellena el método de pago al facturar a este cliente. */
  formaPagoDefault?: string;
  /** Cuenta contable (Account) alterna para la CxC de este cliente — si se omite, se usa el default de la compañía. */
  cuentaCxcDefault?: string;
  /** Moneda por defecto de este cliente ('DOP'|'USD'|'EUR') — debe estar habilitada primero si
   *  difiere de la moneda base (ver GET /monedas). Al fijarla, autopobla `cuentaCxcDefault` con
   *  la cuenta CxC de esa moneda salvo que se mande `cuentaCxcDefault` explícito en el mismo
   *  request. Ver docs/tasks/64_multimoneda_completo.md Fase 2. */
  defaultCurrency?: string | null;
  /** Email del usuario (User) responsable de la cobranza de este cliente. */
  encargadoCxc?: string;
  /** IDs de Sales Taxes and Charges Template — prellenan el impuesto al facturar a este cliente. Solo viene poblado en GET /customers/:id. */
  impuestoVentasDefault?: string[];
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
  telefonos?: TelefonoCliente[];
  branch?: string;
  formaPagoDefault?: string;
  cuentaCxcDefault?: string;
  /** Ver `Customer.defaultCurrency`. Si al editar se manda igual a la moneda base de la
   *  compañía, el backend limpia `cuentaCxcDefault` automáticamente salvo que también se
   *  mande explícito en el mismo request. */
  defaultCurrency?: string;
  encargadoCxc?: string;
  impuestoVentasDefault?: string[];
}

export type UpdateCustomerDto = Partial<
  Omit<CreateCustomerDto, "customerType">
> & {
  customerType?: "Company" | "Individual";
};

// ─── Aseguradora (ARS) ────────────────────────────────────────────────────────
// Vertical Farmacia: una ARS es, por debajo, el mismo doctype `Customer` que un cliente, pero el
// BFF la expone en un CRUD aparte (`/aseguradoras`). Siempre es una empresa (RNC obligatorio, sin
// opción Individual). `hasCredit` viene `true` por defecto al crear — es precondición para poder
// facturar un lote consolidado a la ARS. Ver docs/PROMPT_ASEGURADORAS.md y docs/PROMPT_FARMACIA_V2_FRONTEND.md §6.
// NOTA: `openapi.json` no documenta un schema de respuesta; los nombres de campo se confirmaron
// contra una respuesta real. `customerName` se deja como fallback tolerante de `nombre`.

export interface Aseguradora {
  id: string;
  nombre: string;
  /** Fallback si el backend devuelve `customerName` en vez de `nombre`. */
  customerName?: string;
  rnc?: string;
  email?: string;
  phone?: string;
  address?: string;
  hasCredit: boolean;
  creditLimit: number;
  creditDays: number;
  cuentaCxcDefault?: string;
  encargadoCxc?: string;
  telefonos?: TelefonoCliente[];
  disabled: boolean;
  createdAt?: string;
  modifiedAt?: string;
}

export interface CreateAseguradoraDto {
  nombre: string;
  /** Obligatorio — una aseguradora siempre es una empresa. */
  rnc: string;
  email?: string;
  phone?: string;
  address?: string;
  /** El formulario lo sugiere `true` por defecto (a diferencia de Clientes). */
  hasCredit?: boolean;
  creditLimit?: number;
  creditDays?: number;
  cuentaCxcDefault?: string;
  encargadoCxc?: string;
  telefonos?: TelefonoCliente[];
}

export type UpdateAseguradoraDto = Partial<CreateAseguradoraDto>;

// ─── Supplier ─────────────────────────────────────────────────────────────────
// tipoIdentificacion IS required for suppliers.

/** Enriquecimiento de findOne (`/suppliers/:id` only): un id junto con la tasa vigente
 *  resuelta en vivo por el backend (retenciones: `tax_withholding_rate`;
 *  impuestos: suma de `rate` del template). El listado paginado no enriquece.
 *  En `GET /gastos/:id` cada item de `retenciones`/`impuestos` incluye además
 *  `monto` con el valor exacto ya calculado de la retención/línea de impuesto. */
export interface ProveedorIdTasa {
  id: string;
  tasa: number;
  /** Monto exacto calculado de la retención/línea de impuesto (solo en GET /gastos/:id). */
  monto?: number;
}

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
  tieneSaldoAFavor: boolean;
  saldoAFavor: number;
  defaultTipoBienes606?: string | null;
  defaultFormaPago606?: string | null;
  defaultTipoPagoProveedor?: "Contado" | "Crédito" | null;
  cuentaCxpDefault?: string | null;
  /** Moneda por defecto de este proveedor ('DOP'|'USD'|'EUR') — mismo mecanismo que
   *  `Customer.defaultCurrency` (Fase 2 de docs/tasks/64_multimoneda_completo.md), autopobla
   *  `cuentaCxpDefault` salvo que se mande explícito. */
  defaultCurrency?: string | null;
  /** En findOne viene enriquecido como `{id, tasa}[]`; en listado no se enriquece. */
  retencionesDefault?: ProveedorIdTasa[];
  /** Purchase Taxes and Charges Templates (config/impuestos-compras) aplicados por defecto al crear
   *  una Compra a este proveedor si no se especifica `taxesTemplate` explícito — el backend combina
   *  las líneas de impuesto de todos los templates configurados en un solo documento.
   *  En findOne viene enriquecido como `{id, tasa}[]`. */
  impuestoComprasDefault?: ProveedorIdTasa[];
  /** Igual que `impuestoComprasDefault` pero para Gastos (mismo catálogo de templates). */
  impuestoGastosDefault?: ProveedorIdTasa[];
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
  defaultCurrency?: string | null;
  retencionesDefault?: string[];
  impuestoComprasDefault?: string[];
  impuestoGastosDefault?: string[];
}

export type UpdateProveedorDto = Partial<CreateProveedorDto>;

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  itemCode: string;
  description?: string;
  qty: number;
  rate: number;
  /** Mutuamente excluyente con discountAmount — el que no se usó viene en 0. */
  discountPct?: number;
  /** Descuento fijo en RD$. Mutuamente excluyente con discountPct — el que no se usó viene en 0. */
  discountAmount?: number;
  discountedRate?: number;
  amount: number;
  uom: string;
  warehouse?: string;
  /** Ubicación/rack específico dentro del almacén desde donde se descontó el stock, si se especificó. */
  ubicacion?: string;
  notes?: string;
  // ── Cobertura ARS por línea (solo vertical farmacia, y solo si la factura tiene
  //    `aseguradora`; ausentes en una factura sin cobertura). Ver §3.3 del doc v2.
  /** Peso (%) de esta línea para el reparto automático de la cobertura. */
  porcientoTeoricoArs?: number;
  /** Cobertura ARS de esta línea en RD$. */
  montoAprobadoArs?: number;
  /** Ajuste manual protegido: "Recalcular" no toca esta línea. */
  lineaBloqueadaArs?: boolean;
  /** Calculado por el servidor: `amount − montoAprobadoArs`. Solo lectura. */
  montoPacienteArs?: number;
  /** Calculado por el servidor. Solo lectura. */
  porcientoRealArs?: number;
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
  /** Monto REAL a cobrar, con el redondeo de moneda de ERPNext ya aplicado (redondea al peso más
   *  cercano) — igual a `grandTotal` si la compañía tiene el redondeo desactivado. Este es el
   *  monto que debe cobrarse en efectivo, no `grandTotal`. Puede faltar en respuestas antiguas —
   *  usar `roundedTotal ?? grandTotal`. */
  roundedTotal?: number;
  /** `roundedTotal - grandTotal` — puede ser negativo. 0 si la compañía no redondea. */
  roundingAdjustment?: number;
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
  /** Indica si la factura fue creada para un cliente ocasional (no registrado). */
  esClienteOcasional?: boolean;
  /** Nombre del cliente ocasional (solo presente cuando esClienteOcasional=true). */
  clienteOcasionalNombre?: string;
  /** RNC del cliente ocasional (solo presente cuando esClienteOcasional=true y ncfType=B01). */
  clienteOcasionalRnc?: string;
  /** Dirección del cliente ocasional (solo presente cuando esClienteOcasional=true). */
  clienteOcasionalDireccion?: string;
  /** Presente solo si la factura se emitió electrónicamente como e-CF (ausente —no null— en el
   *  100% de los casos hoy). Ver POST /invoices/:id/submit. */
  ecf?: EcfSubmitResult;
  /** ID del Pedido de venta del que se originó esta factura, si aplica. */
  salesOrder?: string;
  /** Cobertura de la ARS sobre esta factura (vertical farmacia). `null` en una factura sin
   *  cobertura — en ese caso las líneas tampoco traen los campos `*Ars`. Ver §3.5 del doc v2.
   *  En los elementos de `GET /invoices` viene la versión reducida (§3.8). */
  aseguradora?: InvoiceAseguradora | InvoiceAseguradoraResumen | null;
  // ─── Multimoneda (docs/tasks/64_multimoneda_completo.md Fase 3) ──────────────
  /** Moneda del documento ('DOP'|'USD'|'EUR'). Todos los montos del documento (subtotal,
   *  taxAmount, roundedTotal, outstandingAmount, items[], paymentLines[]...) están en ESTA
   *  moneda, no en la moneda base — excepto `baseGrandTotal`/`baseOutstandingAmount`. */
  currency?: string;
  /** Solo en GET /invoices/:id (ausente en el listado). */
  conversionRate?: number;
  /** Total convertido a moneda base — igual a `grandTotal` si ya está en la moneda base. Solo en GET /invoices/:id. */
  baseGrandTotal?: number;
  /** Saldo pendiente convertido a moneda base. Solo en GET /invoices/:id. */
  baseOutstandingAmount?: number;
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
  customer?: string;
  clienteOcasionalNombre?: string;
  clienteOcasionalRnc?: string;
  clienteOcasionalDireccion?: string;
  postingDate: string;
  dueDate?: string;
  branch?: string;
  department?: string;
  ncfType: "B01" | "B02" | "B14" | "B15" | "B16";
  /** Moneda del documento. Si se omite: `Customer.defaultCurrency` del cliente elegido → moneda
   *  base de la compañía (un cliente ocasional también puede facturarse en moneda extranjera,
   *  pasando `currency` explícito). Al editar (PATCH), omitirlo CONGELA la moneda/tasa que la
   *  factura ya tenía — no se re-resuelve. */
  currency?: string;
  /** Obligatoria solo si `currency` resuelve a una moneda distinta de la base y no hay tasa
   *  cargada en /monedas/tasas para la fecha — si se omite en ese caso, ERPNext falla al crear. */
  conversionRate?: number;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    uom?: string;
    /** % de descuento (0-100). Mutuamente excluyente con discountAmount. */
    discountPct?: number;
    /** Descuento fijo en RD$. Mutuamente excluyente con discountPct — use uno u otro, nunca ambos. */
    discountAmount?: number;
    /** Almacén desde el que se descuenta el stock. Si se omite, ERPNext usa el almacén por defecto del artículo. */
    warehouse?: string;
    /** Ubicación/rack específico dentro del almacén. Si se envía, el descuento de stock ocurre exactamente ahí en vez del almacén general. */
    ubicacion?: string;
    /** Solo cuando itemCode es un Combo y algún componente tiene tracking de serial/lote. */
    componentTracking?: ComponentTracking[];
    /** Peso (%) de la línea para el reparto automático de la cobertura ARS (0–100). */
    porcientoTeoricoArs?: number;
    /** Cobertura ARS de esta línea en RD$. Si NINGUNA línea lo envía, el servidor la reparte solo;
     *  si alguna lo envía, se respeta tal cual lo enviado. */
    montoAprobadoArs?: number;
    /** Ajuste manual protegido: el recálculo no toca esta línea. */
    lineaBloqueadaArs?: boolean;
  }[];
  notes?: string;
  /** ID de un Sales Taxes and Charges Template (/config/impuestos-ventas). Si se omite, se usa el default de la compañía si existe. */
  taxesTemplate?: string;
  /** Solo tenants del vertical farmacia. Ausente = sin cobertura; `null` en el PATCH quita una
   *  cobertura que ya estaba en el borrador. Una factura con cobertura NO puede llevar
   *  `taxesTemplate` (el servidor responde 400). */
  aseguradora?: AseguradoraInvoiceDto | null;
  /** docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md §3 — solo mandar si el selector "Despachar
   *  ahora/después" está visible (despachoHabilitado && despachoFuturoHabilitado). Omitido =
   *  conserva el comportamiento por defecto del tenant. `true` sin despacho habilitado, o sin
   *  despachoFuturoHabilitado, responde 400. */
  despachoFuturo?: boolean;
}

/**
 * PATCH /invoices/:id — edición de una factura en borrador. Mismo shape que CreateInvoiceDto:
 * el body es la factura completa (reemplazo total, no un parche); las líneas enviadas sustituyen
 * por completo a las existentes. 400 si la factura ya no está en borrador (usar cancel + amend)
 * o si fue enviada a Caja.
 */
export type UpdateInvoiceDto = CreateInvoiceDto;

// POST /invoices/:id/cancel — reason is mandatory, 10-500 chars.
// motivoAnulacion (código DGII, Formato 608) es obligatorio solo si la factura ya tiene NCF asignado.
export interface CancelInvoiceDto {
  reason: string;
  motivoAnulacion?: string;
}

// POST /invoices/:id/submit — el cobro ya no ocurre aquí (ver módulo Caja). Este endpoint solo
// asigna el NCF y somete la factura; queda con outstandingAmount === grandTotal (menos crédito ya
// aplicado) pendiente de cobrar.
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
  /** Mutuamente excluyente con discountAmount — el que no se usó viene en 0. */
  discountPct?: number;
  /** Descuento fijo en RD$. Mutuamente excluyente con discountPct — el que no se usó viene en 0. */
  discountAmount?: number;
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
  esClienteOcasional: boolean;
  clienteOcasionalNombre?: string;
  clienteOcasionalRnc?: string;
  clienteOcasionalDireccion?: string;
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
  /** ID del Pedido de venta generado a partir de esta cotización, si ya se convirtió. */
  salesOrder?: string;
  /** Moneda del documento — mismo patrón que Factura. No hay `baseGrandTotal` en Cotizaciones;
   *  si se necesita el equivalente en moneda base, calcularlo como `grandTotal * conversionRate`
   *  (aproximado). Ver docs/tasks/64_multimoneda_completo.md §3.2. */
  currency?: string;
  conversionRate?: number;
}

export interface CreateQuotationDto {
  customer?: string;
  clienteOcasionalNombre?: string;
  /** RNC (9 dígitos) o cédula (11) del comprador ocasional. Se conserva al convertir el documento en factura y se envía a Vega como identificación del comprador en el e-CF. */
  clienteOcasionalRnc?: string;
  clienteOcasionalDireccion?: string;
  date: string; // required per API
  validTill?: string;
  branch?: string;
  /** Ver `CreateInvoiceDto.currency` — misma regla de resolución. Al editar (PUT), omitirlo
   *  conserva la moneda/tasa existente. */
  currency?: string;
  conversionRate?: number;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    uom?: string;
    /** % de descuento (0-100). Mutuamente excluyente con discountAmount. */
    discountPct?: number;
    /** Descuento fijo en RD$. Mutuamente excluyente con discountPct — use uno u otro, nunca ambos. */
    discountAmount?: number;
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
   clienteOcasionalNombre?: string;
   clienteOcasionalDireccion?: string;
   items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    uom?: string;
    discountPct?: number;
    discountAmount?: number;
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
  /** Heredados automáticamente de la factura original — el DTO de creación NO tiene estos
   *  campos, no agregar un selector de moneda a este formulario. Ver
   *  docs/tasks/64_multimoneda_completo.md §3.4. */
  currency?: string;
  conversionRate?: number;
}

/** Código de modificación DGII (Tabla VI): 1=Anula, 2=Corrige texto, 3=Corrige montos,
 *  4=Reemplazo por contingencia, 5=Referencia a Factura de Consumo. */
export type EcfModificationCode = 1 | 2 | 3 | 4 | 5;

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
  /** Solo obligatorio si el tenant emite esta nota como e-CF (E34) — si se omite, el submit
   *  falla con 400. Sin efecto en el flujo físico (NCF B04). */
  modificationCode?: EcfModificationCode;
}

// POST /credit-notes/:id/refund — reembolsa una nota de crédito existente (refunded: false)
export interface RefundCreditNoteDto {
  modeOfPayment: string;
  amount: number;
  /** Cuenta bancaria (id de CuentaBancaria) — requerida si el método de pago tiene requiresBankAccount=true y no tiene defaultBankAccount. */
  bankAccount?: string;
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
  /** Código de modificación DGII (Tabla VI) de la nota de crédito generada — solo obligatorio si
   *  el tenant emite esta nota como e-CF (E34): 1=Anula, 2=Corrige texto, 3=Corrige montos,
   *  4=Reemplazo contingencia, 5=Referencia a Factura de Consumo. Sin efecto en el flujo físico (NCF B04). */
  modificationCode?: EcfModificationCode;
  /** Solo facturas con cobertura ARS. Obligatorio cuando la devolución deja la cobertura en cero
   *  (total, o parcial que devuelve toda la cobertura restante) y `estadoArs ≠ "Facturado"`. */
  motivoAnulacionArs?: MotivoAnulacionArs;
  /** Texto 5–500 — obligatorio si `motivoAnulacionArs === "Otro"`. */
  motivoAnulacionDetalle?: string;
}

// POST /devoluciones/:id/cancelar — solo devoluciones en borrador. El documento no se elimina:
// pasa a documentStatus === 'cancelled' y sigue apareciendo en listados/historial.
export interface CancelDevolucionDto {
  /** Obligatorio, 10–500 caracteres. Queda como Comment del documento (auditoría). */
  reason: string;
}

export interface CancelDevolucionResult {
  message: string;
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
  /** Solo viene cuando la factura original tenía cobertura ARS (§5.3). */
  aseguradora?: {
    parteArs: number;
    partePaciente: number;
    /** true si la devolución dejó la aprobación ARS anulada. */
    aprobacionAnulada: boolean;
    estadoArsOriginal: EstadoArs | null;
    /** Solo cuando se emitió la NC a la ARS (`estadoArsOriginal === 'Facturado'`). */
    creditNoteAseguradoraId?: string | null;
    ncfAseguradora?: string | null;
  } | null;
  message?: string;
}

/** Bloque `aseguradora` de `GET /devoluciones/:id` y `GET /credit-notes/:id` (§5.4).
 *  `null` si la nota no tiene cobertura. */
export interface DevolucionAseguradora {
  aseguradora: string;
  aseguradoraName?: string;
  numeroAutorizacion: string;
  parteArsDevuelta: number;
  /** Estado ARS que tenía la factura original CUANDO se devolvió — no el actual. */
  estadoArsAlDevolver: EstadoArs | null;
  /** NC emitida a la aseguradora, o `null` si todavía no se emitió. */
  ncAseguradoraId?: string | null;
  /** Solo en la NC a la aseguradora: la factura de paciente que la originó. */
  facturaPacienteRef?: string | null;
}

/** Body (opcional) de `POST /devoluciones/:id/emitir-nc-aseguradora` — idempotente. */
export interface EmitirNcAseguradoraDto {
  modificationCode?: EcfModificationCode;
}

export interface EmitirNcAseguradoraResult {
  creditNoteId: string;
  creditNoteAseguradoraId: string;
  ncfAseguradora?: string | null;
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
  /** Estado ARS ACTUAL de la factura original — informativo (§5.4). */
  estadoArs?: EstadoArs | null;
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
  /** `null` si la nota no tiene cobertura ARS. */
  aseguradora?: DevolucionAseguradora | null;
  createdAt: string;
  modifiedAt: string;
}

// ─── Devoluciones de Compras ──────────────────────────────────────────────────
// Flujo independiente de Compras: nota de crédito de compra con ciclo de vida
// Draft → Submitted → (Cancelled | Amended) y aplicación de saldo a CxP.

export type DevolucionCompraStatus = 'draft' | 'submitted' | 'cancelled'

export interface DevolucionCompraItemDto {
  itemCode: string
  /** Siempre positiva en el request; el backend la convierte a negativa. */
  qty: number
}

export interface CreateDevolucionCompraDto {
  /** Factura de compra (Purchase Invoice) original que se está devolviendo. */
  originalInvoice: string
  /** Cada itemCode debe existir en la factura original, o 400 del BFF. */
  items: DevolucionCompraItemDto[]
  /** Fecha contable. Opcional (default: hoy). Formato yyyy-mm-dd. */
  postingDate?: string
  /** Motivo (se guarda en `terms`). Opcional. */
  reason?: string
}

export interface UpdateDevolucionCompraDto {
  /** Reemplaza las líneas de la devolución en Draft. */
  items?: DevolucionCompraItemDto[]
  postingDate?: string
  reason?: string
}

/** A dónde se aplicó (o a dónde está pendiente) el saldo de una devolución. */
export interface DevolucionCompraAppliedTo {
  invoiceId: string
  amount: number
  /** 'pending' = la CxP destino sigue en Draft (enlace sin efecto contable); 'reconciled' = sometida y conciliada. */
  status: 'pending' | 'reconciled'
  /** Journal Entry real de la reconciliación — solo cuando status === 'reconciled'. */
  journalEntryId: string | null
  /** Datos de la factura destino (Purchase Invoice), enriquecidos por el BFF para no requerir un fetch aparte. */
  ncfProveedor?: string | null
  tipoComprobante?: string | null
  billNo?: string | null
  postingDate?: string
  grandTotal?: number
  outstandingAmount?: number
  invoiceStatus?: 'draft' | 'submitted' | 'cancelled'
}

/** Línea de artículo en el detalle de una devolución (qty negativa). */
export interface DevolucionCompraItem {
  itemCode: string
  description?: string
  qty: number
  rate: number
  amount: number
  warehouse?: string
  uom?: string
}

/** Entidad principal de Devoluciones de Compras (listado y detalle). */
export interface DevolucionCompra {
  id: string
  supplier: string
  supplierName: string
  /** Factura de compra (Purchase Invoice) original que se está devolviendo. */
  originalInvoice: string
  originalInvoiceNcf?: string | null
  postingDate: string
  /** Se persiste en `terms`. */
  reason?: string
  status: DevolucionCompraStatus
  amendedFrom?: string
  /** NCF propio de la devolución (solo cuando está sometida). */
  ncf?: string | null
  ncfAfectado?: string | null
  currency?: string
  grandTotal: number
  taxAmount?: number
  items: DevolucionCompraItem[]
  /** Presentes solo para devoluciones sometidas. */
  appliedAmount?: number
  availableAmount?: number
  outstandingAmount?: number
  appliedTo?: DevolucionCompraAppliedTo[]
  createdAt?: string
  modifiedAt?: string
}

export interface SaldoFavorDevolucionCompraEntry {
  devolucionId: string
  ncf?: string | null
  postingDate: string
  grandTotal: number
  appliedAmount: number
  availableAmount: number
  appliedTo: DevolucionCompraAppliedTo[]
}

/** GET /devoluciones-compras/saldo-favor/{supplierId} */
export interface SaldoFavorDevolucionCompraResult {
  supplier: string
  balance: number
  entries: SaldoFavorDevolucionCompraEntry[]
}

/** Resultado de aplicar / desaplicar saldo a una CxP. */
export interface AplicarCxpResult {
  invoiceId: string
  devolucionId: string
  amount: number
  status: 'pending' | 'reconciled'
  journalEntryId: string | null
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
  /** Con `referenceInvoice`: hereda estrictamente de esa factura. Sin `referenceInvoice`: se
   *  resuelve igual que una Factura nueva (Cliente.defaultCurrency → moneda base). El DTO de
   *  creación NO tiene estos campos — no agregar selector. Ver docs/tasks/64_multimoneda_completo.md §3.5. */
  currency?: string;
  conversionRate?: number;
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
  /** Factura que esta nota de débito afecta. Solo obligatorio si se emite como e-CF (E33) —
   *  Vega exige el e-NCF afectado. Sin efecto en el flujo físico (NCF B03). */
  referenceInvoice?: string;
  /** Ver CreateCreditNoteDto.modificationCode — mismas reglas (obligatorio solo para e-CF E33). */
  modificationCode?: EcfModificationCode;
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
  /** Requerida para Productos; no aplica a Servicios */
  category?: string;
  categoryName?: string;
  subcategory?: string;
  subcategoryName?: string;
  brand?: string;
  brandName?: string;
  type: "product" | "service" | "combo";
  standardRate: number;
  prices?: ItemPrices;
  valuationRate?: number;
  currentStock?: number;
  /**
   * Stock por almacén: `{ "<nombre del almacén>": <cantidad> }`, solo almacenes con existencia ≠ 0.
   * La suma de los valores es igual a `currentStock`.
   * - En el detalle (GET /catalog/items/:id) viene siempre para artículos de stock; se omite para
   *   servicios o si no hay existencia en ningún almacén.
   * - En el listado (GET /catalog/items) solo se puebla al filtrar por `branch`.
   * Solo cantidades (sin valuación); para valor de inventario por almacén usar GET /catalog/items/:id/stock.
   */
  stockByWarehouse?: Record<string, number>;
  /** Solo vienen en el detalle (GET /catalog/items/:id) — NUNCA en el listado (GET /catalog/items),
   *  a propósito, para no disparar consultas extra por fila en una lista paginada. `undefined` en
   *  un Servicio (no aplica). Ver docs/tasks/76_disponibilidad_stock_detalle_item.md.
   *
   *  No son intercambiables:
   *  - `enPedido`: comprometido en Pedidos de venta SIN facturar todavía — solo informativo, NO
   *    resta de `disponible` (una venta sin cobrar aún podría no concretarse).
   *  - `reservado`: YA facturado (cobrado) pero sin despacho físico todavía — sí resta de
   *    `disponible`. Se calcula directo desde la factura, exista o no el despacho — por eso puede
   *    diferir del `reservedStock`/`disponibleParaVender` de GET /inventory o
   *    GET /catalog/items/:id/stock (esos vienen de Bin.reserved_stock vía Stock Reservation
   *    Entry, que puede estar subcontado si el despacho aún no se creó). Son dos preguntas
   *    distintas, no un bug si difieren para el mismo artículo.
   *  - `disponible` = `currentStock - reservado` (nunca resta `enPedido`). */
  enPedido?: number;
  reservado?: number;
  disponible?: number;
  /** Unidades de este artículo ya vendidas Y despachadas físicamente (Delivery Notes sometidos) —
   *  puramente histórico/informativo, no afecta `disponible`. Mismas reglas que enPedido/reservado/
   *  disponible: solo en el detalle, nunca en el listado, `undefined` en un Servicio. Ver
   *  docs/tasks/79_confirmacion_despacho_pedido.md §8. */
  entregado?: number;
  internalDescription?: string;
  shortName?: string;
  notes?: string;
  hasWarranty?: boolean;
  warrantyPeriod?: number;
  barcodes?: ItemBarcode[];
  /** URL pública absoluta lista para `<img src>` — no requiere headers de auth ni transformación.
   *  Se sube/reemplaza con POST /catalog/items/:id/imagen, ver uploadItemImagen() en catalog.ts. */
  image?: string;
  disabled: boolean;
  defaultWarehouse?: string;
  stockUom?: string;
  uoms?: ItemUomConversion[];
  /** UOMs permitidas para comprar/vender este artículo — docs/tasks/
   *  75_almacen_venta_confirmar_stock_uoms_permitidas.md §3. Listas independientes entre sí,
   *  ambas opcionales; vacío = sin restricción (cualquier UOM con conversión válida contra
   *  `stockUom` sirve, como siempre). Solo tiene efecto en artículos type === "product". Siempre
   *  vienen como array (nunca null/undefined) en las respuestas. */
  purchaseUoms?: string[];
  saleUoms?: string[];
  hasVariants?: boolean;
  variantOf?: string;
  attributes?: TemplateAttribute[];
  priceMode?: "manual" | "cost_plus";
  /** Override por artículo de `FacturacionConfig.actualizarCostoEnCompra` — docs/tasks/
   *  77_actualizar_costo_en_compra_configurable.md §2. `'si'`/`'no'` siempre gana sobre el default
   *  del tenant; ausente = usa el default. Nunca viene como `''` en las respuestas — solo en los
   *  DTOs de request se manda `''` para borrar el override. Independiente de `priceMode`: no
   *  afecta el recálculo del precio de venta en modo `cost_plus`. */
  actualizarCostoEnCompraOverride?: "si" | "no";
  marginA?: number;
  marginB?: number;
  marginC?: number;
  allowsDiscount?: boolean;
  maxDiscountPct?: number;
  trackingType?: "none" | "batch" | "serial";
  /** Nativos de ERPNext (no custom fields), solo tienen efecto si trackingType === "batch" —
   *  ver docs/FARMACIA_ARS_FRONTEND.md §6.1. Rechazado con 400 si se envían con otro trackingType. */
  hasExpiryDate?: boolean;
  shelfLifeInDays?: number;
  /** Solo tiene sentido con trackingType !== "none". Si está activo, el serial/lote de este
   *  artículo se pide al confirmar despacho (venta, POST /despachos/confirmaciones/:id/confirmar)
   *  en vez de en la compra. Ver docs/tasks/79_confirmacion_despacho_pedido.md §9. */
  asignarSerialEnDespacho?: boolean;
  purchaseTaxTemplate?: string;
  purchaseTaxPct?: number;
  salesTaxTemplate?: string;
  salesTaxPct?: number;
  purchasePriceDate?: string;
  salesPriceDate?: string;
  autoDiscount?: AutoDiscount;
  /** Componentes del combo (cuando type === 'combo') */
  components?: { itemCode: string; qty: number }[];
}

export interface ItemImagenUploadResult {
  /** Misma URL pública que después viene en `image` en el resto de las respuestas del módulo. */
  image: string;
}

export interface AutoDiscount {
  ruleId: string;
  discountType: "Discount Percentage" | "Discount Amount";
  discountPercentage?: number;
  discountAmount?: number;
}

export interface CreateItemDto {
  itemCode?: string; // optional, BFF can auto-generate
  itemName: string;
  /** Requerida para Productos; no aplica a Servicios */
  category?: string;
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
  /** Cada UOM de ambas listas debe tener conversión configurada contra `stockUom` — el backend
   *  responde 400 si no. Solo aplica a type === "product". */
  purchaseUoms?: string[];
  saleUoms?: string[];
  hasVariants?: boolean;
  attributes?: { attribute: string }[]; // for templates: just attribute names
  priceMode?: "manual" | "cost_plus";
  /** `''` (edición) = quita el override, vuelve a seguir el default del tenant. Ausente en una
   *  edición = no toca el override actual. Ver docs/tasks/77_actualizar_costo_en_compra_configurable.md §2. */
  actualizarCostoEnCompraOverride?: "" | "si" | "no";
  marginA?: number;
  marginB?: number;
  marginC?: number;
  allowsDiscount?: boolean;
  maxDiscountPct?: number;
  trackingType?: "none" | "batch" | "serial";
  hasExpiryDate?: boolean;
  shelfLifeInDays?: number;
  asignarSerialEnDespacho?: boolean;
  purchaseTaxTemplate?: string;
  salesTaxTemplate?: string;
}

export type UpdateItemDto = Partial<CreateItemDto>;

// ─── Cuentas por Pagar (catálogo de conceptos recurrentes de gasto) ───────────
// Catálogo separado de Productos/Servicios — nunca se venden, solo sirven para
// prellenar un Gasto (ej. "Alquiler de oficina", "Servicios de limpieza").

export type TipoDocumentoCuentaPorPagar = "Factura" | "Pago" | "Nota de Crédito" | "Nota de Débito" | "Devolución";

export interface CuentaPorPagar {
  id: string;
  titulo: string;
  descripcion?: string;
  tipoDocumento: TipoDocumentoCuentaPorPagar;
  /** Cuenta contable default al registrar un Gasto con este concepto */
  cuenta?: string;
  /** Tipo de gasto fiscal: Bienes o Servicios */
  tipoBienes606?: "Bienes" | "Servicios";
  /** Categoría 606 de la DGII (ej. "03 - Arrendamientos"). Default para prellenar el tipoBienes606 al registrar un Gasto con este concepto (ver GET /config/catalogos-fiscales → tipoBienes606). Se puede mandar el código corto o el string completo; el backend lo normaliza. */
  claseFiscal?: string;
  /** Item Tax Template aplicado por defecto */
  impuesto?: string;
  /** Tasa del `impuesto`, calculada por el servidor — solo lectura */
  impuestoPct?: number;
  disabled: boolean;
  createdAt: string;
  modifiedAt: string;
}

export interface CreateCuentaPorPagarDto {
  titulo: string;
  descripcion?: string;
  tipoDocumento: TipoDocumentoCuentaPorPagar;
  cuenta?: string;
  tipoBienes606?: "Bienes" | "Servicios";
  claseFiscal?: string;
  impuesto?: string;
}

export type UpdateCuentaPorPagarDto = Partial<CreateCuentaPorPagarDto>;

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
  /** Ver `CreateItemDto.actualizarCostoEnCompraOverride` — docs/tasks/
   *  77_actualizar_costo_en_compra_configurable.md §2. `''` quita el override. */
  actualizarCostoEnCompraOverride?: "" | "si" | "no";
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
  /** Mutuamente excluyente con discountAmount — el que no se usó viene en 0. */
  discountPct?: number;
  /** Descuento fijo en RD$. Mutuamente excluyente con discountPct — el que no se usó viene en 0. */
  discountAmount?: number;
  notes?: string;
  taxRate: number;
  taxAmount: number;
}

export interface Pedido {
  id: string;
  customer: string;
  customerName: string;
  esClienteOcasional: boolean;
  clienteOcasionalNombre?: string;
  clienteOcasionalRnc?: string;
  clienteOcasionalDireccion?: string;
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
  /** ID de la cotización de la que se originó este pedido, si aplica. */
  quotation?: string;
  /** @deprecated usar `invoices`. Primera factura generada — se mantiene por compatibilidad. */
  facturaId?: string;
  /** IDs de las facturas generadas a partir de este pedido (normalmente 0 o 1). */
  invoices?: string[];
  createdAt: string;
  modifiedAt: string;
  grandTotal?: number;
  taxAmount?: number;
  /** Apartado (layaway) — presentes cuando isLayaway === true */
  isLayaway?: boolean;
  layawayVencido?: boolean;
  layawayDiasRestantes?: number;
  /** Moneda del documento — mismo patrón que Factura/Cotización. Se hereda tal cual al convertir
   *  desde una Cotización (nunca se re-resuelve). No hay `baseGrandTotal` en Pedidos. */
  currency?: string;
  conversionRate?: number;
  /** docs/tasks/79_confirmacion_despacho_pedido.md — nunca junto con `isLayaway: true` (ambos
   *  ya difieren la entrega por su cuenta, son mutuamente excluyentes). */
  despachoFuturo?: boolean;
  /** true si ya pasó por POST /pedidos/:id/confirmar-despacho (o si no le hacía falta: apartado,
   *  despacho a futuro, o el tenant no tiene `pedidoRequiereConfirmacionDespacho` activo). */
  despachoConfirmado?: boolean;
  /** Fuente única de verdad de "en qué está" el pedido — ver PedidoEstadoFlujo. */
  estadoFlujo?: PedidoEstadoFlujo;
}

/** docs/tasks/79_confirmacion_despacho_pedido.md §6 */
export type PedidoEstadoFlujo =
  | "borrador"
  | "pendiente_confirmacion_despacho"
  | "apartado_reservado"
  | "facturando"
  | "facturado"
  | "despachado"
  | "cerrado"
  | "sometido"
  | "cancelado";

export interface CreatePedidoDto {
  customer?: string;
  clienteOcasionalNombre?: string;
  /** RNC (9 dígitos) o cédula (11) del comprador ocasional. Se conserva al convertir el documento en factura y se envía a Vega como identificación del comprador en el e-CF. */
  clienteOcasionalRnc?: string;
  clienteOcasionalDireccion?: string;
  transactionDate?: string;
  deliveryDate?: string;
  branch?: string;
  department?: string;
  /** Ver `CreateInvoiceDto.currency`. Al convertir desde Cotización, se hereda tal cual (este
   *  campo se ignora en ese flujo — el backend nunca re-resuelve la moneda del pedido). */
  currency?: string;
  conversionRate?: number;
  items: {
    itemCode: string;
    qty: number;
    rate: number;
    uom?: string;
    /** % de descuento (0-100). Mutuamente excluyente con discountAmount. */
    discountPct?: number;
    /** Descuento fijo en RD$. Mutuamente excluyente con discountPct — use uno u otro, nunca ambos. */
    discountAmount?: number;
    warehouse?: string;
  }[];
  quotation?: string;
  /** Marca el pedido como apartado (layaway) — reserva stock al someter, no genera factura de inmediato */
  isLayaway?: boolean;
  /** Requiere `despachoHabilitado && despachoFuturoHabilitado` en el tenant — 400 si no. Mutuamente
   *  excluyente con `isLayaway`: un pedido a futuro nunca pide confirmación de despacho (§2/§4.1
   *  de docs/tasks/79_confirmacion_despacho_pedido.md). */
  despachoFuturo?: boolean;
}

export type UpdatePedidoDto = Partial<CreatePedidoDto>;

// POST /pedidos/:id/confirmar-despacho — docs/tasks/79_confirmacion_despacho_pedido.md §4. Mismo
// DTO/resultado que POST /despachos/:id/confirmar-stock — ver ConfirmarStockDespachoDto/Result
// más abajo (§75), reutilizados a propósito para compartir componentes de UI entre ambos flujos.

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
    discountAmount?: number;
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

/** Respuesta de GET /inventory/lotes/sugerido — FEFO real por almacén (docs/FARMACIA_ARS_FRONTEND.md §6.3). */
export interface LoteSugerido {
  batchId: string;
  qtyDisponible: number;
  expiryDate?: string;
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

/** Acciones sensibles reconocidas hoy por POST /auth/verify-admin-pin (ADMIN_PIN_ACTIONS en el
 *  backend). Un valor no listado aquí responde 400 — no asumir que una acción nueva ya está
 *  soportada sin confirmarlo con el backend primero. */
export type AdminPinAccion = "override_descuento" | "cambiar_clasificacion_cliente";

// GET /auth/admin-pin-log no documenta un schema de respuesta en openapi.json — este shape
// sigue la descripción del endpoint ("éxito o fallo, con motivo, quién lo pidió y quién
// autorizó"), no un contrato generado. Verificar contra el endpoint real y ajustar si no calza.
export interface AdminPinLogEntry {
  id: string;
  fecha: string;
  accion: AdminPinAccion | string;
  exito: boolean;
  /** Motivo del resultado (ej. "PIN incorrecto", "usuario sin rol habilitado para esta acción").
   *  Solo visible aquí, en la bitácora — la respuesta 401 al usuario nunca lo distingue. */
  motivo?: string;
  /** Email de quien inició la solicitud de autorización (el usuario que necesitaba el override). */
  solicitadoPor?: string;
  /** Email del dueño del PIN que autorizó — solo presente si `exito` es true. */
  autorizadoPor?: string | null;
}

export interface VerifyPinDto {
  /** PIN de 6 dígitos del usuario autorizador. */
  pin: string;
  /** Acción que se está autorizando — determina qué rol se exige al dueño del PIN. */
  accion: AdminPinAccion;
  /** Email del dueño del PIN. Obligatorio si no se manda `codigoTarjeta`. */
  usuario?: string;
  /** Código de carnet/QR/barcode (adminCode) del dueño del PIN — alternativa a `usuario` para
   *  resolverlo por escaneo. Obligatorio si no se manda `usuario`. */
  codigoTarjeta?: string;
}

export type CategoriaAplicaA = "Ambas" | "Productos" | "Servicios";

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
  /** Restringe a qué tipo de artículo puede asignarse esta categoría/subcategoría. Default "Ambas" */
  aplicaA?: CategoriaAplicaA;
  children?: Category[];
  /** "Medicamentos controlados" (docs/FARMACIA_ARS_FRONTEND.md §8) — restringe la venta de esta
   *  categoría a usuarios con al menos uno de estos roles. Solo viene en GET de una categoría
   *  puntual, no en el listado paginado (mismo patrón que incomeAccount/defaultCogsAccount). */
  rolesPermitidosVenta?: string[];
}

export interface CreateCategoryDto {
  name: string;
  parentCategory?: string;
  isGroup?: boolean;
  image?: string;
  aplicaA?: CategoriaAplicaA;
  rolesPermitidosVenta?: string[];
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
  aplicaA?: CategoriaAplicaA;
  rolesPermitidosVenta?: string[];
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
  /** Comprometido con otro cliente/proceso en este almacén (Stock Reservation Entry — típicamente
   *  un Apartado). Ver docs/tasks/73_alertas_stock_disponible_reservado.md. */
  reservedStock: number;
  /** = qty - reservedStock. Lo realmente disponible para prometer a un cliente nuevo — usar
   *  siempre este campo (nunca `qty` a secas) para validar/mostrar disponibilidad al vender. */
  disponible: number;
}

export interface ItemStock {
  itemCode: string;
  totalQty: number;
  /** Suma de `reservedStock` de todos los almacenes. */
  totalReservedStock: number;
  /** Suma de `disponible` de todos los almacenes (= totalQty - totalReservedStock). */
  totalDisponible: number;
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
  // ─── Campos del Bin — docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §7 ───
  // Existen siempre (no gateados por despachoHabilitado); el listado ya no oculta actualQty=0.
  /** Comprometido en pedidos de venta sometidos aún sin entregar. */
  reservedQty?: number;
  /** Subconjunto de reservedQty con reserva nativa de ERPNext (Stock Reservation Entry) sobre
   *  stock físico concreto — es el que se usa para calcular disponibleParaVender. */
  reservedStock?: number;
  /** Ya pedido a proveedores (orden de compra sometida, aún sin recibir). */
  orderedQty?: number;
  /** En solicitudes de material/compra pendientes (previo a orden de compra). */
  indentedQty?: number;
  /** Proyección nativa de ERPNext: actualQty + orderedQty + indentedQty - reservedQty. */
  projectedQty?: number;
  /** El campo más útil para la UI: actualQty - (reservedStock ?? 0) — lo que realmente se le
   *  puede prometer a un cliente nuevo ahora mismo. Preferirlo sobre actualQty a secas. */
  disponibleParaVender?: number;
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
  /** Heredado de la zona — es el almacén padre, NO sirve para transferencias (usar `warehouseReal`) */
  warehouse: string;
  /** Nombre exacto del Warehouse real en ERPNext para esta ubicación/rack (incluye el sufijo de
   *  la company, ej. "Rack 1 - Nivel 2 - rubheum4eb - JB") — es lo que hay que mandar como
   *  `fromWarehouse`/`toWarehouse` en POST /api/v1/transferencias. */
  warehouseReal: string;
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

// ─── Cajas (POS Profiles) — soporte de múltiples cajas simultáneas ────────────

export interface Caja {
  id: string;
  label: string;
  company: string;
  warehouse: string;
  branch?: string | null;
  disabled: boolean;
  /** true si esta caja tiene un turno abierto ahora mismo */
  isOpen: boolean;
  /** true si es la caja por defecto del usuario que hace la consulta */
  isUserDefault: boolean;
  /** true si es la caja default del tenant (creada al habilitar POS) */
  isTenantDefault: boolean;
}

export interface CreateCajaDto {
  label: string;
  warehouse: string;
  branch?: string;
}

export interface UpdateCajaDto {
  warehouse?: string;
  branch?: string;
  disabled?: boolean;
}

// ─── Sucursales (Branches) ─────────────────────────────────────────────────────

export interface Sucursal {
  id: string;
  name: string;
  warehouseCount: number;
  /** Almacén al que se restringe toda venta de esta sucursal — docs/tasks/
   *  75_almacen_venta_confirmar_stock_uoms_permitidas.md §1. `null` = sin restricción (cualquier
   *  almacén de la sucursal sirve, como siempre). Siempre presente en las respuestas. */
  almacenVenta: string | null;
}

export interface CreateSucursalDto {
  name: string;
  /** Debe pertenecer a esta misma sucursal — el backend valida y responde 400 si no. En el PUT,
   *  mandar `""` lo quita (vuelve a sin restricción). */
  almacenVenta?: string;
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

// warehouseType es un enum estricto en ERPNext (Transit/Finished Goods/Raw Material/Stores)
// sin miembro "vacío" — el backend rechaza `""` (400) pero acepta `null` para limpiarlo.
export type UpdateAlmacenDto = Partial<Omit<CreateAlmacenDto, 'warehouseType'>> & {
  warehouseType?: string | null;
};

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
  /** Hora del movimiento (Stock Ledger Entry.posting_time) — no siempre viene poblada según el
   *  documento de origen, tratar como opcional. */
  postingTime?: string;
}

// ─── Recálculo de valuación (Repost Item Valuation) ───────────────────────────
// Herramienta administrativa (System Manager / Accounts Manager) que expone el mecanismo nativo
// de ERPNext para reparar una cola de valuación FIFO/Moving Average corrupta (ej. tasa de costo
// negativa por movimientos retroactivos o stock negativo) sin entrar al Desk. Ver POST/GET
// /inventory/repost-valuacion — el openapi.json no publica el schema de respuesta; los campos de
// abajo salen de la especificación de la tarea, no están confirmados contra un ejemplo real.

// POST /inventory/repost-valuacion
export interface CreateRepostValuacionDto {
  itemCode: string;
  /** Si se omite, ERPNext recalcula el artículo en TODOS los almacenes donde tiene movimientos. */
  warehouse?: string;
  /** Fecha desde la cual recalcular — debe ser igual o anterior al primer movimiento problemático. */
  postingDate: string;
}

export interface CreateRepostValuacionResult {
  id: string;
  status: "queued";
  /** Ya trae el texto explicativo listo para mostrar (ej. "puede tardar unos minutos..."). */
  message: string;
}

export type RepostValuacionStatus = "Queued" | "In Progress" | "Completed" | "Skipped" | "Failed";

// GET /inventory/repost-valuacion
export interface RepostValuacionItem {
  id: string;
  itemCode: string;
  /** Ausente si se encoló para TODOS los almacenes del artículo. */
  warehouse?: string | null;
  status: RepostValuacionStatus;
  postingDate: string;
  /** Solo relevante si status es Failed o Skipped. */
  errorLog?: string | null;
  totalRepostingCount: number;
  currentIndex: number;
  createdAt: string;
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
  /** Cuenta contable alterna de esta línea (Purchase Invoice Item.expense_account). Solo tiene
   *  efecto real en líneas que no afectan valorización de inventario — ver CompraItemDto. */
  cuentaContable?: string;
  // NOTE: no "description" in CompraItemDto per BFF schema
}

export interface Compra {
  id: string;
  supplier: string;
  supplierName: string;
  /** Indica si la compra se registró a un proveedor ocasional (sin registrar). */
  esProveedorOcasional?: boolean;
  /** Nombre del vendedor ocasional (solo presente cuando esProveedorOcasional=true). */
  proveedorOcasionalNombre?: string;
  /** RNC/Cédula del vendedor ocasional (solo presente cuando esProveedorOcasional=true). */
  proveedorOcasionalRnc?: string;
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
  /** N° de factura del proveedor (native field `bill_no` en ERPNext) */
  billNo?: string | null;
  /** Tipo de comprobante generado/a generar — solo relevante si el proveedor es ocasional y no
   *  se envía `ncfProveedor` (el sistema lo auto-genera al someter). Sin efecto en proveedores
   *  registrados, que siempre traen su propio `ncfProveedor`. */
  tipoComprobante?: "B01" | "B02" | "B03" | "B04" | "B11" | "B12" | "B13" | "B14" | "B15" | "B16" | "B17";
  tipoBienes606?: string;
  formaPago606?: string;
  retencionItbis?: number;
  retencionIsr?: number;
  /** Retenciones aplicadas a la compra con su tasa vigente y monto exacto calculado (solo GET /compras/:id). */
  retenciones?: ProveedorIdTasa[];
  /** Líneas de impuesto ya resueltas por el BFF a partir de `taxesTemplate` (una por cada template/componente aplicado, con su tasa y monto exacto). */
  impuestos?: ProveedorIdTasa[];
  /** Purchase Taxes and Charges Templates aplicados al documento, enriquecidos con su tasa. */
  taxesTemplate?: ProveedorIdTasa[];
  tipoPago?: "Contado" | "Crédito";
  amendedFrom?: string;
  /** Saldo pendiente de la factura de compra (para aplicar devoluciones/DP). */
  outstandingAmount?: number;
  /** Cuenta por Pagar (credit_to) alterna para este documento, si se sobreescribió con
   *  cuentaCxpOverride. Una devolución solo puede aplicarse contra facturas con la misma cuenta CxP. */
  cuentaCxpOverride?: string;
  /** Presente solo si el comprador autogeneró un e-CF (E41) al someter — proveedor ocasional sin
   *  NCF y e-CF habilitado. Ausente en el caso normal (NCF físico capturado a mano). */
  ecf?: EcfSubmitResult;
}

/** Body requerido en POST /compras/:id/submit y /gastos/:id/submit cuando la factura es de
 *  tipoPago "Contado" — el backend crea y somete el Payment Entry por el saldo pendiente
 *  (outstandingAmount) en el mismo request, así la factura no queda como un pago pendiente. */
export interface PagoContadoDto {
  modeOfPayment: string;
  referenceNo?: string;
  /** Marca este pago como cheque — activa la numeración por cuenta bancaria y lo registra en
   *  el historial de cheques (/tesoreria/cheques). Requiere `bankAccount`. */
  esCheque?: boolean;
  referenceDate?: string;
  remarks?: string;
  /** Cuenta bancaria (id de CuentaBancaria) — requerida si el método de pago tiene
   *  requiresBankAccount=true y no tiene defaultBankAccount, o si esCheque=true. */
  bankAccount?: string;
}

/** Respuesta de POST /compras/:id/submit y /gastos/:id/submit cuando la factura es de Contado —
 *  además de la factura ya sometida, trae el id del Payment Entry creado (si se pudo crear). */
export interface SubmitConPagoResult<T> {
  data: T;
  pago?: { id: string };
}

export interface DistribucionCuentaDto {
  cuenta: string;
  monto: number;
}

/** Redistribuye un impuesto ya calculado por ERPNext (de documento o de artículo) entre varias
 *  cuentas — la suma de `distribucion` debe coincidir exactamente con lo que ERPNext ya calculó
 *  para `cuentaOrigen` (el BFF nunca calcula impuestos, solo redistribuye). Se aplica DESPUÉS de
 *  crear/actualizar el documento (necesita el monto real ya calculado, visible en el preview de
 *  asientos). */
export interface ImpuestoDistribucionDto {
  cuentaOrigen: string;
  distribucion: DistribucionCuentaDto[];
}

export interface CreateCompraDto {
  /** Proveedor registrado. Exactamente uno de `supplier`/`proveedorOcasionalNombre` es requerido. */
  supplier?: string;
  /** Nombre del vendedor cuando la compra es a alguien sin registrar como proveedor. No enviar junto con `supplier`. */
  proveedorOcasionalNombre?: string;
  /** RNC/Cédula del vendedor ocasional (sin registrar como proveedor). Se usa en el reporte 606 en vez del RNC del Supplier genérico. */
  proveedorOcasionalRnc?: string;
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
    /** Solo cuando itemCode es un Combo y algún componente tiene has_serial_no/has_batch_no activo. */
    componentTracking?: {
      itemCode: string;
      serials?: string[];
      batches?: { batchId: string; expiryDate?: string; qty: number }[];
    }[];
    /** Cuenta contable alterna para ESTA línea (expense_account). Solo tiene efecto real en líneas
     *  que no afectan valorización de inventario (ej. flete/servicio, o inventario perpetuo
     *  desactivado) — en una línea de stock normal, ERPNext sigue debitando la cuenta de
     *  inventario sin importar este campo. Si se omite, usa el default del artículo. */
    cuentaContable?: string;
    /** Divide el monto de ESTA línea (qty × rate) entre varias cuentas contables — la suma debe
     *  coincidir exactamente con el monto de la línea. Si se envía, `cuentaContable` de esta línea
     *  se ignora. No se puede combinar con `serials`/`batches` en la misma línea. */
    distribucionCuenta?: DistribucionCuentaDto[];
    /** Enlace manual a una línea de Orden de Compra (id de OrdenCompraItem) — deben mandarse
     *  junto con `ordenCompra` (400 si solo viene uno). Caso excepcional: el camino normal es
     *  POST /compras/ordenes/:id/facturar, que enlaza automáticamente. El backend RECHAZA esta
     *  operación si la orden referenciada ya tiene perReceived > 0 (duplicaría inventario ya
     *  recibido por conduce) — usar purchase-receipt/:id/facturar u ordenes/:id/facturar en ese caso.
     *  No usar en una línea que sea un Combo. */
    ordenCompra?: string;
    ordenCompraItem?: string;
    // NO description
  }[];
  /** NCF del comprobante del proveedor. Obligatorio si el proveedor está registrado (no
   *  ocasional). Para un proveedor ocasional puede omitirse: el sistema genera el comprobante
   *  automáticamente al someter usando `tipoComprobante`. */
  ncfProveedor?: string;
  /** Tipo de comprobante a generar cuando el proveedor es ocasional y se omite `ncfProveedor`
   *  (default B11 si se omite este campo). Sin efecto si `ncfProveedor` viene lleno o el
   *  proveedor está registrado. */
  tipoComprobante?: "B01" | "B02" | "B03" | "B04" | "B11" | "B12" | "B13" | "B14" | "B15" | "B16" | "B17";
  billNo?: string;
  tipoBienes606?: string;
  formaPago606?: string;
  tipoPago?: "Contado" | "Crédito";
  /** IDs de Purchase Taxes and Charges Templates (/config/impuestos-compras) a aplicar — admite varios,
   *  las líneas de todos los templates se combinan en el documento. Si se omite, se usan los defaults
   *  configurados en el proveedor o el default de la compañía si existe. */
  taxesTemplate?: string[];
  /** Retenciones (ids de Tax Withholding Category) que aplican a esta Compra — el monto retenido
   *  lo calcula el backend (tasa × base) a partir de estas; nunca se manda un monto.
   *  Si se omite, se usan las retenciones por defecto del proveedor. */
  retenciones?: string[];
  /** Cuenta por Pagar (credit_to) alterna para ESTE documento puntual — gana sobre
   *  Supplier.custom_cuenta_cxp_default. Úsese con cuidado: una devolución de compra solo puede
   *  aplicarse/reconciliarse contra facturas que compartan la misma cuenta CxP. */
  cuentaCxpOverride?: string;
  /** Redistribuye un impuesto ya calculado (ITBIS de documento o de artículo) entre varias
   *  cuentas — ver ImpuestoDistribucionDto. Solo tiene sentido en un PUT sobre un Draft existente
   *  (necesita el monto real ya calculado, visible en el preview de asientos). */
  impuestoDistribucion?: ImpuestoDistribucionDto[];
}

export type UpdateCompraDto = Partial<CreateCompraDto>;

// ─── Purchase Receipt (Recepción de Mercancía — flujo de 2 pasos) ─────────────
// Paso 1: se recibe la mercancía y entra a inventario sin datos fiscales.
// Paso 2 ("facturar"): cuando llega la factura real del proveedor, se genera
// una Purchase Invoice (update_stock=0) referenciando este receipt.

export interface PurchaseReceiptItem {
  itemCode: string;
  itemName: string;
  qty: number;
  rate: number;
  amount: number;
  warehouse: string;
  uom: string;
  /** Monto de esta línea ya facturado desde este receipt */
  billedAmt: number;
}

export interface PurchaseReceipt {
  id: string;
  supplier: string;
  supplierName: string;
  postingDate: string;
  supplierDeliveryNote: string | null;
  status: "draft" | "submitted" | "cancelled" | "unknown";
  /** 0-100, % ya facturado desde este receipt */
  perBilled: number;
  branch: string | null;
  department: string | null;
  items: PurchaseReceiptItem[];
  amendedFrom?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface CreatePurchaseReceiptDto {
  supplier: string;
  postingDate: string;
  supplierDeliveryNote?: string;
  branch?: string;
  department?: string;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    warehouse?: string;
    uom?: string;
    serials?: string[];
    batches?: { batchId: string; expiryDate?: string; qty: number }[];
    /** Enlace manual a una línea de Orden de Compra (id de OrdenCompraItem) — deben mandarse
     *  junto con `ordenCompra` (400 si solo viene uno). Caso excepcional: el camino normal es
     *  POST /compras/ordenes/:id/recibir, que enlaza automáticamente. A diferencia de Compras,
     *  acá no hay guard — recibir contra una orden es el caso normal. No usar en un Combo. */
    ordenCompra?: string;
    ordenCompraItem?: string;
  }[];
}

export type UpdatePurchaseReceiptDto = Partial<CreatePurchaseReceiptDto>;

export interface FacturarPurchaseReceiptDto {
  dueDate?: string;
  ncfProveedor?: string;
  billNo?: string;
  tipoBienes606?: string;
  formaPago606?: string;
  retencionItbis?: number;
  retencionIsr?: number;
  tipoPago?: "Contado" | "Crédito";
  taxesTemplate?: string;
}

// ─── Solicitud de Compra (Material Request) ───────────────────────────────────
// Pedido interno de intención ("necesito N de este artículo"), sin proveedor ni precio
// obligatorios. Se convierte en una o varias Órdenes de Compra vía /generar-orden.

export interface SolicitudCompraItem {
  /** Id real de esta línea (Material Request Item) — es lo que hay que mandar como
   *  `materialRequestItem` al generar una orden, NO el itemCode. */
  id: string;
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  /** Precio estimado — puede venir en 0 si la solicitud no lo especificó. */
  rate: number;
  warehouse?: string;
  scheduleDate: string;
  /** Cuánto de esta línea ya fue llevado a una Orden de Compra. Remanente = qty - orderedQty. */
  orderedQty: number;
  branch?: string | null;
  department?: string | null;
}

export interface SolicitudCompra {
  id: string;
  transactionDate: string;
  scheduleDate: string;
  status: "draft" | "submitted" | "cancelled";
  /** Estado nativo de ERPNext, con más matices que `status` — para el badge visual. */
  erpStatus: "Draft" | "Submitted" | "Stopped" | "Cancelled" | "Pending" | "Partially Ordered" | "Ordered";
  /** 0-100, % ya ordenado del total de la solicitud. */
  perOrdered: number;
  items: SolicitudCompraItem[];
  amendedFrom?: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface CreateSolicitudCompraDto {
  transactionDate: string;
  /** Fecha por defecto en que se necesita la mercancía, aplicada a toda línea que no traiga la
   *  suya propia. Debe ser >= transactionDate. */
  scheduleDate?: string;
  /** Sucursal por defecto — Material Request no tiene sucursal en la cabecera nativa, se aplica
   *  a cada línea que no traiga la suya. */
  branch?: string;
  department?: string;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    /** Precio estimado — opcional, una solicitud no exige precio. */
    rate?: number;
    uom?: string;
    warehouse?: string;
    scheduleDate?: string;
    branch?: string;
    department?: string;
  }[];
}

export type UpdateSolicitudCompraDto = Partial<CreateSolicitudCompraDto>;

/** Body de POST /compras/solicitudes/:id/generar-orden — crea una Orden de Compra (Draft) a
 *  partir del remanente pendiente de ordenar de la solicitud. Puede llamarse varias veces sobre
 *  la misma solicitud, cada vez trae solo lo que falte (el backend recalcula el remanente real). */
export interface OrdenFromSolicitudItemOverrideDto {
  /** id de SolicitudCompraItem (no el itemCode). */
  materialRequestItem: string;
  /** Si se omite, ordena todo el remanente de esa línea. */
  qty?: number;
  /** Precio acordado con el proveedor — obligatorio si la línea de la solicitud no trae rate. */
  rate?: number;
  warehouse?: string;
  scheduleDate?: string;
}

export interface CreateOrdenFromSolicitudDto {
  supplier: string;
  transactionDate?: string;
  scheduleDate?: string;
  currency?: string;
  conversionRate?: number;
  taxesTemplate?: string;
  branch?: string;
  department?: string;
  /** Si se omite, ordena TODO el remanente pendiente de la solicitud. */
  items?: OrdenFromSolicitudItemOverrideDto[];
}

// ─── Orden de Compra (Purchase Order) ──────────────────────────────────────────
// El pedido formal a un proveedor específico, con precios — se genera desde una Solicitud de
// Compra o se crea directa. Se recibe (Purchase Receipt) y/o se factura (Purchase Invoice).

export interface OrdenCompraItem {
  /** Id real de esta línea (Purchase Order Item) — es lo que hay que mandar como
   *  `purchaseOrderItem` al recibir o facturar, NO el itemCode. */
  id: string;
  itemCode: string;
  itemName?: string;
  qty: number;
  rate: number;
  amount: number;
  warehouse?: string;
  uom?: string;
  scheduleDate: string;
  /** Cuánto de esta línea ya fue recibido/facturado. Remanente = qty - receivedQty/billedAmt. */
  receivedQty: number;
  billedAmt: number;
  /** Presentes solo si esta línea viene de una Solicitud de Compra. */
  materialRequest?: string | null;
  materialRequestItem?: string | null;
}

export interface OrdenCompra {
  id: string;
  supplier: string;
  supplierName: string;
  transactionDate: string;
  scheduleDate: string;
  currency: string;
  conversionRate: number;
  status: "draft" | "submitted" | "cancelled";
  /** Estado nativo de ERPNext, con más matices que `status` — para el badge visual. */
  erpStatus: "Draft" | "On Hold" | "To Receive and Bill" | "To Bill" | "To Receive" | "Completed" | "Cancelled" | "Closed" | "Delivered";
  /** 0-100, % ya recibido — independiente de perBilled (puede estar 100% recibida y 0% facturada). */
  perReceived: number;
  /** 0-100, % ya facturado. */
  perBilled: number;
  grandTotal: number;
  netTotal: number;
  branch?: string | null;
  department?: string | null;
  items: OrdenCompraItem[];
  amendedFrom?: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface CreateOrdenCompraDto {
  supplier: string;
  transactionDate: string;
  scheduleDate?: string;
  currency?: string;
  /** Obligatorio SOLO si currency es distinta a la moneda de la compañía. */
  conversionRate?: number;
  /** Id del template de impuestos de compra — si se omite, usa el default del proveedor o de
   *  la compañía. */
  taxesTemplate?: string;
  setWarehouse?: string;
  branch?: string;
  department?: string;
  items: {
    itemCode: string;
    description?: string;
    qty: number;
    rate: number;
    discountPct?: number;
    uom?: string;
    warehouse?: string;
    scheduleDate?: string;
    /** Enlace manual de trazabilidad a una Solicitud de Compra — normalmente NO se manda a mano,
     *  se genera solo vía POST /compras/solicitudes/:id/generar-orden. */
    materialRequestItem?: string;
    materialRequest?: string;
  }[];
}

export type UpdateOrdenCompraDto = Partial<CreateOrdenCompraDto>;

export interface ReceiptFromOrdenItemOverrideDto {
  /** id de OrdenCompraItem (no el itemCode). */
  purchaseOrderItem: string;
  /** Si se omite, recibe todo el remanente de esa línea. */
  qty?: number;
  warehouse?: string;
  /** Requerido si el artículo tiene tracking de serial activo — uno por unidad recibida. */
  serials?: string[];
  /** Requerido si el artículo tiene tracking de lote activo. */
  batches?: { batchId: string; expiryDate?: string; qty: number }[];
}

export interface CreateReceiptFromOrdenDto {
  supplierDeliveryNote?: string;
  /** Si se omite, recibe TODO el remanente pendiente de la orden. */
  items?: ReceiptFromOrdenItemOverrideDto[];
}

export interface InvoiceFromOrdenItemOverrideDto {
  /** id de OrdenCompraItem (no el itemCode). */
  purchaseOrderItem: string;
  /** Si se omite, factura todo el remanente de esa línea. */
  qty?: number;
}

export interface CreateInvoiceFromOrdenDto {
  dueDate?: string;
  ncfProveedor?: string;
  billNo?: string;
  tipoBienes606?: string;
  formaPago606?: string;
  retencionItbis?: number;
  retencionIsr?: number;
  tipoPago?: "Contado" | "Crédito";
  taxesTemplate?: string;
  /** Si se omite, factura TODO el remanente pendiente de la orden. */
  items?: InvoiceFromOrdenItemOverrideDto[];
}

/** Respuesta de POST /compras/ordenes/:id/facturar — la Purchase Invoice creada y sometida.
 *  `warning` solo aparece cuando la orden ya tenía recepción parcial/total (perReceived > 0):
 *  no es un error, la operación sí se completó — mostrarlo como aviso no bloqueante.
 *  Nota: el ejemplo de la doc del backend usa `name` en vez de `id` para el documento creado —
 *  se tipa con ambos por si acaso, usar `id ?? name` al leerlo. */
export interface FacturarOrdenResult {
  data: Compra & { name?: string };
  warning?: string;
}

// ─── Gasto (Purchase Invoice — update_stock=0) ────────────────────────────────
// GastoItemDto: una línea puede ser de catálogo (itemCode) o "ad-hoc" (titulo, sin Item de
// ERPNext) — ver GastoItemDto abajo. Exactamente uno de itemCode/titulo por línea.

/** Línea de un Gasto en la respuesta de lectura (GET /gastos, GET /gastos/:id). Los campos
 *  ad-hoc (cuentaAlterna, tipoBienes606, tipoGastoFiscal) vienen null/undefined en líneas de
 *  catálogo. impuestos/retenciones de línea NO se devuelven aquí — el backend no los persiste
 *  individualmente, solo su efecto en los totales del documento (ver GastoItemDto). */
export interface GastoItem {
  itemCode: string | null;
  itemName?: string;
  /** Solo líneas ad-hoc — descripción larga de la línea. */
  descripcion?: string;
  qty: number;
  rate: number;
  amount: number;
  uom?: string;
  description?: string;
  /** Solo líneas ad-hoc — cuenta contable (Account) debitada por esta línea. */
  cuentaAlterna?: string | null;
  /** Solo líneas ad-hoc — Tipo de Bienes/Servicios (606) de esta línea. Informativo: el
   *  reporte 606 solo usa el campo de cabecera del documento (Gasto.tipoBienes606), nunca
   *  desglosa por línea. */
  tipoBienes606?: string | null;
  /** Solo líneas ad-hoc. */
  tipoGastoFiscal?: "Bienes" | "Servicios" | null;
}

/** Línea de un Gasto en el request (POST/PUT /gastos). De catálogo: trae `itemCode`. Ad-hoc
 *  (sin Item de ERPNext): trae `titulo` en su lugar, con su propia `cuentaAlterna` (requerida)
 *  e impuestos/retenciones INDEPENDIENTES de los del documento — si se omiten, la línea no
 *  lleva ninguno aunque el documento sí traiga `taxesTemplate`/`retenciones`. */
export interface GastoItemDto {
  /** Item del catálogo (ej. Cuentas por Pagar). Requerido salvo que se envíe `titulo`. */
  itemCode?: string;
  /** Título de un ítem SIN catálogo (ad-hoc) — activa este modo en vez de `itemCode`. */
  titulo?: string;
  /** Solo ítems ad-hoc — descripción larga de la línea. */
  descripcion?: string;
  /** Cantidad. Opcional en ad-hoc (default 1 en el backend); recomendado siempre en catálogo. */
  qty?: number;
  /** Precio unitario. Siempre requerido. */
  rate: number;
  uom?: string;
  description?: string;
  /** Solo ítems ad-hoc — mismo catálogo de 11 valores que el campo de cabecera. Ignorado en
   *  ítems de catálogo. El reporte 606 no desglosa por línea — es solo informativo. */
  tipoBienes606?: string;
  /** Solo ítems ad-hoc. */
  tipoGastoFiscal?: "Bienes" | "Servicios";
  /** Requerida en ítems ad-hoc — cuenta contable (Account) a debitar. Ignorada en catálogo.
   *  Opcional en ítems de catálogo (si se omite, usa la cuenta de gasto default del Item); si se
   *  envía, la sobreescribe solo para esta línea. Si se envía `distribucionCuenta`, este campo se
   *  ignora (la cuenta la define cada entrada de la distribución). */
  cuentaAlterna?: string;
  /** Divide el monto de ESTA línea (qty × rate) entre varias cuentas contables — la suma debe
   *  coincidir exactamente con el monto de la línea. Si se envía, `cuentaAlterna` de esta línea
   *  se ignora. Funciona en ítems de catálogo y ad-hoc por igual. */
  distribucionCuenta?: DistribucionCuentaDto[];
  /** Solo ítems ad-hoc — ids de "Tasa Impuesto RD" que aplican a ESTA línea, independientes de
   *  `taxesTemplate` del documento. */
  impuestos?: string[];
  /** Solo ítems ad-hoc — ids de Tax Withholding Category que aplican a ESTA línea,
   *  independientes de `retenciones` del documento. Base: qty × rate de esta línea. */
  retenciones?: string[];
}

export interface Gasto {
  id: string;
  supplier: string;
  supplierName: string;
  /** Indica si el gasto se registró a un proveedor ocasional (sin registrar). */
  esProveedorOcasional?: boolean;
  /** Nombre del vendedor ocasional (solo presente cuando esProveedorOcasional=true). */
  proveedorOcasionalNombre?: string;
  /** RNC/Cédula del vendedor ocasional (solo presente cuando esProveedorOcasional=true). */
  proveedorOcasionalRnc?: string;
  postingDate: string;
  dueDate: string;
  branch?: string | null;
  department?: string | null;
  status: "draft" | "submitted" | "cancelled";
  currency: string;
  items: GastoItem[];
  total: number;
  grandTotal: number;
  /** Monto total de impuestos del documento (Purchase Taxes and Charges), si se aplicó un template */
  taxAmount?: number;
  outstandingAmount: number;
  ncfProveedor?: string;
  /** N° de factura del proveedor (native field `bill_no` en ERPNext) */
  billNo?: string | null;
  tipoComprobante?: "B01" | "B13" | "B14" | "B15" | "B16" | "B17" | "E31";
  tipoBienes606?: string;
  formaPago606?: string;
  tipoPago?: "Contado" | "Crédito";
  /** Retenciones aplicadas al gasto, enriquecidas con su tasa vigente (igual que
   *  Supplier.retencionesDefault en el GET de detalle — no confundir con el `string[]` de ids
   *  que se envía en CreateGastoDto). */
  retenciones?: ProveedorIdTasa[];
  /** Purchase Taxes and Charges Templates aplicados al documento, enriquecidos con su tasa
   *  (igual que Supplier.impuestoGastosDefault en el GET de detalle). */
  taxesTemplate?: ProveedorIdTasa[];
  /** Líneas de impuesto ya resueltas por el BFF a partir de `taxesTemplate` (una por cada
   *  Purchase Taxes and Charges Template/componente aplicado, con su tasa). Solo lectura. */
  impuestos?: ProveedorIdTasa[];
  categoriaGasto?: "Operativo" | "Administrativo" | "Ventas" | "Financiero";
  esDeducible?: boolean;
  amendedFrom?: string;
  createdAt?: string;
  modifiedAt?: string;
  message?: string;
  /** Cuenta por Pagar (credit_to) alterna para este documento, si se sobreescribió con
   *  cuentaCxpOverride. Una devolución solo puede aplicarse contra facturas con la misma cuenta CxP. */
  cuentaCxpOverride?: string;
  /** Presente solo si el comprador autogeneró un e-CF (E41/E43/E44/E45/E47) al someter — gasto de
   *  tipo B11/B13/B14/B15/B17 sin NCF y e-CF habilitado. Ausente en el caso normal. */
  ecf?: EcfSubmitResult;
}

export interface CreateGastoDto {
  /** Proveedor registrado. Exactamente uno de `supplier`/`proveedorOcasionalNombre` es requerido. */
  supplier?: string;
  /** Nombre del vendedor cuando el gasto es a alguien sin registrar como proveedor. No enviar junto con `supplier`. */
  proveedorOcasionalNombre?: string;
  /** RNC/Cédula del vendedor ocasional (sin registrar como proveedor). Se usa en el reporte 606 en vez del RNC del Supplier genérico. */
  proveedorOcasionalRnc?: string;
  postingDate: string;
  dueDate?: string;
  branch?: string;
  department?: string;
  currency?: string;
  conversionRate?: number;
  items: GastoItemDto[];
  ncfProveedor?: string;
  billNo?: string;
  tipoComprobante?: "B01" | "B13" | "B14" | "B15" | "B16" | "B17" | "E31";
  tipoBienes606?: string;
  formaPago606?: string;
  tipoPago?: "Contado" | "Crédito";
  categoriaGasto?: "Operativo" | "Administrativo" | "Ventas" | "Financiero";
  esDeducible?: boolean;
  /** Ids de config/retenciones a aplicar (multiselect). Si se omite, el BFF aplica las retenciones
   *  configuradas como default del proveedor. */
  retenciones?: string[];
  /** IDs de Purchase Taxes and Charges Templates (/config/impuestos-compras) a aplicar (multiselect).
   *  Si se omite, se usan los `impuestoGastosDefault` del proveedor si existen, y si no el default
   *  de la compañía. */
  taxesTemplate?: string[];
  /** Cuenta por Pagar (credit_to) alterna para ESTE documento puntual, en vez del default de la
   *  compañía. Úsese con cuidado: una devolución de compra solo puede aplicarse/reconciliarse
   *  contra facturas que compartan la misma cuenta CxP. */
  cuentaCxpOverride?: string;
  /** Redistribuye un impuesto ya calculado (ITBIS de documento o de artículo) entre varias
   *  cuentas — ver ImpuestoDistribucionDto. Solo tiene sentido en un PUT sobre un Draft existente
   *  (necesita el monto real ya calculado, visible en el preview de asientos). */
  impuestoDistribucion?: ImpuestoDistribucionDto[];
}

export type UpdateGastoDto = Partial<CreateGastoDto>;

/** Fila del preview de asientos contables (GL) que se generarían al someter una Compra/Gasto en
 *  Draft — GET /compras/:id/preview-asientos y GET /gastos/:id/preview-asientos. Solo lectura. */
export interface AsientoPreviewRow {
  postingDate: string;
  account: string;
  debit: number;
  credit: number;
  against?: string;
  partyType?: string;
  party?: string;
  costCenter?: string;
  /** Solo las filas "impuesto" son válidas como `cuentaOrigen` en `impuestoDistribucion` — las
   *  "retencion" se regeneran aparte (no redistribuibles) y las "costo" (inventario, CxP, la del
   *  artículo) nunca aplican. */
  origen: "impuesto" | "retencion" | "costo";
}

// ─── Usuario ──────────────────────────────────────────────────────────────────

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §6 — cada fila es una MEMBRESÍA (persona +
// tenant), no solo un `User` de ERPNext. `enabled` ya no existe — reemplazado por `status`, 5
// valores en vez de 2 (ver MembershipStatus más arriba, §6.1).
export interface Usuario {
  email: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  status: MembershipStatus;
  isDefault: boolean;
  roles: string[];
  invitedAt?: string;
  acceptedAt?: string;
  phone?: string;
  language?: string;
  timeZone?: string;
  lastActive?: string;
  maxDiscountPct?: number;
  warehouses?: string[];
  defaultWarehouse?: string;
  branches?: string[];
  defaultBranch?: string;
  /** Caja (POS Profile) por defecto al abrir turno, id de src/shared/api/cajas.ts listCajas() */
  defaultPosProfile?: string;
  /** Código de carnet/QR/barcode del empleado — único por tenant, no es secreto. null si no tiene uno asignado. */
  adminCode?: string | null;
}

// GET /usuarios/lookup?email= — paso previo obligatorio antes de invitar (§6.2).
export interface UsuarioLookupResult {
  exists: boolean;
  /** Solo si exists:true — de solo lectura, es la persona, no la fija este tenant. */
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** Solo `true` si `membershipStatus === 'accepted'`. */
  alreadyMember?: boolean;
  membershipStatus?: MembershipStatus | null;
}

// POST /usuarios — invita (nunca crea con contraseña). `perfiles` o `roles`, uno de los dos
// obligatorio, mutuamente excluyentes (§6.3). `firstName`/`lastName` solo hacen falta (y son
// obligatorios) cuando el email NO existía todavía (`UsuarioLookupResult.exists === false`).
export interface InviteUsuarioDto {
  email: string;
  firstName?: string;
  lastName?: string;
  mobileNo?: string;
  /** Forma recomendada — GET /roles/perfiles. Excluyente con `roles`, autoritativo. */
  perfiles?: string[];
  roles?: string[];
  adminCode?: string;
}

export interface InviteUsuarioResult {
  email: string;
  firstName: string;
  lastName?: string;
  status: "invited";
  /** Informativo — qué tipo de correo se le mandó a la persona invitada (§6.3). */
  purpose: "registration" | "invitation";
}

// PUT /usuarios/:email — YA NO acepta firstName/lastName (§6.6, el backend rechaza con 400 si
// se mandan — `forbidNonWhitelisted`). El nombre es de la persona, se edita en PATCH /me/profile.
export interface UpdateUsuarioDto {
  mobileNo?: string;
  perfiles?: string[];
  roles?: string[];
  warehouses?: string[];
  defaultWarehouse?: string;
  maxDiscountPct?: number;
  branches?: string[];
  defaultBranch?: string;
  defaultPosProfile?: string;
  adminPin?: string;
  /** Código de carnet/QR/barcode del empleado — permite buscarlo luego con GET /usuarios/buscar-codigo/:codigo. */
  adminCode?: string;
}

export interface Role {
  name: string;
}

// ─── Permisos y Roles (admin — requiere System Manager) ───────────────────────
// Nota: openapi.json documenta los DTOs de request para /permisos y /roles pero
// no las respuestas (200/201 sin schema) — los shapes de abajo para PermisoRow
// y RoleDetail siguen los ejemplos del prompt de implementación, no un schema
// generado. Verificar contra el endpoint real si algo no calza.

export interface PermisoFlagValues {
  read: boolean;
  write: boolean;
  create: boolean;
  delete: boolean;
  submit: boolean;
  cancel: boolean;
  amend: boolean;
  report: boolean;
  export: boolean;
  import: boolean;
  share: boolean;
  print: boolean;
  email: boolean;
  select: boolean;
}

export type PermisoPtype = keyof PermisoFlagValues;

export interface PermisoRow extends PermisoFlagValues {
  role: string;
  permlevel: number;
  ifOwner?: boolean;
}

export interface CreatePermisoDto {
  doctype: string;
  role: string;
  permlevel?: number;
}

export interface UpdatePermisoDto {
  doctype: string;
  role: string;
  permlevel: number;
  ptype: PermisoPtype;
  value?: boolean;
  ifOwner?: boolean;
}

export interface RemovePermisoDto {
  doctype: string;
  role: string;
  permlevel: number;
  ifOwner?: boolean;
}

export interface ResetPermisoDto {
  doctype: string;
}

export interface AssignPermisoDto extends Partial<PermisoFlagValues> {
  doctype: string;
  role: string;
  permlevel?: number;
  ifOwner?: boolean;
}

/** La forma exacta la define ERPNext (get_roles_and_doctypes) — normalizada
 * defensivamente en el cliente, ver normalizeCatalogo() en shared/api/permisos.ts */
export interface PermisosCatalogo {
  doctypes: string[];
  roles: string[];
}

export interface RoleUserSummary {
  email: string;
  fullName: string;
  enabled: boolean;
}

/** GET /roles/perfiles — Role Profile de ERPNext, con los roles planos que agrupa cada uno. Forma
 *  recomendada de asignar permisos (`InviteUsuarioDto.perfiles`/`UpdateUsuarioDto.perfiles`) en
 *  vez de armar la lista de `roles` sueltos a mano — sin schema documentado en openapi.json. */
export interface RolePerfil {
  name: string;
  roles: string[];
}

export interface RoleDetail {
  roleName: string;
  disabled: boolean;
  deskAccess: boolean;
  isCustom: boolean;
  users: RoleUserSummary[];
}

export interface CreateRoleDto {
  roleName: string;
  deskAccess?: boolean;
}

export interface UpdateRoleDto {
  disabled?: boolean;
  deskAccess?: boolean;
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

/** Solo lectura — generada y gestionada automáticamente desde config/tasas-impuesto */
export interface TaxTemplate {
  id: string;
  title: string;
  isDefault: boolean;
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

/** Solo lectura — generada y gestionada automáticamente desde config/tasas-impuesto */
export interface ItemTaxTemplate {
  id: string;
  title: string;
  taxes: ItemTaxLine[];
}

// ─── Tasas de Impuesto (catálogo de impuestos base + combos) ──────────────────

export interface TasaImpuestoComponente {
  /** ID (name de ERPNext) del impuesto base que compone este combo */
  impuestoBaseId: string;
  /** 100 = suma completa de la tasa. Ej. 30 = "30% de este impuesto" (retenciones) */
  factor?: number;
}

export interface TasaImpuesto {
  id: string;
  nombre: string;
  /** Cuenta contable (Account) que representa este impuesto en los templates */
  account: string;
  /** Cuenta contable a usar específicamente en compras/gastos. Si se omite/"" se usa `account`. */
  accountCompras?: string;
  esCombo: boolean;
  /** Tasa en porcentaje. Si esCombo=true, la calcula el backend */
  tasa?: number;
  componentes?: TasaImpuestoComponente[];
  descripcion?: string;
  /** El backend gestiona sola la plantilla interna correspondiente (Item Tax Template) */
  aplicaArticulos?: boolean;
  /** El backend gestiona sola la plantilla interna de Ventas y la deja como default de la compañía */
  aplicaVentas?: boolean;
  /** El backend gestiona sola la plantilla interna de Compras y la deja como default de la compañía */
  aplicaCompras?: boolean;
}

export interface CreateTasaImpuestoDto {
  nombre: string;
  account: string;
  /** Cuenta contable a usar específicamente en compras/gastos. Si se omite/"" se usa `account`. */
  accountCompras?: string;
  esCombo?: boolean;
  tasa?: number;
  componentes?: TasaImpuestoComponente[];
  aplicaArticulos?: boolean;
  aplicaVentas?: boolean;
  aplicaCompras?: boolean;
  descripcion?: string;
}

export type UpdateTasaImpuestoDto = Partial<CreateTasaImpuestoDto>;

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

/** Formato de impresión de PDF para facturas, cobros y compras. "a4"/"carta"/"a6": página completa (mismo diseño, distinto tamaño de papel). "pos": ticket angosto 80mm. */
export type FormatoImpresion = "a4" | "carta" | "a6" | "pos"

// GET/PUT /config/facturacion
export interface FacturacionConfig {
  rolesCancelacionFactura: string[];
  /** "directo": un solo método de pago al cobrar (default, histórico). "caja": múltiples métodos + vuelto. */
  flujoCobro: "directo" | "caja";
  /** Si está activo, no se puede vender un artículo de inventario sin una Ubicación asignada dentro del almacén de facturación. */
  requiereUbicacionVenta?: boolean;
  /** Si está activo, al comprar un artículo con tracking de serial/lote exige capturar los mismos en la línea de compra. */
  requiereSerialLoteCompra?: boolean;
  /** Default true — docs/tasks/77_actualizar_costo_en_compra_configurable.md. Si está activo, someter una compra
   *  actualiza `Item.valuation_rate` ("Costo de Valoración") del artículo comprado con la tasa de esa compra. Un
   *  artículo puntual puede salirse de este default con `Item.actualizarCostoEnCompraOverride` ('si'/'no' siempre
   *  gana sobre este valor). No afecta el recálculo del precio de venta en modo `cost_plus` — eso sigue igual
   *  independientemente de este ajuste. */
  actualizarCostoEnCompra?: boolean;
  /** "email" (default): al crear un usuario (POST /usuarios) o resetear su contraseña (POST /usuarios/:email/reset-password)
   *  se genera un link y se manda por correo (comportamiento histórico). "directo": el administrador escribe la contraseña
   *  él mismo en el momento (`password` en la creación, `newPassword` en el reset) y se fija de una vez en ERPNext sin
   *  enviar ningún correo — útil si el tenant no tiene canal de email saliente confiable. */
  modoCreacionPassword?: "email" | "directo";
  /** Si está en false, oculta el selector de Departamento (opcional, análogo a Sucursal) en los formularios de Factura, Cotización, Pedido, Cobro, Compra y Gasto. Puramente de presentación — no afecta documentos ya guardados con departamento. Default true. */
  usaDepartamentos?: boolean;
  /** Si está en false, oculta el selector de plantilla de Impuesto de Documento en Factura, Cotización y Compra. Puramente de presentación. Default true. */
  usaImpuestoDocumento?: boolean;
  /** Name de la plantilla dedicada de Sales Taxes and Charges Template (generada desde config/tasas-impuesto) marcada como default de ventas para la compañía. null para quitar el default. */
  plantillaImpuestoVentasDefault?: string | null;
  /** Name de la plantilla dedicada de Purchase Taxes and Charges Template (generada desde config/tasas-impuesto) marcada como default de compras para la compañía. null para quitar el default. */
  plantillaImpuestoComprasDefault?: string | null;
  /** true si el módulo POS (turnos de caja) está activo para este tenant. */
  usaModuloPos?: boolean;
  /** Nombre del POS Profile provisionado — solo informativo, no editable desde aquí. */
  posProfileDefault?: string | null;
  /** Nombre exacto del método de pago que representa "la caja" — se compara contra el efectivo físico al cuadrar, y se usa como default para cobrar/pagar facturas en DOP (moneda base) cuando no se especifica ninguno. Solo tiene sentido cuando usaModuloPos está activo. */
  modoPagoCaja?: string | null;
  /** Método de pago default para facturas en USD — se usa como fallback cuando una línea de pago no trae `modeOfPayment` explícito. Solo mostrar el campo si `monedasHabilitadas` incluye "USD". */
  modoPagoCajaUsd?: string | null;
  /** Igual que `modoPagoCajaUsd`, pero para EUR. Solo mostrar el campo si `monedasHabilitadas` incluye "EUR". */
  modoPagoCajaEur?: string | null;
  /** Nombres exactos de Mode of Payment que requieren conteo manual al cerrar turno. Si no se configura, el backend usa por defecto los métodos type="Cash". */
  modosPagoConciliar?: string[];
  /** Si está activo, cerrar un turno de caja exige el desglose de denominaciones contadas para el/los modos de pago en efectivo. */
  arqueoEfectivoRequerido?: boolean;
  /** Roles de ERPNext autorizados para cerrar el turno de OTRO cajero (mismas validaciones que cerrar el propio turno). Vacío/omitido = nadie puede cerrar turnos ajenos. */
  rolesCierreCajaAjena?: string[];
/** Formato de impresión default al generar el PDF de una factura, cobro o compra. "a4"/"carta"/"a6": página completa (mismo diseño, distinto tamaño de papel). "pos": ticket angosto 80mm para impresora térmica. Siempre debe estar incluido en formatosPermitidos. */
  formatoImpresionDefault?: FormatoImpresion
  /** Formatos de impresión habilitados para este tenant — el selector de formato al generar un PDF solo debe ofrecer estos. Si nunca se configuró, vienen los 4. Mínimo 1. */
  formatosPermitidos?: FormatoImpresion[]
  /** Máximo de horas que un turno de caja puede estar abierto antes de obligar al cajero a cerrarlo. 0.1 = 6 minutos. Default 24 si no se configura. */
  turnoMaxHoras?: number
  /** Cuando a una Secuencia NCF le queden este número de comprobantes o menos, GET /config/ncf marca esa serie con alertaActiva=true y se envía el correo del tipo de notificación "Secuencia NCF por agotarse" (una vez por día por serie). Default 50. */
  ncfAlertaMinimo?: number
  /** Espejo de `Accounts Settings.disable_rounded_total` de ERPNext — aplica como default a toda factura/compra nueva del tenant. Si está en false (default), el grand_total con centavos se redondea a rounded_total y ese es el monto que queda a cobrar (pensado para efectivo). Si está en true, se cobra el grand_total exacto con centavos (pensado para tarjeta/cheque/transferencia). No afecta documentos ya sometidos. */
  redondeoTotalDeshabilitado?: boolean

  // ─── Multimoneda (DOP/USD/EUR) — ver docs/tasks/60_multimoneda_dop_usd_eur.md ────────────

  /** Si está activo, cobrar una factura de venta en moneda extranjera usa siempre la tasa con la que se emitió esa factura, nunca la tasa del día. */
  tasaFijaCxc?: boolean
  /** Igual que `tasaFijaCxc`, pero para pagos a proveedores (Cuentas por Pagar). */
  tasaFijaCxp?: boolean
  /** Si está activo, permite cobrar/pagar en una cuenta bancaria que opera en una moneda distinta a la del monto — sujeto a `bankConversionRate`/`receivedAmount` en el cobro/pago. */
  permitirPagoMonedaDistintaBanco?: boolean
  /** Si está activo, un job diario actualiza las tasas de cambio automáticamente (a la hora `tasasHoraActualizacion`, contra `tasasProveedor`). */
  tasasActualizacionAutomatica?: boolean
  /** Hora del servidor, formato "HH:mm" exacto (24 horas, sin segundos ni zona horaria), a la que corre el job de actualización automática de tasas. */
  tasasHoraActualizacion?: string
  /** Proveedor externo contra el que el job de actualización automática resuelve las tasas. */
  tasasProveedor?: "Banco Central RD" | "Currency Exchange Settings"
  /** Última vez que corrió el job de actualización automática de tasas — ISO datetime, o null si nunca corrió. Solo lectura. */
  tasasUltimaActualizacion?: string | null
  /** Último error del job de actualización automática de tasas, o null si no hubo. Solo lectura. */
  tasasUltimoError?: string | null
  /** Moneda base de la compañía — siempre "DOP", nunca se deshabilita. Derivado en vivo desde el catálogo de monedas, no editable con PUT. */
  monedaBase?: string
  /** Monedas habilitadas para el tenant (siempre incluye `monedaBase`). Derivado en vivo, no editable con PUT. */
  monedasHabilitadas?: string[]
  /** true si `monedasHabilitadas` tiene alguna moneda además de `monedaBase`. Derivado en vivo, no editable con PUT. */
  multimonedaHabilitada?: boolean

  // ─── Despacho (Delivery Note) — docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md ───
  /** Interruptor por tenant, apagado por default. Con true: las facturas nuevas dejan de descontar
   *  inventario al someterse (update_stock=0) — la salida física pasa a ocurrir al someter un
   *  Despacho (Delivery Note). No se edita con PUT directo — usar POST /config/despacho/habilitar
   *  y /deshabilitar (ver despachos.ts), y volver a pedir este endpoint después para refrescar. */
  despachoHabilitado?: boolean
  /** Con despacho habilitado, permite elegir "despachar ahora" vs. "despachar después" por venta
   *  (`despachoFuturo` en Create/UpdateInvoiceDto). Default true (preserva el comportamiento
   *  previo: con despacho activo, todo era a futuro). No se edita con PUT directo — usar
   *  PUT /config/despacho/futuro (ver despachos.ts) y refrescar este endpoint después. */
  despachoFuturoHabilitado?: boolean
  /** Si una venta a futuro reserva stock en firme (Stock Reservation Entry) contra otros clientes
   *  al crear el despacho pendiente. Default true. Ver PUT /config/despacho/futuro. */
  despachoFuturoBloqueaVenta?: boolean
  /** Solo ventas inmediatas (no a futuro): si true, al someter la factura el sistema auto-asigna
   *  seriales/lotes disponibles (FIFO/FEFO) en vez de exigir que el usuario los asigne a mano.
   *  Default false. Ver PUT /config/despacho/futuro. */
  despachoConfirmarStockAsignaSeriales?: boolean

  // ─── Confirmación de despacho de Pedidos — docs/tasks/79_confirmacion_despacho_pedido.md ───
  /** Si está activo, un Pedido inmediato (no apartado, no despacho a futuro) no se puede someter
   *  sin antes pasar por POST /pedidos/:id/confirmar-despacho. Default false (apagado): el flujo
   *  de Pedidos no cambia. Se edita con el PUT /config/facturacion normal (no un endpoint aparte). */
  pedidoRequiereConfirmacionDespacho?: boolean
  /** Si el PDF del Pedido (GET /pedidos/:id/pdf, "conduce") incluye columnas de precio/ITBIS/total
   *  y la sección de totales. Default true. En false queda como un conduce sin montos. */
  pedidoConduceIncluyePrecios?: boolean
}

/** PUT /config/despacho/futuro — docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md §2.1. Los 3 campos
 *  son independientes y opcionales: mandar solo los que el usuario tocó. 400 si no se manda
 *  ninguno. La respuesta es solo un mensaje — volver a pedir GET /config/facturacion después para
 *  refrescar los valores reales. */
export interface UpdateDespachoFuturoDto {
  futuroHabilitado?: boolean;
  futuroBloqueaVenta?: boolean;
  confirmarStockAsignaSeriales?: boolean;
}

// ─── Facturación Electrónica (e-CF) ────────────────────────────────────────────
// F0-F1 ya aterrizaron (cimientos + config). No hay todavía emisión real de e-CF
// (fases F3-F6) — ver GET/PUT /config/ecf.

export type EcfTipoElectronico = "31" | "32" | "33" | "34" | "41" | "43" | "44" | "45" | "46" | "47";

/** Uno por RNC emisor conectado a Vega — solo lectura, gestionado por soporte/backend. */
export interface EcfProvisioningCliente {
  company: string;
  rnc: string;
  certificateExpiresAt?: string | null;
  certificationStage?: string | null;
  contingencyMode?: boolean;
}

/** Estado de la conexión del tenant con Vega. Para el tenant promedio hoy `provisionado`
 *  es false y el resto viene vacío/null — es normal, no un error. Solo lectura: no hay
 *  todavía un flujo de auto-servicio para conectar un tenant a Vega desde la UI. */
export interface EcfProvisioning {
  provisionado: boolean;
  activeMode: "test" | "live" | null;
  hasApiKeyTest: boolean;
  hasApiKeyLive: boolean;
  clientes: EcfProvisioningCliente[];
}

export interface EcfConfig {
  habilitado: boolean;
  company?: string | null;
  /** typeId de e-CF habilitados para esta compañía. Un tipo NO listado sigue emitiéndose
   *  como NCF físico aunque `habilitado` esté activo — migración por tipo, no big-bang. */
  tiposElectronicos: EcfTipoElectronico[];
  vegaClientId?: string | null;
  ambiente?: string | null;
  contingenciaActiva: boolean;
  /** Si está activo, la emisión del e-CF ocurre automáticamente al someter el documento. */
  emitirAlSometer: boolean;
  /** Si Vega/DGII no responde: true = se bloquea la facturación (default seguro); false =
   *  se activa contingencia automáticamente. */
  bloquearSubmitSiVegaCaido: boolean;
  /** 1=Contado, 2=Crédito, 3=Gratuito. */
  tipoPagoDefault: 1 | 2 | 3;
  /** 01=Habituales, 02=Financieros, 03=Extraordinarios, 04=Arrendamientos, 05=Venta de
   *  activo, 06=Otros. */
  tipoIngresosDefault: "01" | "02" | "03" | "04" | "05" | "06";
  /** Días para aprobar/rechazar comercialmente (ACECF) un e-CF recibido — solo relevante
   *  para comprobantes recibidos de terceros (fase futura). */
  diasLimiteAprobacionComercial: number;
  /** Si está activo, adjunta automáticamente el PDF de archivo fiscal cuando un
   *  comprobante es aceptado por la DGII (fase futura, pero el campo ya se puede configurar). */
  adjuntarPdfa: boolean;
  /** Mismo concepto que FacturacionConfig.ncfAlertaMinimo, aplicado a rangos electrónicos. */
  umbralAlertaSecuencia: number;
  provisioning: EcfProvisioning;
  /** Presente si el doctype de configuración e-CF aún no está instalado en el tenant —
   *  tratar igual que en GET /config/facturacion: mostrar defaults, sin romper la pantalla. */
  note?: string;
}

export interface UpdateEcfConfigDto {
  habilitado?: boolean;
  tiposElectronicos?: EcfTipoElectronico[];
  emitirAlSometer?: boolean;
  bloquearSubmitSiVegaCaido?: boolean;
  tipoPagoDefault?: 1 | 2 | 3;
  tipoIngresosDefault?: "01" | "02" | "03" | "04" | "05" | "06";
  diasLimiteAprobacionComercial?: number;
  adjuntarPdfa?: boolean;
  umbralAlertaSecuencia?: number;
}

// ─── e-CF — Secuencias e-NCF (/config/ecf/secuencias) ──────────────────────────
// Análogo a las Secuencias NCF físicas (NcfSerie / /config/ncf) pero para los tipos
// electrónicos. Mismos campos derivados (exhausted/remaining/usedPct/alertaActiva).

export type EcfEnv = "TesteCF" | "CerteCF" | "eCF";

export interface EcfSequence {
  id: string;
  typeId: EcfTipoElectronico;
  /** Equivalente físico (B01, B02…) — solo referencia visual, el dato real es typeId. */
  ncfType: string;
  env: EcfEnv;
  startOn: number;
  stopOn: number;
  currentNumber: number;
  expireAt: string | null;
  exhausted: boolean;
  used: number;
  remaining: number;
  usedPct: number;
  umbralAlerta: number;
  alertaActiva: boolean;
}

export interface CreateEcfSequenceDto {
  typeId: EcfTipoElectronico;
  startOn: number;
  stopOn: number;
  expireAt?: string;
  /** Opcional — se infiere del ambiente activo (test → TesteCF, live → eCF). */
  env?: EcfEnv;
}

/** Solo se puede extender un rango — typeId/env son inmutables. */
export interface UpdateEcfSequenceDto {
  stopOn?: number;
  expireAt?: string;
}

/** GET /config/ecf/tipos — catálogo unificado NCF físico + e-CF. */
export interface EcfTipoCatalogo {
  ncfType: string;
  typeId: EcfTipoElectronico | null;
  /** true = ya habilitado para emitirse como e-CF en este tenant. */
  electronico: boolean;
}

// ─── e-CF — Administración / provisioning (/config/ecf/admin/*) ─────────────────
// Requieren rol "System Manager" en el tenant (validado en vivo contra ERPNext → 403).

export type EcfMode = "test" | "live";

export interface EcfConnectApiKeyDto {
  mode: EcfMode;
  apiKey: string;
}

export interface EcfConnectResult {
  mode: EcfMode;
  connected: boolean;
}

export interface CreateEcfClientDto {
  /** Nombre EXACTO de la Company en ERPNext. */
  company: string;
  rnc: string;
  legalName: string;
  tradeName?: string;
  address: string;
  municipality?: string;
  province?: string;
  /** Máximo 3. */
  phones?: string[];
  email?: string;
  economicActivity?: string;
  /** Opcional — si se omite usa el ambiente activo ya conectado. */
  mode?: EcfMode;
}

/** Objeto Client de Vega (respuesta de POST /config/ecf/admin/clients, y de cada item de
 *  GET /config/ecf/admin/clients). Laxo a propósito. */
export interface EcfClient {
  id: string;
  rnc: string;
  legalName: string;
  tradeName?: string | null;
  activeEnv?: string;
  hasCertificate?: boolean;
  certificationStage?: string | null;
  certificateExpiresAt?: string | null;
  contingencyMode?: boolean;
  /** Solo en GET /clients — Company de este tenant a la que ya está vinculado, o null si
   *  está libre para vincular con POST /clients/link. */
  linkedCompany?: string | null;
  [key: string]: unknown;
}

export interface EcfClientsListResult {
  clients: EcfClient[];
  mode: EcfMode;
}

/** POST /config/ecf/admin/clients/link — vincula un Client que ya existe en Vega sin crearlo. */
export interface LinkEcfClientDto {
  /** Nombre EXACTO de la Company en ERPNext. */
  company: string;
  vegaClientId: string;
  /** Opcional — si se omite usa el ambiente activo ya conectado. */
  mode?: EcfMode;
}

export interface UploadEcfCertificateDto {
  /** Archivo .p12 completo en base64, sin el prefijo data:... */
  p12Base64: string;
  password: string;
  mode?: EcfMode;
}

export interface UploadEcfCertificateResult {
  certificateExpiresAt: string;
}

export interface RegisterEcfWebhookDto {
  mode?: EcfMode;
}

export interface RegisterEcfWebhookResult {
  id: string;
  url: string;
  mode: EcfMode;
}

/** DELETE /config/ecf/admin/clients/{company} — desvincula el Client de Vega de una Company sin
 *  tocar nada en Vega (solo borra el puente local `tenant_ecf_clients` y limpia el espejo en
 *  Facturacion Electronica Config). Úsalo cuando el `vegaClientId` guardado quedó apuntando a un
 *  Client que ya no existe en Vega ("Cliente no encontrado" al emitir). */
export interface UnlinkEcfClientResult {
  message: string;
  previousVegaClientId: string;
}

// ─── e-CF — Resultado / estado del comprobante electrónico de una factura ──────
// Viene tanto en POST /invoices/:id/submit (data.ecf, recién emitido) como en
// GET /invoices/:id (data.ecf, estado actualizado en segundo plano por webhook).
// `status` recorre PENDING → SIGNED → ACCEPTED | CONDITIONAL | REJECTED | FAILED | …
export interface EcfSubmitResult {
  voucherId: string;
  status: string;
  qrUrl?: string | null;
  securityCode?: string | null;
  /** true = emitido en modo contingencia (caída de Vega/DGII). Caso muy raro. */
  deferred?: boolean;
  message?: string;
}

// POST /config/ecf/secuencias/anular-rangos — anula sub-rangos e-NCF nunca usados.
export interface EcfVoidRangeDto {
  typeId: EcfTipoElectronico;
  from: number;
  to: number;
}

export interface VoidEcfRangesDto {
  /** Hasta 10 rangos por llamada. Los e-CF ya ACCEPTED se saltan automáticamente. */
  ranges: EcfVoidRangeDto[];
  reason?: string;
}

// ─── e-CF F9 — certificación DGII + contingencia (Decreto 587-24) ─────────────
// El openapi documenta los paths y los DTOs de request, no las respuestas — estos tipos derivan
// del documento de la tarea (tolerantes: campos opcionales donde no es explícito).

// GET /config/ecf/certificacion (solo lectura, requiere ?company=)
export interface EcfCertificacion {
  /** Etapa cruda del trámite de 14 pasos + "CERTIFIED" (ej. "STATUS_VERIFIED"). */
  stage: string;
  /** Etiqueta ya traducida al español por el backend. */
  stageLabel: string;
  /** Qué falta, ya en español ("" si CERTIFIED). */
  siguientePaso: string;
  /** Derivado de stage === "CERTIFIED" si el backend no lo trae. */
  certified?: boolean;
  /** Progreso numérico, si el backend lo incluye. */
  paso?: number;
  totalPasos?: number;
}

// GET /config/ecf/contingencia/pendientes — e-CF en WAITING_DEFERRED
export interface EcfDiferidoItem {
  voucherId: string;
  ncf: string;
  typeId: EcfTipoElectronico;
  status: string;
  issuedAt: string;
  /** Horas que lleva firmado en diferido (límite legal: 72h). */
  horasEnDiferido: number;
}

export interface ActivarContingenciaDto {
  /** Obligatorio, 1–500 caracteres (Decreto 587-24). */
  motivo: string;
  /** ISO datetime. Si se omite, el backend usa 72h desde ahora. */
  autorizadoHasta?: string;
}

export interface FlushContingenciaDto {
  /** IDs a reenviar. Si se omite, se reenvían todos los WAITING_DEFERRED del Client. */
  voucherIds?: string[];
}

export interface FlushContingenciaResult {
  /** Cuántos se reencolaron para reenvío a la DGII. */
  queued: number;
  /** Cuántos superaron las 72h legales sin transmitirse (requieren anulación manual + 608). */
  expired: number;
  /** Cuántos son de tipos que Vega no permite reenviar en contingencia (E41/E43/E45/E46/E47). */
  disallowed: number;
}

// ─── e-CF recibidos de terceros (F8) — bandeja + conciliación + ACECF ─────────
// El openapi.json documenta los paths (/ecf/recibidos*) y los DTOs de request, pero no las
// respuestas — estos tipos derivan del documento de la tarea y son tolerantes (campos opcionales
// donde el contrato no es explícito). Confirmar contra la respuesta real al integrar.

export type EcfStatusDgii =
  | "PENDING" | "SIGNED" | "IN_PROCESS" | "ACCEPTED" | "CONDITIONAL" | "REJECTED"
  | "NOT_FOUND" | "WAITING_DEFERRED" | "VOIDED" | "FAILED";

/** Resultado de la conciliación automática con Purchase Invoices existentes. */
export type EcfConciliacion = "CONCILIADO" | "UNICO" | "MULTIPLE" | "NINGUNO";

export type AcecfStatus = "ACCEPTED" | "REJECTED";

export interface EcfRecibidoAcecf {
  /** null mientras no se ha decidido la aprobación comercial. */
  status: AcecfStatus | null;
  reason?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

export interface EcfRecibidoListItem {
  voucherId: string;
  ncf: string;
  typeId: EcfTipoElectronico;
  status: EcfStatusDgii;
  /** RNC/Cédula del emisor (contraparte). */
  counterpartRnc: string;
  counterpartName: string;
  total: number;
  currency: string;
  issuedAt: string;
  /** Purchase Invoice ya vinculada, o null. */
  purchaseInvoice: string | null;
  conciliacion: EcfConciliacion;
  /** Ids de las Purchase Invoice candidatas (1 si UNICO, varios si MULTIPLE, vacío si no hay). */
  candidatosConciliacion: string[];
  acecf: EcfRecibidoAcecf;
}

export interface EcfRecibidoItem {
  description: string;
  qty: number;
  unitPrice: number;
  /** % de ITBIS de la línea. */
  itbisRate?: number;
  amount?: number;
  uom?: string;
}

export interface EcfRecibidoDetail extends EcfRecibidoListItem {
  /** Líneas tal como las emitió el proveedor — solo lectura, nunca crean una Purchase Invoice. */
  items: EcfRecibidoItem[];
  /** ISO — límite legal para decidir la aprobación comercial (ACECF). */
  slaVenceEn: string | null;
}

export interface VincularEcfRecibidoDto {
  purchaseInvoice: string;
}

export interface AprobacionComercialDto {
  status: AcecfStatus;
  /** Obligatorio cuando status === "REJECTED". */
  reason?: string;
}

export interface CargarManualEcfDto {
  /** XML semilla firmado del emisor, crudo o en base64. */
  signedXml: string;
  company?: string;
}

// ─── e-CF emitidos (bandeja `origin: ISSUED`) — listado + detalle + refresh ────
// El openapi.json aún no publica los paths `/ecf/emitidos*`; estos tipos derivan del documento
// de la tarea (#53) y son tolerantes (campos opcionales/`unknown` donde el contrato no es
// explícito). Confirmar contra la respuesta real al integrar.

/** Un paso del flujo de estado derivado (`flujo.pasos[]`). */
export interface EcfFlujoPaso {
  estado: EcfStatusDgii;
  label: string;
  alcanzado: boolean;
  actual: boolean;
  terminal: boolean;
  /** ISO — solo algunos pasos traen fecha real; el resto es `null`. Nunca inventar. */
  at: string | null;
}

/** Flujo de estado del comprobante ante la DGII (derivado por el BFF). */
export interface EcfFlujo {
  estadoActual: EcfStatusDgii;
  esTerminal: boolean;
  /** true cuando el estado terminal NO es ACCEPTED. */
  requiereAtencion: boolean;
  /** Instrucción ya redactada en español, o null. No reconstruir desde `status`. */
  alerta: string | null;
  pasos: EcfFlujoPaso[];
}

/** Documento de ERPNext vinculado al comprobante. */
export interface EcfEmitidoErpnext {
  doctype: "Sales Invoice" | "Purchase Invoice";
  docname: string;
  outboxState?: string | null;
  attempt?: number | null;
}

export interface VoucherEmitido {
  voucherId: string;
  ncf: string;
  typeId: EcfTipoElectronico;
  status: EcfStatusDgii;
  env: EcfEnv;
  counterpartRnc: string | null;
  counterpartName: string | null;
  total: number;
  taxedAmount: number;
  exemptAmount: number;
  itbisAmount: number;
  iscAmount: number;
  currency: string;
  exchangeRate?: number | null;
  /** URL del timbre DGII — QR + "Verificar en DGII". `null` hasta que se firma. */
  qrUrl: string | null;
  securityCode: string | null;
  trackId: string | null;
  lastError: string | null;
  /** Solo relevante en REJECTED — ver documento #53 §2. */
  sequenceConsumed: boolean | null;
  /** true = emitido en contingencia (Decreto 587-24). */
  deferredSend: boolean;
  archived: boolean;
  issuedAt: string | null;
  createdAt: string;
  erpnext: EcfEmitidoErpnext | null;
  flujo: EcfFlujo;
}

/** Línea de un e-CF emitido — solo en el detalle. Montos como strings numéricos. */
export interface LineaVoucher {
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string | null;
  itbisRate?: string | null;
  itbisAmount?: string | null;
  iscAmount?: string | null;
  itbisRetention?: string | null;
  itbisRetentionRate?: string | null;
  isrRetention?: string | null;
  isrRetentionRate?: string | null;
  lineTotal: string;
}

export interface EcfEmitidoDetail extends VoucherEmitido {
  items: LineaVoucher[];
}

/** Respuesta de POST /ecf/emitidos/:voucherId/refresh. */
export interface RefreshEcfEmitidoResult extends EcfEmitidoDetail {
  statusPrevio: EcfStatusDgii;
  /** true si el estado cambió tras consultar a la DGII. */
  cambio: boolean;
}

/** Respuesta de POST /ecf/emitidos/:voucherId/regenerar — no documentada en openapi.json,
 * sale de la prosa de docs/FARMACIA_ARS_FRONTEND.md §4.6. */
export interface RegenerarEcfEmitidoResult {
  docname: string;
  ncf: string;
  status: EcfStatusDgii;
  qrUrl?: string;
  securityCode?: string;
  voucherId: string;
}

// POST /config/pos/habilitar
export interface HabilitarPosDto {
  warehouse: string;
}

export interface HabilitarPosResult {
  posProfile: string;
  cajeroRole: string;
}

// POST /config/pos/deshabilitar
export interface DeshabilitarPosResult {
  message: string;
}

// POST /config/despacho/habilitar
export interface HabilitarDespachoResult {
  message: string;
}

// POST /config/despacho/deshabilitar — éxito. El 409 (bloqueado) trae `DesactivarDespachoBloqueos`
// en `error.details` en su lugar, ver types de Despachos.
export interface DeshabilitarDespachoResult {
  message: string;
}

export interface PosTurnoBloqueante {
  id: string;
  cajero: string;
}

/** `error.details` del 409 de POST /config/pos/deshabilitar — las cuatro listas siempre vienen
 *  (vacías si no aplican). `colaCaja` y `posConSaldo` son docnames de factura (ver /facturas/:id). */
export interface PosDeshabilitarBloqueos {
  turnosAbiertos: PosTurnoBloqueante[];
  cierresBorrador: PosTurnoBloqueante[];
  colaCaja: string[];
  posConSaldo: string[];
}

// GET /pos/turnos/actual — null si el cajero no tiene turno abierto
export interface TurnoCaja {
   openingEntryId: string;
   posProfile: string;
   company: string;
   periodStartDate: string;
   turnoMaxHoras: number;
   modoPagoCaja?: string | null;
   montoCaja?: number | null;
   /** Planos del response de POST /pos/turnos/abrir (reemplazan balanceDetails). */
   modeOfPayment?: string;
   openingAmount?: number;
 }

// POST /pos/turnos/abrir
export interface AbrirTurnoDto {
  /** Si se omite, usa el POS Profile default del tenant. */
  posProfile?: string;
  /** Efectivo físico con el que se abre el turno. Se asocia automáticamente a FacturacionConfig.modoPagoCaja. */
  openingAmount: number;
}

export interface PaymentReconciliationLine {
  modeOfPayment: string;
  openingAmount: number;
  expectedAmount: number;
  /** En la vista previa siempre es 0 — el cajero todavía no ha contado nada. */
  closingAmount: number;
  /** closingAmount - expectedAmount. Negativo = faltante, positivo = sobrante. */
  difference: number;
  /** true si este método requiere que el cajero ingrese manualmente el monto contado. */
  requiereConciliacion: boolean;
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
  /** El cajero DUEÑO del turno (sin cambios). */
  user?: string;
  /** Quién ejecutó el cierre realmente — igual a `user` en el caso normal, distinto cuando un supervisor cerró el turno de otro cajero. */
  closedBy?: string;
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
   /** Quién ejecutó el cierre realmente (presente cuando el turno ya cerró) — igual a `user` en el caso normal, distinto cuando un supervisor cerró el turno de otro cajero. */
   closedBy?: string;
   periodStartDate: string;
   modeOfPayment?: string;
   openingAmount?: number;
   closing?: TurnoClosing | null;
 }

export interface TurnoClosing {
  id: string;
  status: string;
  posOpeningEntry: string;
  posProfile: string;
  user: string;
  /** Quién ejecutó el cierre realmente — igual a `user` en el caso normal, distinto cuando un supervisor cerró el turno de otro cajero. */
  closedBy?: string;
  periodStartDate: string;
  periodEndDate: string;
  grandTotal: number;
  netTotal: number;
  totalQuantity: number;
  paymentReconciliation: PaymentReconciliationLine[];
  denominacionesEfectivo: DenominacionCierreDto[];
  corteCaja: CorteCaja;
}

// ─── Corte de Caja ────────────────────────────────────────────────────────────
// Reporte "Corte de Caja" — GET /pos/turnos/:id (dentro de `closing.corteCaja`) y
// GET /reportes/pos/corte-caja-dia (consolidado + por turno). No existe una fila
// "Delivery" en este sistema (no hay canal de venta delivery separado del POS).
// "ventasCredito" y "recibosCobrados" de nivel raíz siempre vienen en 0 — es
// correcto: una venta dentro de un turno POS siempre es de contado, y un cobro
// de CxC nunca es "de contado". No tratar como dato faltante.

/** Una fila por método de pago real configurado en el tenant (Cash, Tarjeta, etc.) — cantidad dinámica, no asumir un número fijo. */
export interface CorteCajaIngresoLine {
  metodo: string;
  ventasContado: number;
  recibosCobrados: number;
  total: number;
}

export interface CorteCaja {
  ventasDelDia: {
    ventasContado: number;
    /** Siempre 0 en este sistema — una venta POS siempre es de contado. */
    ventasCredito: number;
    total: number;
  };
  devoluciones: { total: number };
  /** Siempre 0 en este sistema — un cobro de CxC nunca es "de contado" dentro de un turno POS. */
  recibosCobrados: { total: number };
  ventasNetas: { total: number };
  /** Filas dinámicas por método de pago real — iterar tal cual, no asumir 4 categorías fijas. */
  ingresos: CorteCajaIngresoLine[];
  egresos: {
    devoluciones: number;
    otrosEgresos: number;
    total: number;
  };
  fondoApertura: number;
  /** Efectivo físico a entregar (solo métodos tipo Cash) — NO es el total general de ingresos. */
  importeAEntregar: number;
}

// GET /reportes/pos/corte-caja-dia
export interface CorteCajaDiaTurno {
  id: string;
  cajero: string;
  posProfile: string;
  periodStartDate: string;
  periodEndDate: string;
  corteCaja: CorteCaja;
  /** Moneda del POS Profile de este turno — ERPNext garantiza que un turno nunca mezcla
   *  monedas, así que es seguro asumir una sola moneda por fila. */
  moneda?: string;
}

/** Misma forma que `CorteCaja` pero segmentada por moneda — ver `consolidadoPorMoneda`. */
export interface CorteCajaPorMoneda extends CorteCaja {
  moneda: string;
}

export interface CorteCajaDiaResult {
  date: string;
  turnos: CorteCajaDiaTurno[];
  /** Suma cruda de todos los turnos — se mantiene por compatibilidad, solo tiene sentido si el
   *  día operó en una sola moneda. Si hubo turnos en monedas distintas, usar
   *  `consolidadoPorMoneda` como fuente de verdad, nunca sumar entre monedas en el cliente. */
  consolidado: CorteCaja;
  /** Fuente de verdad cuando el día tuvo turnos de POS Profiles en distintas monedas. */
  consolidadoPorMoneda?: CorteCajaPorMoneda[];
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
  /** Moneda del POS Profile de ese turno — mismo criterio que `CorteCajaDiaTurno.moneda`. */
  moneda?: string;
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
  /** Cuenta bancaria o de caja asociada a este método de pago. */
  account?: string;
  /** Si es true, el backend exige `bankAccount` en cobros/pagos con este método (salvo que tenga defaultBankAccount). */
  requiresBankAccount?: boolean;
  /** Cuenta bancaria (id de CuentaBancaria) usada automáticamente si la operación no especifica una. */
  defaultBankAccount?: string;
  /** Si es true, todo pago/cobro con este método (Compras, Gastos, Pagos a proveedores) se trata
   *  siempre como cheque — el backend lo fuerza sin importar el `esCheque` que envíe el caller. */
  esCheque?: boolean;
}

// GET /config/bancos — catálogo nativo ERPNext (Bank), solo lectura
export interface Banco {
  id: string;
  name: string;
}

// GET/POST/PUT /cuentas-bancarias/bancos — catálogo de bancos propio (mutable), separado del
// catálogo nativo ERPNext de solo lectura (`Banco` arriba, GET /config/bancos).
export interface BancoCatalogo {
  id: string;
  name: string;
  swiftNumber?: string;
  website?: string;
}

export interface CreateBancoDto {
  name: string;
  swiftNumber?: string;
}

export interface UpdateBancoDto {
  name?: string;
  swiftNumber?: string;
}

// ─── Cuentas Bancarias ──────────────────────────────────────────────────────

export type CuentaBancariaEstado = "Activa" | "Inactiva" | "Cerrada";
export type ChequeFormat = "Estándar" | "Voucher" | "Media Carta" | "Cartera";

export interface CuentaBancaria {
  id: string;
  accountName: string;
  bank: string;
  account: string;
  bankAccountNo?: string;
  /** La moneda REAL de la cuenta es siempre la de su cuenta contable (GL) vinculada — nunca un
   *  campo editable libre. El backend nunca persiste lo que se mande en create/update, siempre
   *  guarda la moneda real resuelta de `account`. */
  currency: string;
  estado: CuentaBancariaEstado;
  chequeFormat: ChequeFormat;
  chequesManuales: boolean;
  isDefault: boolean;
  disabled: boolean;
  ultimoCheque?: number;
  ultimoDeposito?: number;
  balanceInicial: number;
  /** "Cuenta de Ahorro" | "Cuenta Corriente" | "Cuenta de Nómina" — catálogo en GET /cuentas-bancarias/tipos.
   *  Opcional: cuentas creadas antes de este campo vienen sin valor. */
  tipoCuenta?: string;
  /** Nombre de un Cheque Print Template (ver GET /tesoreria/cheque-print-templates) vinculado a esta
   *  cuenta — determina qué plantilla usa el motor nativo de ERPNext al imprimir un cheque de Emisiones.
   *  Opcional: sin plantilla, la impresión usa el comprobante genérico del BFF. */
  chequePrintTemplate?: string;
  /** Solo presente cuando se solicita explícitamente (?withBalance=true o GET .../balance) */
  balance?: number;
}

export interface CreateCuentaBancariaDto {
  accountName: string;
  bank: string;
  account: string;
  bankAccountNo?: string;
  currency: string;
  estado?: CuentaBancariaEstado;
  chequeFormat?: ChequeFormat;
  chequesManuales?: boolean;
  isDefault?: boolean;
  balanceInicial?: number;
  /** Requerido si chequesManuales es false (numeración automática) — punto de partida del contador. */
  ultimoCheque?: number;
  tipoCuenta?: string;
  chequePrintTemplate?: string;
}

export interface UpdateCuentaBancariaDto {
  accountName?: string;
  bank?: string;
  account?: string;
  bankAccountNo?: string;
  currency?: string;
  estado?: CuentaBancariaEstado;
  chequeFormat?: ChequeFormat;
  chequesManuales?: boolean;
  isDefault?: boolean;
  ultimoCheque?: number;
  ultimoDeposito?: number;
  tipoCuenta?: string;
  chequePrintTemplate?: string;
}

export interface CuentaBancariaBalance {
  balance: number;
  balanceInicial: number;
  /** ⚠️ Excepción de nomenclatura dentro del mismo módulo: este endpoint usa `moneda`, no
   *  `currency` como el resto de Cuentas Bancarias — no es un typo. */
  moneda: string;
}

/** GET /cuentas-bancarias/tipos — catálogo de valores válidos para `tipoCuenta`. */
export interface TipoCuentaBancariaOption {
  value: string;
  label: string;
}

/** GET /cuentas-bancarias/inconsistencias-moneda — cuentas donde el campo espejo interno
 *  (`custom_moneda`) quedó desincronizado de la moneda real de la cuenta contable vinculada
 *  (típicamente porque alguien editó algo directo en ERPNext por fuera de esta app). Pantalla
 *  informativa/de solo lectura — no hay endpoint para "arreglar" esto automáticamente,
 *  reeditar la cuenta con PUT la resincroniza sola. `accountCurrency` es siempre la fuente de
 *  verdad. Ver docs/tasks/64_multimoneda_completo.md §5.6. */
export interface CuentaBancariaInconsistenciaMoneda {
  id: string;
  accountName: string;
  account: string;
  customMoneda: string;
  accountCurrency: string;
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
  /** Opcional — si se omite, el backend usa el método de pago default configurado en
   *  Facturacion Config para la moneda del documento (modoPagoCaja/modoPagoCajaUsd/modoPagoCajaEur).
   *  Si esa moneda no tiene un default configurado, la línea se rechaza con 400. */
  modeOfPayment?: string;
  amount: number;
  cardNumber?: string;
  authorizationCode?: string;
  bank?: string;
  checkNumber?: string;
  /** Cuenta bancaria (id de CuentaBancaria) — requerida si el método de pago tiene requiresBankAccount=true y no tiene defaultBankAccount. */
  bankAccount?: string;
}

export interface VueltoLine {
  denominacion: string;
  cantidad: number;
}

// POST /caja/facturas/:id/cobrar
export type CondicionFiscal = "CREDITO_FISCAL" | "CONSUMO"

export interface CobrarFacturaDto {
   payments: PaymentLine[]
   vuelto?: VueltoLine[]
   tenderedCash?: number
   /** Opcional — si se omite, el backend infiere según el RNC/Cédula del cliente. */
   condicionFiscal?: CondicionFiscal
   /** RNC del cliente ocasional — requerido cuando esClienteOcasional=true y condicionFiscal=CREDITO_FISCAL. */
   rnc?: string
 }

/** Resumen del cobro registrado al someter una factura (presente cuando se enviaron payments). */
export interface CobroResumen {
  invoiceId: string;
  paymentEntryIds: string[];
  outstandingAmount: number;
  /** Ver `Invoice.roundedTotal`/`roundingAdjustment`. */
  roundedTotal?: number;
  roundingAdjustment?: number;
  fullyPaid: boolean;
  vuelto: VueltoLine[];
}

/** Respuesta de POST /invoices/:id/submit cuando usaModuloPos=true y el cliente no tiene crédito fiscal (hasCredit=false).
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
   /** Monto real a cobrar, con redondeo de moneda aplicado — usar en vez de `grandTotal` para
    *  prellenar/validar el cobro. Ver `Invoice.roundedTotal`. */
   roundedTotal?: number;
   roundingAdjustment?: number;
   postingDate: string;
   esClienteOcasional: boolean;
   clienteOcasionalNombre?: string;
   /** Cobertura de la ARS, o `null` en una venta sin cobertura (vertical farmacia, §4.3). */
   aseguradora?: InvoiceAseguradoraResumen | null;
   /** `roundedTotal − montoCobertura` (igual a `roundedTotal` sin cobertura). **Este** es el
    *  importe a cobrar y contra el que se validan los métodos de pago — nunca `roundedTotal`. */
   montoACobrar?: number;
   /** Moneda de la factura completa (`grandTotal`/`roundedTotal`/`montoACobrar`) — nunca la de la
    *  cobertura ARS, que siempre es DOP (docs/tasks/71_agregar_currency_a_caja_por_cobrar.md). */
   currency?: string;
 }

/** Respuesta de POST /caja/facturas/:id/completar-cobro. */
export interface CompletarCobroResult {
   invoiceId: string;
   ncf: string;
   ncfType?: string;
   condicionFiscal?: CondicionFiscal;
   isPos: boolean;
   paymentEntryIds: string[];
   outstandingAmount: number;
   /** Ver `Invoice.roundedTotal`/`roundingAdjustment`. */
   roundedTotal?: number;
   roundingAdjustment?: number;
   fullyPaid: boolean;
   vuelto: VueltoLine[];
   esClienteOcasional: boolean;
   clienteOcasionalNombre?: string;
   clienteOcasionalRnc?: string;
 }

export type SubmitInvoiceResult = Invoice | PendienteCobroSubmitResult;

// ─── Caja (cobro de facturas ya sometidas) ────────────────────────────────────

// GET /caja/pendientes
export interface CajaPendienteItem {
  id: string
  customer: string
  customerName: string
  ncf?: string
  grandTotal: number
  /** Ver `Invoice.roundedTotal`/`roundingAdjustment`. */
  roundedTotal?: number
  roundingAdjustment?: number
  outstandingAmount: number
  postingDate: string
}

// POST /caja/facturas/:id/cobrar
export interface CobrarFacturaDto {
  payments: PaymentLine[]
  vuelto?: VueltoLine[]
  tenderedCash?: number
}

export interface CobrarFacturaResult {
  invoiceId: string
  paymentEntryIds: string[]
  outstandingAmount: number
  /** Ver `Invoice.roundedTotal`/`roundingAdjustment`. */
  roundedTotal?: number
  roundingAdjustment?: number
  fullyPaid: boolean
  vuelto: VueltoLine[]
}

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
  /** Código DGII (uno de los 62 de la tabla fija) — null si esta UOM no tiene código asignado. */
  codigoDgii?: string | null;
  /** Abreviatura DGII correspondiente a `codigoDgii` — null si no tiene código asignado. */
  abreviaturaDgii?: string | null;
  /** true si `codigoDgii` es uno de los 62 códigos válidos. Campo defensivo — en la práctica
   *  siempre coincide con "codigoDgii no es null". */
  validaDgii?: boolean;
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
  /** Uno de los 62 códigos DGII (ver DGII_UOM_CODES) — opcional. */
  codigoDgii?: string;
  /** Si es true, la cantidad expresada en esta UOM debe ser un número entero (sin decimales)
   *  tanto al comprar como al vender. Ej: "Unidad", "Caja". UOMs continuas (Kg, Litro, Metro)
   *  deben dejarlo en false. Default false. */
  mustBeWholeNumber?: boolean;
}

export interface UpdateUOMDto {
  name?: string;
  conversions?: { toUom: string; factor: number }[];
  /** Uno de los 62 códigos DGII. Enviar "" (string vacío) desasigna el código actual. */
  codigoDgii?: string;
  mustBeWholeNumber?: boolean;
}

// PUT /config/uom/:id — la respuesta puede traer `warning` (no bloqueante) cuando el código
// DGII enviado ya está asignado a otra UOM.
export interface UpdateUOMResult {
  id: string;
  warning?: string;
}

export interface Grupo {
  name: string;
  parentGroup?: string;
}

// GET /config/currencies — catálogo de monedas habilitadas en ERPNext (Currency), para
// poblar el select de "Moneda" en vez de texto libre (ej. en cuentas bancarias).
// `id`/`name` son el código ISO (ej. "CHF") — usar `id` como value enviado al backend.
export interface CurrencyOption {
  id: string;
  name: string;
  symbol?: string;
  fraction?: string;
  fractionUnits?: number;
}

// GET /config/paises — catálogo de países tal cual existen en ERPNext (Country).
// `name` es el nombre exacto del documento en ERPNext (inglés). paisOrigen debe
// enviar siempre `name`, nunca una traducción.
export interface PaisCatalogo {
  id: string;
  name: string;
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
  /** Umbral configurado (FacturacionConfig.ncfAlertaMinimo) contra el que se compara `remaining` para decidir `alertaActiva`. */
  umbralAlerta?: number;
  /** true si remaining <= umbralAlerta y la serie no está agotada ni deshabilitada. Ya viene calculado por el backend. */
  alertaActiva?: boolean;
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

export type AgingGroupBy = "party" | "invoice";

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

/** Fila de aging en modo `groupBy=invoice` — una fila por factura pendiente. */
export interface AgingInvoiceEntry {
  customer: string;
  customerName: string;
  invoice: string;
  dueDate: string;
  totalOutstanding: number;
  current: number;
  range1: number;
  range2: number;
  range3: number;
  range4: number;
}

export interface AgingConfig {
  rangos: string[];
}

export interface AgingResult {
  groupBy: AgingGroupBy;
  rows: AgingEntry[] | AgingInvoiceEntry[];
  config: AgingConfig;
  note?: string;
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
  /** Bank Account nativo asociado al pago (id de CuentaBancaria) */
  bankAccount?: string;
  /** Banco emisor (custom field, cheque/transferencia) */
  bank?: string;
  checkNumber?: string;
  cardNumber?: string;
  authorizationCode?: string;
  /** Solo presente en `GET /cobros|pagos/historial/:id` (tarea 42 §3) — antes cada endpoint
   *  filtraba internamente por su tipo nativo; ahora el historial de un tercero incluye ambos
   *  movimientos (ej. un reembolso `Pay` a un cliente, o un cobro `Receive` a un proveedor). */
  paymentType?: "Pay" | "Receive";
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
  /** Cuenta bancaria (id de CuentaBancaria) — requerida si el método de pago tiene requiresBankAccount=true y no tiene defaultBankAccount. */
  bankAccount?: string;
  referencias?: {
    invoiceId: string;
    allocatedAmount: number;
    /** Requerido en 'Sales Order' para aplicar el anticipo a un pedido de apartado; default (factura) si se omite */
    referenceDoctype?: "Sales Order" | "Sales Invoice";
  }[];
  /** Tasa explícita moneda del cliente → moneda de la compañía. Gana sobre "Tasa Fija" si se especifica. Solo aplica si la(s) factura(s) referenciadas están en moneda distinta a la de la compañía — hoy Ventas no soporta moneda, así que este campo no debería dispararse en la práctica (ver docs/tasks/60_multimoneda_dop_usd_eur.md §0). */
  conversionRate?: number;
  /** Monto real que entra al banco, en la moneda de la cuenta bancaria — requerido si esa cuenta opera en una moneda distinta a la del monto cobrado. */
  receivedAmount?: number;
  /** Tasa explícita moneda del cliente → moneda del banco — requerida si `receivedAmount` aplica y no hay tasa cargada entre esas dos monedas. */
  bankConversionRate?: number;
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

// ─── Cuentas por Pagar (CxP) ────────────────────────────────────────────────
// Equivalente de Cobros/CxC pero para proveedores. Sin semáforo — Supplier no
// tiene límite de crédito en ERPNext, así que ese concepto no aplica acá.

export interface PendientePago {
  id: string;
  supplier: string;
  supplierName: string;
  postingDate: string;
  dueDate: string;
  grandTotal: number;
  outstandingAmount: number;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface AgingProveedorEntry {
  supplier: string;
  supplierName?: string;
  totalOutstanding: number;
  current: number;
  range1: number;
  range2: number;
  range3: number;
  range4: number;
}

/** Fila de aging en modo `groupBy=invoice` — una fila por factura pendiente. */
export interface AgingProveedorInvoiceEntry {
  supplier: string;
  supplierName?: string;
  invoice: string;
  dueDate: string;
  totalOutstanding: number;
  current: number;
  range1: number;
  range2: number;
  range3: number;
  range4: number;
}

export interface AgingProveedorConfig {
  rangos: string[];
}

// GET /pagos/aging responde { success, groupBy, data: AgingProveedorEntry[], config, note? }
// — config y note NO están anidados dentro de `data`, van al mismo nivel.
export interface AgingProveedorResult {
  groupBy: AgingGroupBy;
  rows: AgingProveedorEntry[] | AgingProveedorInvoiceEntry[];
  config: AgingProveedorConfig;
  note?: string;
}

export interface PagoReferenciaResumen {
  invoiceId: string;
  invoiceName?: string;
  totalAmount?: number;
  outstandingAmount?: number;
  allocatedAmount: number;
}

export interface Pago {
  id: string;
  status: "draft" | "submitted" | "cancelled";
  supplier: string;
  supplierName: string;
  postingDate: string;
  paidAmount: number;
  modeOfPayment: string;
  referenceNo?: string;
  referenceDate?: string;
  remarks?: string;
  branch?: string | null;
  department?: string | null;
  referencias?: PagoReferenciaResumen[];
  createdAt: string;
  modifiedAt?: string;
  /** Solo presente en `GET /pagos/historial/:supplierId` (tarea 42 §3) — el historial de un
   *  proveedor ahora incluye ambos tipos de movimiento, no solo `Pay`. */
  paymentType?: "Pay" | "Receive";
  /** true si este pago se registró como cheque — participa de la numeración por cuenta bancaria
   *  y aparece en GET /tesoreria/cheques. */
  esCheque?: boolean;
  bankAccount?: string;
}

export interface PagoReferenciaDto {
  invoiceId: string;
  allocatedAmount: number;
}

export interface CreatePagoDto {
  supplier: string;
  postingDate: string;
  paidAmount: number;
  modeOfPayment: string;
  referenceNo?: string;
  referenceDate?: string;
  remarks?: string;
  referencias?: PagoReferenciaDto[];
  branch?: string;
  department?: string;
  /** Cuenta bancaria (id de CuentaBancaria) — requerida si el método de pago tiene requiresBankAccount=true y no tiene defaultBankAccount, o si esCheque=true. */
  bankAccount?: string;
  /** Marca este pago como cheque — activa la numeración por cuenta bancaria (manual o automática
   *  según chequesManuales de la cuenta) y lo registra en /tesoreria/cheques. Requiere bankAccount.
   *  En cuenta manual, referenceNo es el número de cheque (requerido); en automática, referenceNo
   *  debe omitirse — el backend lo asigna y responde 400 si se envía. */
  esCheque?: boolean;
  /** Tasa explícita moneda del proveedor → moneda de la compañía. Gana sobre "Tasa Fija" si se especifica. Solo aplica si la(s) factura(s) referenciadas están en moneda distinta a la de la compañía. */
  conversionRate?: number;
  /** Monto real que sale del banco, en la moneda de la cuenta bancaria — requerido si esa cuenta opera en una moneda distinta a la del monto pagado. */
  receivedAmount?: number;
  /** Tasa explícita moneda del proveedor → moneda del banco — requerida si `receivedAmount` aplica y no hay tasa cargada entre esas dos monedas. */
  bankConversionRate?: number;
}

export interface SaldoFavorProveedorAppliedTo {
  invoiceId: string;
  allocatedAmount: number;
}

export interface SaldoFavorProveedorEntry {
  paymentEntryId: string;
  unallocatedAmount: number;
  postingDate: string;
  modeOfPayment: string;
  committedAmount: number;
  availableAmount: number;
  appliedTo: SaldoFavorProveedorAppliedTo[];
}

export interface SaldoFavorProveedorResult {
  supplier: string;
  balance: number;
  entries: SaldoFavorProveedorEntry[];
}

export interface SaldoFavorAsignacionDto {
  paymentEntryId: string;
  amount: number;
}

export interface FacturaConSaldosFavorDto {
  invoiceId: string;
  saldos: SaldoFavorAsignacionDto[];
}

export interface AplicarSaldosFavorBulkDto {
  facturas: FacturaConSaldosFavorDto[];
}

export interface AplicarSaldosFavorResultItem {
  invoiceId: string;
  paymentEntryId: string;
  amount: number;
  reconciled: boolean;
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
  /** `null` explícito limpia el campo (a diferencia de omitirlo, que lo deja sin tocar) — igual
   *  criterio que el resto de los campos de esta interfaz. */
  defaultReceivableAccount?: string | null;
  defaultPayableAccount?: string | null;
  defaultIncomeAccount?: string | null;
  defaultExpenseAccount?: string | null;
  defaultBankAccount?: string | null;
  writeOffAccount?: string | null;
  roundOffAccount?: string | null;
  // 🆕 16 campos nuevos (ver plan/IMPLEMENTACION.md sección 6)
  defaultCashAccount?: string | null;
  defaultInventoryAccount?: string | null;
  stockReceivedButNotBilled?: string | null;
  stockAdjustmentAccount?: string | null;
  defaultDeferredRevenueAccount?: string | null;
  defaultDeferredExpenseAccount?: string | null;
  exchangeGainLossAccount?: string | null;
  unrealizedExchangeGainLossAccount?: string | null;
  accumulatedDepreciationAccount?: string | null;
  depreciationExpenseAccount?: string | null;
  disposalAccount?: string | null;
  defaultDiscountAccount?: string | null;
  costCenter?: ItemProps | null;
  roundOffCostCenter?: ItemProps | null;
  depreciationCostCenter?: ItemProps | null;
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
  /** Request: obligatoria SOLO si `account` opera en una moneda distinta a la base y no hay
   *  tasa cargada para la fecha (si se omite en ese caso: 400 `EXCHANGE_RATE_REQUIRED`). Si
   *  TODAS las cuentas del asiento están en la moneda base, nunca aplica.
   *  Respuesta (GET /journal-entry/:id): `null` si no aplicó conversión — aquí el campo de
   *  moneda se llama `currency`, no `moneda` (a diferencia de Tesorería). */
  conversionRate?: number;
  /** Solo en la respuesta de GET /journal-entry/:id — moneda de esta cuenta, `null`/ausente si
   *  es la moneda base. */
  currency?: string;
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
  /** Interruptor maestro de ERPNext — debe estar en true para poder comprar/vender artículos con Serial/Batch No. */
  enableSerialAndBatchNoForItem?: boolean;
  /** true → capturar Serial No / Batch No directamente en la fila del documento (sin diálogo emergente). Solo tiene efecto si enableSerialAndBatchNoForItem es true. */
  useSerialBatchFields?: boolean;
  /** Activado automáticamente por POST /config/despacho/habilitar — permite reserva parcial de
   *  una línea (Stock Reservation Entry) cuando no hay stock para cubrirla completa. No se expone
   *  como checkbox independiente (ver PROMPT_DESPACHO... §8.2) — solo lectura acá. */
  allowPartialReservation?: boolean;
  /** % de tolerancia de sobre-recepción de compra / sobre-entrega de venta antes de que el
   *  servidor rechace la operación (ej. recibir 105 cuando la OC pedía 100, con 5% de tolerancia). */
  overDeliveryReceiptAllowance?: number;
  /** Rol de ERPNext (string) cuyos usuarios pueden recibir compras o despachar ventas por encima
   *  de `overDeliveryReceiptAllowance` sin que el sistema lo bloquee. Opcional. */
  roleAllowedToOverDeliverReceive?: string;
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

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §9 — mucho más chico que antes: ya no hay
// `modoCreacionPassword` (toda alta es por invitación) ni `resetPasswordLinkExpiryMinutes`
// editable. Lo único que queda es de solo lectura, viene de una variable de entorno global del
// backend (INVITATION_TTL_HOURS), no configurable por tenant — `PUT /config/seguridad` ya no
// acepta ningún campo (siempre 400).
export interface SeguridadSettings {
  invitationLinkExpiryHours?: number;
}

// ─── Retenciones (Tax Withholding Category) ───────────────────────────────────

export interface RetencionComponente {
  /** id (name de ERPNext) de un impuesto de config/tasas-impuesto */
  impuestoBaseId: string;
  /** 100 = tasa completa del impuesto referenciado, 30 = "30% de este impuesto". Default 100 */
  factor?: number;
}

/** Tramo de retención tal como lo devuelve el backend (lectura). Un tramo trae `componentes`
 *  no vacío (modo catálogo) O `valorFijo` (modo % fijo) — cuando es % fijo, `componentes` viene
 *  como array vacío. */
export interface RetencionRate {
  /** Calculado por ERPNext a partir de `componentes`, o igual a `valorFijo` en modo % fijo —
   *  solo lectura, nunca se envía al guardar */
  taxWithholdingRate: number;
  componentes: RetencionComponente[];
  /** % fijo del tramo cuando NO está ligado a `componentes` (modo % fijo) */
  valorFijo?: number;
  /** Descripción libre del tramo — aplica sobre todo al modo % fijo */
  descripcion?: string;
  /** undefined = sin límite inferior */
  fromDate?: string;
  /** undefined = sin límite superior */
  toDate?: string;
  singleThreshold?: number | null;
  cumulativeThreshold?: number | null;
  taxWithholdingGroup?: string | null;
}

/** Tramo de retención al crear/editar — sin `taxWithholdingRate` (lo calcula el backend). Debe
 *  traer `componentes` (no vacío) O `valorFijo`, nunca ambos. */
export interface CreateRetencionRateDto {
  /** Alternativa a `valorFijo` — impuestos del catálogo que componen la tasa */
  componentes?: RetencionComponente[];
  /** Alternativa a `componentes` — % fijo del tramo, sin ligar a ningún impuesto del catálogo */
  valorFijo?: number;
  /** Descripción opcional del tramo (aplica a cualquier modo, típicamente junto a `valorFijo`) */
  descripcion?: string;
  /** Omitir la clave = sin límite inferior */
  fromDate?: string;
  /** Omitir la clave = sin límite superior */
  toDate?: string;
  singleThreshold?: number | null;
  cumulativeThreshold?: number | null;
  /** Nunca enviar string vacío — omitir la clave */
  taxWithholdingGroup?: string;
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
  rates: CreateRetencionRateDto[];
  account?: string;
}

export type UpdateRetencionDto = Partial<CreateRetencionDto>;

// ─── Costos de Importación (Landed Cost Voucher) ──────────────────────────────

export interface LandedCostReceiptRef {
  receiptDocumentType: "Purchase Receipt" | "Purchase Invoice" | "Stock Entry" | "Subcontracting Receipt";
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
  | "Seguridad"
  | "Relaciones Comerciales";

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

// ─── Estado de Cuenta ──────────────────────────────────────────────────

export interface EstadoCuentaCliente {
  id: string
  nombre: string
  telefono: string | null
}

export interface EstadoCuentaDocumento {
  fecha: string
  numero: string
  comprobante: string
  vence: string
  monto: number
  aplicado: number
  saldo: number
  dias: number
}

export interface EstadoCuentaAgingBucket {
  label: string
  total: number
}

export interface EstadoCuentaResponse {
  empresa: string
  cliente: EstadoCuentaCliente
  telefono: string | null
  fecha: string
  documentos: EstadoCuentaDocumento[]
  aging: EstadoCuentaAgingBucket[]
  totalPendiente: number
}

// ─── Pricing Rules ───────────────────────────────────────────────────

export interface PricingRule {
  id: string
  title: string
  applyOn: 'Item Code' | 'Item Group' | 'Brand'
  itemCodes?: string[]
  itemGroups?: string[]
  brands?: string[]
  discountType: 'Discount Percentage' | 'Discount Amount'
  discountPercentage?: number
  discountAmount?: number
  minQty?: number
  maxQty?: number
  validFrom?: string
  validUpto?: string
  priority?: number
  disabled: boolean
}

export interface CreatePricingRuleDto {
  title: string
  applyOn: 'Item Code' | 'Item Group' | 'Brand'
  itemCodes?: string[]
  itemGroups?: string[]
  brands?: string[]
  discountType: 'Discount Percentage' | 'Discount Amount'
  discountPercentage?: number
  discountAmount?: number
  minQty?: number
  maxQty?: number
  validFrom?: string
  validUpto?: string
  priority?: number
}

export type UpdatePricingRuleDto = Partial<CreatePricingRuleDto>

// ─── Tesorería — Tipos de Documento Bancario (Bank Document Type) ──────────────
// Catálogo configurable de tipos de documento que puede usar Tesorería (Cheque, Depósito,
// Transferencia, etc.). Pre-sembrado con 8 registros por tenant, pero editable/ampliable.
// Campos en inglés porque así viaja el DTO real (ver CreateBankDocumentTypeDto en openapi.json) —
// los docs de negocio usan nombres en español, pero eso es solo para las etiquetas de UI.

export type TesoreriaNaturaleza =
  | "Cheque"
  | "Depósito"
  | "Transferencia"
  | "Transferencia interna"
  | "Ajuste bancario"
  | "Nota de débito"
  | "Nota de crédito"
  | "Otro";

export type TesoreriaTipoTransaccion = "Débito" | "Crédito";

export interface TipoDocumentoBancario {
  id: string;
  code: string;
  description: string;
  nature: TesoreriaNaturaleza;
  transactionType: TesoreriaTipoTransaccion;
  defaultOffsetAccount?: string;
  requiresParty: boolean;
  enabled: boolean;
  requiresNcf: boolean;
  ncfPrefix?: string;
  requiresFiscalClass: boolean;
  requiresRnc: boolean;
  comment?: string;
}

export interface CreateBankDocumentTypeDto {
  code: string;
  description: string;
  nature: TesoreriaNaturaleza;
  transactionType: TesoreriaTipoTransaccion;
  defaultOffsetAccount?: string;
  requiresParty?: boolean;
  enabled?: boolean;
  requiresNcf?: boolean;
  ncfPrefix?: string;
  requiresFiscalClass?: boolean;
  requiresRnc?: boolean;
  comment?: string;
}

export type UpdateBankDocumentTypeDto = Partial<CreateBankDocumentTypeDto>;

// ─── Tesorería — Transacciones (Emisiones / Depósitos / Transferencias) ────────
// Shape normalizado COMPARTIDO por los 3 submódulos — el backend siempre responde con este
// mismo formato sin importar si por dentro creó un Payment Entry o un Journal Entry.

export type TesoreriaEstado = "draft" | "submitted" | "cancelled";

export interface TesoreriaParty {
  tipo: "Customer" | "Supplier";
  id: string;
  nombre?: string;
}

export interface TesoreriaReferencias {
  numeroCheque?: string;
  numeroReferencia?: string;
  comprobante?: string;
  ncf?: string;
  claseFiscal?: string;
  rnc?: string;
}

/** Línea de distribución/deducción — {@link EmisionLineaDto} en el backend. */
export interface TesoreriaLinea {
  cuenta: string;
  monto: number;
  descripcion?: string;
  /** Solo en el camino SIN beneficiario/origen (asiento directo) — tasa de ESTA cuenta específica
   *  → moneda base, si esa cuenta opera en moneda distinta y no hay tasa cargada para la fecha.
   *  En Depósitos sin origen, la cuenta de la deducción debe estar en la misma moneda que el
   *  banco (se rechaza con 400 si no). Ver docs/tasks/64_multimoneda_completo.md §5.1/§5.2. */
  conversionRate?: number;
}

/** Liquidación de una factura pendiente — {@link EmisionLiquidacionDto} en el backend. */
export interface TesoreriaLiquidacion {
  facturaId: string;
  montoAsignado: number;
}

/** Línea del asiento contable ya generado — solo informativa, para la vista de detalle. */
export interface TesoreriaLineaAsiento {
  cuenta: string;
  debito: number;
  credito: number;
  esBanco: boolean;
  facturaId?: string;
  esAnticipo?: boolean;
  descripcion?: string;
  /** Moneda de esta cuenta específica, si no es la moneda base. */
  moneda?: string;
  /** Esta línea convertida a moneda base. */
  montoBase?: number;
  /** true solo en una línea que ERPNext generó automáticamente como ajuste de ganancia/pérdida
   *  cambiaria dentro de un Payment Entry (Emisiones/Depósitos CON beneficiario/origen). Las
   *  Transferencias Internas NO usan este flag aunque también puedan generar un ajuste cambiario
   *  — ahí es una línea contable normal más. Ver docs/tasks/64_multimoneda_completo.md §5.5. */
  esDiferenciaCambiaria?: boolean;
}

export interface TreasuryTransaction {
  id: string;
  documentoOrigen: { doctype: "Payment Entry" | "Journal Entry"; name: string };
  fecha: string;
  cuentaBancaria: string | null;
  monto: number;
  estado: TesoreriaEstado;
  descripcion?: string;
  /** Beneficiario (Emisiones) u origen normalizado (Depósitos) — mismo campo en la respuesta. */
  beneficiario?: TesoreriaParty;
  beneficiarioNombre?: string;
  tipoDocumento?: string;
  referencias: TesoreriaReferencias;
  lineas: TesoreriaLineaAsiento[];
  nota?: string;
  branch?: string;
  department?: string;
  creation?: string;
  modified?: string;
  /** Cuenta contable alterna para el lado banco de este documento puntual — ver CreateEmisionDto/
   *  CreateDepositoDto.cuentaBancoOverride. Presente solo si se reasignó. */
  cuentaBancoOverride?: string;
  /** Cuenta contable alterna para el lado del beneficiario/origen — ver CreateEmisionDto/
   *  CreateDepositoDto.cuentaPartyOverride. Presente solo si se reasignó. */
  cuentaPartyOverride?: string;
  /** Solo Transferencias Internas — cuenta contable alterna de la pata de origen. */
  cuentaBancoOrigenOverride?: string;
  /** Solo Transferencias Internas — cuenta contable alterna de la pata de destino. */
  cuentaBancoDestinoOverride?: string;
  // ─── Multimoneda (docs/tasks/64_multimoneda_completo.md §5.0-§5.3) ───────────
  /** Moneda del lado banco de esta transacción — no hay campo `moneda`/`currency` propio del
   *  documento, se deriva de la cuenta bancaria elegida (y de las facturas liquidadas, si hay
   *  beneficiario/origen). `undefined` en un documento que nunca tocó multimoneda. */
  moneda?: string;
  /** Tasa banco/beneficiario/origen → moneda base usada en este documento. */
  conversionRate?: number;
  /** Monto de esta transacción convertido a moneda base. */
  montoBase?: number;
}

// ─── Tesorería — Cheques (historial) ───────────────────────────────────────────
// Registro de primera clase de cada número de cheque emitido a un tercero (CxP), creado desde
// POST /tesoreria/emisiones o POST /pagos (esCheque: true). Nunca cubre cheques recibidos (CxC).

export type ChequeEstado = "Reservado" | "Emitido" | "Anulado" | "Cobrado";

export interface Cheque {
  id: string;
  chequeNo: string;
  /** Ya viene como texto descriptivo (nombre de la cuenta bancaria), no como código interno. */
  cuentaBancaria: string;
  company?: string;
  estado: ChequeEstado;
  modoAsignacion?: "Manual" | "Automático";
  /** Sin `nombre` — el backend solo trae tipo + id del tercero. */
  beneficiario?: { tipo: "Customer" | "Supplier"; id: string };
  monto: number;
  fecha: string;
  impreso: boolean;
  vecesImpreso?: number;
  impresoEl?: string | null;
  impresoPor?: string | null;
  /** Presente cuando el banco ya compensó el cheque (estado "Cobrado"). */
  fechaCompensacion?: string | null;
  documentoOrigen: { doctype: "Payment Entry" | "Journal Entry"; name: string };
  anuladoEl?: string | null;
  anuladoPor?: string | null;
  motivoAnulacion?: string | null;
  createdAt?: string;
  modifiedAt?: string;
}

export interface ChequeFactura {
  invoiceId: string;
  allocatedAmount: number;
}

export interface ChequeDetalle extends Cheque {
  facturas: ChequeFactura[];
}

export interface AnularChequeDto {
  motivo?: string;
}

// ─── Tesorería — Emisiones (egresos) ───────────────────────────────────────────

export interface CreateEmisionDto {
  fecha: string;
  tipoDocumento: string;
  cuentaBancaria: string;
  descripcion?: string;
  monto: number;
  /** Ausente → Journal Entry. Presente → Payment Entry (Pay). */
  beneficiario?: { tipo: "Customer" | "Supplier"; id: string };
  beneficiarioNombre?: string;
  referencias?: TesoreriaReferencias;
  /** Solo con beneficiario. No necesita sumar el monto exacto (el resto queda a favor). */
  liquidaciones?: TesoreriaLiquidacion[];
  /** Válido con o sin beneficiario. */
  deducciones?: TesoreriaLinea[];
  /** Solo SIN beneficiario. Debe sumar exactamente `monto`. */
  distribucion?: TesoreriaLinea[];
  nota?: string;
  branch?: string;
  department?: string;
  /** Cuenta contable alterna para el LADO BANCO de este asiento puntual, en vez de la que tiene
   *  configurada la cuenta bancaria (Bank Account.account). Excepción, no un campo de todos los
   *  días — úsese solo cuando el movimiento debe desviarse de la cuenta habitual. */
  cuentaBancoOverride?: string;
  /** Cuenta contable alterna para el LADO DEL BENEFICIARIO (su CxP/CxC), en vez de la que
   *  ERPNext resuelve sola desde el Supplier/Customer. Solo válida CON "beneficiario". Si además
   *  se envían "liquidaciones", debe ser idéntica a la cuenta con la que quedó contabilizada cada
   *  factura liquidada — el backend rechaza con un mensaje explícito si no calzan. */
  cuentaPartyOverride?: string;
  /** Tasa beneficiario/facturas liquidadas → moneda base. Solo relevante con `beneficiario`, y
   *  solo si esa moneda difiere de la del banco — gana sobre la Tasa Fija en CxP
   *  (`tasaFijaCxp`, ver Fase 1). Si las facturas liquidadas están en monedas distintas entre
   *  sí: 400 `PAYMENT_MIXED_CURRENCIES`. */
  conversionRate?: number;
  /** Tasa banco → moneda base, si la cuenta bancaria opera en divisa y no hay tasa cargada para
   *  la fecha. Si el banco difiere de la moneda del beneficiario y
   *  `permitirPagoMonedaDistintaBanco` (Fase 1) está apagado: 400 `BANK_ACCOUNT_CURRENCY_MISMATCH`. */
  bankConversionRate?: number;
}

/** PUT /tesoreria/emisiones/:id — solo cabecera de un borrador. */
export interface UpdateEmisionDto {
  descripcion?: string;
  nota?: string;
  referencias?: TesoreriaReferencias;
  branch?: string;
  department?: string;
  /** Reasigna el lado banco del asiento del borrador. Ver CreateEmisionDto.cuentaBancoOverride. */
  cuentaBancoOverride?: string;
  /** Reasigna el lado del beneficiario del asiento del borrador. Solo aplica a borradores que
   *  tengan beneficiario. Ver CreateEmisionDto.cuentaPartyOverride. */
  cuentaPartyOverride?: string;
}

// ─── Tesorería — Depósitos (ingresos) ──────────────────────────────────────────

export interface CreateDepositoDto {
  fecha: string;
  tipoDocumento: string;
  cuentaBancaria: string;
  descripcion?: string;
  monto: number;
  /** Ausente → Journal Entry. Presente → Payment Entry (Receive). tipo puede ser Customer o Supplier. */
  origen?: { tipo: "Customer" | "Supplier"; id: string };
  origenNombre?: string;
  referencias?: TesoreriaReferencias;
  /** Solo con origen. Sales Invoice si origen.tipo=Customer, Purchase Invoice si Supplier. */
  liquidaciones?: TesoreriaLiquidacion[];
  /** Semántica INVERTIDA según haya o no origen — ver docs/tasks/38. */
  deducciones?: TesoreriaLinea[];
  /** Solo SIN origen. Debe sumar exactamente `monto`. */
  distribucion?: TesoreriaLinea[];
  nota?: string;
  branch?: string;
  department?: string;
  /** Cuenta contable alterna para el LADO BANCO de este asiento puntual, en vez de la que tiene
   *  configurada la cuenta bancaria (Bank Account.account). */
  cuentaBancoOverride?: string;
  /** Cuenta contable alterna para el LADO DEL ORIGEN (su CxC si es Customer, su CxP si es
   *  Supplier), en vez de la que ERPNext resuelve sola. Solo válida CON "origen". Si además se
   *  envían "liquidaciones", debe ser idéntica a la cuenta con la que quedó contabilizada cada
   *  factura liquidada. */
  cuentaPartyOverride?: string;
  /** Tasa origen/facturas liquidadas → moneda base. Ver CreateEmisionDto.conversionRate (mismo
   *  concepto, análogo para Depósitos con `tasaFijaCxc`). */
  conversionRate?: number;
  /** Tasa banco → moneda base. Ver CreateEmisionDto.bankConversionRate. */
  bankConversionRate?: number;
}

/** PUT /tesoreria/depositos/:id — solo cabecera de un borrador. */
export interface UpdateDepositoDto {
  descripcion?: string;
  nota?: string;
  referencias?: TesoreriaReferencias;
  branch?: string;
  department?: string;
  /** Reasigna el lado banco del asiento del borrador. Ver CreateDepositoDto.cuentaBancoOverride. */
  cuentaBancoOverride?: string;
  /** Reasigna el lado del origen del asiento del borrador. Solo aplica a borradores que tengan
   *  origen. Ver CreateDepositoDto.cuentaPartyOverride. */
  cuentaPartyOverride?: string;
}

// ─── Tesorería — Transferencias Internas ───────────────────────────────────────
// Siempre Journal Entry (dos cuentas bancarias propias) — nunca tiene party/beneficiario/origen,
// ni liquidaciones ni distribución, ni branch/department.

export interface CreateTransferenciaInternaDto {
  fecha: string;
  /** Opcional — a diferencia de Emisiones/Depósitos, nunca hay ambigüedad de contrapartida. */
  tipoDocumento?: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  descripcion?: string;
  monto: number;
  /** Obligatorio SI origen y destino están en monedas distintas — 400 `MONTO_DESTINO_REQUIRED`
   *  si se omite en ese caso. El backend NUNCA lo calcula solo a partir de una tasa, siempre
   *  debe venir explícito. Si origen y destino son la misma moneda, se ignora (el destino
   *  siempre es `monto - deducciones`). */
  montoDestino?: number;
  /** Tasa moneda de origen → base, si esa cuenta opera en divisa y no hay tasa cargada. */
  conversionRateOrigen?: number;
  /** Tasa moneda de destino → base, análogo. */
  conversionRateDestino?: number;
  referencias?: TesoreriaReferencias;
  /** Comisiones interbancarias — reducen lo que llega a cuentaDestino respecto a lo que sale.
   *  Regla no obvia: cualquier comisión/deducción se asume SIEMPRE en la moneda de ORIGEN. */
  deducciones?: TesoreriaLinea[];
  nota?: string;
  /** Cuenta contable alterna para la pata de ORIGEN del asiento, en vez de la que tiene
   *  configurada la cuenta bancaria de origen (Bank Account.account). */
  cuentaBancoOrigenOverride?: string;
  /** Cuenta contable alterna para la pata de DESTINO del asiento. No puede terminar siendo la
   *  misma cuenta contable que la pata de origen. */
  cuentaBancoDestinoOverride?: string;
}

/** PUT /tesoreria/transferencias-internas/:id — solo cabecera de un borrador. */
export interface UpdateTransferenciaInternaDto {
  descripcion?: string;
  nota?: string;
  referencias?: TesoreriaReferencias;
  /** Reasigna la pata de origen del asiento del borrador. Ver
   *  CreateTransferenciaInternaDto.cuentaBancoOrigenOverride. */
  cuentaBancoOrigenOverride?: string;
  /** Reasigna la pata de destino del asiento del borrador. Ver
   *  CreateTransferenciaInternaDto.cuentaBancoDestinoOverride. */
  cuentaBancoDestinoOverride?: string;
}

// ─── Tesorería — Facturas pendientes (liquidaciones) ───────────────────────────
// Shape no documentado en openapi.json (sin schema) — inferido de PendientePago existente,
// con `facturaId` para calzar con TesoreriaLiquidacion. Verificar contra una respuesta real.

export interface TesoreriaPendienteFactura {
  facturaId: string;
  postingDate: string;
  dueDate: string;
  grandTotal: number;
  outstandingAmount: number;
  isOverdue?: boolean;
  daysOverdue?: number;
}

// ─── Tesorería — Movimientos (libro de banco / kardex) ─────────────────────────
// Se alimenta de GL Entry filtrado por la cuenta contable de la cuenta bancaria — incluye
// TODO lo que afecta esa cuenta, no solo lo creado desde Tesorería.

export interface MovimientoBancario {
  fecha: string;
  voucherType: string;
  voucherNo: string;
  debito: number;
  credito: number;
  /** Saldo acumulado DESPUÉS de esta fila. */
  saldoCorrido: number;
  party?: string;
  partyType?: string;
  remarks?: string;
  branch?: string;
  department?: string;
  /** Moneda del lado banco de esta transacción — `undefined` en un tenant/documento que nunca
   *  tocó multimoneda. Ver docs/tasks/64_multimoneda_completo.md §5.5. */
  moneda?: string;
  /** Tasa banco→base usada. */
  conversionRate?: number;
  /** Monto convertido a moneda base. */
  montoBase?: number;
  /** true en una línea que ERPNext generó automáticamente como ajuste de ganancia/pérdida
   *  cambiaria — ver `TesoreriaLineaAsiento.esDiferenciaCambiaria` (misma semántica). */
  esDiferenciaCambiaria?: boolean;
}

export interface MovimientosMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  cuentaBancaria: string;
  /** Saldo justo ANTES de la primera fila devuelta — para la fila sintética de "Saldo inicial". */
  saldoInicialDelRango: number;
}

export interface ResumenMovimientos {
  cuentaBancaria: string;
  cuentaBancariaNombre: string;
  fromDate: string | null;
  toDate: string | null;
  saldoInicial: number;
  entradas: number;
  salidas: number;
  saldoFinal: number;
}

// ─── Tesorería — Plantillas de Impresión de Cheque (Cheque Print Template) ─────
// Doctype nativo de ERPNext — cada campo numérico es una coordenada en cm desde el borde
// superior/izquierdo del papel pre-impreso del talonario.

export type ChequePrintTemplateSize = "Regular" | "A4";

export interface ChequePrintTemplate {
  /** Nombre/identificador de la plantilla — inmutable tras crear (docname nativo de ERPNext). */
  bankName: string;
  chequeSize?: ChequePrintTemplateSize;
  /** Solo relevante si chequeSize = "A4". */
  startingPositionFromTopEdge?: number;
  chequeWidth?: number;
  chequeHeight?: number;
  isAccountPayable?: boolean;
  accPayDistFromTopEdge?: number;
  accPayDistFromLeftEdge?: number;
  messageToShow?: string;
  dateDistFromTopEdge?: number;
  dateDistFromLeftEdge?: number;
  payerNameFromTopEdge?: number;
  payerNameFromLeftEdge?: number;
  amtInWordsFromTopEdge?: number;
  amtInWordsFromLeftEdge?: number;
  amtInWordWidth?: number;
  amtInWordsLineSpacing?: number;
  amtInFiguresFromTopEdge?: number;
  amtInFiguresFromLeftEdge?: number;
  accNoDistFromTopEdge?: number;
  accNoDistFromLeftEdge?: number;
  signatoryFromTopEdge?: number;
  signatoryFromLeftEdge?: number;
  /** Si ya existe un Print Format generado con las coordenadas ACTUALES. */
  hasPrintFormat?: boolean;
}

export type CreateChequePrintTemplateDto = Omit<ChequePrintTemplate, "hasPrintFormat">;

export type UpdateChequePrintTemplateDto = Partial<Omit<CreateChequePrintTemplateDto, "bankName">>;

// ─── Plantillas de Impresión (POS + etiquetas) ──────────────────────────────
// Ver docs/tasks/55_plantillas_impresion_editor_pos_y_etiquetas.md — el backend nunca
// interpreta `documentJson`, lo trata como blob opaco (ver TemplateDocument en
// src/features/invoice-template-editor/types.ts). El valor de `plantillaType` trae un
// espacio literal ("Pos Invoice"/"Label 5x2") — así viaja en la query string también.

export type PlantillaApiType = "Pos Invoice" | "Label 5x2";

export interface PlantillaImpresion {
  id: string;
  plantillaType: PlantillaApiType;
  plantillaName: string;
  company: string;
  isDefault: boolean;
  catalogVersion: number;
  /** TemplateDocument completo tal cual lo produce el editor — el backend no lo valida. */
  documentJson: Record<string, unknown>;
}

export interface CreatePlantillaImpresionDto {
  plantillaType: PlantillaApiType;
  plantillaName: string;
  isDefault?: boolean;
  catalogVersion?: number;
  documentJson: Record<string, unknown>;
}

export type UpdatePlantillaImpresionDto = Partial<CreatePlantillaImpresionDto>;

/** Ítem del catálogo fijo de GET /plantillas/galeria — igual para todos los tenants (el ítem de
 * farmacia solo aparece si el vertical del tenant es "farmacia", ya filtrado por el servidor). */
export interface GaleriaPlantillaDto {
  id: string;
  type: PlantillaApiType;
  name: string;
  description: string;
  /** TemplateDocument completo (page + pages[].elements[]), mismo shape que documentJson. */
  document: Record<string, unknown>;
}

export interface CampoDisponiblePlantilla {
  key: string;
  label: string;
  /** Si es true, el valor correspondiente en render-data es un arreglo (tabla), no un escalar. */
  array: boolean;
}

export interface LogoPlantillaUploadResult {
  fileUrl: string;
  fileName: string;
}

/** Respuesta de GET /plantillas/render-data?type=Pos Invoice — una key ausente en `values`
 * significa lo mismo que presente con `null` (el binding no existe en este tenant o el dato
 * vino vacío). */
export interface RenderDataPosInvoice {
  template: { id: string; document: Record<string, unknown> };
  values: Record<string, unknown>;
}

/** Respuesta de GET /plantillas/render-data?type=Label 5x2 — `labels` respeta el orden (con
 * repeticiones) de `sourceIds` enviado. */
export interface RenderDataLabels {
  template: { id: string; document: Record<string, unknown> };
  labels: Array<{ sourceId: string; values: Record<string, unknown> }>;
}

// ─── Impresoras (QZ Tray) ────────────────────────────────────────────────────
// Ver docs/tasks/56_persistencia_configuracion_impresoras.md — "brand"/"model" son texto libre
// puramente descriptivo (el backend no los valida ni interpreta); `qzPrinterName` es el único
// campo con significado técnico, opaco para el backend también (lo resuelve/valida el cliente
// contra `qz.printers.find()`).

export interface Impresora {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  qzPrinterName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateImpresoraDto {
  name: string;
  brand?: string;
  model?: string;
  qzPrinterName: string;
}

export type UpdateImpresoraDto = Partial<CreateImpresoraDto>;

export interface SetSeleccionDto {
  /** `null` u omitido = "ninguna" (cae al diálogo de impresión del navegador). */
  impresoraId?: string | null;
}

// ─── DGII — Padrón de Contribuyentes ───────────────────────────────────────

// ─── Permisos (nivel 1/2) ───────────────────────────────────────────────────
// Ver docs/PROMPT_PERMISOS_FRONTEND.md. Alcance acotado: solo se usa en el vertical Farmacia
// ARS por ahora (ver docs/PROMPT_FARMACIA_V2_FRONTEND.md §1) — no se migró el resto de la app.

export type PermisoPtypeFlag = 0 | 1

export interface MePermissions {
  email: string;
  roles: string[];
  /** Flags crudos por DocType — solo aparecen los ptypes otorgados. */
  doctypes: Record<string, Partial<Record<PermisoPtype, PermisoPtypeFlag>>>;
  /** Catálogo de acciones con nombre, resuelto contra los permisos reales del usuario. */
  acciones: Record<string, boolean>;
  /** No documentado en openapi.json — "general" si el backend no lo envía o envía otra cosa. */
  vertical: 'general' | 'farmacia';
}

export interface DocumentPermissions {
  doctype: string;
  name: string;
  permisos: Partial<Record<PermisoPtype, PermisoPtypeFlag>>;
}

// ─── Farmacia ARS v2 — cobertura dentro de la factura ───────────────────────
// La v1 (Preaprobaciones / Despachos / Cola de Cobro) se eliminó: la cobertura de la ARS ahora
// vive en el bloque `aseguradora` de la factura de venta normal. Ver
// docs/PROMPT_FARMACIA_V2_FRONTEND.md §3 y el schema `AseguradoraInvoiceDto` de openapi.json.

export type TipoCoberturaArs = 'monto' | 'porciento';

/** Estado de la aprobación ARS de una factura. `null` mientras es borrador (§3.8). */
export type EstadoArs = 'Pendiente' | 'En Lote' | 'Facturado' | 'Anulada';

export const MOTIVOS_ANULACION_ARS = [
  'Rechazo de la ARS',
  'Medicamento incorrecto',
  'Error de digitación',
  'Paciente desistió',
  'Producto defectuoso/vencido',
  'Otro',
] as const;

export type MotivoAnulacionArs = (typeof MOTIVOS_ANULACION_ARS)[number];

/** Lo que el frontend ENVÍA en `aseguradora` de POST /invoices y PATCH /invoices/:id.
 *  Ausente (o `null` en el PATCH) = factura sin cobertura. */
export interface AseguradoraInvoiceDto {
  /** Customer registrado como aseguradora — el picker debe consumir `GET /aseguradoras`. */
  aseguradora: string;
  numeroAutorizacion: string;
  tipoCobertura: TipoCoberturaArs;
  /** RD$ si `tipoCobertura = 'monto'`; porcentaje (0, 100] si `'porciento'`. */
  valorCobertura: number;
  carnetAfiliado?: string;
  /** Cédula del paciente (11 dígitos, validada con el algoritmo JCE en el servidor). */
  cedula?: string;
  numeroSeguroSocial?: string;
  telefonoPaciente?: string;
  nombreDoctor?: string;
  /** `YYYY-MM-DD` */
  fechaAprobacion?: string;
  /** `YYYY-MM-DD` */
  fechaIndicacionReceta?: string;
  aprobadoPor?: string;
}

/** Bloque `aseguradora` que DEVUELVE la factura (§3.5). Los campos calculados son del servidor:
 *  nunca recalcularlos en el cliente, solo mostrarlos. */
export interface InvoiceAseguradora extends AseguradoraInvoiceDto {
  aseguradoraName?: string;
  /** Cobertura en RD$ resuelta por el servidor (si es `porciento`, `subtotal × valor / 100`). */
  montoCobertura: number;
  /** Σ `montoAprobadoArs` de las líneas. */
  montoDistribuido: number;
  /** `montoCobertura − montoDistribuido` — debe ser 0 para poder someter. */
  diferencia: number;
  /** `grandTotal − montoCobertura` — lo que paga el paciente. */
  montoPaciente: number;
  estadoArs: EstadoArs | null;
  /** Id del lote de facturación que la tomó, o `null`. */
  lote?: string | null;
  montoCoberturaDevuelta: number;
  montoCoberturaNeta: number;
  motivoAnulacion?: MotivoAnulacionArs | null;
  motivoAnulacionDetalle?: string | null;
}

/** Versión reducida que traen los elementos de `GET /invoices` y `GET /caja/por-cobrar`. */
export interface InvoiceAseguradoraResumen {
  aseguradora: string;
  aseguradoraName?: string;
  numeroAutorizacion: string;
  montoCobertura: number;
  montoPaciente: number;
  estadoArs: EstadoArs | null;
  lote?: string | null;
}

/** Narrowing entre el bloque completo (detalle de factura) y el reducido (listados): solo el
 *  completo trae los campos calculados del reparto. */
export function esCoberturaCompleta(
  a: InvoiceAseguradora | InvoiceAseguradoraResumen | null | undefined,
): a is InvoiceAseguradora {
  return !!a && 'montoDistribuido' in a;
}

/** Respuesta de `POST /config/farmacia/habilitar` (§9) — todos los campos son informativos. */
export interface HabilitarFarmaciaResult {
  cuentaCxcArsProvisional?: string;
  modoPagoCoberturaArs?: string;
  customerGroupArs?: string;
  itemCoberturaLote?: string;
  rolDispensadorControlados?: string;
  plantillaFactura?: string;
}

// ─── Farmacia ARS v2 — Lotes de Facturación ─────────────────────────────────

export type LoteFarmaciaEstado = 'Abierto' | 'En Revisión' | 'Facturado';

export interface CreateLoteDto {
  aseguradora: string;
  periodoInicio: string;
  periodoFin: string;
  /** Email de un User de ERPNext. */
  responsable?: string;
}

/** Factura de paciente candidata o vinculada a un lote — mismo shape en
 *  `GET /farmacia/lotes/facturas-elegibles` y en `LoteFacturacionArs.facturas` (§6.3). */
export interface FacturaElegibleArs {
  id: string;
  customer: string;
  customerName: string;
  postingDate: string;
  ncf?: string;
  grandTotal: number;
  outstandingAmount: number;
  numeroAutorizacion: string;
  carnetAfiliado?: string;
  montoCobertura: number;
  montoCoberturaNeta: number;
  estadoArs: EstadoArs | null;
}

export interface FacturasElegiblesResult {
  items: FacturaElegibleArs[];
  total: number;
  montoTotal: number;
}

export interface VincularFacturasDto {
  /** 1–100 ids de facturas de paciente. */
  facturaIds: string[];
}

/** Fila congelada al facturar el lote — el anexo oficial de la consolidada. */
export interface LoteFacturaSnapshot {
  factura: string;
  ncf?: string;
  paciente?: string;
  numeroAutorizacion?: string;
  carnetAfiliado?: string;
  montoCobertura: number;
}

export interface LoteFacturacionArs {
  id: string;
  estado: LoteFarmaciaEstado;
  aseguradora: string;
  aseguradoraName?: string;
  periodoInicio: string;
  periodoFin: string;
  responsable?: string;
  cantidadFacturas: number;
  montoTotalLote: number;
  facturaConsolidada?: string;
  ncfAsignado?: string;
  /** Congelado al facturar: usar como anexo cuando `estado === 'Facturado'`. */
  facturasSnapshot?: LoteFacturaSnapshot[];
  /** Lista viva (solo en `GET /farmacia/lotes/:id`). Usar mientras el lote está abierto. */
  facturas?: FacturaElegibleArs[];
}

/** Respuesta de `POST /farmacia/lotes/:id/facturas` — vincular en bloque nunca aborta por las
 *  rechazadas: el lote vuelve actualizado junto con el detalle de cada caso (§6.3). */
export interface VincularFacturasResult extends LoteFacturacionArs {
  vinculadas: string[];
  rechazadas: { factura: string; motivo: string }[];
}

/** Respuesta de `POST /farmacia/lotes/:id/facturar`. */
export interface FacturarLoteResult extends LoteFacturacionArs {
  facturasMarcadas?: string[];
}

export interface DgiiTaxpayer {
  /** RNC o cédula del contribuyente */
  rnc: string;
  /** Razón social */
  name: string;
  tradeName?: string | null;
  businessActivity?: string | null;
  registrationDate?: string | null;
  status?: string | null;
  type?: string | null;
}

// ─── Multimoneda (DOP/USD/EUR) — GET/PATCH /monedas, /monedas/tasas — ver
// docs/tasks/60_multimoneda_dop_usd_eur.md. Universo cerrado: solo existen estas 3 monedas. ──

export type MonedaCode = "DOP" | "USD" | "EUR";

// GET /monedas — siempre devuelve exactamente estos 3 elementos, en este orden.
export interface Moneda {
  code: MonedaCode;
  nombre: string;
  simbolo: string;
  habilitada: boolean;
  /** true solo para la moneda de la compañía (DOP) — no se puede deshabilitar. */
  esBase: boolean;
}

// PATCH /monedas/:code
export interface HabilitarMonedaDto {
  habilitada: boolean;
}

export interface HabilitarMonedaResult {
  currency: MonedaCode;
  enabled: boolean;
  /** null si se deshabilitó, o si nunca se habilitó. */
  cuentas: { receivable: string; payable: string } | null;
}

// GET /monedas/tasas
export interface TasaCambio {
  /** name real del Currency Exchange en ERPNext — úsalo para PUT/DELETE, no lo construyas a mano. */
  id: string;
  fecha: string;
  from: MonedaCode;
  to: MonedaCode;
  tasa: number;
  forBuying: boolean;
  forSelling: boolean;
}

export interface ListTasasCambioParams {
  from?: MonedaCode;
  to?: MonedaCode;
  fromDate?: string;
  toDate?: string;
  tipo?: "compra" | "venta";
  limit?: number;
  offset?: number;
}

// POST /monedas/tasas — upsert: si ya hay una tasa para ese par en esa fecha exacta, la actualiza.
export interface CreateTasaCambioDto {
  from: MonedaCode;
  to: MonedaCode;
  rate: number;
  /** Default: hoy. */
  date?: string;
}

export interface UpdateTasaCambioDto {
  rate: number;
}

export interface TasaCambioActionResult {
  id: string;
  message: string;
}

// GET /monedas/tasas/vigente
export interface TasaVigente {
  tasa: number;
  fecha: string;
  /** "currency_exchange": tasa cargada manualmente o por el job. "proveedor": resuelta contra el proveedor externo configurado, no contra la tabla de tasas del tenant. */
  origen: "currency_exchange" | "proveedor";
}

// POST /monedas/tasas/sincronizar
export interface SincronizarTasasResult {
  actualizadas: { currency: MonedaCode; base: MonedaCode; rate: number }[];
  errores: { currency: MonedaCode; error: string }[];
}

// GET /monedas/convertir — solo para mostrar (ej. calculadora de conversión), nunca para
// precalcular un monto que se envíe al body de otro POST.
export interface ConvertirMonedaResult {
  monto: number;
  from: MonedaCode;
  to: MonedaCode;
  tasa: number;
  origen: "currency_exchange" | "proveedor";
  resultado: number;
}

// POST /monedas/preview-conversion-banco — simula si un monto se puede depositar/cobrar en una
// cuenta bancaria de otra moneda, SIN crear nada. Nunca lanza 400 por incompatibilidad — todo
// viaja en `advertencia` con 200. Útil como paso previo opcional antes de confirmar un
// cobro/pago/emisión (esos sí lanzan 400 duro con los códigos de MonedaErrorCode).
export interface PreviewConversionBancoDto {
  monto: number;
  moneda: MonedaCode;
  cuentaBancaria: string;
  conversionRate?: number;
}

export interface PreviewConversionBancoResult {
  monedaBanco: MonedaCode;
  requiereConversion: boolean;
  permitido: boolean;
  tasaAplicada?: number;
  origenTasa?: "manual" | "currency_exchange" | "proveedor";
  montoEquivalente?: number;
  advertencia: string | null;
}

// Tabla maestra de códigos de error de multimoneda (400) — campo `code` dentro del body.
// Ver docs/tasks/64_multimoneda_completo.md §0.4.
export type MonedaErrorCode =
  | "CURRENCY_NOT_SUPPORTED"
  | "CURRENCY_NOT_ENABLED"
  | "CURRENCY_IS_BASE"
  | "EXCHANGE_RATE_REQUIRED"
  | "PAYMENT_MIXED_CURRENCIES"
  | "PAYMENT_MIXED_RATES"
  | "BANK_ACCOUNT_CURRENCY_MISMATCH"
  | "BANK_ACCOUNT_CURRENCY_MISMATCH_GL"
  | "BANK_AMOUNT_OUT_OF_TOLERANCE"
  | "MONTO_DESTINO_REQUIRED";

// ─── Facturas de Apertura (Migración de Saldos) ────────────────────────────────
// docs/tasks/PROMPT_APERTURA_FRONTEND.md — carga, una sola vez, del saldo pendiente de facturas
// de venta/compra que ya existían en el sistema anterior. Nunca hay borrador ni edición: crear
// siempre confirma (estado "submitted"); corregir = anular ("cancelled") + volver a cargar.

export interface AperturaPreflight {
  listo: boolean;
  ejerciciosFiscales: {
    requeridos: string[];
    existentes: string[];
    faltantes: string[];
  };
  cuentaApertura: {
    existe: boolean;
    cuenta: string | null;
    numeroSugerido: string;
  };
  serieNumeracion: {
    existe: boolean;
    ventas: string;
    compras: string;
  };
  /** Mensajes ya redactados en español, listos para mostrar tal cual — no reformular. */
  bloqueantes: string[];
}

export interface PrepararAperturaDto {
  /** Fecha 'YYYY-MM-DD'. Por defecto, el 1 de enero de hace 3 años. */
  desde?: string;
  /** Fecha 'YYYY-MM-DD'. Por defecto, hoy. */
  hasta?: string;
}

export interface AperturaPrepararResult {
  ejerciciosFiscales: {
    creados: string[];
    yaExistian: string[];
  };
  cuentaApertura: {
    cuenta: string;
    creada: boolean;
  };
}

export type AperturaEstado = "submitted" | "cancelled";

export interface CrearFacturaAperturaVentaDto {
  customer: string;
  numeroFacturaOriginal: string;
  fechaFactura: string;
  fechaVencimiento?: string;
  /** Saldo PENDIENTE de la factura — no el total original. */
  montoPendiente: number;
  descripcion?: string;
  origen?: string;
  /** Letra (B/E) + 2 dígitos de tipo + 8-10 dígitos de secuencial, ej. "B0100000123". */
  ncfOriginal?: string;
  /** Si es true, exige ncfOriginal. Default false. */
  reportarEnDgii?: boolean;
  moneda?: string;
  /** Obligatoria si moneda difiere de la moneda de la compañía. */
  tasaCambio?: number;
  branch?: string;
  costCenter?: string;
}

export interface FacturaAperturaVenta {
  id: string;
  numeroFacturaOriginal: string;
  customer: string;
  customerName: string;
  fechaFactura: string;
  fechaVencimiento: string;
  montoPendiente: number;
  /** Baja a medida que se registran cobros por los canales normales del sistema. */
  saldoActual: number;
  ncf: string | null;
  ncfType: string | null;
  reportadaEnDgii: boolean;
  origen: string | null;
  currency: string;
  branch: string | null;
  estado: AperturaEstado;
  esApertura: true;
}

export interface ListAperturaVentasParams extends PaginationParams {
  customer?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ImportarAperturaVentasDto {
  /** Entre 1 y 200 filas. */
  filas: CrearFacturaAperturaVentaDto[];
}

export interface ImportarAperturaResultadoFilaBase {
  fila: number;
  ok: boolean;
  id?: string;
  error?: string;
}

export interface ImportarAperturaVentasResultadoFila extends ImportarAperturaResultadoFilaBase {
  numeroFacturaOriginal: string;
}

export interface ImportarAperturaVentasResult {
  total: number;
  creadas: number;
  fallidas: number;
  /** Suma solo de las filas creadas (ok: true) — no la suma de todo el lote pedido. */
  montoTotalMigrado: number;
  resultados: ImportarAperturaVentasResultadoFila[];
}

export interface CrearFacturaAperturaCompraDto {
  supplier: string;
  /** Número de factura del PROVEEDOR — se guarda en el campo nativo bill_no. */
  numeroFacturaProveedor: string;
  fechaFactura: string;
  fechaVencimiento?: string;
  /** Saldo PENDIENTE de la factura — no el total original. */
  montoPendiente: number;
  descripcion?: string;
  origen?: string;
  /** NCF del proveedor — sin validación de formato en el backend. */
  ncfProveedor?: string;
  /** A diferencia de ventas, en compras el tipo NO se deriva del NCF — se elige aparte. */
  tipoComprobante?: string;
  reportarEnDgii?: boolean;
  moneda?: string;
  tasaCambio?: number;
  branch?: string;
  costCenter?: string;
}

export interface FacturaAperturaCompra {
  id: string;
  numeroFacturaProveedor: string;
  supplier: string;
  supplierName: string;
  fechaFactura: string;
  fechaVencimiento: string;
  montoPendiente: number;
  saldoActual: number;
  ncf: string | null;
  /** Puede venir null incluso si ncf tiene valor — en compras el tipo es un campo separado. */
  ncfType: string | null;
  reportadaEnDgii: boolean;
  origen: string | null;
  currency: string;
  branch: string | null;
  estado: AperturaEstado;
  esApertura: true;
}

export interface ListAperturaComprasParams extends PaginationParams {
  supplier?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ImportarAperturaComprasDto {
  filas: CrearFacturaAperturaCompraDto[];
}

export interface ImportarAperturaComprasResultadoFila extends ImportarAperturaResultadoFilaBase {
  numeroFacturaProveedor: string;
}

export interface ImportarAperturaComprasResult {
  total: number;
  creadas: number;
  fallidas: number;
  montoTotalMigrado: number;
  resultados: ImportarAperturaComprasResultadoFila[];
}

export interface AperturaResumen {
  ventas: { cantidad: number; montoMigrado: number; saldoPendiente: number };
  compras: { cantidad: number; montoMigrado: number; saldoPendiente: number };
  /** Sin `saldoPendiente` — no aplica a un ajuste de stock (docs/tasks/PROMPT_APERTURA_INVENTARIO_FRONTEND.md §10). */
  inventario: { cantidad: number; montoMigrado: number };
  cuentaApertura: {
    cuenta: string | null;
    saldo: number;
    esperado: number;
    cuadra: boolean;
  };
  porAnio: { anio: number; ventas: number; compras: number; inventario: number }[];
  /** true mientras la cuenta puente tenga saldo distinto de cero — el cierre es manual, fuera de este módulo. */
  pendienteDeCierre: boolean;
}

// ─── Apertura de Inventario (dentro de Migración de Saldos) ───────────────────
// docs/tasks/PROMPT_APERTURA_INVENTARIO_FRONTEND.md — migra el saldo FÍSICO inicial (stock por
// ítem/almacén) del sistema anterior. `qty` es el saldo FINAL absoluto, no se suma (§3). Crea y
// confirma en una sola llamada, igual que Ventas/Compras — no hay borrador ni edición ni /importar
// (§6, un Stock Reconciliation es un documento atómico). Anular SÍ revierte stock real (§7).

export interface AperturaInventarioItemDto {
  itemCode: string;
  warehouse: string;
  /** Saldo FINAL absoluto de este ítem en este almacén — 0 es válido. */
  qty: number;
  /** Estrictamente > 0, a diferencia de qty. */
  valuationRate: number;
}

export interface CrearAperturaInventarioDto {
  fechaApertura: string;
  /** Si se omite, el backend usa "Apertura de inventario — saldo inicial del sistema anterior". */
  remarks?: string;
  /** Un documento no puede mezclar almacenes de sucursales distintas (§5). */
  items: AperturaInventarioItemDto[];
  branch?: string;
  department?: string;
}

export interface AperturaInventarioItem extends AperturaInventarioItemDto {
  /** qty × valuationRate, calculado por el servidor — no recalcular en el cliente. */
  amount: number;
}

export interface AperturaInventarioListItem {
  id: string;
  fechaApertura: string;
  company: string;
  branch: string | null;
  department: string | null;
  cuentaApertura: string;
  estado: AperturaEstado;
  esApertura: true;
}

/** Shape del detalle (§4.3/§8.2) — el listado (§8.1) NO trae `items`/`montoTotal`, a propósito. */
export interface AperturaInventario extends AperturaInventarioListItem {
  items: AperturaInventarioItem[];
  montoTotal: number;
}

export interface ListAperturaInventarioParams extends PaginationParams {
  branch?: string;
  fromDate?: string;
  toDate?: string;
}

// ─── Carga Inicial de Inventario (Stock Entry / Material Receipt) ─────────────
// docs/tasks/PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md — agrega existencias a un almacén SIN
// que haya una compra de por medio (hallazgos, donaciones, ajustes). NO es lo mismo que Apertura
// de Inventario (`AperturaInventario` arriba): acá `qty` se SUMA a lo que ya existe (nunca fija
// un saldo absoluto) y por eso `qty: 0` es inválido — a diferencia de Apertura, donde 0 sí es
// válido. Contabiliza contra `Company.stock_adjustment_account`, una cuenta DISTINTA de la
// `14-03 APERTURA TEMPORAL` que usa Apertura de Inventario. Crea y confirma en una sola llamada,
// sin borrador ni edición ni /importar por lote.

export type CargaInicialStatus = "submitted" | "cancelled";

export interface CargaInicialItemDto {
  itemCode: string;
  warehouse: string;
  /** Estrictamente > 0 — a diferencia de Apertura de Inventario, 0 NO es válido acá. */
  qty: number;
  valuationRate: number;
}

export interface CrearCargaInicialDto {
  postingDate: string;
  /** Si se omite, el backend guarda cadena vacía (no un texto por defecto). */
  remarks?: string;
  /** Un documento no puede mezclar almacenes de sucursales distintas. */
  items: CargaInicialItemDto[];
  branch?: string;
  department?: string;
}

export interface CargaInicialItem extends CargaInicialItemDto {
  /** qty × valuationRate, calculado por ERPNext — no recalcular en el cliente. */
  amount: number;
}

export interface CargaInicialListItem {
  id: string;
  status: CargaInicialStatus;
  postingDate: string;
  company: string;
  branch: string | null;
  department: string | null;
  remarks: string;
  createdAt: string;
}

/** Shape del detalle (§3.3/§7.2) — el listado (§7.1) NO trae `items`/`totalValue`, a propósito. */
export interface CargaInicialInventario extends CargaInicialListItem {
  items: CargaInicialItem[];
  totalValue: number;
}

export interface ListCargaInicialParams extends PaginationParams {
  branch?: string;
  department?: string;
  status?: CargaInicialStatus;
}

// ─── Despachos (Delivery Note) ─────────────────────────────────────────────────
// docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md — módulo nuevo, gateado por
// FacturacionConfig.despachoHabilitado. Nunca "Delivery Note" ni "Nota de entrega" en la UI: usar
// siempre "Despacho".

/** Estado de documento — gobierna qué botones mostrar (mismo patrón que Factura/Pedido). */
export type DespachoStatus = "draft" | "submitted" | "cancelled";

/** Estado nativo de ERPNext — más granular, solo informativo (badge secundario/tooltip). NUNCA
 *  usar para decidir qué acciones mostrar — para eso usar siempre `status`. */
export type DespachoDeliveryStatus =
  | "Draft"
  | "To Bill"
  | "Completed"
  | "Return"
  | "Return Issued"
  | "Cancelled"
  | "Closed";

export interface DespachoItem {
  itemCode: string;
  itemName: string;
  qty: number;
  rate: number;
  amount: number;
  warehouse: string;
  uom: string;
  deliveredQty: number;
  /** Pedido de origen de esta línea, si nació de desde-pedido (o de una factura que a su vez vino de un pedido). */
  againstSalesOrder: string | null;
  soDetail: string | null;
  /** Factura de origen de esta línea, si nació de desde-factura. */
  againstSalesInvoice: string | null;
  siDetail: string | null;
}

export interface Despacho {
  id: string;
  customer: string;
  customerName: string;
  postingDate: string;
  status: DespachoStatus;
  deliveryStatus: DespachoDeliveryStatus;
  /** true si este despacho ES una devolución (nació de POST /despachos/:id/devolucion). */
  isReturn: boolean;
  /** Despacho original que se devolvió, cuando isReturn === true. */
  returnAgainst: string | null;
  salesOrder: string | null;
  salesInvoice: string | null;
  branch?: string | null;
  department?: string | null;
  /** % ya facturado de este despacho (0-100) — barra de progreso si se factura parcialmente. */
  perBilled: number;
  items: DespachoItem[];
  amendedFrom: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface DespachoItemDto {
  itemCode: string;
  qty: number;
  /** Si se omite, se usa el almacén por defecto del usuario. */
  warehouse?: string;
  /** Costo/valor de referencia, informativo — el Despacho no es un documento fiscal. Default 0. */
  rate?: number;
}

/** POST /despachos — creación directa (venta mostrador, sin Sales Order previo). Único de los 3
 *  caminos de creación donde el frontend arma el body completo. */
export interface CreateDespachoDto {
  customer: string;
  branch?: string;
  department?: string;
  items: DespachoItemDto[];
  notes?: string;
}

/** PUT /despachos/:id — reemplazo completo de `items` cuando se envía (igual que PUT /pedidos/:id).
 *  Solo cantidad/almacén por línea existente — no se pueden agregar líneas nuevas. */
export interface UpdateDespachoDto {
  items?: DespachoItemDto[];
}

export interface DespachoBatchAllocationDto {
  batchId: string;
  qty: number;
}

export interface AssignDespachoTrackingItemDto {
  itemCode: string;
  /** Uno por unidad — la cantidad debe coincidir con `qty` de la línea. */
  serials?: string[];
  /** Debe sumar `qty` de la línea. */
  batches?: DespachoBatchAllocationDto[];
}

export interface AssignDespachoTrackingDto {
  items: AssignDespachoTrackingItemDto[];
}

export interface CancelarDespachoDto {
  /** Motivo obligatorio, 10-500 caracteres. */
  reason: string;
}

export interface ListDespachosParams extends PaginationParams {
  customer?: string;
  /** Default del backend: trae Borrador+Sometido (no "all"). */
  status?: DespachoStatus | "all";
  warehouse?: string;
  branch?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  salesOrder?: string;
  salesInvoice?: string;
}

/** GET /despachos/pendientes — cola de trabajo, líneas sueltas de todo lo pendiente de despachar
 *  sin importar de qué documento vienen. Puede haber líneas duplicadas por artículo si un pedido
 *  ya tiene factura (una fila `origen:"pedido"` y otra `origen:"factura"`) — no es un bug, cada
 *  una representa una situación de negocio distinta (§2.3). */
export interface DespachoPendienteLinea {
  origen: "factura" | "pedido";
  documentoId: string;
  customer: string;
  customerName: string;
  /** null en casos especiales sin línea de artículo real (ej. facturas de apertura/migración). */
  itemCode: string | null;
  itemName: string;
  warehouse: string | null;
  qtyPendiente: number;
}

export interface ListDespachosPendientesParams extends PaginationParams {
  customer?: string;
  itemCode?: string;
  warehouse?: string;
}

/** POST /despachos/:id/facturar */
export interface FacturarDespachoResult {
  invoiceId: string;
  despachoId: string;
  message: string;
}

/** POST /despachos/:id/confirmar-stock — docs/tasks/75_almacen_venta_confirmar_stock_uoms_permitidas.md
 *  §2. Solo aplica a un despacho en Borrador. No somete el despacho — eso sigue siendo un paso
 *  separado y explícito (POST /despachos/:id/submit) después de confirmar.
 *
 *  Mismo DTO reutilizado por POST /despachos/confirmaciones/:id/confirmar (docs/tasks/
 *  79_confirmacion_despacho_pedido.md §4 — reemplaza al viejo POST /pedidos/:id/confirmar-despacho,
 *  eliminado) — ahí sí importan `serials`/`batches` (solo para un artículo con
 *  `Item.custom_asignar_serial_en_despacho` activo, y ahí `items[]` debe cubrir TODAS las líneas de
 *  la solicitud); la confirmación de un Despacho existente los ignora si se envían. */
export interface ConfirmarStockDespachoItemDto {
  itemCode: string;
  /** Solo hace falta si el ítem realmente tiene faltante en su almacén destino — se puede omitir
   *  si ya hay suficiente ahí. Cualquier almacén de la compañía, no restringido a la sucursal. */
  sourceWarehouse?: string;
  /** Solo para POST /despachos/confirmaciones/:id/confirmar, con `trackingType: 'serial'`. */
  serials?: string[];
  /** Solo para POST /despachos/confirmaciones/:id/confirmar, con `trackingType: 'batch'`. */
  batches?: { batchId: string; qty: number }[];
}

export interface ConfirmarStockDespachoDto {
  items: ConfirmarStockDespachoItemDto[];
}

export interface ConfirmarStockDespachoResultItem {
  itemCode: string;
  warehouse: string;
  /** Cuánto realmente hacía falta (actual_qty - reserved_stock en el almacén destino, contra la
   *  cantidad pendiente del despacho). */
  faltante: number;
  /** `false` = ya había suficiente stock en el almacén destino, no hizo falta transferir nada
   *  para esta línea — no es un error, es informativo. */
  transferido: boolean;
  sourceWarehouse: string;
}

export interface ConfirmarStockDespachoResult {
  /** Solo en la respuesta de POST /despachos/confirmaciones/:id/confirmar. */
  solicitudId?: string;
  /** Solo en la respuesta de POST /despachos/confirmaciones/:id/confirmar. */
  salesOrder?: string;
  /** `null` si ninguna línea necesitaba transferencia (todo ya estaba disponible). */
  stockEntryId: string | null;
  items: ConfirmarStockDespachoResultItem[];
  message: string;
}

// ─── Confirmación de despacho de Pedidos (cola en Despachos) ─────────────────
// docs/tasks/79_confirmacion_despacho_pedido.md §3-§5. Reemplaza al viejo POST
// /pedidos/:id/confirmar-despacho (eliminado) — la confirmación ahora vive del lado de Despachos,
// con su propia cola consultable (`GET /despachos/confirmaciones`), separada del detalle de Pedido.

export type SolicitudConfirmacionDespachoStatus = 'Pendiente' | 'Confirmado' | 'Cancelado';

export interface SolicitudConfirmacionDespachoItem {
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  warehouse: string;
  /** Si true, hay que pedir serial(es)/lote(s) para esta línea al confirmar (ver
   *  `ConfirmarStockDespachoItemDto.serials`/`batches`) — evita tener que consultar el artículo
   *  aparte para saber si `custom_asignar_serial_en_despacho` está activo. */
  requiresSerialOrBatch: boolean;
}

/** Fila de `GET /despachos/confirmaciones` — mismo shape que devuelve `GET
 *  /despachos/confirmaciones/:id` para el detalle (sin `data[]`/`meta`, un solo objeto). */
export interface SolicitudConfirmacionDespacho {
  id: string;
  salesOrder: string;
  status: SolicitudConfirmacionDespachoStatus;
  company: string;
  branch?: string | null;
  department?: string | null;
  customer: string;
  customerName: string;
  items: SolicitudConfirmacionDespachoItem[];
  stockEntry?: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
}

export interface ListConfirmacionesParams extends PaginationParams {
  status?: SolicitudConfirmacionDespachoStatus;
  customer?: string;
  branch?: string;
  search?: string;
  orderBy?: string;
}

/** `details` del 400 de POST /despachos/:id/confirmar-stock cuando el almacén origen indicado no
 *  tiene suficiente stock — mismo shape que `STOCK_INSUFFICIENT_OR_RESERVED` de §73. */
export type ConfirmarStockDespachoInsufficientDetails = StockInsufficientOrReservedDetails;

/** `details` del 409 de POST /config/despacho/deshabilitar — cada categoría no vacía es una lista
 *  de IDs concretos que el operador debe resolver antes de poder desactivar. */
export interface DesactivarDespachoBloqueos {
  despachosBorrador: string[];
  pedidosPendientes: string[];
  facturasPendientesDespacho: string[];
  reservasVivas: { id: string; status: string }[];
}

// ─── Abastecimiento (Compras → Órdenes, multi-pedido) ──────────────────────────

/** GET /compras/ordenes/pendientes-abastecimiento — viene ya ordenado FIFO por transactionDate,
 *  no reordenar arbitrariamente. Distinto de `DespachoPendienteLinea`: esto mide qué falta COMPRAR
 *  (qty - ordered_qty), no qué falta entregar. */
export interface PendienteAbastecimientoLinea {
  salesOrder: string;
  transactionDate: string;
  customer: string;
  customerName: string;
  itemCode: string;
  itemName: string;
  warehouse: string;
  rate: number;
  qtyPendiente: number;
}

export interface ListPendientesAbastecimientoParams extends PaginationParams {
  itemCode?: string;
  customer?: string;
}

export interface DesdePedidosItemDto {
  salesOrder: string;
  itemCode: string;
}

export interface CreateOrdenDesdePedidosDto {
  supplier: string;
  /** Pares (salesOrder, itemCode) — nunca cantidad, el servidor toma todo el pendiente de esa línea. */
  items: DesdePedidosItemDto[];
  /** Opcional, default hoy. */
  transactionDate?: string;
  /** Segundo paso del flujo de confirmación de margen negativo — ver §5.4. */
  confirmarMargenNegativo?: boolean;
}

export interface MargenNegativoWarning {
  itemCode: string;
  salesOrder: string;
  precioVenta: number;
  costoCompra: number;
  /** precioVenta - costoCompra — negativo o cero cuando comprar así implica perder dinero. */
  margen: number;
}

/** Respuesta de POST /compras/ordenes/desde-pedidos cuando el servidor detecta margen negativo/nulo
 *  en al menos una línea — la orden NO se crea todavía, hay que reenviar con
 *  `confirmarMargenNegativo: true` tras que el operador confirme explícitamente en un modal. */
export interface OrdenDesdePedidosMargenResult {
  requiereConfirmacion: true;
  warnings: MargenNegativoWarning[];
  message?: string;
}

// ─── Relaciones Comerciales (B2B) — docs/tasks/relaciones_comerciales/*.md ─────────────────────

export type EstadoRelacionComercial = 'invitada' | 'activa' | 'rechazada' | 'revocada' | 'suspendida';
/** `activando` es derivado (Fase 05 §3): la invitación se aceptó y los espejos Customer/Supplier
 *  se están creando — nunca es un valor real del enum del backend, solo aparece en el listado. */
export type EstadoRelacionComercialListado = EstadoRelacionComercial | 'activando';

export type EstadoTransaccionB2B =
  | 'Pendiente de entrega'
  | 'Pendiente'
  | 'Requiere Mapeo'
  | 'Requiere Configuración'
  | 'Aceptada'
  | 'Editada'
  | 'Enlazada'
  | 'Rechazada'
  | 'Cancelada'
  | 'Error';

/** Fase 01 §2.3 — mismo shape en invitar, aceptar invitación y editar términos de una relación. */
export interface TerminosComercialesDto {
  tieneCredito?: boolean;
  diasCredito?: number;
  /** Aceptado por el backend pero SIN efecto todavía (Fase 05 §6) — no mostrarlo como si aplicara. */
  limiteCredito?: number;
  grupoCliente?: string;
  cuentaCxcAlterna?: string;
  encargadoCxc?: string;
  formaPagoDefault?: string;
  grupoProveedor?: string;
  diasCreditoProveedor?: number;
  cuentaCxpAlterna?: string;
  tipoBienes606?: string;
  formaPago606?: string;
}

export interface MaestroLocalRelacion {
  name: string;
  nombre: string;
  disabled: boolean;
}

export interface MaestrosLocalesRelacion {
  customer: MaestroLocalRelacion | null;
  supplier: MaestroLocalRelacion | null;
  duplicados: { customer: boolean; supplier: boolean };
}

// ─── Directorio (Fase 03) ───────────────────────────────────────────────────

export interface EmpresaDirectorioRelacion {
  tenantId: string;
  nombre: string;
  rnc: string;
  estadoRelacion: EstadoRelacionComercial | null;
  invitacion: 'enviada' | 'recibida' | null;
  puedeInvitar: boolean;
  /** Mostrar SIEMPRE tal cual — nunca inferir el motivo real a partir de `estadoRelacion` (Fase 03 §5). */
  motivoNoInvitable: string | null;
}

export interface PadronDgiiInfo {
  nombre: string;
  estado: string | null;
}

export interface BuscarEmpresaRelacionResponse {
  rnc: string;
  enGenSuite: boolean;
  empresas: EmpresaDirectorioRelacion[];
  /** Solo viene cuando `enGenSuite: false` y el RNC existe en el padrón local (Fase 03 §3). */
  padronDgii?: PadronDgiiInfo | null;
  maestrosLocales: MaestrosLocalesRelacion;
}

// ─── Invitaciones y Bloqueos (Fase 04) ──────────────────────────────────────

export type EstadoInvitacionRelacion = 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada' | 'expirada';

export interface InvitacionRelacion {
  id: string;
  status: EstadoInvitacionRelacion;
  fromTenantId: string;
  toTenantId: string;
  mensaje?: string | null;
  expiresAt: string;
  createdAt: string;
  maestrosLocales?: MaestrosLocalesRelacion;
  contraparte?: { tenantId: string; nombre: string; rnc?: string };
  direccion?: 'enviada' | 'recibida';
  terminos?: TerminosComercialesDto | null;
}

export interface CrearInvitacionRelacionDto {
  /** Sale del directorio (Fase 03) — nunca un slug ni un RNC. */
  tenantDestinoId: string;
  mensaje?: string;
  terminos?: TerminosComercialesDto;
}

export interface RechazarInvitacionRelacionDto {
  motivo?: string;
  bloquear?: boolean;
}

export interface AceptarInvitacionRelacionDto {
  terminos?: TerminosComercialesDto;
}

export interface ListInvitacionesRelacionParams {
  direccion?: 'enviadas' | 'recibidas';
  estado?: EstadoInvitacionRelacion;
}

// Pantalla pública (sin login) — GET/POST /relaciones/invitaciones/token/:token

export interface InvitacionPublicaEmpresa {
  nombre: string;
  rnc?: string;
}

export type InvitacionPublicaEstado = 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada' | 'expirada';

export interface InvitacionPublicaResumen {
  estado: InvitacionPublicaEstado;
  empresaOrigen: InvitacionPublicaEmpresa;
  empresaDestino: InvitacionPublicaEmpresa;
  mensaje?: string | null;
  expiraEl?: string;
  terminosPropuestos?: TerminosComercialesDto;
  /** Solo cuando `estado` ya no es `pendiente`/`expirada`. */
  resultado?: { respondidoEl: string; motivo: string | null };
}

export interface AceptarInvitacionPublicaDto {
  email?: string;
}

export interface RechazarInvitacionPublicaDto {
  motivo?: string;
  bloquear?: boolean;
  email?: string;
}

// Bloqueos

export interface BloqueoComercial {
  id: string;
  tenantBloqueadoId: string;
  nombreBloqueado?: string;
  rncBloqueado?: string;
  motivo?: string | null;
  levantado?: boolean;
  createdAt: string;
}

export interface CrearBloqueoDto {
  tenantBloqueadoId: string;
  motivo?: string;
}

// ─── Relaciones — activación, configuración y maestros (Fase 05) ───────────

export interface RelacionComercialContraparte {
  tenantId: string;
  nombre: string;
  rnc?: string;
}

export interface RelacionComercialListItem {
  id: string;
  status: EstadoRelacionComercialListado;
  contraparte: RelacionComercialContraparte;
  activatedAt: string | null;
  createdAt: string;
}

export interface RelacionComercialConfiguracion {
  almacenDestino: string | null;
  tipoBienes606: string | null;
  formaPago606: string | null;
  autoEnviarVentas: boolean;
  autoEnviarCompras: boolean;
  mapeoEstricto: boolean;
}

export interface RelacionComercialDetalle {
  id: string;
  status: EstadoRelacionComercialListado;
  contraparte: RelacionComercialContraparte;
  customer: string | null;
  supplier: string | null;
  /** `null` mientras este lado no se haya activado todavía (recién invitada). */
  configuracion: RelacionComercialConfiguracion | null;
  activatedAt: string | null;
  createdAt: string;
}

export interface ActualizarConfiguracionRelacionDto {
  almacenDestino?: string;
  tipoBienes606?: string;
  formaPago606?: string;
  autoEnviarVentas?: boolean;
  autoEnviarCompras?: boolean;
  mapeoEstricto?: boolean;
}

export interface MaestroCandidatoRelacion {
  name: string;
  nombre: string;
  disabled: boolean;
  yaVinculadoAOtraRelacion: boolean;
  documentos: number;
  saldo: number;
}

export interface MaestrosCandidatosRelacion {
  customers: MaestroCandidatoRelacion[];
  suppliers: MaestroCandidatoRelacion[];
}

export interface AdoptarMaestrosDto {
  customer?: string;
  supplier?: string;
}

// ─── Transacciones B2B — bandeja (Fase 06) ─────────────────────────────────

export interface TransaccionContraparte {
  tenant: string;
  nombre: string;
}

export interface DocumentoOrigenTransaccion {
  name: string;
  ncf?: string | null;
  fecha: string;
  total: number;
}

export interface TransaccionB2BListItem {
  transaccionUid: string;
  relacionUid: string;
  direccion: 'Entrante' | 'Saliente';
  tipo: 'Venta' | 'Compra';
  estado: EstadoTransaccionB2B;
  contraparte: TransaccionContraparte;
  documentoLocal: string | null;
  documentoOrigen: DocumentoOrigenTransaccion | null;
  advertenciaTotales?: string | null;
  motivoEstado?: string | null;
  creation: string;
}

export interface TransaccionB2BHistorialEvento {
  fecha: string;
  evento: string;
  actor: string;
  detalle?: string;
}

export interface TransaccionB2BDetalle extends TransaccionB2BListItem {
  payloadSnapshot: Record<string, unknown>;
  payloadHash: string;
  mapeoPendiente: unknown | null;
  resumenCambios: string | null;
  motivoRechazo: string | null;
  respondidoPor: string | null;
  respondidoEl: string | null;
  reenvioDe: string | null;
  autoSometer: boolean;
  historial: TransaccionB2BHistorialEvento[];
  /** Fase 11 §4 — cuando es `true` en una transacción de compra, el botón "Aceptar" no debe
   *  mostrarse: solo "Enlazar mi factura"/"Rechazar" (emitir un comprobante nuevo duplicaría el NCF). */
  origenYaSometido?: boolean;
}

export interface ListTransaccionesParams extends PaginationParams {
  direccion?: 'Entrante' | 'Saliente';
  tipo?: 'Venta' | 'Compra';
  estado?: EstadoTransaccionB2B;
  relacionId?: string;
  desde?: string;
  hasta?: string;
}

// ─── Mapeo de catálogo (Fase 07) ────────────────────────────────────────────

export type EstadoLineaMapeo = 'confirmada' | 'sugerida' | 'sin_sugerencia' | 'ambigua';

export interface ItemOrigenMapeo {
  itemCode: string;
  itemName: string;
  barcodes?: string[];
  uom: string;
  cantidad: number;
  precioUnitario: number;
}

export interface ItemSugeridoMapeo {
  itemCode: string;
  itemName: string;
  motivo: string;
}

export interface ItemLocalMapeo {
  itemCode: string;
  itemName: string;
  uom: string;
  conversionFactor: number;
  isStockItem: boolean;
}

export interface LineaMapeo {
  indice: number;
  estado: EstadoLineaMapeo;
  origen: ItemOrigenMapeo;
  /** Solo cuando `estado === 'sugerida'`. Nunca preseleccionar por nombre/código igual (Fase 07 §6). */
  sugerencia?: ItemSugeridoMapeo | null;
  /** Solo cuando `estado === 'ambigua'` — nunca preseleccionar ninguno (Fase 07 §4). */
  candidatos?: ItemSugeridoMapeo[];
  local?: ItemLocalMapeo | null;
  advertencias: string[];
  barcodesACopiar?: string[];
}

export interface ResumenMapeo {
  confirmadas: number;
  sugeridas: number;
  sinSugerencia: number;
  ambiguas: number;
}

export interface ResultadoMapeo {
  lineas: LineaMapeo[];
  puedeAceptar: boolean;
  resumen: ResumenMapeo;
}

export interface DecisionMapeoDto {
  indiceLinea: number;
  itemCodeLocal: string;
  uomLocal?: string;
  factorConversion?: number;
}

export interface ConfirmarMapeoDto {
  decisiones: DecisionMapeoDto[];
  sincronizarBarcodes?: boolean;
}

export interface BarcodeSincronizado {
  itemCode: string;
  agregados: string[];
  omitidos: Array<{ barcode: string; motivo: string } | string>;
}

export interface ConfirmarMapeoResponse extends ResultadoMapeo {
  barcodesSincronizados?: BarcodeSincronizado[];
  /** Viene con texto cuando se pidió sincronizar pero faltó permiso — mostrar como aviso, no error. */
  sincronizacionOmitida?: string | null;
}

export interface CrearArticuloDesdeSocioDto {
  indiceLinea: number;
  itemGroup: string;
  isStockItem: boolean;
  itemCode?: string | null;
  crearPrecioCompra?: boolean;
}

export interface CrearArticuloDesdeSocioResponse {
  itemCode: string;
  mapeo: ResultadoMapeo;
}

export interface FilaMapeoAcumulado {
  itemCodeOrigen: string;
  itemNameOrigen?: string;
  barcodeOrigen?: string;
  itemCodeLocal: string;
  uomOrigen?: string;
  uomLocal?: string;
  factorConversion?: number;
}

// ─── Ventas B2B (Fase 08) ───────────────────────────────────────────────────

export interface EnviarVentaDto {
  reenvioDe?: string;
}

export interface AceptarTransaccionDto {
  mapeo: DecisionMapeoDto[];
  sincronizarBarcodes?: boolean;
}

export interface RechazarTransaccionDto {
  motivo: string;
}

// ─── Compras B2B (Fase 09) ──────────────────────────────────────────────────

export interface EnviarAProveedorDto {
  autoSometer?: boolean;
  nota?: string;
  reenvioDe?: string;
}

export type EstadoSocioCompra = 'Enviada' | 'Aceptada' | 'Editada' | 'Rechazada';

export interface EstadoSocioCompraResponse {
  transaccionUid: string | null;
  estadoSocio: EstadoSocioCompra | null;
  autoSometerAutorizadoPor: string | null;
  ncf: string | null;
  billNo: string | null;
}

// ─── Diferencias e Igualar (Fase 10) ────────────────────────────────────────

export type EstadoLineaDiff = 'igual' | 'modificada' | 'agregada' | 'eliminada';

export interface CampoDiff {
  campo: string;
  origen: unknown;
  destino: unknown;
}

export interface CambioLineaDiff {
  campo: string;
  origen: unknown;
  destino: unknown;
  deltaPct?: number;
}

export interface ItemDiffRef {
  itemCode: string;
  itemName: string;
}

export interface LineaDiff {
  estado: EstadoLineaDiff;
  indiceOrigen?: number;
  itemOrigen?: ItemDiffRef | null;
  itemDestino?: ItemDiffRef | null;
  cambios: CambioLineaDiff[];
}

export interface TotalesDiff {
  origen: number;
  destino: number;
  diferencia: number;
  diferenciaPct: number;
}

export interface DiffTransaccion {
  huboCambios: boolean;
  cabecera: CampoDiff[];
  lineas: LineaDiff[];
  totales: TotalesDiff;
  resumenTexto: string;
}

export interface IgualarBorradorDto {
  aplicar?: ('lineas' | 'cabecera')[];
}

export interface IgualarBorradorResponse {
  message: string;
  diff: DiffTransaccion;
}

export interface IgualarConEnmiendaDto {
  confirmoAnulacion: boolean;
  motivoAnulacion: string;
}

export interface IgualarConEnmiendaResponse {
  message: string;
  nuevoDocname: string;
  diff: DiffTransaccion;
}

// ─── Enlazar documentos existentes (Fase 11) ────────────────────────────────

export interface DocumentoEnlazable {
  name: string;
  fecha: string;
  total: number;
  ncf?: string | null;
  billNo?: string | null;
  score: number;
  coincidencias: string[];
}

export interface EnlazarYEnviarDto {
  relacionId: string;
  nota?: string;
}

export interface EnlazarTransaccionDto {
  docname: string;
  mapeo: DecisionMapeoDto[];
  sincronizarBarcodes?: boolean;
  notaParaElSocio?: string;
}

export interface EnlazarTransaccionResponse {
  message: string;
  diff: DiffTransaccion;
  advertenciaFiscal?: string | null;
}
