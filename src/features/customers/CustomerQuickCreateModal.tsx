import type { Customer } from '@/shared/api/types'
import { CustomerFormPanel } from './CustomerFormPanel'

interface CustomerQuickCreateModalProps {
  onCreated: (customer: Customer) => void
  onClose: () => void
}

export function CustomerQuickCreateModal({ onCreated, onClose }: CustomerQuickCreateModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Nuevo Cliente</h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <CustomerFormPanel
            onSuccess={onCreated}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
