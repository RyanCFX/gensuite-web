import type { Supplier } from '@/shared/api/types'
import { SupplierFormPanel } from './SupplierFormPanel'

interface SupplierQuickCreateModalProps {
  onCreated: (supplier: Supplier) => void
  onClose: () => void
}

export function SupplierQuickCreateModal({ onCreated, onClose }: SupplierQuickCreateModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Nuevo Proveedor</h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <SupplierFormPanel
            onSuccess={onCreated}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
