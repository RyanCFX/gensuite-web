import { useState } from 'react'
import { ChevronDown, ChevronRight, Database, Shapes, LayoutTemplate, FileClock, Cloud } from 'lucide-react'
import { ELEMENT_PALETTE } from './constants'
import { setDragPayload } from './dragPayload'
import { ElementTypeIcon } from './elementIcons'
import { TemplateGalleryTab } from './TemplateGalleryTab'
import { DraftsTab } from './DraftsTab'
import { SavedTemplatesTab } from './SavedTemplatesTab'
import type { DraftSummary, ElementType, TemplateDocument, TemplateFieldCategory, TemplateFieldDef, TemplateGalleryItem, TemplateType } from './types'

interface Props {
  fields: TemplateFieldCategory[]
  fieldsLoading: boolean
  onInsertField: (field: TemplateFieldDef) => void
  onInsertElement: (type: ElementType) => void

  gallery: TemplateGalleryItem[]
  galleryLoading: boolean
  onPreviewGalleryItem: (item: TemplateGalleryItem) => void
  onUseGalleryItem: (item: TemplateGalleryItem) => void

  drafts: DraftSummary[]
  onSaveDraft: (name?: string) => void
  onPreviewDraft: (id: string) => void
  onLoadDraft: (id: string) => void
  onDeleteDraft: (id: string) => void

  format: TemplateType
  onUseSavedTemplate: (document: TemplateDocument, templateId: string, name: string) => void
  onSetDefaultTemplate: (id: string) => Promise<void>
  onDeleteTemplate: (id: string) => Promise<void>
}

type LeftTab = 'diseno' | 'plantillas' | 'guardadas' | 'borradores'

const TABS: { key: LeftTab; label: string; icon: typeof Database }[] = [
  { key: 'diseno', label: 'Diseño', icon: Database },
  { key: 'plantillas', label: 'Plantillas', icon: LayoutTemplate },
  { key: 'guardadas', label: 'Guardadas', icon: Cloud },
  { key: 'borradores', label: 'Borradores', icon: FileClock },
]

function DesignTab({ fields, fieldsLoading, onInsertField, onInsertElement }: Pick<Props, 'fields' | 'fieldsLoading' | 'onInsertField' | 'onInsertElement'>) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({ empresa: true, factura: true })

  function toggleCategory(key: string) {
    setOpenCategories((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="tpl-left-panel-inner">
      <div className="tpl-left-section">
        <div className="tpl-left-section-title">
          <Database size={14} />
          <span>Datos disponibles</span>
        </div>

        <div className="tpl-left-section-body">
          {fieldsLoading ? (
            <div style={{ padding: '12px 14px' }}>
              <span className="skeleton-box" style={{ height: 14, display: 'block', marginBottom: 8 }} />
              <span className="skeleton-box" style={{ height: 14, display: 'block', width: '80%' }} />
            </div>
          ) : (
            <div className="tpl-accordion">
              {fields.map((cat) => (
                <div key={cat.key} className="tpl-accordion-group">
                  <button type="button" className="tpl-accordion-header" onClick={() => toggleCategory(cat.key)}>
                    {openCategories[cat.key] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span>{cat.label}</span>
                    <span className="tpl-accordion-count">{cat.fields.length}</span>
                  </button>
                  {openCategories[cat.key] && (
                    <div className="tpl-field-list">
                      {cat.fields.map((field) => (
                        <div
                          key={field.key}
                          className="tpl-field-item"
                          draggable
                          onDragStart={(e) => setDragPayload(e, { kind: 'field', field })}
                          onClick={() => onInsertField(field)}
                          title={`Insertar ${field.label}`}
                        >
                          <span className="tpl-field-label">{field.label}</span>
                          {field.sample && <span className="tpl-field-sample">{field.sample}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="tpl-left-section">
        <div className="tpl-left-section-title">
          <Shapes size={14} />
          <span>Elementos</span>
        </div>
        <div className="tpl-left-section-body">
          <div className="tpl-palette-grid">
            {ELEMENT_PALETTE.map((item) => (
              <div
                key={item.type}
                className="tpl-palette-item"
                draggable
                onDragStart={(e) => setDragPayload(e, { kind: 'element', elementType: item.type })}
                onClick={() => onInsertElement(item.type)}
                title={`Insertar ${item.label}`}
              >
                <ElementTypeIcon type={item.type} size={18} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TemplateEditorLeftPanel({
  fields, fieldsLoading, onInsertField, onInsertElement,
  gallery, galleryLoading, onPreviewGalleryItem, onUseGalleryItem,
  drafts, onSaveDraft, onPreviewDraft, onLoadDraft, onDeleteDraft,
  format, onUseSavedTemplate, onSetDefaultTemplate, onDeleteTemplate,
}: Props) {
  const [tab, setTab] = useState<LeftTab>('diseno')

  return (
    <div className="tpl-left-panel-tabbed">
      <div className="tpl-left-tabs">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={`tpl-left-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="tpl-left-tab-content">
        {tab === 'diseno' && (
          <DesignTab fields={fields} fieldsLoading={fieldsLoading} onInsertField={onInsertField} onInsertElement={onInsertElement} />
        )}
        {tab === 'plantillas' && (
          <TemplateGalleryTab items={gallery} loading={galleryLoading} onPreview={onPreviewGalleryItem} onUse={onUseGalleryItem} />
        )}
        {tab === 'guardadas' && (
          <SavedTemplatesTab
            type={format}
            onUse={onUseSavedTemplate}
            onSetDefault={onSetDefaultTemplate}
            onDelete={onDeleteTemplate}
          />
        )}
        {tab === 'borradores' && (
          <DraftsTab
            drafts={drafts}
            onSaveDraft={onSaveDraft}
            onPreviewDraft={onPreviewDraft}
            onLoadDraft={onLoadDraft}
            onDeleteDraft={onDeleteDraft}
          />
        )}
      </div>
    </div>
  )
}
