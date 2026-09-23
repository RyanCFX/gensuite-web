import { useRef, type ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { useFloatingDropdown, FloatingPortal } from '@/lib/useFloatingPortal'

interface FieldTooltipProps {
  children: ReactNode
  size?: number
}

// Ícono de ayuda para usar al lado de un `ff-label` — al hacer hover (o focus, para
// accesibilidad con teclado) muestra el hint del campo en un cuadro flotante. Se renderiza
// vía portal en <body> (mismo mecanismo que los dropdowns de Select/SearchSelect) para que
// nunca quede recortado por el `overflow: hidden` de `.card` u otros contenedores ancestros.
export function FieldTooltip({ children, size = 13 }: FieldTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const { open, style, openDropdown, close, portalRef } = useFloatingDropdown(anchorRef, undefined, {
    align: 'center',
    matchWidth: false,
  })

  return (
    <span
      ref={anchorRef}
      className="ff-tooltip-icon"
      tabIndex={0}
      onMouseEnter={openDropdown}
      onMouseLeave={close}
      onFocus={openDropdown}
      onBlur={close}
    >
      <HelpCircle size={size} aria-hidden="true" />
      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div className="ff-tooltip-box" role="tooltip">{children}</div>
      </FloatingPortal>
    </span>
  )
}
