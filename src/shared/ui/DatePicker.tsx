/**
 * DatePicker
 * ----------
 * Reemplazo de `<input type="date">` que evita el selector nativo del
 * navegador — usa el Calendar de shadcn/ui (react-day-picker) dentro de un
 * dropdown flotante, siguiendo el mismo patrón de portal que `SearchSelect`.
 *
 * Value/onChange trabajan con el mismo formato ISO 'yyyy-MM-dd' que ya usa
 * el resto de la app (equivalente al `value`/`e.target.value` de un input
 * nativo de fecha), para que reemplazar los usos existentes sea mecánico.
 */

import { useRef } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import type { Matcher } from 'react-day-picker'
import { Calendar } from '@/components/ui/calendar'
import { FloatingPortal, useFloatingDropdown } from '@/lib/useFloatingPortal'
import { formatDate } from '@/lib/formatters'

export interface DatePickerProps {
  /** Fecha en formato ISO 'yyyy-MM-dd', o '' si no hay selección */
  value: string
  /** Recibe la nueva fecha en formato ISO 'yyyy-MM-dd', o '' al limpiar */
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  error?: boolean
  /** Clase del trigger — por defecto imita un `ff-input`. Pasa 'filter-select' o 'items-input' para otros contextos. */
  className?: string
  /** Fecha mínima seleccionable, formato ISO 'yyyy-MM-dd' */
  min?: string
  /** Fecha máxima seleccionable, formato ISO 'yyyy-MM-dd' */
  max?: string
  /** Muestra un botón para limpiar la selección (default: false) */
  clearable?: boolean
  style?: React.CSSProperties
}

function toDate(iso?: string): Date | undefined {
  if (!iso) return undefined
  const d = parseISO(iso)
  return isValid(d) ? d : undefined
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = 'dd/mm/aaaa',
  disabled = false,
  error = false,
  className = 'ff-input',
  min,
  max,
  clearable = false,
  style,
}: DatePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { open, style: dropdownStyle, openDropdown, close, portalRef } = useFloatingDropdown(
    triggerRef as React.RefObject<HTMLElement>,
    undefined,
    { align: 'center', matchWidth: false },
  )

  const selected = toDate(value)
  const minDate = toDate(min)
  const maxDate = toDate(max)

  const disabledMatchers: Matcher[] = []
  if (minDate) disabledMatchers.push({ before: minDate })
  if (maxDate) disabledMatchers.push({ after: maxDate })

  function handleSelect(date: Date | undefined) {
    onChange(date ? format(date, 'yyyy-MM-dd') : '')
    close()
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
  }

  const triggerCls = [
    className,
    'date-trigger',
    error ? 'date-trigger--error' : '',
  ].filter(Boolean).join(' ')

  return (
    <div style={{ position: 'relative', ...style }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={triggerCls}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openDropdown())}
      >
        <CalendarIcon size={14} className="date-trigger-icon" aria-hidden="true" />
        <span className={`date-trigger-text${value ? '' : ' date-trigger-placeholder'}`}>
          {value ? formatDate(value) : placeholder}
        </span>
        {clearable && value && !disabled && (
          <span className="date-trigger-clear" onClick={handleClear} role="button" aria-label="Limpiar fecha">
            <X size={11} aria-hidden="true" />
          </span>
        )}
      </button>

      <FloatingPortal open={open} style={dropdownStyle} portalRef={portalRef}>
        <div className="date-picker-dropdown">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate ?? new Date()}
            onSelect={handleSelect}
            disabled={disabledMatchers.length ? disabledMatchers : undefined}
            startMonth={minDate}
            endMonth={maxDate}
          />
        </div>
      </FloatingPortal>
    </div>
  )
}
