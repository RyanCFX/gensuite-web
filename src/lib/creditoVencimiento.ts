import type { ApiError, CreditoEstado } from '@/shared/api/types'

/**
 * Vencimiento y uso de notas de crédito y saldos a favor.
 * docs/tasks/PROMPT_VENCIMIENTO_SALDOS_A_FAVOR_FRONTEND.md §3 y §7.
 *
 * REGLA DE ORO (§7.1, §9): el backend decide, la UI informa. Nunca recalcular
 * estados ni «días restantes» en el cliente — usar `estado`/`puedeAplicar` tal
 * como llegan (calculados con la zona del site, America/Santo_Domingo).
 */

// ─── Fechas ───────────────────────────────────────────────────────────────────
// `venceEl` es fecha de calendario `YYYY-MM-DD` sin hora ni zona (§7.5). NO pasarla
// por `new Date()` ni `parseISO()` con formato de fecha/hora: el desfase de zona
// horaria cambia el día. Se formatea por partición directa del string.

/** `YYYY-MM-DD` → `DD/MM/AAAA`. `null`/vacío → '—'. Nunca usa `new Date()`. */
export function formatVenceEl(venceEl?: string | null): string {
  if (!venceEl) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(venceEl)
  if (!m) return venceEl
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Hoy en `YYYY-MM-DD` en hora local (para `min` de inputs date y validación blanda). */
export function todayYMD(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Estados y badges (§3.2) ──────────────────────────────────────────────────

export const CREDITO_ESTADO_BADGE: Record<CreditoEstado, string> = {
  vigente: 'badge-success',
  por_vencer: 'badge-warning',
  vencido: 'badge-error',
  perdido: 'badge-neutral',
  agotado: 'badge-neutral',
}

/** Texto del badge. En `por_vencer`/`vencido` incluye la fecha `DD/MM/AAAA`. */
export function creditoEstadoLabel(
  estado?: CreditoEstado | null,
  opts?: { diasRestantes?: number | null; venceEl?: string | null },
): string {
  if (!estado) return '—'
  switch (estado) {
    case 'vigente':
      return 'Vigente'
    case 'por_vencer': {
      const d = opts?.diasRestantes
      if (d == null) return `Vence el ${formatVenceEl(opts?.venceEl)}`
      if (d <= 0) return 'Vence hoy'
      return `Vence en ${d} día${d === 1 ? '' : 's'}`
    }
    case 'vencido':
      return `Vencida el ${formatVenceEl(opts?.venceEl)}`
    case 'perdido':
      return 'Dada de baja'
    case 'agotado':
      return 'Agotada'
    default:
      return estado
  }
}

/** Tooltip para filas deshabilitadas (§4.2). */
export function creditoNoAplicableTooltip(venceEl?: string | null): string {
  return `Vencida el ${formatVenceEl(venceEl)}. Reactive para poder usarla.`
}

// ─── Errores (§8) ────────────────────────────────────────────────────────────

function errorCode(err: unknown): string | undefined {
  return (err as ApiError | undefined)?.code
}

function errorDetails(err: unknown): Record<string, unknown> {
  const d = (err as ApiError | undefined)?.details
  return (d ?? {}) as Record<string, unknown>
}

/** `true` si el 403 admite reintento con el código de otro usuario (§6.1). */
export function esPermisoRequeridoConPin(err: unknown): boolean {
  const e = err as ApiError | undefined
  return (
    e?.statusCode === 403 &&
    e?.code === 'PERMISO_REQUERIDO' &&
    errorDetails(err).admiteAutorizacionPin === true
  )
}

/** `true` si el código del autorizador fue inválido/sin permiso/mismo usuario (§6.3). */
export function esAutorizacionInvalida(err: unknown): boolean {
  const e = err as ApiError | undefined
  return e?.statusCode === 401 && e?.code === 'AUTORIZACION_INVALIDA'
}

export function esCreditoVencidoError(err: unknown): boolean {
  const code = errorCode(err)
  return (
    (err as ApiError | undefined)?.statusCode === 409 &&
    (code === 'CREDITO_VENCIDO' || code === 'SALDO_FAVOR_VENCIDO')
  )
}

export function esUsoUnicoConsumidoError(err: unknown): boolean {
  const e = err as ApiError | undefined
  return e?.statusCode === 409 && e?.code === 'CREDITO_USO_UNICO_CONSUMIDO'
}

export function esCreditoDadoDeBajaError(err: unknown): boolean {
  const e = err as ApiError | undefined
  return e?.statusCode === 409 && e?.code === 'CREDITO_DADO_DE_BAJA'
}

/** Mensaje genérico a propósito para el modal de código (§6.3): no revela la causa. */
export const AUTORIZACION_INVALIDA_MSG = 'Código inválido o sin permiso para autorizar esta acción.'
