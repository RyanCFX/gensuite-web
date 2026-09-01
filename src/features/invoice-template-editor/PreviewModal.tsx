import { Printer } from 'lucide-react'
import { TemplateEditorElementView } from './TemplateEditorElementView'
import type { TemplateDocument, TemplateFieldCategory, TemplateElement } from './types'
import { MIN_CANVAS_HEIGHT } from './constants'

interface Props {
  doc: TemplateDocument
  fields: TemplateFieldCategory[]
  values?: Record<string, unknown>
  onClose: () => void
}

function pageContentHeight(doc: TemplateDocument, elements: TemplateElement[]) {
  return doc.page.height ?? Math.max(MIN_CANVAS_HEIGHT, elements.reduce((m, el) => Math.max(m, el.y + el.height), 0) + 40)
}

export function PreviewModal({ doc, fields, values, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Printer size={17} /> Vista previa de impresión
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, background: 'var(--surface-sunken, #e5e7eb)', padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>
          {doc.pages.map((page, i) => (
            <div key={page.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {doc.pages.length > 1 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Página {i + 1} de {doc.pages.length}
                </span>
              )}
              <div className="tpl-preview-ticket" style={{ width: doc.page.width, minHeight: pageContentHeight(doc, page.elements) }}>
                {page.elements.map((el) => (
                  <div
                    key={el.id}
                    style={{
                      position: 'absolute',
                      left: el.x,
                      top: el.y,
                      width: el.width,
                      height: el.height,
                      transform: `rotate(${el.rotation}deg)`,
                    }}
                  >
                    <TemplateEditorElementView element={el} fields={fields} values={values} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Simulación en pantalla — la impresión térmica real se renderiza en blanco y negro puro (1-bit).
          </span>
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
