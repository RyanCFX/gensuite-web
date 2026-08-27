import { useState } from 'react'
import type { ComponentTracking } from '@/shared/api/types'
import { X } from 'lucide-react'
import { TrackedComponentEditor } from './TrackedComponentEditor'

export interface TrackedComponent {
  itemCode: string
  itemName?: string
  trackingType: 'serial' | 'batch'
  /** Cantidad exacta de este componente que debe quedar cubierta por seriales/lotes (qty del componente × cantidad de combos en la línea) */
  qtyNeeded: number
  /** Almacén de la línea de la factura — solo para mostrar un mensaje claro si no hay stock disponible ahí */
  warehouse?: string
}

interface ComponentTrackingModalProps {
  bundleName: string
  components: TrackedComponent[]
  initial?: ComponentTracking[]
  onConfirm: (tracking: ComponentTracking[]) => void
  onClose: () => void
  title?: string
  description?: string
  confirmLabel?: string
  allowNew?: boolean
}

export function ComponentTrackingModal({
  bundleName, components, initial, onConfirm, onClose,
  title, description, confirmLabel = 'Confirmar selección', allowNew = false,
}: ComponentTrackingModalProps) {
  const [serialsByItem, setSerialsByItem] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    for (const t of initial ?? []) if (t.serials?.length) init[t.itemCode] = t.serials
    return init
  })
  const [batchesByItem, setBatchesByItem] = useState<Record<string, { batchId: string; qty: number }[]>>(() => {
    const init: Record<string, { batchId: string; qty: number }[]> = {}
    for (const t of initial ?? []) if (t.batches?.length) init[t.itemCode] = t.batches
    return init
  })

  function isComplete(c: TrackedComponent): boolean {
    if (c.trackingType === 'serial') return (serialsByItem[c.itemCode]?.length ?? 0) === c.qtyNeeded
    const sum = (batchesByItem[c.itemCode] ?? []).reduce((s, b) => s + Number(b.qty || 0), 0)
    return sum === c.qtyNeeded && (batchesByItem[c.itemCode]?.length ?? 0) > 0
  }

  const allComplete = components.every(isComplete)

  function handleConfirm() {
    const tracking: ComponentTracking[] = components.map((c) => ({
      itemCode: c.itemCode,
      ...(c.trackingType === 'serial' ? { serials: serialsByItem[c.itemCode] ?? [] } : {}),
      ...(c.trackingType === 'batch' ? { batches: batchesByItem[c.itemCode] ?? [] } : {}),
    }))
    onConfirm(tracking)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">{title ?? `Series / Lotes del combo — ${bundleName}`}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            {description ?? 'Este combo incluye componentes con seguimiento de serial/lote. Selecciona exactamente la cantidad requerida de cada uno para poder facturarlo.'}
          </p>
          {components.map((c) => (
            <TrackedComponentEditor
              key={c.itemCode}
              component={c}
              serials={serialsByItem[c.itemCode] ?? []}
              onChangeSerials={(s) => setSerialsByItem((prev) => ({ ...prev, [c.itemCode]: s }))}
              batches={batchesByItem[c.itemCode] ?? []}
              onChangeBatches={(b) => setBatchesByItem((prev) => ({ ...prev, [c.itemCode]: b }))}
              allowNew={allowNew}
            />
          ))}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={!allComplete}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
