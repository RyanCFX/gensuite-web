import { Badge } from '@/shared/ui/Badge'
import type { BadgeVariant } from '@/shared/ui/Badge'
import { DOC_STATUS_LABELS } from '@/lib/constants'

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  Draft: 'draft',
  Submitted: 'submitted',
  Cancelled: 'cancelled',
  Ordered: 'ordered',
  Lost: 'lost',
  // Algunos BFF (ej. Gastos) devuelven el status en minúscula.
  draft: 'draft',
  submitted: 'submitted',
  cancelled: 'cancelled',
  // Estados post-sometidos de devoluciones (ruta devoluciones): mismo significado visual
  // que STATUS_BADGE/STATUS_LABEL locales de esa pantalla — centralizados aquí.
  available: 'success',
  partially_used: 'warning',
  fully_used: 'neutral',
  // erpStatus nativo de Solicitud de Compra (Material Request):
  Pending: 'warning',
  Stopped: 'lost',
  'Partially Ordered': 'info',
  // erpStatus nativo de Orden de Compra (Purchase Order):
  'On Hold': 'warning',
  'To Receive and Bill': 'info',
  'To Bill': 'info',
  'To Receive': 'info',
  Completed: 'success',
  Closed: 'neutral',
  Delivered: 'success',
}

interface StatusBadgeProps {
  status: string
  dot?: boolean
}

export function StatusBadge({ status, dot }: StatusBadgeProps) {
  const variant = STATUS_VARIANT[status] ?? 'default'
  const label = DOC_STATUS_LABELS[status] ?? status
  return <Badge variant={variant} dot={dot}>{label}</Badge>
}
