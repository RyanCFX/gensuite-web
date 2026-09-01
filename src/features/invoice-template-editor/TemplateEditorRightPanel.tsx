import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, BringToFront, SendToBack, Copy, Trash2, Upload, Sigma, GitBranch, Table as TableIcon, MousePointer2 } from 'lucide-react'
import type { TemplateElement, TemplateFieldCategory, TextAlign, TextElement } from './types'
import { CONDITION_OPERATOR_LABELS } from './constants'
import { uploadPlantillaLogo } from '@/shared/api/plantillas'

interface Props {
  element: TemplateElement | undefined
  fields: TemplateFieldCategory[]
  /** true cuando el formato activo es térmico (Pos Invoice) — el logo se sube con
   * `?termico=true` para que el backend genere también la versión 1-bit (§4 del doc). */
  termico: boolean
  onUpdate: (patch: Partial<TemplateElement>) => void
  onDelete: () => void
  onDuplicate: () => void
  onBringToFront: () => void
  onSendToBack: () => void
  onOpenConditional: () => void
  onOpenFormula: () => void
  onOpenTable: () => void
}

const ALL_FIELD_KEYS = (fields: TemplateFieldCategory[]) => fields.flatMap((c) => c.fields)

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="ff-wrap">
      <label className="ff-label">{label}</label>
      <input type="number" className="ff-input" value={Math.round(value * 100) / 100} step={step} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  )
}

function AlignControl({ value, onChange }: { value: TextAlign; onChange: (v: TextAlign) => void }) {
  const options: { value: TextAlign; icon: typeof AlignLeft }[] = [
    { value: 'left', icon: AlignLeft },
    { value: 'center', icon: AlignCenter },
    { value: 'right', icon: AlignRight },
  ]
  return (
    <div className="tpl-align-control">
      {options.map(({ value: v, icon: Icon }) => (
        <button key={v} type="button" className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

/** Alterna entre "Campo dinámico" (enlazado a un dato de la factura) y "Texto fijo" (un valor
 * constante que el usuario escribe) — usado por QR y código de barras. El modo inicial se
 * deriva de si ya hay un `value` guardado; una vez el usuario elige, el toggle se controla
 * localmente para permitir dejar el texto fijo vacío mientras escribe. */
function QrBarcodeSource({
  binding, value, fields, label, onUpdate,
}: {
  binding?: string
  value?: string
  fields: TemplateFieldCategory[]
  label: string
  onUpdate: (patch: { binding?: string; value?: string }) => void
}) {
  const [fixedMode, setFixedMode] = useState(!!value?.trim())

  return (
    <>
      <div className="ff-wrap">
        <label className="ff-label">Fuente del contenido</label>
        <div className="tpl-align-control">
          <button
            type="button"
            className={!fixedMode ? 'active' : ''}
            onClick={() => { setFixedMode(false); onUpdate({ value: '' }) }}
          >
            Campo dinámico
          </button>
          <button
            type="button"
            className={fixedMode ? 'active' : ''}
            onClick={() => setFixedMode(true)}
          >
            Texto fijo
          </button>
        </div>
      </div>

      {fixedMode ? (
        <div className="ff-wrap">
          <label className="ff-label">{label} (texto fijo)</label>
          <input
            className="ff-input"
            value={value ?? ''}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="Escribe el valor fijo…"
          />
        </div>
      ) : (
        <div className="ff-wrap">
          <label className="ff-label">{label}</label>
          <select className="ff-input ff-select" value={binding ?? ''} onChange={(e) => onUpdate({ binding: e.target.value })}>
            <option value="">Sin enlazar</option>
            {ALL_FIELD_KEYS(fields).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      )}
    </>
  )
}

function TextStyleControl({ element, onUpdate }: { element: TextElement; onUpdate: (patch: Partial<TextElement>) => void }) {
  return (
    <div className="tpl-align-control">
      <button
        type="button"
        className={element.fontWeight === 'bold' ? 'active' : ''}
        title="Negrita"
        onClick={() => onUpdate({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        className={element.fontStyle === 'italic' ? 'active' : ''}
        title="Cursiva"
        onClick={() => onUpdate({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}
      >
        <Italic size={14} />
      </button>
      <button
        type="button"
        className={element.textDecoration === 'underline' ? 'active' : ''}
        title="Subrayado"
        onClick={() => onUpdate({ textDecoration: element.textDecoration === 'underline' ? 'none' : 'underline' })}
      >
        <Underline size={14} />
      </button>
    </div>
  )
}

export function TemplateEditorRightPanel({
  element, fields, termico, onUpdate, onDelete, onDuplicate, onBringToFront, onSendToBack, onOpenConditional, onOpenFormula, onOpenTable,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  if (!element) {
    return (
      <div className="tpl-right-panel tpl-right-panel-empty">
        <MousePointer2 size={22} />
        <p>Selecciona un elemento del canvas para ver y editar sus propiedades.</p>
      </div>
    )
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingLogo(true)
    try {
      const result = await uploadPlantillaLogo(file, termico)
      // Se guarda la URL devuelta por el backend, nunca el archivo embebido en base64 (§4).
      onUpdate({ src: result.fileUrl, processed: termico })
    } catch {
      toast.error('No se pudo subir el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  return (
    <div className="tpl-right-panel">
      <div className="tpl-right-panel-header">
        <span className="tpl-right-panel-type">{element.type}</span>
        <div className="tpl-right-panel-actions">
          <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Duplicar" onClick={onDuplicate}><Copy size={14} /></button>
          <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Traer al frente" onClick={onBringToFront}><BringToFront size={14} /></button>
          <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Enviar al fondo" onClick={onSendToBack}><SendToBack size={14} /></button>
          <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Eliminar" onClick={onDelete}><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="tpl-right-panel-body">
        <div className="form-row form-row-3">
          <NumberField label="X" value={element.x} onChange={(v) => onUpdate({ x: v })} />
          <NumberField label="Y" value={element.y} onChange={(v) => onUpdate({ y: v })} />
          <NumberField label="Rotación" value={element.rotation} onChange={(v) => onUpdate({ rotation: v })} />
        </div>
        <div className="form-row form-row-3">
          <NumberField label="Ancho" value={element.width} onChange={(v) => onUpdate({ width: Math.max(4, v) })} />
          <NumberField label="Alto" value={element.height} onChange={(v) => onUpdate({ height: Math.max(4, v) })} />
        </div>

        <hr className="tpl-right-panel-divider" />

        {element.type === 'text' && (
          <>
            <div className="ff-wrap">
              <label className="ff-label">Texto</label>
              <input className="ff-input" value={element.text} onChange={(e) => onUpdate({ text: e.target.value })} disabled={!!element.binding} />
              {element.binding && <p className="ff-hint">Enlazado a <code>{element.binding}</code></p>}
            </div>
            <div className="form-row form-row-3">
              <NumberField label="Tamaño" value={element.fontSize} onChange={(v) => onUpdate({ fontSize: v })} />
              <div className="ff-wrap">
                <label className="ff-label">Alineación</label>
                <AlignControl value={element.align} onChange={(v) => onUpdate({ align: v })} />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Estilo</label>
                <TextStyleControl element={element} onUpdate={onUpdate} />
              </div>
            </div>
          </>
        )}

        {element.type === 'qr' && (
          <QrBarcodeSource
            binding={element.binding}
            value={element.value}
            fields={fields}
            label="Campo que alimenta el QR"
            onUpdate={onUpdate}
          />
        )}

        {element.type === 'barcode' && (
          <>
            <QrBarcodeSource
              binding={element.binding}
              value={element.value}
              fields={fields}
              label="Campo que alimenta el código"
              onUpdate={onUpdate}
            />
            <div className="ff-wrap">
              <label className="ff-label">Formato</label>
              <select className="ff-input ff-select" value={element.format} onChange={(e) => onUpdate({ format: e.target.value as 'CODE128' | 'EAN13' })}>
                <option value="CODE128">CODE128</option>
                <option value="EAN13">EAN13</option>
              </select>
            </div>
          </>
        )}

        {element.type === 'formula' && (
          <>
            <div className="ff-wrap">
              <label className="ff-label">Fórmula</label>
              <code className="tpl-formula-preview">{element.formula || 'sin definir'}</code>
              <button type="button" className="btn btn-secondary btn-size-sm" style={{ marginTop: 8 }} onClick={onOpenFormula}>
                <Sigma size={14} /> Editar fórmula…
              </button>
            </div>
            <div className="form-row form-row-3">
              <NumberField label="Tamaño" value={element.fontSize} onChange={(v) => onUpdate({ fontSize: v })} />
              <div className="ff-wrap">
                <label className="ff-label">Alineación</label>
                <AlignControl value={element.align} onChange={(v) => onUpdate({ align: v })} />
              </div>
            </div>
          </>
        )}

        {element.type === 'line' && (
          <div className="form-row form-row-3">
            <div className="ff-wrap">
              <label className="ff-label">Estilo</label>
              <select className="ff-input ff-select" value={element.style} onChange={(e) => onUpdate({ style: e.target.value as 'solid' | 'dashed' })}>
                <option value="solid">Continua</option>
                <option value="dashed">Punteada</option>
              </select>
            </div>
            <NumberField label="Grosor" value={element.thickness} onChange={(v) => onUpdate({ thickness: Math.max(1, v) })} />
          </div>
        )}

        {element.type === 'logo' && (
          <div className="ff-wrap">
            <label className="ff-label">Imagen</label>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} disabled={uploadingLogo} />
            <button type="button" className="btn btn-secondary btn-size-sm" disabled={uploadingLogo} onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} /> {uploadingLogo ? 'Subiendo…' : element.src ? 'Reemplazar imagen…' : 'Subir imagen…'}
            </button>
            <p className="ff-hint">Se procesará a blanco y negro (1-bit) para impresión térmica.</p>
          </div>
        )}

        {element.type === 'table' && (
          <div className="ff-wrap">
            <label className="ff-label">Columnas visibles</label>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {element.columns.filter((c) => c.visible).map((c) => c.label).join(' · ') || 'Ninguna'}
            </p>
            <button type="button" className="btn btn-secondary btn-size-sm" style={{ marginTop: 8 }} onClick={onOpenTable}>
              <TableIcon size={14} /> Configurar columnas…
            </button>
            <div style={{ marginTop: 12 }}>
              <NumberField label="Tamaño de fuente" value={element.fontSize} onChange={(v) => onUpdate({ fontSize: v })} />
            </div>
          </div>
        )}

        {element.type === 'list' && (
          <>
            <div className="ff-wrap">
              <label className="ff-label">Campo</label>
              <select className="ff-input ff-select" value={element.binding} onChange={(e) => onUpdate({ binding: e.target.value })}>
                <option value="">Sin enlazar</option>
                {ALL_FIELD_KEYS(fields).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <NumberField label="Tamaño de fuente" value={element.fontSize} onChange={(v) => onUpdate({ fontSize: v })} />
          </>
        )}

        {element.type === 'date' && (
          <>
            <div className="ff-wrap">
              <label className="ff-label">Campo de fecha</label>
              <select className="ff-input ff-select" value={element.binding} onChange={(e) => onUpdate({ binding: e.target.value })}>
                {ALL_FIELD_KEYS(fields).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Formato</label>
              <input className="ff-input" value={element.format} onChange={(e) => onUpdate({ format: e.target.value })} placeholder="dd/MM/yyyy" />
            </div>
            <NumberField label="Tamaño de fuente" value={element.fontSize} onChange={(v) => onUpdate({ fontSize: v })} />
          </>
        )}

        {element.type === 'conditional' && (
          <div className="ff-wrap">
            <label className="ff-label">Texto</label>
            <input className="ff-input" value={element.text} onChange={(e) => onUpdate({ text: e.target.value })} />
            <label className="ff-label" style={{ marginTop: 10 }}>Regla</label>
            {element.rule ? (
              <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                {element.rule.field} {CONDITION_OPERATOR_LABELS[element.rule.operator]} "{element.rule.value}"
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Sin regla — siempre visible</p>
            )}
            <button type="button" className="btn btn-secondary btn-size-sm" style={{ marginTop: 8 }} onClick={onOpenConditional}>
              <GitBranch size={14} /> Configurar regla…
            </button>
            <div style={{ marginTop: 12 }}>
              <NumberField label="Tamaño de fuente" value={element.fontSize} onChange={(v) => onUpdate({ fontSize: v })} />
            </div>
          </div>
        )}

        {element.type === 'rectangle' && (
          <div className="form-row form-row-3">
            <div className="ff-wrap">
              <label className="ff-label">Relleno</label>
              <input type="color" className="ff-input" value={element.fill === 'transparent' ? '#ffffff' : element.fill} onChange={(e) => onUpdate({ fill: e.target.value })} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Borde</label>
              <input type="color" className="ff-input" value={element.stroke} onChange={(e) => onUpdate({ stroke: e.target.value })} />
            </div>
            <NumberField label="Grosor borde" value={element.strokeWidth} onChange={(v) => onUpdate({ strokeWidth: Math.max(0, v) })} />
          </div>
        )}

        {element.type === 'group' && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Contenedor de sección — puede usarse para agrupar visualmente varios elementos dentro de su área.
          </p>
        )}
      </div>
    </div>
  )
}
