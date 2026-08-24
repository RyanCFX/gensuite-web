import { useRef } from 'react'
import { ZoomIn, ZoomOut, Undo2, Redo2, Save, Grid3x3, Ruler, Magnet, Image as ImageIcon, X, RefreshCw } from 'lucide-react'

interface Props {
  zoom: number
  canUndo: boolean
  canRedo: boolean
  saving: boolean
  showGrid: boolean
  showRulers: boolean
  snapEnabled: boolean
  hasBackground: boolean
  backgroundOpacity: number
  pendienteRegenerar: boolean
  regenerando: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onToggleGrid: () => void
  onToggleRulers: () => void
  onToggleSnap: () => void
  onUploadBackground: (file: File) => void
  onClearBackground: () => void
  onBackgroundOpacityChange: (v: number) => void
  onRegenerar: () => void
}

export function ChequeEditorToolbar({
  zoom, canUndo, canRedo, saving, showGrid, showRulers, snapEnabled,
  hasBackground, backgroundOpacity, pendienteRegenerar, regenerando,
  onZoomIn, onZoomOut, onUndo, onRedo, onSave,
  onToggleGrid, onToggleRulers, onToggleSnap,
  onUploadBackground, onClearBackground, onBackgroundOpacityChange, onRegenerar,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="chq-toolbar">
      <div className="chq-toolbar-group">
        <button type="button" className="chq-toolbar-btn" onClick={onZoomOut} title="Alejar">
          <ZoomOut size={16} />
        </button>
        <span className="chq-toolbar-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="chq-toolbar-btn" onClick={onZoomIn} title="Acercar">
          <ZoomIn size={16} />
        </button>
      </div>

      <span className="chq-toolbar-sep" />

      <div className="chq-toolbar-group">
        <button type="button" className="chq-toolbar-btn" onClick={onUndo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button type="button" className="chq-toolbar-btn" onClick={onRedo} disabled={!canRedo} title="Rehacer (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </button>
      </div>

      <span className="chq-toolbar-sep" />

      <div className="chq-toolbar-group">
        <button type="button" className={`chq-toolbar-btn${showGrid ? ' active' : ''}`} onClick={onToggleGrid} title="Mostrar cuadrícula">
          <Grid3x3 size={16} />
        </button>
        <button type="button" className={`chq-toolbar-btn${showRulers ? ' active' : ''}`} onClick={onToggleRulers} title="Mostrar reglas">
          <Ruler size={16} />
        </button>
        <button type="button" className={`chq-toolbar-btn${snapEnabled ? ' active' : ''}`} onClick={onToggleSnap} title="Ajustar a cuadrícula (snap)">
          <Magnet size={16} />
        </button>
      </div>

      <span className="chq-toolbar-sep" />

      <div className="chq-toolbar-group">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUploadBackground(file)
            e.target.value = ''
          }}
        />
        <button type="button" className="chq-toolbar-btn" onClick={() => fileInputRef.current?.click()} title="Cargar imagen de fondo (escaneo del cheque real)">
          <ImageIcon size={16} />
          <span>{hasBackground ? 'Cambiar fondo' : 'Cargar fondo'}</span>
        </button>
        {hasBackground && (
          <>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={backgroundOpacity}
              onChange={(e) => onBackgroundOpacityChange(parseFloat(e.target.value))}
              title="Opacidad de la imagen de fondo"
              className="chq-toolbar-range"
            />
            <button type="button" className="chq-toolbar-btn" onClick={onClearBackground} title="Quitar imagen de fondo">
              <X size={16} />
            </button>
          </>
        )}
      </div>

      <span className="chq-toolbar-sep" />

      {pendienteRegenerar && (
        <button type="button" className="chq-toolbar-btn chq-toolbar-btn-warn" onClick={onRegenerar} disabled={regenerando} title="Regenerar plantilla de impresión">
          {regenerando ? <span className="spinner spinner-sm" /> : <RefreshCw size={16} />}
          <span>{regenerando ? 'Regenerando…' : 'Regenerar plantilla'}</span>
        </button>
      )}

      <button type="button" className="chq-toolbar-btn chq-toolbar-btn-primary" onClick={onSave} disabled={saving} title="Guardar plantilla">
        {saving ? <span className="spinner spinner-white spinner-sm" /> : <Save size={16} />}
        <span>Guardar</span>
      </button>
    </div>
  )
}
