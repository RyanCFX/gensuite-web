import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select, SelectItem } from '@/components/ui/select'
import { CANVAS_BOTTOM_MARGIN, TEMPLATE_FORMATS } from './constants'
import { useTemplateEditorStore } from './store'
import { TemplateEditorLeftPanel } from './TemplateEditorLeftPanel'
import { TemplateEditorCanvas } from './TemplateEditorCanvas'
import { TemplateEditorRightPanel } from './TemplateEditorRightPanel'
import { TemplateEditorToolbar } from './TemplateEditorToolbar'
import { ConditionalRuleModal } from './ConditionalRuleModal'
import { FormulaBuilderModal } from './FormulaBuilderModal'
import { TableColumnsModal } from './TableColumnsModal'
import { PreviewModal } from './PreviewModal'
import { TemplateEditorPrintTarget } from './TemplateEditorPrintTarget'
import { pageSizeMm, paperWidthMm } from './printUtils'
import { getDraft } from './drafts'
import { ConfirmModal } from '@/shared/ui/Modal'
import type { TemplateDocument, TemplateGalleryItem, TemplateType } from './types'

const PRINT_STYLE_TAG_ID = 'tpl-print-page-size'

function printDocument(doc: TemplateDocument) {
  const { height } = pageSizeMm(doc)
  // El "papel" declarado a @page/html/body es el ancho NOMINAL del rollo físico (ej. 80mm),
  // no el ancho del contenido imprimible (ej. 72mm) — son distintos a propósito. Si se
  // declaran iguales, el sobrante entre el rollo real y el contenido queda a criterio del
  // driver/impresora repartirlo como margen (lo cual salía descentrado hacia la izquierda).
  // Centrando nosotros mismos el contenido dentro del ancho del rollo (ver `.tpl-print-root`
  // en index.css) el resultado es determinista sin importar el driver.
  const paperMm = `${paperWidthMm(doc).toFixed(2)}mm`
  // Alto "auto" para pos_invoice (rollo continuo, el ticket crece con el contenido);
  // alto fijo para formatos con `page.height` definido (ej. etiquetas).
  const heightMm = height ? `${height.toFixed(2)}mm` : 'auto'

  let styleTag = document.getElementById(PRINT_STYLE_TAG_ID) as HTMLStyleElement | null
  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.id = PRINT_STYLE_TAG_ID
    document.head.appendChild(styleTag)
  }
  // No basta con declarar `@page`: algunos drivers/OS ignoran un tamaño de página
  // personalizado y usan el papel por defecto (ej. Letter/A4) del diálogo de impresión, lo
  // cual reduce proporcionalmente todo el contenido dentro de esa página más grande y el
  // ticket sale diminuto. Forzar explícitamente el ancho real en html/body evita que el motor
  // de impresión reinterprete el tamaño del contenido según el papel que termine usando.
  styleTag.textContent = `
    @page { size: ${paperMm} ${heightMm}; margin: 0; }
    @media print {
      html, body {
        width: ${paperMm} !important;
        height: ${heightMm === 'auto' ? 'auto' : heightMm} !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
    }
  `
  window.print()
}

type ActiveModal = 'conditional' | 'formula' | 'table' | 'preview' | null

export default function InvoiceTemplateEditorPage() {
  const {
    format, documents, loadingDocuments, availableFields, fieldsLoading, selectedIds, zoom, saving, history,
    templateGallery, galleryLoading, drafts,
    init, setFormat, setPageHeight, addPage, removePage,
    addElement, addElementFromField, updateElement, removeElement, duplicateElement,
    bringToFront, sendToBack, selectIds, beginTransaction, zoomIn, zoomOut, zoomByFactor, undo, redo, save,
    applyDocument, saveDraft, removeDraft,
  } = useTemplateEditorStore()

  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [previewDoc, setPreviewDoc] = useState<TemplateDocument | null>(null)
  const [pendingApply, setPendingApply] = useState<{ document: TemplateDocument; label: string } | null>(null)

  useEffect(() => { init() }, [init])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isEditableTarget = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if (isEditableTarget) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        selectedIds.forEach((id) => removeElement(id))
      }
      if (e.key === 'Escape') selectIds([])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, undo, redo, removeElement, selectIds])

  const doc = documents[format]
  const selectedElement = selectedIds.length === 1
    ? doc?.pages.flatMap((p) => p.elements).find((el) => el.id === selectedIds[0])
    : undefined
  const activeHistory = history[format]

  async function handleSave() {
    await save()
    toast.success('Plantilla guardada correctamente')
  }

  function handleTestPrint() {
    if (!doc) return
    printDocument(doc)
    toast.info('Selecciona tu impresora térmica (ej. Star TSP100) en el diálogo de impresión')
  }

  function handleUseGalleryItem(item: TemplateGalleryItem) {
    setPendingApply({ document: item.document, label: item.name })
  }

  function handlePreviewGalleryItem(item: TemplateGalleryItem) {
    setPreviewDoc(item.document)
  }

  function handlePreviewDraft(id: string) {
    const draft = getDraft(id)
    if (draft) setPreviewDoc(draft.document)
  }

  function handleLoadDraft(id: string) {
    const draft = getDraft(id)
    if (!draft) return
    setPendingApply({ document: draft.document, label: draft.name })
  }

  function confirmApply() {
    if (!pendingApply) return
    applyDocument(pendingApply.document)
    setPendingApply(null)
    toast.success('Plantilla aplicada al canvas')
  }

  if (loadingDocuments || !doc) {
    return (
      <div className="page-container">
        <PageHeader title="Editor de Plantillas" description="Diseña el formato de impresión de facturas y etiquetas" />
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: '48px 0' }}><span className="spinner spinner-brand spinner-md" /></div></div>
      </div>
    )
  }

  return (
    <div className="tpl-editor-page">
      <aside className="tpl-left-panel">
        <TemplateEditorLeftPanel
          fields={availableFields}
          fieldsLoading={fieldsLoading}
          onInsertField={(field) => addElementFromField(field)}
          onInsertElement={(type) => addElement(type)}
          gallery={templateGallery}
          galleryLoading={galleryLoading}
          onPreviewGalleryItem={handlePreviewGalleryItem}
          onUseGalleryItem={handleUseGalleryItem}
          drafts={drafts}
          onSaveDraft={(name) => { saveDraft(name); toast.success('Borrador guardado') }}
          onPreviewDraft={handlePreviewDraft}
          onLoadDraft={handleLoadDraft}
          onDeleteDraft={(id) => { removeDraft(id); toast.success('Borrador eliminado') }}
        />
      </aside>

      <div className="tpl-editor-content">
        <div className="tpl-editor-header">
          <PageHeader title="Editor de Plantillas" description="Diseña el formato de impresión de facturas y etiquetas" />
          <div className="ff-wrap tpl-format-select">
            <label className="ff-label">Formato de factura</label>
            <Select value={format} onValueChange={(v) => setFormat(v as TemplateType)}>
              {TEMPLATE_FORMATS.map((f) => (
                <SelectItem key={f.type} value={f.type} disabled={f.comingSoon}>
                  {f.label}{f.comingSoon ? ' (próximamente)' : ''}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="ff-wrap tpl-height-control">
            <label className="ff-label">Alto de página (px)</label>
            <div className="tpl-height-control-row">
              <label className="tpl-height-auto-toggle">
                <input
                  type="checkbox"
                  checked={doc.page.height === null}
                  onChange={(e) => {
                    if (e.target.checked) { setPageHeight(null); return }
                    const contentHeight = doc.pages
                      .flatMap((p) => p.elements)
                      .reduce((max, el) => Math.max(max, el.y + el.height), 0) + CANVAS_BOTTOM_MARGIN
                    setPageHeight(Math.round(contentHeight))
                  }}
                />
                Automático
              </label>
              {doc.page.height !== null && (
                <input
                  type="number"
                  className="ff-input"
                  min={20}
                  step={10}
                  value={doc.page.height}
                  onChange={(e) => setPageHeight(Math.max(20, Number(e.target.value) || 0))}
                />
              )}
            </div>
          </div>
        </div>

        <div className="tpl-editor-body">
          <div className="tpl-canvas-area">
            <TemplateEditorCanvas
              pageSpec={doc.page}
              pages={doc.pages}
              fields={availableFields}
              zoom={zoom}
              selectedIds={selectedIds}
              onSelectIds={selectIds}
              onBeginTransaction={beginTransaction}
              onUpdateElement={updateElement}
              onInsertElementAt={(type, pageId, x, y) => addElement(type, { x, y }, pageId)}
              onInsertFieldAt={(field, pageId, x, y) => addElementFromField(field, { x, y }, pageId)}
              onZoomByFactor={zoomByFactor}
              onAddPage={addPage}
              onRemovePage={removePage}
            />
            <TemplateEditorToolbar
              zoom={zoom}
              canUndo={activeHistory.past.length > 0}
              canRedo={activeHistory.future.length > 0}
              saving={saving}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onUndo={undo}
              onRedo={redo}
              onSave={handleSave}
              onPreview={() => setActiveModal('preview')}
              onTestPrint={handleTestPrint}
            />
          </div>

          <TemplateEditorRightPanel
            key={selectedElement?.id ?? 'none'}
            element={selectedElement}
            fields={availableFields}
            onUpdate={(patch) => selectedElement && updateElement(selectedElement.id, patch)}
            onDelete={() => selectedElement && removeElement(selectedElement.id)}
            onDuplicate={() => selectedElement && duplicateElement(selectedElement.id)}
            onBringToFront={() => selectedElement && bringToFront(selectedElement.id)}
            onSendToBack={() => selectedElement && sendToBack(selectedElement.id)}
            onOpenConditional={() => setActiveModal('conditional')}
            onOpenFormula={() => setActiveModal('formula')}
            onOpenTable={() => setActiveModal('table')}
          />
        </div>
      </div>

      {activeModal === 'conditional' && selectedElement?.type === 'conditional' && (
        <ConditionalRuleModal
          element={selectedElement}
          fields={availableFields}
          onSave={(rule) => updateElement(selectedElement.id, { rule })}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'formula' && selectedElement?.type === 'formula' && (
        <FormulaBuilderModal
          element={selectedElement}
          fields={availableFields}
          onSave={(formula, fieldKeys) => updateElement(selectedElement.id, { formula, fields: fieldKeys })}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'table' && selectedElement?.type === 'table' && (
        <TableColumnsModal
          element={selectedElement}
          onSave={(columns) => updateElement(selectedElement.id, { columns })}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'preview' && (
        <PreviewModal doc={doc} fields={availableFields} onClose={() => setActiveModal(null)} />
      )}

      {previewDoc && (
        <PreviewModal doc={previewDoc} fields={availableFields} onClose={() => setPreviewDoc(null)} />
      )}

      <ConfirmModal
        open={!!pendingApply}
        onClose={() => setPendingApply(null)}
        onConfirm={confirmApply}
        title="¿Reemplazar la plantilla actual?"
        description={`La plantilla que estás editando ahora mismo se perderá (a menos que la hayas guardado). ¿Deseas reemplazarla por "${pendingApply?.label ?? ''}"?`}
        confirmLabel="Sí, reemplazar"
        variant="danger"
      />

      <TemplateEditorPrintTarget doc={doc} fields={availableFields} />
    </div>
  )
}
