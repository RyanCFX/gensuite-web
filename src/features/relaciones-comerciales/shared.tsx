import { Loader2 } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/shared/ui/Badge'
import type {
  EstadoRelacionComercialListado,
  EstadoInvitacionRelacion,
  MaestrosLocalesRelacion,
} from '@/shared/api/types'

// ─── Badges de estado ───────────────────────────────────────────────────────
// `StatusBadge` (@/components/shared/StatusBadge) es solo para documentos ERP (Draft/Submitted/…)
// — los estados de este módulo usan `Badge` directo con un mapa local, según el prompt.

const RELACION_VARIANT: Record<EstadoRelacionComercialListado, BadgeVariant> = {
  activa: 'success',
  invitada: 'warning',
  activando: 'warning',
  rechazada: 'error',
  revocada: 'error',
  suspendida: 'neutral',
}

const RELACION_LABEL: Record<EstadoRelacionComercialListado, string> = {
  activa: 'Activa',
  invitada: 'Invitada',
  activando: 'Activando',
  rechazada: 'Rechazada',
  revocada: 'Revocada',
  suspendida: 'Suspendida',
}

/** `activando` es un estado derivado (nunca un valor real del enum del backend) que representa
 *  "la invitación se aceptó, los espejos Customer/Supplier se están creando ahora mismo" — se
 *  muestra como carga (spinner), nunca como error. */
export function EstadoRelacionBadge({ status }: { status: EstadoRelacionComercialListado }) {
  return (
    <Badge variant={RELACION_VARIANT[status]}>
      {status === 'activando' && <Loader2 size={11} className="spin" style={{ marginRight: 4 }} aria-hidden="true" />}
      {RELACION_LABEL[status]}
    </Badge>
  )
}

const INVITACION_VARIANT: Record<EstadoInvitacionRelacion, BadgeVariant> = {
  pendiente: 'warning',
  aceptada: 'success',
  rechazada: 'error',
  cancelada: 'error',
  expirada: 'neutral',
}

const INVITACION_LABEL: Record<EstadoInvitacionRelacion, string> = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
}

export function EstadoInvitacionBadge({ status }: { status: EstadoInvitacionRelacion }) {
  return <Badge variant={INVITACION_VARIANT[status]}>{INVITACION_LABEL[status]}</Badge>
}

// ─── Aviso de adopción de maestros locales ──────────────────────────────────
// Mismo texto en 3 lugares (Fase 03 §6 / Fase 04): directorio del wizard (paso 1 y 3), modal de
// "Aceptar invitación" y (fase 05, ya cubierto en RelacionDetail) — debe mostrarse SIEMPRE antes
// de que el usuario pueda confirmar la acción, nunca después.

export function AvisoAdopcionMaestros({ maestrosLocales }: { maestrosLocales?: MaestrosLocalesRelacion | null }) {
  if (!maestrosLocales) return null
  const avisos: string[] = []

  if (maestrosLocales.customer) {
    avisos.push(`Ya tiene a esta empresa como cliente (${maestrosLocales.customer.nombre}). Se usará ese registro; no se creará uno nuevo.`)
  }
  if (maestrosLocales.supplier) {
    avisos.push(`Ya tiene a esta empresa como proveedor (${maestrosLocales.supplier.nombre}). Se usará ese registro; no se creará uno nuevo.`)
  }
  if (maestrosLocales.duplicados?.customer) {
    avisos.push('Tiene más de un cliente con este RNC — al activar la relación deberá elegir cuál usar.')
  }
  if (maestrosLocales.duplicados?.supplier) {
    avisos.push('Tiene más de un proveedor con este RNC — al activar la relación deberá elegir cuál usar.')
  }

  if (avisos.length === 0) return null

  return (
    <div className="inline-alert inline-alert-info" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {avisos.map((texto) => <span key={texto}>{texto}</span>)}
    </div>
  )
}
