// Catálogos estáticos de la DGII (República Dominicana) usados por Facturación Electrónica
// (e-CF) y por el código DGII de Unidades de Medida. No hay endpoint que los exponga — son
// tablas fijas que solo cambian con un deploy.

import type { EcfTipoCatalogo, EcfModificationCode } from '@/shared/api/types'

/** Tipos de comprobante electrónico (e-CF) habilitables en /config/ecf.tiposElectronicos. */
export const ECF_TIPOS = [
  { typeId: '31', label: 'Crédito Fiscal', descripcion: 'Factura de Crédito Fiscal Electrónica' },
  { typeId: '32', label: 'Consumo', descripcion: 'Factura de Consumo Electrónica' },
  { typeId: '33', label: 'Nota Débito', descripcion: 'Nota de Débito Electrónica' },
  { typeId: '34', label: 'Nota Crédito', descripcion: 'Nota de Crédito Electrónica' },
  { typeId: '41', label: 'Compras', descripcion: 'Comprobante Electrónico de Compras' },
  { typeId: '43', label: 'Gastos Menores', descripcion: 'Comprobante Electrónico para Gastos Menores' },
  { typeId: '44', label: 'Reg. Especiales', descripcion: 'Comprobante para Regímenes Especiales' },
  { typeId: '45', label: 'Gubernamental', descripcion: 'Comprobante Gubernamental Electrónico' },
  { typeId: '46', label: 'Exportaciones', descripcion: 'Comprobante para Exportaciones Electrónico' },
  { typeId: '47', label: 'Pagos Exterior', descripcion: 'Comprobante para Pagos al Exterior Electrónico' },
] as const

export type EcfTipoId = (typeof ECF_TIPOS)[number]['typeId']

export const TIPO_PAGO_DEFAULT_OPTIONS = [
  { value: 1, label: 'Contado' },
  { value: 2, label: 'Crédito' },
  { value: 3, label: 'Gratuito' },
] as const

export const TIPO_INGRESOS_DEFAULT_OPTIONS = [
  { value: '01', label: 'Habituales' },
  { value: '02', label: 'Financieros' },
  { value: '03', label: 'Extraordinarios' },
  { value: '04', label: 'Arrendamientos' },
  { value: '05', label: 'Venta de activo' },
  { value: '06', label: 'Otros' },
] as const

/** Las 62 unidades de medida de la DGII, usadas por el selector "Código DGII" de UOM. */
export const DGII_UOM_CODES = [
  { codigo: '1', abreviatura: 'BARR', medida: 'Barril' },
  { codigo: '2', abreviatura: 'BOL', medida: 'Bolsa' },
  { codigo: '3', abreviatura: 'BOT', medida: 'Bote' },
  { codigo: '4', abreviatura: 'BULTO', medida: 'Bultos' },
  { codigo: '5', abreviatura: 'BOTELLA', medida: 'Botella' },
  { codigo: '6', abreviatura: 'CAJ', medida: 'Caja' },
  { codigo: '7', abreviatura: 'CAJETILLA', medida: 'Cajetilla' },
  { codigo: '8', abreviatura: 'CM', medida: 'Centímetro' },
  { codigo: '9', abreviatura: 'CIL', medida: 'Cilindro' },
  { codigo: '10', abreviatura: 'CONJ', medida: 'Conjunto' },
  { codigo: '11', abreviatura: 'CONT', medida: 'Contenedor' },
  { codigo: '12', abreviatura: 'DÍA', medida: 'Día' },
  { codigo: '13', abreviatura: 'DOC', medida: 'Docena' },
  { codigo: '14', abreviatura: 'FARD', medida: 'Fardo' },
  { codigo: '15', abreviatura: 'GL', medida: 'Galones' },
  { codigo: '16', abreviatura: 'GRAD', medida: 'Grado' },
  { codigo: '17', abreviatura: 'GR', medida: 'Gramo' },
  { codigo: '18', abreviatura: 'GRAN', medida: 'Granel' },
  { codigo: '19', abreviatura: 'HOR', medida: 'Hora' },
  { codigo: '20', abreviatura: 'HUAC', medida: 'Huacal' },
  { codigo: '21', abreviatura: 'KG', medida: 'Kilogramo' },
  { codigo: '22', abreviatura: 'kWh', medida: 'Kilovatio Hora' },
  { codigo: '23', abreviatura: 'LB', medida: 'Libra' },
  { codigo: '24', abreviatura: 'LITRO', medida: 'Litro' },
  { codigo: '25', abreviatura: 'LOT', medida: 'Lote' },
  { codigo: '26', abreviatura: 'M', medida: 'Metro' },
  { codigo: '27', abreviatura: 'M2', medida: 'Metro Cuadrado' },
  { codigo: '28', abreviatura: 'M3', medida: 'Metro Cúbico' },
  { codigo: '29', abreviatura: 'MMBTU', medida: 'Millones de Unidades Térmicas' },
  { codigo: '30', abreviatura: 'MIN', medida: 'Minuto' },
  { codigo: '31', abreviatura: 'PAQ', medida: 'Paquete' },
  { codigo: '32', abreviatura: 'PAR', medida: 'Par' },
  { codigo: '33', abreviatura: 'PIE', medida: 'Pie' },
  { codigo: '34', abreviatura: 'PZA', medida: 'Pieza' },
  { codigo: '35', abreviatura: 'ROL', medida: 'Rollo' },
  { codigo: '36', abreviatura: 'SOBR', medida: 'Sobre' },
  { codigo: '37', abreviatura: 'SEG', medida: 'Segundo' },
  { codigo: '38', abreviatura: 'TANQUE', medida: 'Tanque' },
  { codigo: '39', abreviatura: 'TONE', medida: 'Tonelada' },
  { codigo: '40', abreviatura: 'TUB', medida: 'Tubo' },
  { codigo: '41', abreviatura: 'YD', medida: 'Yarda' },
  { codigo: '42', abreviatura: 'YD2', medida: 'Yarda Cuadrada' },
  { codigo: '43', abreviatura: 'UND', medida: 'Unidad' },
  { codigo: '44', abreviatura: 'EA', medida: 'Elemento' },
  { codigo: '45', abreviatura: 'MILLAR', medida: 'Millar' },
  { codigo: '46', abreviatura: 'SAC', medida: 'Saco' },
  { codigo: '47', abreviatura: 'LAT', medida: 'Lata' },
  { codigo: '48', abreviatura: 'DIS', medida: 'Display' },
  { codigo: '49', abreviatura: 'BID', medida: 'Bidón' },
  { codigo: '50', abreviatura: 'RAC', medida: 'Ración' },
  { codigo: '51', abreviatura: 'Q', medida: 'Quintal' },
  { codigo: '52', abreviatura: 'GRT', medida: 'Toneladas de registro bruto' },
  { codigo: '53', abreviatura: 'P2', medida: 'Pie cuadrado' },
  { codigo: '54', abreviatura: 'PAX', medida: 'Pasajero' },
  { codigo: '55', abreviatura: 'PULG', medida: 'Pulgadas' },
  { codigo: '56', abreviatura: 'STAY', medida: 'Parqueo barcos en muelle' },
  { codigo: '57', abreviatura: 'BDJ', medida: 'Bandeja' },
  { codigo: '58', abreviatura: 'HA', medida: 'Hectárea' },
  { codigo: '59', abreviatura: 'ML', medida: 'Mililitro' },
  { codigo: '60', abreviatura: 'MG', medida: 'Miligramo' },
  { codigo: '61', abreviatura: 'OZ', medida: 'Onzas' },
  { codigo: '62', abreviatura: 'OZT', medida: 'Onzas Troy' },
] as const

export function dgiiUomLabel(codigo: string): string {
  const entry = DGII_UOM_CODES.find((c) => c.codigo === codigo)
  return entry ? `${entry.codigo} — ${entry.abreviatura} — ${entry.medida}` : codigo
}

/** Ambientes de emisión e-CF (Aura). */
export const ECF_ENV_LABELS: Record<string, string> = {
  TesteCF: 'Pruebas (TesteCF)',
  CerteCF: 'Certificación (CerteCF)',
  eCF: 'Producción (eCF)',
}

/** Chip corto de ambiente para la bandeja/detalle. `null` si es producción (no se muestra chip). */
export function ecfEnvChip(env?: string | null): { label: string; className: string } | null {
  switch (env) {
    case 'TesteCF':
      return { label: 'Pruebas', className: 'badge-info' }
    case 'CerteCF':
      return { label: 'Certificación', className: 'badge-warning' }
    default:
      return null
  }
}

/** ¿Ofrecer el botón "Refrescar estado"? Sí en estados no terminales, y también en NOT_FOUND
 *  (terminal, pero cuya acción principal es reconsultar a la DGII — ver documento #53 §2).
 *  `esTerminal` viene de `flujo.esTerminal` (autoridad del BFF). */
export function ecfPuedeRefrescar(status: string | null | undefined, esTerminal: boolean): boolean {
  if (status?.toUpperCase() === 'NOT_FOUND') return true
  return !esTerminal
}

/** Label legible de un typeId de e-CF (ej. "31" → "31 — Crédito Fiscal"). */
export function ecfTipoLabel(typeId: string): string {
  const entry = ECF_TIPOS.find((t) => t.typeId === typeId)
  return entry ? `${entry.typeId} — ${entry.label}` : typeId
}

/** Códigos de modificación DGII (Tabla VI) para Notas de Crédito/Débito electrónicas.
 *  El copy en español es el que ve el usuario — nunca se muestra el número solo. */
export const ECF_MODIFICATION_CODES: { code: EcfModificationCode; label: string; comun: boolean }[] = [
  { code: 1, label: 'Devolución total de productos', comun: true },
  { code: 2, label: 'Corrección de texto / datos', comun: true },
  { code: 3, label: 'Corrección de montos', comun: true },
  { code: 4, label: 'Reemplazo por contingencia', comun: false },
  { code: 5, label: 'Referencia a Factura de Consumo', comun: false },
]

export function ecfModificationCodeLabel(code: number): string {
  return ECF_MODIFICATION_CODES.find((c) => c.code === code)?.label ?? String(code)
}

/** true si el tipo (por typeId de e-CF, ej. "34" para B04) ya está habilitado para emitirse
 *  como e-CF en el tenant — según el catálogo de GET /config/ecf/tipos. */
export function ecfTipoElectronicoHabilitado(
  tipos: EcfTipoCatalogo[] | undefined,
  typeId: string,
): boolean {
  return tipos?.find((t) => t.typeId === typeId)?.electronico ?? false
}

// ─── Estado DGII de un voucher e-CF ───────────────────────────────────────────
// Aplica igual a e-CF emitidos (facturas/compras/gastos) y recibidos de terceros.

const ECF_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Enviado a la DGII, esperando confirmación',
  SIGNED: 'Firmado, pendiente de envío a la DGII',
  IN_PROCESS: 'En proceso en la DGII',
  ACCEPTED: 'Aceptado por la DGII',
  APPROVED: 'Aceptado por la DGII',
  CONDITIONAL: 'Aceptado con observaciones por la DGII',
  REJECTED: 'Rechazado por la DGII',
  NOT_FOUND: 'No encontrado en la DGII',
  WAITING_DEFERRED: 'En espera (modo contingencia)',
  VOIDED: 'Anulado',
  FAILED: 'Falló el envío a la DGII',
}

export function ecfStatusLabel(status?: string | null): string {
  if (!status) return '—'
  return ECF_STATUS_LABELS[status.toUpperCase()] ?? status
}

/** Badge sugerido para el estado DGII. */
export function ecfStatusBadge(status?: string | null): string {
  switch (status?.toUpperCase()) {
    case 'ACCEPTED':
    case 'APPROVED':
      return 'badge-success'
    case 'CONDITIONAL':
    case 'PENDING':
    case 'SIGNED':
    case 'IN_PROCESS':
      return 'badge-warning'
    case 'WAITING_DEFERRED':
      return 'badge-info'
    case 'REJECTED':
    case 'FAILED':
    case 'NOT_FOUND':
      return 'badge-error'
    case 'VOIDED':
      return 'badge-neutral'
    default:
      return 'badge-neutral'
  }
}

// ─── e-CF recibidos: conciliación con Purchase Invoice ────────────────────────

export function ecfConciliacionLabel(c?: string | null): string {
  switch (c) {
    case 'CONCILIADO': return 'Conciliado'
    case 'UNICO': return 'Candidata encontrada'
    case 'MULTIPLE': return 'Varias candidatas'
    case 'NINGUNO': return 'Sin candidata'
    default: return c ?? '—'
  }
}

export function ecfConciliacionBadge(c?: string | null): string {
  switch (c) {
    case 'CONCILIADO': return 'badge-success'
    case 'UNICO': return 'badge-warning'
    case 'MULTIPLE': return 'badge-error'
    default: return 'badge-neutral'
  }
}

// ─── e-CF recibidos: aprobación comercial (ACECF) ─────────────────────────────

export function acecfStatusLabel(s?: string | null): string {
  switch (s) {
    case 'ACCEPTED': return 'Aceptado comercialmente'
    case 'REJECTED': return 'Rechazado comercialmente'
    default: return 'Pendiente de aprobación'
  }
}

export function acecfBadge(s?: string | null): string {
  switch (s) {
    case 'ACCEPTED': return 'badge-success'
    case 'REJECTED': return 'badge-error'
    default: return 'badge-warning'
  }
}

/** Urgencia de un e-CF firmado en diferido (contingencia) según sus horas. Límite legal: 72h. */
export function ecfDiferidoUrgencia(horas: number): { label: string; tone: 'error' | 'warn' | 'neutral' } {
  if (horas >= 48) return { label: `Crítico — ${Math.round(horas)}h (límite legal 72h)`, tone: 'error' }
  if (horas >= 24) return { label: `Urgente — ${Math.round(horas)}h`, tone: 'warn' }
  return { label: `${Math.round(horas)}h en diferido`, tone: 'neutral' }
}

/** Urgencia de la ventana legal para decidir ACECF. `tone`: 'error' | 'warn' | 'neutral'. */
export function ecfSlaUrgencia(slaVenceEn?: string | null): { label: string; tone: 'error' | 'warn' | 'neutral' } {
  if (!slaVenceEn) return { label: 'Sin fecha límite', tone: 'neutral' }
  const vence = new Date(slaVenceEn)
  const ahora = new Date()
  const ms = vence.getTime() - ahora.getTime()
  const dias = Math.ceil(ms / 86_400_000)
  const fecha = vence.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
  if (ms <= 0) return { label: `Venció el ${fecha}`, tone: 'error' }
  if (dias <= 1) return { label: 'Vence hoy', tone: 'error' }
  if (dias <= 3) return { label: `Vence en ${dias} días (${fecha})`, tone: 'warn' }
  return { label: `Vence el ${fecha}`, tone: 'neutral' }
}
