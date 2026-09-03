import { useUomMustBeWholeNumber } from '@/shared/hooks/useUomMustBeWholeNumber'

interface QtyInputProps {
  value: number
  onChange: (value: number) => void
  /** UOM de la línea — se resuelve contra el catálogo (GET /config/uom) para saber si acepta
   *  decimales. Si la UOM no está definida o no tiene mustBeWholeNumber, se comporta como antes. */
  uom?: string
  className?: string
  style?: React.CSSProperties
  min?: string | number
  max?: number
  disabled?: boolean
  placeholder?: string
  id?: string
}

/** Input de cantidad que respeta `mustBeWholeNumber` de la UOM de la línea — bloquea la entrada
 *  de decimales por teclado/pegado y redondea si igual llega un valor decimal (ej. from
 *  autocompletado). Cuando la UOM cambia a una que sí permite decimales, vuelve a habilitarlos
 *  automáticamente (no hay estado propio, todo se deriva de `uom` en cada render). */
export function QtyInput({ value, onChange, uom, className, style, min = '0', max, disabled, placeholder, id }: QtyInputProps) {
  const wholeNumber = useUomMustBeWholeNumber(uom)

  return (
    <input
      id={id}
      className={className}
      style={style}
      type="number"
      min={min}
      max={max}
      step={wholeNumber ? '1' : '0.001'}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onKeyDown={(e) => {
        if (wholeNumber && (e.key === '.' || e.key === ',')) e.preventDefault()
      }}
      onPaste={(e) => {
        if (!wholeNumber) return
        const text = e.clipboardData.getData('text')
        if (/[.,]/.test(text)) {
          e.preventDefault()
          const parsed = parseFloat(text.replace(',', '.'))
          if (!Number.isNaN(parsed)) onChange(Math.round(parsed))
        }
      }}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value) || 0
        onChange(wholeNumber ? Math.round(parsed) : parsed)
      }}
    />
  )
}
