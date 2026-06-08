import { useState } from 'react'
import { ConfirmModal } from '@/shared/ui/Modal'
import { Download, X, CheckCircle, Edit } from 'lucide-react'

interface DocumentActionsProps {
  status: 'Draft' | 'Submitted' | 'Cancelled'
  onSubmit?: () => void
  onCancel?: () => void
  onAmend?: () => void
  onDelete?: () => void
  onDownloadPdf?: () => void
  hasPdf?: boolean
  isLoading?: boolean
  docType?: 'invoices' | 'compras' | 'gastos' | 'quotations'
}

const SUBMIT_MESSAGES: Record<string, string> = {
  invoices: 'Esta acción asigna el NCF y registra los asientos contables. No se puede editar directamente después.',
  compras: 'Esta acción registra la compra en contabilidad y actualiza el inventario.',
  gastos: 'Esta acción registra el gasto en contabilidad. Asegúrate de que los campos 606 estén completos.',
  quotations: 'Esta acción confirma la cotización como Submitted.',
}

const CANCEL_MESSAGES: Record<string, string> = {
  invoices: 'Cancelar esta factura cancela el NCF asignado. Para emitir una nueva, usa "Enmendar" luego.',
  compras: 'Cancelar esta compra revierte el movimiento de inventario y los asientos contables.',
  gastos: 'Cancelar este gasto revierte los asientos contables.',
}

export function DocumentActions({
  status, onSubmit, onCancel, onAmend, onDelete, onDownloadPdf,
  hasPdf, isLoading, docType = 'invoices',
}: DocumentActionsProps) {
  const [showSubmit, setShowSubmit] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  if (status === 'Draft') {
    return (
      <>
        <div className="doc-actions-bar">
          {onSubmit && (
            <button className="btn btn-primary btn-size-sm" onClick={() => setShowSubmit(true)} disabled={isLoading}>
              <CheckCircle size={13} aria-hidden="true" />
              Someter
            </button>
          )}
          {onDelete && (
            <button className="btn btn-danger btn-size-sm" onClick={() => setShowDelete(true)} disabled={isLoading}>
              <X size={13} aria-hidden="true" />
              Eliminar
            </button>
          )}
        </div>

        <ConfirmModal
          open={showSubmit}
          onClose={() => setShowSubmit(false)}
          onConfirm={() => { setShowSubmit(false); onSubmit?.() }}
          title="¿Someter documento?"
          description={SUBMIT_MESSAGES[docType] ?? 'Esta acción no se puede deshacer directamente.'}
          confirmLabel="Someter"
          variant="default"
          loading={isLoading}
        />
        <ConfirmModal
          open={showDelete}
          onClose={() => setShowDelete(false)}
          onConfirm={() => { setShowDelete(false); onDelete?.() }}
          title="¿Eliminar borrador?"
          description="Se eliminará el borrador permanentemente. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          variant="danger"
          loading={isLoading}
        />
      </>
    )
  }

  if (status === 'Submitted') {
    return (
      <>
        <div className="doc-actions-bar">
          {hasPdf && onDownloadPdf && (
            <button className="btn btn-secondary btn-size-sm" onClick={onDownloadPdf}>
              <Download size={13} aria-hidden="true" />
              Descargar PDF
            </button>
          )}
          {onCancel && (
            <button className="btn btn-ghost btn-size-sm" onClick={() => setShowCancel(true)} disabled={isLoading}>
              <X size={13} aria-hidden="true" />
              Cancelar
            </button>
          )}
        </div>
        <ConfirmModal
          open={showCancel}
          onClose={() => setShowCancel(false)}
          onConfirm={() => { setShowCancel(false); onCancel?.() }}
          title="¿Cancelar documento?"
          description={CANCEL_MESSAGES[docType] ?? 'Esta acción cancela el comprobante fiscal.'}
          confirmLabel="Cancelar documento"
          variant="danger"
          loading={isLoading}
        />
      </>
    )
  }

  if (status === 'Cancelled') {
    return (
      <div className="doc-actions-bar">
        {onAmend && (
          <button className="btn btn-secondary btn-size-sm" onClick={onAmend} disabled={isLoading}>
            <Edit size={13} aria-hidden="true" />
            Enmendar
          </button>
        )}
      </div>
    )
  }

  return null
}
