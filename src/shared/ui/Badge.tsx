import { type ComponentPropsWithoutRef, type ReactNode } from 'react'

export type BadgeVariant =
  | 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'
  | 'draft' | 'submitted' | 'cancelled' | 'ordered' | 'lost'
  | 'in-stock' | 'low-stock' | 'out-stock'

interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  variant?: BadgeVariant
  dot?: boolean
  children: ReactNode
}

const variantClass: Record<BadgeVariant, string> = {
  default: 'badge-default',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
  neutral: 'badge-neutral',
  brand: 'badge-brand',
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
  ordered: 'badge-ordered',
  lost: 'badge-lost',
  'in-stock': 'badge-in-stock',
  'low-stock': 'badge-low-stock',
  'out-stock': 'badge-out-stock',
}

export function Badge({ variant = 'default', dot = false, children, className = '', ...props }: BadgeProps) {
  const cls = ['badge', variantClass[variant], className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...props}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
