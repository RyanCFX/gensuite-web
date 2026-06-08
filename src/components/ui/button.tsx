import * as React from 'react'

export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'link'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-xs'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  asChild?: boolean
}

const variantClass: Record<ButtonVariant, string> = {
  default: 'btn-primary',
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  outline: 'btn-outline',
  danger: 'btn-danger',
  link: 'btn-link',
}

const sizeClass: Record<ButtonSize, string> = {
  xs: 'btn-size-xs',
  sm: 'btn-size-sm',
  md: 'btn-size-md',
  lg: 'btn-size-lg',
  icon: 'btn-size-icon',
  'icon-sm': 'btn-size-icon-sm',
  'icon-xs': 'btn-size-icon-xs',
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...props }, ref) => {
    const cls = ['btn', variantClass[variant], sizeClass[size], loading ? 'btn-loading' : '', className]
      .filter(Boolean)
      .join(' ')

    return (
      <button ref={ref} className={cls} disabled={disabled ?? loading} {...props}>
        {loading ? (
          <span className="btn-spinner" aria-hidden="true" />
        ) : (
          children
        )}
      </button>
    )
  },
)
Button.displayName = 'Button'

export { Button }
