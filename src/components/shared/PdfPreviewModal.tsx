/**
 * PdfPreviewModal
 * ---------------
 * Modal que muestra un PDF (vía blob URL) en un <iframe>, sin forzar la descarga.
 * Usado junto a PdfFormatButton en Facturas, Cobros y Compras — mismo patrón,
 * distinto endpoint de origen.
 */
import { useEffect } from 'react'
import { X } from 'lucide-react'

export function PdfPreviewModal({
  url,
  onClose,
}: {
  url: string | null
  onClose: () => void
}) {
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
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
