import * as React from 'react'

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

const variantClass: Record<BadgeVariant, string> = {
  default: 'badge-default',
  secondary: 'badge-secondary',
  outline: 'badge-outline',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <div className={`badge ${variantClass[variant]} ${className}`} {...props}>
      {children}
    </div>
  )
}
