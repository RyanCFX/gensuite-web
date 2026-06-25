import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listItemVariants } from '@/shared/api/catalog'
import type { Item } from '@/shared/api/types'
import { X, Loader2 } from 'lucide-react'

interface VariantSelection {
  item: Item
  qty: number
}

interface VariantsModalProps {
  templateItem: Item
  onConfirm: (selections: VariantSelection[]) => void
  onClose: () => void
}

export function VariantsModal({ templateItem, onConfirm, onClose }: VariantsModalProps) {
  const [selections, setSelections] = useState<Map<string, number>>(new Map())

  const { data: variants, isLoading } = useQuery({
    queryKey: ['item-variants', templateItem.id],
    queryFn: () => listItemVariants(templateItem.id),
    enabled: !!templateItem.id,
  })

  function toggleVariant(id: string) {
    setSelections((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, 1)
      return next
    })
  }

  function setQty(id: string, qty: number) {
    setSelections((prev) => {
      const next = new Map(prev)
      if (qty <= 0) next.delete(id)
      else next.set(id, qty)
      return next
    })
  }

  function handleConfirm() {
    const selected = Array.from(selections.entries())
      .map(([id, qty]) => {
        const item = variants?.find((v) => v.id === id)
        return item ? { item, qty } : null
      })
      .filter(Boolean) as VariantSelection[]
    if (selected.length > 0) onConfirm(selected)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Variantes — {templateItem.itemName}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><Loader2 size={20} className="spin" /></div>
          ) : !variants?.length ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24 }}>Este artículo no tiene variantes configuradas.</p>
          ) : (
            <table className="table-config" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
                  <th>Variante</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Stock</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const attrStr = v.attributes?.map((a) => `${a.attribute}: ${a.attributeValue}`).join(' / ') ?? v.itemName
                  const selected = selections.has(v.id)
                  return (
                    <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => toggleVariant(v.id)}>
                      <td>
                        <input type="checkbox" checked={selected} onChange={() => toggleVariant(v.id)} style={{ width: 16, height: 16 }} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{v.itemName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{attrStr}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 13 }}>{v.currentStock ?? '—'}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={selected ? selections.get(v.id) : ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setQty(v.id, parseFloat(e.target.value) || 0)}
                          className="ff-input"
                          style={{ width: 80, textAlign: 'right', fontSize: 12, padding: '4px 8px' }}
                          placeholder="Cant."
                          disabled={!selected}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={selections.size === 0}>
            Agregar ({selections.size}) variante(s)
          </button>
        </div>
      </div>
    </div>
  )
}

export type { VariantSelection }
