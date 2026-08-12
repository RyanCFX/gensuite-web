import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listSeriales, listLotes } from '@/shared/api/inventory'
import type { TrackedComponent } from './ComponentTrackingModal'
import { Plus, Trash2 } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

export function TrackedComponentEditor({
  component, serials, onChangeSerials, batches, onChangeBatches, allowNew = false,
}: {
  component: TrackedComponent
  serials: string[]
  onChangeSerials: (s: string[]) => void
  batches: { batchId: string; qty: number }[]
  onChangeBatches: (b: { batchId: string; qty: number }[]) => void
  /** Si está activo, permite capturar un serial/lote nuevo (no existente en el sistema) en vez de exigir seleccionarlo de la lista disponible. */
  allowNew?: boolean
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

  const [serialSearch, setSerialSearch] = useState('')
  const serialOptions: SearchSelectOption[] = unusedSerials
    .filter((s) => !serialSearch || s.id.toLowerCase().includes(serialSearch.toLowerCase()))
    .map((s) => ({ value: s.id, label: s.id }))

  const [batchSearch, setBatchSearch] = useState('')
  const batchOptions: SearchSelectOption[] = (availableLotes?.items ?? [])
    .filter((l) => !batchSearch || l.id.toLowerCase().includes(batchSearch.toLowerCase()))
    .map((l) => ({ value: l.id, label: l.id, sublabel: `${l.qty} disp.` }))

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
          {allowNew ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="ff-input"
                style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}
                placeholder="Escribir serial nuevo…"
                value={serialToAdd}
                onChange={(e) => setSerialToAdd(e.target.value)}
                disabled={serials.length >= qtyNeeded}
              />
              <button
                type="button"
                className="btn btn-secondary btn-size-xs"
                disabled={!serialToAdd.trim() || serials.length >= qtyNeeded}
                onClick={() => { const v = serialToAdd.trim(); if (v) { onChangeSerials([...serials, v]); setSerialToAdd('') } }}
              >
                <Plus size={13} /> Agregar
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <SearchSelect
                  value={serialToAdd}
                  onChange={setSerialToAdd}
                  options={serialOptions}
                  onSearch={setSerialSearch}
                  selectedLabel={serialToAdd}
                  placeholder={loadingSerials ? 'Cargando…' : 'Seleccionar serial…'}
                  disabled={loadingSerials || serials.length >= qtyNeeded}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-size-xs"
                disabled={!serialToAdd || serials.length >= qtyNeeded}
                onClick={() => { if (serialToAdd) { onChangeSerials([...serials, serialToAdd]); setSerialToAdd('') } }}
              >
                <Plus size={13} /> Agregar
              </button>
            </div>
          )}
          {!allowNew && !loadingSerials && (availableSerials?.items?.length ?? 0) === 0 && (
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
            <div style={{ flex: 1 }}>
              {allowNew ? (
                <input
                  className="ff-input"
                  style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                  placeholder="Escribir lote nuevo…"
                  value={batchToAdd}
                  onChange={(e) => setBatchToAdd(e.target.value)}
                />
              ) : (
                <SearchSelect
                  value={batchToAdd}
                  onChange={setBatchToAdd}
                  options={batchOptions}
                  onSearch={setBatchSearch}
                  selectedLabel={batchToAdd}
                  placeholder={loadingLotes ? 'Cargando…' : 'Seleccionar lote…'}
                  disabled={loadingLotes}
                />
              )}
            </div>
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
              disabled={!batchToAdd.trim() || batchQtyToAdd <= 0}
              onClick={() => {
                const v = batchToAdd.trim()
                if (!v) return
                onChangeBatches([...batches, { batchId: v, qty: batchQtyToAdd }])
                setBatchToAdd('')
                setBatchQtyToAdd(1)
              }}
            >
              <Plus size={13} /> Agregar
            </button>
          </div>
          {!allowNew && !loadingLotes && (availableLotes?.items?.length ?? 0) === 0 && (
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
