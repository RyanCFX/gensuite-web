import type { FeatureAdicional } from './types'

/**
 * Lógica pura del acceso adicional ("features adicionales por usuario") —
 * docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md §2–§4.
 *
 * A propósito sin imports de stores/React: se prueba con node compilando este archivo solo
 * (ver scripts/e2e-features-adicionales.mjs). Reglas que fija:
 * - `featuresAdicionales`/`componentesAdicionales` son SOLO decoración de UI (§9: nunca acceso).
 * - Aviso de vencimiento (§4.2): `expiraEn` no null y faltan ≤ 7 días; < 24 h = urgencia.
 * - `details.origenPosible === "adicional"` (§2.4/§5): el acceso venció o fue retirado.
 */

// ─── Nombres legibles por clave de feature (para el mensaje de §5 cuando el backend no ──
// manda el `nombre`: `featuresFaltantes[0]` trae solo la clave). No es catálogo de acceso:
// solo presentación del mensaje de error.
export const NOMBRES_MODULOS: Record<string, string> = {
  compras: 'Compras',
  comprasOrdenes: 'Órdenes de compra',
  comprasSolicitudes: 'Solicitudes de compra',
  devolucionesCompras: 'Devoluciones de compras',
  gastos: 'Gastos',
  proveedores: 'Proveedores',
  caja: 'Caja',
  contabilidad: 'Contabilidad',
  cuentasPorCobrar: 'Cuentas por cobrar',
  cuentasPorPagar: 'Cuentas por pagar',
  tesoreria: 'Tesorería',
  inventario: 'Inventario',
  productos: 'Productos',
  servicios: 'Servicios',
  relacionesComerciales: 'Relaciones comerciales',
  cotizaciones: 'Cotizaciones',
  despacho: 'Despacho',
  devoluciones: 'Devoluciones',
  notasCredito: 'Notas de crédito',
  notasDebito: 'Notas de débito',
  pedidos: 'Pedidos',
}

/** Nombre legible de un módulo a partir de su clave (fallback: la clave tal cual). */
export function nombreModulo(key: string | undefined | null): string {
  if (!key) return 'el módulo'
  return NOMBRES_MODULOS[key] ?? key
}

/** ¿La `key` de feature figura como adicional? Solo para decorar la UI (§9: nunca acceso). */
export function esFeatureAdicional(
  key: string | null | undefined,
  adicionales: readonly FeatureAdicional[] | null | undefined,
): boolean {
  if (!key || !adicionales) return false
  return adicionales.some((a) => a.key === key)
}

/** Entrada adicional para una `key`, o `undefined`. */
export function adicionalDe(
  key: string | null | undefined,
  adicionales: readonly FeatureAdicional[] | null | undefined,
): FeatureAdicional | undefined {
  if (!key || !adicionales) return undefined
  return adicionales.find((a) => a.key === key)
}

/** Ms restantes hasta `expiraEn` (ISO). `null` = sin vencimiento o ISO inválido. */
export function msRestantes(expiraEn: string | null | undefined, ahora: number = Date.now()): number | null {
  if (!expiraEn) return null
  const t = Date.parse(expiraEn)
  if (Number.isNaN(t)) return null
  return t - ahora
}

/** Días (fraccionales) restantes. `null` = sin vencimiento. */
export function diasRestantes(expiraEn: string | null | undefined, ahora: number = Date.now()): number | null {
  const ms = msRestantes(expiraEn, ahora)
  return ms === null ? null : ms / 86_400_000
}

const UMBRAL_AVISO_MS = 7 * 86_400_000
const UMBRAL_URGENCIA_MS = 24 * 3_600_000

/** ¿Mostrar el aviso de vencimiento (§4.2)? `expiraEn` no null y faltan ≤ 7 días (incluye ya vencido). */
export function debeAvisarVencimiento(
  expiraEn: string | null | undefined,
  ahora: number = Date.now(),
): boolean {
  const ms = msRestantes(expiraEn, ahora)
  return ms !== null && ms <= UMBRAL_AVISO_MS
}

/** ¿Tono de urgencia (§4.2)? Faltan < 24 h (incluye ya vencido). */
export function esVencimientoUrgente(
  expiraEn: string | null | undefined,
  ahora: number = Date.now(),
): boolean {
  const ms = msRestantes(expiraEn, ahora)
  return ms !== null && ms < UMBRAL_URGENCIA_MS
}

/** Adicionales que deben mostrar aviso (≤ 7 días), ordenados por vencimiento. */
export function adicionalesPorVencer(
  adicionales: readonly FeatureAdicional[] | null | undefined,
  ahora: number = Date.now(),
): FeatureAdicional[] {
  if (!adicionales) return []
  return adicionales
    .filter((a) => debeAvisarVencimiento(a.expiraEn, ahora))
    .sort((a, b) => Date.parse(a.expiraEn as string) - Date.parse(b.expiraEn as string))
}

/** Fecha legible en la zona horaria del usuario (§4.2: `expiraEn` ISO + TZ local). */
export function formatearVencimiento(expiraEn: string | null | undefined, timeZone?: string): string {
  if (!expiraEn) return ''
  const t = Date.parse(expiraEn)
  if (Number.isNaN(t)) return ''
  try {
    return new Intl.DateTimeFormat('es-DO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(t))
  } catch {
    return new Date(t).toLocaleDateString('es-DO')
  }
}

/** Texto del aviso de vencimiento (§4.2). */
export function textoAvisoVencimiento(a: Pick<FeatureAdicional, 'nombre' | 'expiraEn'>, timeZone?: string): string {
  return `Tu acceso adicional a ${a.nombre} vence el ${formatearVencimiento(a.expiraEn, timeZone)}. Contactá a GenSuite para renovarlo.`
}

/** ¿El `details` de un 403 FEATURE_NO_CONTRATADO trae la pista de acceso adicional (§2.4)? */
export function esOrigenAdicional(details: unknown): boolean {
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as Record<string, unknown>).origenPosible === 'adicional'
  )
}

/** Claves faltantes del `details` (defensivo: siempre array). */
export function featuresFaltantesDe(details: unknown): string[] {
  if (typeof details !== 'object' || details === null) return []
  const v = (details as Record<string, unknown>).featuresFaltantes
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Mensaje del caso §5 (venció o fue retirado). Usa `featuresFaltantes[0]` para el nombre. */
export function mensajeAccesoAdicionalVencido(details: unknown): string {
  const [primera] = featuresFaltantesDe(details)
  return `Tu acceso adicional a ${nombreModulo(primera)} venció o fue retirado. Contactá a GenSuite.`
}

/** Mensaje estándar del "no contratado" de siempre (§5, sin `origenPosible`). */
export const MENSAJE_NO_CONTRATADO = 'Este módulo no está incluido en el plan de tu empresa.'

/** Mensaje estándar cuando el tenant contrató el módulo después (§5: manda el administrador). */
export const MENSAJE_PERMISO_ADMIN =
  'No tenés permiso. Pedí acceso al administrador de tu empresa.'
