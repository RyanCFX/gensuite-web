import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from 'react'

// ─── Input ────────────────────────────────────────────────────────────────────

interface InputOwnProps {
  error?: boolean
  size?: 'sm' | 'md'
}

export type InputProps = InputOwnProps & ComponentPropsWithoutRef<'input'>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error = false, size = 'md', className = '', ...props },
  ref,
) {
  const cls = [
    'ff-input',
    size === 'sm' ? 'ff-input-sm' : '',
    error ? 'ff-input-error' : '',
    className,
  ].filter(Boolean).join(' ')

  return <input ref={ref} className={cls} {...props} />
})

// ─── FormField ────────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}

export function FormField({ label, htmlFor, error, hint, required, children }: FormFieldProps) {
  return (
    <div className="ff-wrap">
      <label className="ff-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ff-required" aria-hidden="true">*</span>}
      </label>
      <div className="ff-input-wrap">{children}</div>
      {error && <p className="ff-error" role="alert">{error}</p>}
      {!error && hint && <p className="ff-hint">{hint}</p>}
    </div>
  )
}

// ─── FormSelect ───────────────────────────────────────────────────────────────

interface FormSelectProps extends ComponentPropsWithoutRef<'select'> {
  error?: boolean
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(function FormSelect(
  { error = false, className = '', ...props },
  ref,
) {
  const cls = ['ff-select', error ? 'ff-input-error' : '', className].filter(Boolean).join(' ')
  return <select ref={ref} className={cls} {...props} />
})

// ─── Textarea ─────────────────────────────────────────────────────────────────

interface TextareaProps extends ComponentPropsWithoutRef<'textarea'> {
  error?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error = false, className = '', ...props },
  ref,
) {
  const cls = ['ff-textarea', error ? 'ff-input-error' : '', className].filter(Boolean).join(' ')
  return <textarea ref={ref} className={cls} {...props} />
})
