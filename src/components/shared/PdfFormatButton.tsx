/**
 * PdfFormatButton
 * ---------------
 * Botón "Descargar PDF" con menú desplegable para elegir el formato de impresión
 * (página completa A4/Carta/A6, o ticket POS 80mm) antes de descargar.
 * Usado en Facturas, Cobros y Compras — mismo patrón, distinto endpoint.
 */
import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { useFloatingDropdown, FloatingPortal } from '@/lib/useFloatingPortal'
import type { FormatoImpresion } from '@/shared/api/types'

const FORMATO_LABELS: Record<FormatoImpresion, string> = {
  a4: 'Página completa — A4',
  carta: 'Página completa — Carta',
  a6: 'Página completa — A6',
  pos: 'Ticket POS (80mm)',
}

const FORMATOS: FormatoImpresion[] = ['a4', 'carta', 'a6', 'pos']

export function PdfFormatButton({
  onSelect,
  loading,
  label = 'Descargar PDF',
  loadingLabel = 'Descargando…',
  icon = <Download size={14} />,
  className = 'btn btn-secondary btn-size-sm',
  formatosPermitidos,
}: {
  onSelect: (formato: FormatoImpresion) => void
  loading?: boolean
  label?: string
  loadingLabel?: string
  icon?: ReactNode
  className?: string
  /** Formatos habilitados para el tenant (config → Facturación). Si se omite, se muestran los 4. */
  formatosPermitidos?: FormatoImpresion[]
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { open, style, toggle, close, portalRef } = useFloatingDropdown(triggerRef)
  const [pending, setPending] = useState<FormatoImpresion | null>(null)

  function handleSelect(formato: FormatoImpresion) {
    setPending(formato)
    onSelect(formato)
    close()
  }

  const isLoading = loading ?? false
  const visibleFormatos = formatosPermitidos && formatosPermitidos.length > 0
    ? FORMATOS.filter((f) => formatosPermitidos.includes(f))
    : FORMATOS

  // Con 0 o 1 formato disponible no tiene sentido mostrar un dropdown —
  // el botón principal ejecuta la acción directamente con la única opción
  // (o sin `formato`, dejando que el backend use su default, si no hay ninguna).
  const hasChoice = visibleFormatos.length > 1

  function handleTriggerClick() {
    if (hasChoice) {
      toggle()
      return
    }
    const only = visibleFormatos[0]
    if (only) handleSelect(only)
    else onSelect(undefined as unknown as FormatoImpresion)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        onClick={handleTriggerClick}
        disabled={isLoading}
        aria-haspopup={hasChoice ? 'listbox' : undefined}
        aria-expanded={hasChoice ? open : undefined}
      >
        {isLoading ? (
          <>
            <span className="spinner" /> {loadingLabel}
          </>
        ) : (
          <>
            {icon} {label} {hasChoice && <ChevronDown size={12} style={{ opacity: 0.6 }} />}
          </>
        )}
      </button>

      {hasChoice && (
        <FloatingPortal open={open} style={style} portalRef={portalRef}>
          <div className="actions-menu" style={{ minWidth: 200 }}>
            {visibleFormatos.map((formato) => (
              <button
                key={formato}
                type="button"
                className="actions-item"
                onClick={() => handleSelect(formato)}
                disabled={isLoading && pending === formato}
              >
                {FORMATO_LABELS[formato]}
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </div>
  )
}
