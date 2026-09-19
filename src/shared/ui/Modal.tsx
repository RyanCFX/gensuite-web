import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle } from 'lucide-react'

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  footer?: ReactNode
  children: ReactNode
}

export function Modal({ open, onClose, title, subtitle, size = 'md', footer, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const sizeClass = size === 'sm' ? 'modal-box-sm' : size === 'lg' ? 'modal-box-lg' : ''

  // Portal a document.body: si se renderiza inline, cualquier ancestro con una animación de
  // entrada que toque translate/transform (ej. `.card`, ver src/index.css) queda establecido
  // como containing block permanente de este `position: fixed` — el overlay termina encerrado
  // en esa tarjeta en vez de cubrir la pantalla. Mismo patrón ya usado en
  // SaldoFavorProveedorPagosSection.tsx.
  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal-box ${sizeClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  variant?: 'danger' | 'default'
  loading?: boolean
  /** Botón extra opcional entre "Cancelar" y el de confirmación, para una tercera acción. */
  secondaryAction?: { label: string; onClick: () => void }
}

export function ConfirmModal({
  open, onClose, onConfirm, title, description,
  confirmLabel = 'Confirmar', variant = 'danger', loading = false, secondaryAction,
}: ConfirmModalProps) {
  if (!open) return null

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ gap: 12, paddingTop: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <span className={`confirm-icon ${variant === 'danger' ? 'confirm-icon-danger' : 'confirm-icon-warn'}`}>
              <AlertTriangle size={20} aria-hidden="true" />
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{description}</div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary btn-size-sm" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          {secondaryAction && (
            <button className="btn btn-secondary btn-size-sm" onClick={secondaryAction.onClick} disabled={loading}>
              {secondaryAction.label}
            </button>
          )}
          <button
            className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'} btn-size-sm`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <span className="spinner spinner-white spinner-sm" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
