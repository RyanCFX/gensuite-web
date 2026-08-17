import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import type { TableColumn, TableElement } from './types'

interface Props {
  element: TableElement
  onSave: (columns: TableColumn[]) => void
  onClose: () => void
}

export function TableColumnsModal({ element, onSave, onClose }: Props) {
  const [columns, setColumns] = useState<TableColumn[]>(element.columns.map((c) => ({ ...c })))

  function toggle(key: TableColumn['key']) {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)))
  }

  function move(index: number, dir: -1 | 1) {
    setColumns((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Columnas de la tabla de items</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Marca las columnas a mostrar y usa las flechas para definir su orden.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {columns.map((col, i) => (
              <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 8 }}>
                <GripVertical size={14} style={{ color: 'var(--text-tertiary)' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={col.visible} onChange={() => toggle(col.key)} />
                  {col.label}
                </label>
                <button type="button" className="btn btn-ghost btn-size-icon-sm" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={14} /></button>
                <button type="button" className="btn btn-ghost btn-size-icon-sm" disabled={i === columns.length - 1} onClick={() => move(i, 1)}><ChevronDown size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { onSave(columns); onClose() }}>Guardar columnas</button>
        </div>
      </div>
    </div>
  )
}
