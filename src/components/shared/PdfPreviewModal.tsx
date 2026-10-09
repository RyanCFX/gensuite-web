/**
 * PdfPreviewModal
 * ---------------
 * Modal que muestra un PDF (vía blob URL) en un <iframe>, sin forzar la descarga.
 * Usado junto a PdfFormatButton en Facturas, Cobros y Compras — mismo patrón,
 * distinto endpoint de origen.
 */
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function PdfPreviewModal({
  url,
  onClose,
}: {
  url: string | null
  onClose: () => void
}) {
  // La URL se libera con un pequeño retraso cancelable: en StrictMode (dev) React ejecuta el
  // cleanup y vuelve a montar el efecto de inmediato — revocar en seco dejaba al iframe apuntando
  // a un blob ya invalidado (ícono de página triste).
  const pendingRevoke = useRef<{ url: string; timer: number } | null>(null)
  useEffect(() => {
    if (!url) return
    if (pendingRevoke.current?.url === url) {
      window.clearTimeout(pendingRevoke.current.timer)
      pendingRevoke.current = null
    }
    return () => {
      pendingRevoke.current = { url, timer: window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
    }
  }, [url])

  if (!url) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ width: '90vw', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Vista previa del PDF</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <iframe src={url} title="Vista previa del PDF" style={{ width: '100%', height: '100%', border: 'none' }} />
        </div>
      </div>
    </div>
  )
}
