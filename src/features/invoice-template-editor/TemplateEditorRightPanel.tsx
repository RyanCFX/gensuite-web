import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, BringToFront, SendToBack, Copy, Trash2, Upload, Sigma, GitBranch, Table as TableIcon, MousePointer2, ChevronDown, ChevronUp, Plus, GripVertical } from 'lucide-react'
import type { RepeaterElement, RepeaterLine, RepeaterToken, RepeaterTokenKey, TemplateElement, TemplateFieldCategory, TextAlign, TextElement } from './types'
import { CONDITION_OPERATOR_LABELS, repeaterTokensFor } from './constants'
import { uploadPlantillaLogo } from '@/shared/api/plantillas'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'

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

/** Configuración del repetidor "Lista de productos/servicios": líneas por registro, contenido
 * y orden de cada línea (tokens de campo mezclados con texto fijo), alineación y tamaño por
 * línea. Todo se guarda dentro del elemento en `documentJson` — el backend no lo interpreta. */
function RepeaterConfig({ element, fields, onUpdate }: { element: RepeaterElement; fields: TemplateFieldCategory[]; onUpdate: (patch: Partial<RepeaterElement>) => void }) {
  const [fixedText, setFixedText] = useState<Record<number, string>>({})
  const [newToken, setNewToken] = useState<Record<number, string>>({})
  // Orígenes válidos: los campos `array` del catálogo real (normalmente `items.tabla` y
  // `pagos.tabla`). Si el catálogo aún no los trae, se ofrecen los dos conocidos.
  const arrayKeys = ALL_FIELD_KEYS(fields).filter((f) => f.array).map((f) => f.key)
  const bindingOptions = Array.from(new Set([...arrayKeys, 'items.tabla', 'pagos.tabla']))
  const allowedKeys = new Set(repeaterTokensFor(element.binding || 'items.tabla').map((t) => t.key))
  const lines = element.lines ?? []

  function setLines(next: RepeaterLine[]) {
    onUpdate({ lines: next })
  }

  function changeBinding(binding: string) {
    const allowed = new Set(repeaterTokensFor(binding).map((t) => t.key))
    setLines(
      lines.map((l) => ({
        ...l,
        tokens: l.tokens.filter((t) => t.kind === 'text' || allowed.has(t.key)),
      })),
    )
    onUpdate({ binding })
  }

  function moveLine(index: number, dir: -1 | 1) {
    const next = [...lines]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setLines(next)
  }

  function moveToken(lineIndex: number, tokenIndex: number, dir: -1 | 1) {
    const next = lines.map((l) => ({ ...l, tokens: [...l.tokens] }))
    const tokens = next[lineIndex].tokens
    const target = tokenIndex + dir
    if (target < 0 || target >= tokens.length) return
    ;[tokens[tokenIndex], tokens[target]] = [tokens[target], tokens[tokenIndex]]
    setLines(next)
  }

  function updateToken(lineIndex: number, tokenIndex: number, token: RepeaterToken) {
    const next = lines.map((l) => ({ ...l, tokens: [...l.tokens] }))
    next[lineIndex].tokens[tokenIndex] = token
    setLines(next)
  }

  function removeToken(lineIndex: number, tokenIndex: number) {
    const next = lines.map((l) => ({ ...l, tokens: l.tokens.filter((_, i) => i !== tokenIndex) }))
    setLines(next)
  }

  return (
    <>
      <div className="ff-wrap">
        <label className="ff-label">Origen de datos</label>
        <select className="ff-input ff-select" value={element.binding || 'items.tabla'} onChange={(e) => changeBinding(e.target.value)}>
          {bindingOptions.map((key) => (
            <option key={key} value={key}>{key === 'items.tabla' ? 'Productos/servicios (items.tabla)' : key === 'pagos.tabla' ? 'Métodos de pago (pagos.tabla)' : key}</option>
          ))}
        </select>
        <p className="ff-hint">Cada registro se imprime como un bloque de {lines.length} {lines.length === 1 ? 'línea' : 'líneas'}. Crece con la cantidad de registros y empuja hacia abajo lo que está debajo.</p>
      </div>

      {lines.map((line, li) => (
        <div key={li} style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>Línea {li + 1}</span>
            <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Subir línea" disabled={li === 0} onClick={() => moveLine(li, -1)}><ChevronUp size={14} /></button>
            <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Bajar línea" disabled={li === lines.length - 1} onClick={() => moveLine(li, 1)}><ChevronDown size={14} /></button>
            <button
              type="button" className="btn btn-ghost btn-size-icon-sm" title="Eliminar línea" disabled={lines.length <= 1}
              onClick={() => setLines(lines.filter((_, i) => i !== li))}
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {line.tokens.map((token, ti) => (
              <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <GripVertical size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                {token.kind === 'field' ? (
                  <select
                    className="ff-input ff-select" style={{ flex: 1, minWidth: 0 }} value={token.key}
                    onChange={(e) => updateToken(li, ti, { kind: 'field', key: e.target.value as RepeaterTokenKey })}
                  >
                    {repeaterTokensFor(element.binding || 'items.tabla').map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                    {!allowedKeys.has(token.key) && <option value={token.key}>{token.key} (de otro origen)</option>}
                  </select>
                ) : (
                  <input
                    className="ff-input" style={{ flex: 1, minWidth: 0 }} value={token.text}
                    onChange={(e) => updateToken(li, ti, { kind: 'text', text: e.target.value })}
                    placeholder='Texto fijo (ej. " * $")'
                  />
                )}
                <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Subir" disabled={ti === 0} onClick={() => moveToken(li, ti, -1)}><ChevronUp size={13} /></button>
                <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Bajar" disabled={ti === line.tokens.length - 1} onClick={() => moveToken(li, ti, 1)}><ChevronDown size={13} /></button>
                <button type="button" className="btn btn-ghost btn-size-icon-sm" title="Quitar" onClick={() => removeToken(li, ti)}><Trash2 size={13} /></button>
              </div>
            ))}
            {line.tokens.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Línea vacía — agrega un campo o texto fijo.</p>}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <select
              className="ff-input ff-select" style={{ flex: 1, minWidth: 0 }}
              value={newToken[li] ?? repeaterTokensFor(element.binding || 'items.tabla')[0]?.key ?? ''}
              onChange={(e) => setNewToken((prev) => ({ ...prev, [li]: e.target.value }))}
              title="Campo a agregar"
            >
              {repeaterTokensFor(element.binding || 'items.tabla').map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <button
              type="button" className="btn btn-secondary btn-size-sm"
              onClick={() => {
                const key = newToken[li] ?? repeaterTokensFor(element.binding || 'items.tabla')[0]?.key
                if (!key) return
                const next = lines.map((l, i) => (i === li ? { ...l, tokens: [...l.tokens, { kind: 'field', key } as RepeaterToken] } : l))
                setLines(next)
              }}
            >
              <Plus size={13} /> Campo
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="ff-input" style={{ flex: 1, minWidth: 0 }} value={fixedText[li] ?? ''}
              onChange={(e) => setFixedText((prev) => ({ ...prev, [li]: e.target.value }))}
              placeholder='Texto fijo (ej. " * $", "ITBIS ")'
            />
            <button
              type="button" className="btn btn-secondary btn-size-sm" disabled={!(fixedText[li] ?? '').length}
              onClick={() => {
                const text = fixedText[li] ?? ''
                if (!text.length) return
                const next = lines.map((l, i) => (i === li ? { ...l, tokens: [...l.tokens, { kind: 'text', text }] } : l))
                setLines(next)
                setFixedText((prev) => ({ ...prev, [li]: '' }))
              }}
            >
              <Plus size={13} /> Texto
            </button>
          </div>

          <div className="form-row form-row-3">
            <NumberField label="Tamaño" value={line.fontSize} onChange={(v) => {
              const next = lines.map((l, i) => (i === li ? { ...l, fontSize: Math.max(4, v) } : l))
              setLines(next)
            }} />
            <div className="ff-wrap">
              <label className="ff-label">Alineación</label>
              <AlignControl value={line.align} onChange={(v) => {
                const next = lines.map((l, i) => (i === li ? { ...l, align: v } : l))
                setLines(next)
              }} />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button" className="btn btn-secondary btn-size-sm"
        onClick={() => setLines([...lines, { tokens: [], align: 'left', fontSize: 9 }])}
      >
        <Plus size={14} /> Agregar línea
      </button>

      <div className="form-row form-row-3">
        <NumberField label="Espacio entre líneas" value={element.lineGap ?? 2} onChange={(v) => onUpdate({ lineGap: Math.max(0, v) })} />
        <NumberField label="Espacio entre productos" value={element.blockGap ?? 4} onChange={(v) => onUpdate({ blockGap: Math.max(0, v) })} />
      </div>
    </>
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
            <label className="ff-label">
              Imagen
              <FieldTooltip>Se procesará a blanco y negro (1-bit) para impresión térmica.</FieldTooltip>
            </label>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} disabled={uploadingLogo} />
            <button type="button" className="btn btn-secondary btn-size-sm" disabled={uploadingLogo} onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} /> {uploadingLogo ? 'Subiendo…' : element.src ? 'Reemplazar imagen…' : 'Subir imagen…'}
            </button>
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

        {element.type === 'repeater' && (
          <RepeaterConfig element={element} fields={fields} onUpdate={onUpdate as (patch: Partial<RepeaterElement>) => void} />
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
              <p style={{ fontSize: 12, fontFamily: 'var(--font-body)' }}>
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
