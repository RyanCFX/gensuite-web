import type { CreateChequePrintTemplateDto, ChequePrintTemplateSize } from '@/shared/api/types'
import { Select, SelectItem } from '@/components/ui/select'
import { CHEQUE_ELEMENTS, type ChequeElementId } from './constants'
import { readElement, writeElement } from './mapping'

interface Props {
  values: CreateChequePrintTemplateDto
  isEdit: boolean
  selectedId: ChequeElementId | null
  onChange: (patch: Partial<CreateChequePrintTemplateDto>) => void
}

export function NumberField({ label, value, onChange, disabled, suffix = 'cm' }: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  disabled?: boolean
  suffix?: string
}) {
  return (
    <div className="ff-wrap">
      <label className="ff-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          className="ff-input"
          type="number"
          step="0.1"
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
          style={{ paddingRight: 32 }}
        />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-tertiary)' }}>{suffix}</span>
      </div>
    </div>
  )
}

export function ChequePropertiesPanel({ values, isEdit, selectedId, onChange }: Props) {
  const selectedDef = selectedId ? CHEQUE_ELEMENTS.find((d) => d.id === selectedId) : undefined

  return (
    <div className="chq-right-panel">
      <div className="chq-right-panel-body">
        <div className="chq-right-section">
          <h3 className="chq-right-section-title">Cheque</h3>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Nombre de la plantilla</label>
            {isEdit ? (
              <>
                <input className="ff-input" value={values.bankName} disabled />
                <p className="ff-hint">No editable — para renombrar, crea una plantilla nueva.</p>
              </>
            ) : (
              <input
                className="ff-input"
                placeholder="Ej: Popular Estandar"
                value={values.bankName}
                onChange={(e) => onChange({ bankName: e.target.value })}
              />
            )}
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Tamaño de cheque</label>
            <Select
              value={values.chequeSize ?? 'Regular'}
              onValueChange={(v) => onChange({ chequeSize: v as ChequePrintTemplateSize })}
              clearable={false}
            >
              <SelectItem value="Regular">Regular</SelectItem>
              <SelectItem value="A4">A4</SelectItem>
            </Select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <NumberField label="Ancho" value={values.chequeWidth} onChange={(v) => onChange({ chequeWidth: v })} />
            <NumberField label="Alto" value={values.chequeHeight} onChange={(v) => onChange({ chequeHeight: v })} />
          </div>
          <NumberField
            label="Posición desde borde superior (solo A4)"
            value={values.startingPositionFromTopEdge}
            onChange={(v) => onChange({ startingPositionFromTopEdge: v })}
            disabled={values.chequeSize !== 'A4'}
          />
          <label className="ff-check-wrap" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              className="ff-check"
              checked={!!values.isAccountPayable}
              onChange={(e) => onChange({ isAccountPayable: e.target.checked })}
            />
            Incluir leyenda "Account Pay Only"
          </label>
          {values.isAccountPayable && (
            <div className="ff-wrap">
              <label className="ff-label">Texto de la leyenda</label>
              <input
                className="ff-input"
                placeholder="Account Pay Only"
                value={values.messageToShow ?? ''}
                onChange={(e) => onChange({ messageToShow: e.target.value })}
              />
            </div>
          )}
        </div>

        <hr className="chq-right-panel-divider" />

        {selectedDef ? (
          <div className="chq-right-section">
            <h3 className="chq-right-section-title">{selectedDef.label}</h3>
            {(() => {
              const box = readElement(values, selectedDef)
              return (
                <>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <NumberField
                      label="Desde borde izquierdo"
                      value={box.xCm}
                      onChange={(v) => v !== undefined && onChange(writeElement(values, selectedDef, { xCm: v }))}
                    />
                    <NumberField
                      label="Desde borde superior"
                      value={box.yCm}
                      onChange={(v) => v !== undefined && onChange(writeElement(values, selectedDef, { yCm: v }))}
                    />
                  </div>
                  {selectedDef.widthKey && (
                    <NumberField
                      label="Ancho"
                      value={box.wCm}
                      onChange={(v) => v !== undefined && onChange(writeElement(values, selectedDef, { wCm: v }))}
                    />
                  )}
                  {selectedDef.lineSpacingKey && (
                    <NumberField
                      label="Espaciado entre líneas"
                      value={values.amtInWordsLineSpacing}
                      onChange={(v) => onChange({ amtInWordsLineSpacing: v })}
                    />
                  )}
                </>
              )
            })()}
          </div>
        ) : (
          <div className="chq-right-panel-empty">Selecciona un elemento en el cheque para ajustar su posición con precisión.</div>
        )}
      </div>
    </div>
  )
}
