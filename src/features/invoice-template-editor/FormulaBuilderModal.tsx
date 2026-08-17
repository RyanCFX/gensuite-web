import { useRef, useState } from 'react'
import type { FormulaElement, TemplateFieldCategory } from './types'

interface Props {
  element: FormulaElement
  fields: TemplateFieldCategory[]
  onSave: (formula: string, fieldKeys: string[]) => void
  onClose: () => void
}

const OPERATORS = ['+', '-', '*', '/', '(', ')']

export function FormulaBuilderModal({ element, fields, onSave, onClose }: Props) {
  const [formula, setFormula] = useState(element.formula)
  const inputRef = useRef<HTMLInputElement>(null)
  const numericFields = fields.flatMap((cat) => cat.fields.filter((f) => f.numeric).map((f) => ({ ...f, categoryLabel: cat.label })))

  function insertAtCursor(token: string) {
    const input = inputRef.current
    const start = input?.selectionStart ?? formula.length
    const end = input?.selectionEnd ?? formula.length
    const next = `${formula.slice(0, start)}${token}${formula.slice(end)}`
    setFormula(next)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function usedFieldKeys(): string[] {
    return numericFields.filter((f) => formula.includes(f.key)).map((f) => f.key)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Cálculo matemático</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Selecciona campos numéricos y operadores para construir la fórmula (ej. <code>items.cantidad * items.precio</code>).
          </p>

          <div className="ff-wrap">
            <label className="ff-label">Fórmula</label>
            <input ref={inputRef} className="ff-input" style={{ fontFamily: 'var(--font-mono)' }} value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="items.cantidad * items.precio" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Campos numéricos</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {numericFields.map((f) => (
                <button key={f.key} type="button" className="btn btn-ghost btn-size-xs" onClick={() => insertAtCursor(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Operadores</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {OPERATORS.map((op) => (
                <button key={op} type="button" className="btn btn-secondary btn-size-xs" style={{ fontFamily: 'var(--font-mono)', minWidth: 32 }} onClick={() => insertAtCursor(` ${op} `)}>
                  {op}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { onSave(formula, usedFieldKeys()); onClose() }} disabled={!formula.trim()}>Guardar fórmula</button>
        </div>
      </div>
    </div>
  )
}
