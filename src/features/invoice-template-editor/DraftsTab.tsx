import { useState } from 'react'
import { Eye, FolderOpen, Save, Trash2 } from 'lucide-react'
import type { DraftSummary } from './types'

interface Props {
  drafts: DraftSummary[]
  onSaveDraft: (name?: string) => void
  onPreviewDraft: (id: string) => void
  onLoadDraft: (id: string) => void
  onDeleteDraft: (id: string) => void
}

const TYPE_LABELS: Record<string, string> = {
  pos_invoice: 'Factura POS',
  label_5x2: 'Etiqueta',
}

export function DraftsTab({ drafts, onSaveDraft, onPreviewDraft, onLoadDraft, onDeleteDraft }: Props) {
  const [name, setName] = useState('')

  function handleSave() {
    onSaveDraft(name.trim() || undefined)
    setName('')
  }

  return (
    <div className="tpl-drafts-tab">
      <div className="tpl-drafts-save-row">
        <input
          className="ff-input"
          placeholder="Nombre del borrador (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="button" className="btn btn-secondary btn-size-sm" onClick={handleSave}>
          <Save size={13} /> Guardar borrador actual
        </button>
      </div>

      {drafts.length === 0 ? (
        <p className="tpl-drafts-empty">Aún no tienes borradores guardados. Usa el botón de arriba para guardar tu progreso sin perderlo.</p>
      ) : (
        <div className="tpl-gallery-list">
          {drafts.map((draft) => (
            <div key={draft.id} className="tpl-gallery-card">
              <div className="tpl-gallery-card-head">
                <span className="tpl-gallery-card-title">{draft.name}</span>
                <span className="tpl-gallery-card-badge">{TYPE_LABELS[draft.type] ?? draft.type}</span>
              </div>
              <p className="tpl-gallery-card-desc">Guardado {new Date(draft.savedAt).toLocaleString('es-DO')}</p>
              <div className="tpl-gallery-card-actions">
                <button type="button" className="btn btn-ghost btn-size-xs" onClick={() => onPreviewDraft(draft.id)}>
                  <Eye size={13} /> Ver
                </button>
                <button type="button" className="btn btn-secondary btn-size-xs" onClick={() => onLoadDraft(draft.id)}>
                  <FolderOpen size={13} /> Cargar
                </button>
                <button type="button" className="btn btn-ghost btn-size-xs" onClick={() => onDeleteDraft(draft.id)} title="Eliminar borrador">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
