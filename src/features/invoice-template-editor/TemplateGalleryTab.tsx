import { Eye, FileStack } from 'lucide-react'
import type { TemplateGalleryItem } from './types'

interface Props {
  items: TemplateGalleryItem[]
  loading: boolean
  onPreview: (item: TemplateGalleryItem) => void
  onUse: (item: TemplateGalleryItem) => void
}

const TYPE_LABELS: Record<string, string> = {
  pos_invoice: 'Factura POS',
  label_5x2: 'Etiqueta',
}

export function TemplateGalleryTab({ items, loading, onPreview, onUse }: Props) {
  if (loading) {
    return (
      <div style={{ padding: '12px 14px' }}>
        <span className="skeleton-box" style={{ height: 60, display: 'block', marginBottom: 8 }} />
        <span className="skeleton-box" style={{ height: 60, display: 'block' }} />
      </div>
    )
  }

  return (
    <div className="tpl-gallery-list">
      {items.map((item) => (
        <div key={item.id} className="tpl-gallery-card">
          <div className="tpl-gallery-card-head">
            <span className="tpl-gallery-card-title">{item.name}</span>
            <span className="tpl-gallery-card-badge">{TYPE_LABELS[item.type] ?? item.type}</span>
          </div>
          <p className="tpl-gallery-card-desc">{item.description}</p>
          <div className="tpl-gallery-card-actions">
            <button type="button" className="btn btn-ghost btn-size-xs" onClick={() => onPreview(item)}>
              <Eye size={13} /> Previsualizar
            </button>
            <button type="button" className="btn btn-secondary btn-size-xs" onClick={() => onUse(item)}>
              <FileStack size={13} /> Usar
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
