import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** 'md' (default, 420px) para filtros secundarios; 'lg' (720px) cuando el contenido es una
   *  tabla u otra vista que necesita más espacio horizontal. */
  size?: 'md' | 'lg'
  /** Sobrescribe el max-width del panel (ej. 300) cuando 'size' no ajusta lo suficiente. */
  width?: number | string
}

// Panel lateral derecho reutilizable — usado, por ejemplo, para agrupar filtros secundarios
// que no caben en la barra de filtros principal sin saturarla.
export function Drawer({ open, onClose, title, subtitle, children, footer, size = 'md', width }: DrawerProps) {
  if (!open) return null
  // Portal a document.body (mismo patrón que Modal): si se renderiza inline, cualquier ancestro
  // con stacking context propio (o que atrape `position: fixed`) deja el overlay/drawer por
  // debajo del topbar — el fondo oscuro no cubre el header y el panel queda recortado.
  return createPortal(
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className={`drawer-panel${size === 'lg' ? ' drawer-panel-lg' : ''}`}
        style={width !== undefined ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body" style={{ flex: 1 }}>
          {children}
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
