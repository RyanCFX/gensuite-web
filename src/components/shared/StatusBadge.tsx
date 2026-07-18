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
