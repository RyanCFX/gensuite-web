import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { formatearTelefonoDo, normalizarTelefonoDo } from '@/lib/formatters'

/**
 * Input de teléfono DO.
 *
 * Muestra el formato visual `(XXX) XXX - XXXX` pero el `onChange` siempre entrega
 * solo dígitos (`XXXXXXXXXX`) — el valor que viaja al API nunca lleva paréntesis,
 * espacios ni guiones. Acepta en `value` dígitos o texto ya formateado (data vieja).
 *
 * Usa `type="tel"` (HTML no tiene `type="phone"`) + `inputMode="tel"` para el
 * teclado numérico en móvil.
 */

interface PhoneInputOwnProps {
  /** Dígitos (`XXXXXXXXXX`) o texto con formato — se normaliza para mostrar. */
  value: string
  /** Recibe siempre solo dígitos, máx 10. */
  onChange: (digitos: string) => void
  error?: boolean
}

export type PhoneInputProps = PhoneInputOwnProps &
  Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange' | 'type'>

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, error = false, className = '', placeholder = '(829) 450 - 4950', ...props },
  ref,
) {
  const cls = ['ff-input', error ? 'ff-input-error' : '', className].filter(Boolean).join(' ')

  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      className={cls}
      placeholder={placeholder}
      maxLength={16}
      value={formatearTelefonoDo(value)}
      onChange={(e) => onChange(normalizarTelefonoDo(e.target.value))}
      {...props}
    />
  )
})
