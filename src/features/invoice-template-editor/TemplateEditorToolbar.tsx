import { ZoomIn, ZoomOut, Undo2, Redo2, Save, Eye, Printer } from 'lucide-react'

interface Props {
  zoom: number
  canUndo: boolean
  canRedo: boolean
  saving: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onPreview: () => void
  onTestPrint: () => void
}

export function TemplateEditorToolbar({ zoom, canUndo, canRedo, saving, onZoomIn, onZoomOut, onUndo, onRedo, onSave, onPreview, onTestPrint }: Props) {
  return (
    <div className="tpl-toolbar">
      <div className="tpl-toolbar-group">
        <button type="button" className="tpl-toolbar-btn" onClick={onZoomOut} title="Alejar">
          <ZoomOut size={16} />
        </button>
        <span className="tpl-toolbar-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="tpl-toolbar-btn" onClick={onZoomIn} title="Acercar">
          <ZoomIn size={16} />
        </button>
      </div>

      <span className="tpl-toolbar-sep" />

      <div className="tpl-toolbar-group">
        <button type="button" className="tpl-toolbar-btn" onClick={onUndo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button type="button" className="tpl-toolbar-btn" onClick={onRedo} disabled={!canRedo} title="Rehacer (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </button>
      </div>

      <span className="tpl-toolbar-sep" />

      <div className="tpl-toolbar-group">
        <button type="button" className="tpl-toolbar-btn" onClick={onPreview} title="Vista previa">
          <Eye size={16} />
        </button>
        <button type="button" className="tpl-toolbar-btn" onClick={onTestPrint} title="Imprimir prueba en la impresora térmica conectada">
          <Printer size={16} />
          <span>Imprimir prueba</span>
        </button>
        <button type="button" className="tpl-toolbar-btn tpl-toolbar-btn-primary" onClick={onSave} disabled={saving} title="Guardar plantilla">
          {saving ? <span className="spinner spinner-white spinner-sm" /> : <Save size={16} />}
          <span>Guardar</span>
        </button>
      </div>
    </div>
  )
}
