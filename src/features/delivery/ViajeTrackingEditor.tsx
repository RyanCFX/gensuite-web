// Captura de seriales/lotes por factura y artículo para despachar un viaje (§4.2 "Seriales y lotes").

import { Plus, Trash2 } from 'lucide-react'
import type { TrackingRequisito } from './viajeLib'

import { type TrackingState, type TrackingEntry, trackingKey as key, emptyTracking as empty } from './trackingLib'

interface Props {
  requisitos: TrackingRequisito[]
  value: TrackingState
  onChange: (next: TrackingState) => void
  /** invoiceId → etiqueta (NCF / cliente). */
  etiquetas?: Record<string, string>
}

export function ViajeTrackingEditor({ requisitos, value, onChange, etiquetas }: Props) {
  function patch(r: TrackingRequisito, fn: (e: TrackingEntry) => TrackingEntry) {
    const k = key(r)
    onChange({ ...value, [k]: fn(value[k] ?? empty()) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {requisitos.map((r) => {
        const e = value[key(r)] ?? empty()
        return (
          <div key={key(r)} className="card" style={{ margin: 0 }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {etiquetas?.[r.invoiceId] ?? r.invoiceId} · {r.itemCode}
                {r.qty != null && <span className="td-muted"> — cantidad {r.qty}</span>}
              </div>
              {r.tipo === 'serial' ? (
                <div className="ff-wrap">
                  <label className="ff-label-sm">Seriales (uno por línea)</label>
                  <textarea
                    className="ff-textarea"
                    rows={3}
                    value={e.serialsText}
                    onChange={(ev) => patch(r, (x) => ({ ...x, serialsText: ev.target.value }))}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="ff-label-sm">Lotes</label>
                  {e.batches.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        className="ff-input"
                        placeholder="ID del lote"
                        value={b.batchId}
                        onChange={(ev) => patch(r, (x) => ({ ...x, batches: x.batches.map((bb, j) => (j === i ? { ...bb, batchId: ev.target.value } : bb)) }))}
                      />
                      <input
                        className="ff-input"
                        type="number"
                        min={0}
                        placeholder="Cant."
                        style={{ width: 100 }}
                        value={b.qty}
                        onChange={(ev) => patch(r, (x) => ({ ...x, batches: x.batches.map((bb, j) => (j === i ? { ...bb, qty: ev.target.value } : bb)) }))}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-size-icon-sm"
                        disabled={e.batches.length === 1}
                        onClick={() => patch(r, (x) => ({ ...x, batches: x.batches.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <div>
                    <button type="button" className="btn btn-ghost btn-size-sm" onClick={() => patch(r, (x) => ({ ...x, batches: [...x.batches, { batchId: '', qty: '' }] }))}>
                      <Plus size={14} /> Agregar lote
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
