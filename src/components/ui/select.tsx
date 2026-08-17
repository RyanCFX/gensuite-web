import * as React from 'react'
import { ChevronDown, X } from 'lucide-react'
import { useFloatingDropdown, FloatingPortal } from '@/lib/useFloatingPortal'

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  children?: React.ReactNode
  disabled?: boolean
  className?: string
  /** Muestra el botón × para limpiar la selección (como en SearchSelect). Por defecto true. */
  clearable?: boolean
}

function Select({ value, onValueChange, placeholder, children, disabled, className = '', clearable = true }: SelectProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [minOptionWidth, setMinOptionWidth] = React.useState(0)
  const { open, style, toggle, close, portalRef } = useFloatingDropdown(triggerRef)

  type ItemEl = React.ReactElement<{ value: string; children: React.ReactNode }>
  const allChildren = React.Children.toArray(children) as ItemEl[]
  const selectedLabel = allChildren.find((child) => child.props?.value === value)?.props?.children ?? placeholder ?? 'Seleccionar...'

  // Mide el ancho del label más ancho entre las opciones (y el placeholder) para fijar un
  // min-width estable: así el control nunca se encoge al seleccionar una opción corta, y siempre
  // cabe el texto más largo de las opciones.
  React.useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    let max = 0
    el.querySelectorAll<HTMLSpanElement>('.select-measure-item').forEach((s) => {
      max = Math.max(max, s.offsetWidth)
    })
    // +48px de insets horizontales (padding 10×2 + gap + chevron/clear) para que el label
    // más largo nunca se corte, tanto vacío como seleccionado.
    setMinOptionWidth(max + 48)
  }, [children, placeholder])

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValueChange?.('')
    close()
  }

  const showClear = clearable && Boolean(value) && !disabled

  return (
    <div style={{ position: 'relative', minWidth: minOptionWidth ? `${minOptionWidth}px` : undefined }} className={className}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ color: value ? undefined : 'var(--text-tertiary, hsl(var(--muted-foreground)))', flex: 1, textAlign: 'left' }}>
          {selectedLabel}
        </span>
        {!showClear && (
          <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
        )}
      </button>

      {showClear && (
        <button
          type="button"
          className="select-clear"
          onClick={handleClear}
          aria-label="Limpiar selección"
          tabIndex={-1}
        >
          <X size={11} aria-hidden="true" />
        </button>
      )}

      {/* Medición invisible del ancho de las opciones (sibling, no afecta layout visible) */}
      <div ref={measureRef} className="select-measure" aria-hidden="true">
        {allChildren.map((child, i) => (
          <span className="select-measure-item" key={i}>{child.props?.children ?? ''}</span>
        ))}
        <span className="select-measure-item">{placeholder ?? 'Seleccionar...'}</span>
      </div>

      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div className="select-content">
          {React.Children.map(children, (child: any) =>
            React.cloneElement(child, {
              onClick: child.props.disabled
                ? undefined
                : () => {
                    onValueChange?.(child.props.value)
                    close()
                  },
              'data-selected': child.props.value === value ? '' : undefined,
            }),
          )}
        </div>
      </FloatingPortal>
    </div>
  )
}

function SelectTrigger({ className = '', children, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`select-trigger ${className}`} {...props}>
      {children}
    </button>
  )
}

function SelectValue({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) {
  return <>{children ?? placeholder}</>
}

function SelectContent({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`select-content ${className}`} {...props}>{children}</div>
}

function SelectItem({ className = '', children, value, disabled, style, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string; disabled?: boolean }) {
  return (
    <div
      className={`select-item ${className}`}
      role="option"
      aria-disabled={disabled}
      style={disabled ? { ...style, opacity: 0.5, cursor: 'not-allowed' } : style}
      {...props}
    >
      {children}
    </div>
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
