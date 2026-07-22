import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listSeriales, listLotes } from '@/shared/api/inventory'
import type { ComponentTracking } from '@/shared/api/types'
import { X, Plus, Trash2 } from 'lucide-react'

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
}

export function ComponentTrackingModal({
  bundleName, components, initial, onConfirm, onClose,
  title, description, confirmLabel = 'Confirmar selección',
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
            <TrackedComponentRow
              key={c.itemCode}
              component={c}
              serials={serialsByItem[c.itemCode] ?? []}
              onChangeSerials={(s) => setSerialsByItem((prev) => ({ ...prev, [c.itemCode]: s }))}
              batches={batchesByItem[c.itemCode] ?? []}
              onChangeBatches={(b) => setBatchesByItem((prev) => ({ ...prev, [c.itemCode]: b }))}
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

function TrackedComponentRow({
  component, serials, onChangeSerials, batches, onChangeBatches,
}: {
  component: TrackedComponent
  serials: string[]
  onChangeSerials: (s: string[]) => void
  batches: { batchId: string; qty: number }[]
  onChangeBatches: (b: { batchId: string; qty: number }[]) => void
}) {
  const { itemCode, itemName, trackingType, qtyNeeded, warehouse } = component

  const { data: availableSerials, isLoading: loadingSerials } = useQuery({
    queryKey: ['seriales', itemCode],
    queryFn: () => listSeriales({ itemCode, status: 'Active', limit: 100 }),
    enabled: trackingType === 'serial',
  })
  const { data: availableLotes, isLoading: loadingLotes } = useQuery({
    queryKey: ['lotes', itemCode],
    queryFn: () => listLotes({ itemCode, limit: 100 }),
    enabled: trackingType === 'batch',
  })

  const [serialToAdd, setSerialToAdd] = useState('')
  const [batchToAdd, setBatchToAdd] = useState('')
  const [batchQtyToAdd, setBatchQtyToAdd] = useState(1)

  const batchSum = batches.reduce((s, b) => s + Number(b.qty || 0), 0)
  const unusedSerials = (availableSerials?.items ?? []).filter((s) => !serials.includes(s.id))

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>{itemName ?? itemCode}</span>
        <span style={{ fontSize: 12, color: trackingType === 'serial' ? (serials.length === qtyNeeded ? 'var(--color-success)' : 'var(--text-secondary)') : (batchSum === qtyNeeded ? 'var(--color-success)' : 'var(--text-secondary)') }}>
          {trackingType === 'serial' ? `${serials.length}/${qtyNeeded} seriales` : `${batchSum}/${qtyNeeded} en lotes`}
        </span>
      </div>

      {trackingType === 'serial' ? (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="ff-select"
              style={{ fontSize: 12, padding: '4px 8px' }}
              value={serialToAdd}
              onChange={(e) => setSerialToAdd(e.target.value)}
              disabled={loadingSerials || serials.length >= qtyNeeded}
            >
              <option value="">{loadingSerials ? 'Cargando…' : 'Seleccionar serial…'}</option>
              {unusedSerials.map((s) => (
                <option key={s.id} value={s.id}>{s.id}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-size-xs"
              disabled={!serialToAdd || serials.length >= qtyNeeded}
              onClick={() => { if (serialToAdd) { onChangeSerials([...serials, serialToAdd]); setSerialToAdd('') } }}
            >
              <Plus size={13} /> Agregar
            </button>
          </div>
          {!loadingSerials && (availableSerials?.items?.length ?? 0) === 0 && (
            <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
              No hay seriales disponibles de {itemName ?? itemCode}{warehouse ? ` en el almacén ${warehouse}` : ''}.
              Debes recibir/transferir stock antes de poder facturarlo{warehouse ? ', o cambiar el almacén de la línea' : ''}.
            </p>
          )}
          {serials.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {serials.map((s) => (
                <span key={s} className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {s}
                  <button type="button" onClick={() => onChangeSerials(serials.filter((x) => x !== s))} style={{ display: 'flex' }}>
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="ff-select"
              style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
              value={batchToAdd}
              onChange={(e) => setBatchToAdd(e.target.value)}
              disabled={loadingLotes}
            >
              <option value="">{loadingLotes ? 'Cargando…' : 'Seleccionar lote…'}</option>
              {(availableLotes?.items ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.id} ({l.qty} disp.)</option>
              ))}
            </select>
            <input
              className="ff-input"
              type="number"
              min="1"
              step="1"
              value={batchQtyToAdd}
              onChange={(e) => setBatchQtyToAdd(parseInt(e.target.value) || 1)}
              style={{ width: 70, fontSize: 12, padding: '4px 8px' }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-size-xs"
              disabled={!batchToAdd || batchQtyToAdd <= 0}
              onClick={() => {
                if (!batchToAdd) return
                onChangeBatches([...batches, { batchId: batchToAdd, qty: batchQtyToAdd }])
                setBatchToAdd('')
                setBatchQtyToAdd(1)
              }}
            >
              <Plus size={13} /> Agregar
            </button>
          </div>
          {!loadingLotes && (availableLotes?.items?.length ?? 0) === 0 && (
            <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
              No hay lotes disponibles de {itemName ?? itemCode}{warehouse ? ` en el almacén ${warehouse}` : ''}.
              Debes recibir/transferir stock antes de poder facturarlo{warehouse ? ', o cambiar el almacén de la línea' : ''}.
            </p>
          )}
          {batches.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {batches.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span>{b.batchId} — {b.qty}</span>
                  <button type="button" className="btn btn-ghost btn-size-icon-xs" onClick={() => onChangeBatches(batches.filter((_, bi) => bi !== i))}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
