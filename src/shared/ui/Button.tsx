import { type ComponentPropsWithoutRef, type ReactNode, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

interface ButtonOwnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export type ButtonProps = ButtonOwnProps & ComponentPropsWithoutRef<'button'>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, children, disabled, className = '', ...props },
  ref,
) {
  const cls = [
    'btn',
    `btn-${variant}`,
    `btn-size-${size}`,
    loading ? 'btn-loading' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button ref={ref} className={cls} disabled={disabled ?? loading} {...props}>
      {loading
        ? <span className="spinner spinner-white spinner-sm" aria-hidden="true" />
        : leftIcon && <span aria-hidden="true">{leftIcon}</span>}
      {children}
      {!loading && rightIcon && <span aria-hidden="true">{rightIcon}</span>}
    </button>
  )
})
