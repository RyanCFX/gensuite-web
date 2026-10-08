import type { CreditoEstado } from '@/shared/api/types'
import { CREDITO_ESTADO_BADGE, creditoEstadoLabel } from '@/lib/creditoVencimiento'

/**
 * Badge de estado de un crédito (nota o saldo a favor) — §3.2.
 * El estado lo calcula el backend; acá solo se mapea a badge + texto.
 * Sin estado (respuesta vieja / tenant sin configurar) no renderiza nada,
 * para que la pantalla se vea idéntica a antes (§3.1, §9).
 */
export function CreditoEstadoBadge({
  estado,
  diasRestantes,
  venceEl,
}: {
  estado?: CreditoEstado | null
  diasRestantes?: number | null
  venceEl?: string | null
}) {
  if (!estado) return null
  return (
    <span className={`badge ${CREDITO_ESTADO_BADGE[estado] ?? 'badge-neutral'}`}>
      {creditoEstadoLabel(estado, { diasRestantes, venceEl })}
    </span>
  )
}
