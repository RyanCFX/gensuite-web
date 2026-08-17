import { useState } from 'react'
import { CONDITION_OPERATOR_LABELS } from './constants'
import type { ConditionalElement, ConditionOperator, TemplateFieldCategory } from './types'

const OPERATORS: ConditionOperator[] = ['==', '!=', '>', '<', '>=', '<=', 'contains']

interface Props {
  element: ConditionalElement
  fields: TemplateFieldCategory[]
  onSave: (rule: { field: string; operator: ConditionOperator; value: string }) => void
  onClose: () => void
}

export function ConditionalRuleModal({ element, fields, onSave, onClose }: Props) {
  const [field, setField] = useState(element.rule?.field ?? fields[0]?.fields[0]?.key ?? '')
  const [operator, setOperator] = useState<ConditionOperator>(element.rule?.operator ?? '==')
  const [value, setValue] = useState(element.rule?.value ?? '')

  function handleSave() {
    if (!field || !value.trim()) return
    onSave({ field, operator, value: value.trim() })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Regla de visibilidad condicional</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Este elemento solo se mostrará en el documento impreso cuando se cumpla la regla.
          </p>

          <div className="ff-wrap">
            <label className="ff-label">Mostrar si el campo…</label>
            <select className="ff-input ff-select" value={field} onChange={(e) => setField(e.target.value)}>
              {fields.map((cat) => (
                <optgroup key={cat.key} label={cat.label}>
                  {cat.fields.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Operador</label>
            <select className="ff-input ff-select" value={operator} onChange={(e) => setOperator(e.target.value as ConditionOperator)}>
              {OPERATORS.map((op) => (
                <option key={op} value={op}>{CONDITION_OPERATOR_LABELS[op]}</option>
              ))}
            </select>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Valor</label>
            <input className="ff-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder='ej. "Consumo"' />
          </div>

          <div className="inline-alert inline-alert-info" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            mostrar si {field || '…'} {CONDITION_OPERATOR_LABELS[operator]} "{value || '…'}"
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!field || !value.trim()}>Guardar regla</button>
        </div>
      </div>
    </div>
  )
}
