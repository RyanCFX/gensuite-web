import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import {
  getChequePrintTemplate,
  createChequePrintTemplate,
  updateChequePrintTemplate,
  regenerarChequePrintTemplate,
} from '@/shared/api/tesoreria'
import type { CreateChequePrintTemplateDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { ChequeCanvas } from './cheque-template-editor/ChequeCanvas'
import { ChequeEditorToolbar } from './cheque-template-editor/ChequeEditorToolbar'
import { ChequePropertiesPanel } from './cheque-template-editor/ChequePropertiesPanel'
import { CHEQUE_ELEMENTS, DEFAULT_ZOOM, ZOOM_LEVELS, type ChequeElementId } from './cheque-template-editor/constants'
import {
  clearBackgroundImage,
  getBackgroundImage,
  readFileAsDataUrl,
  setBackgroundImage,
  type ChequeBackgroundImage,
} from './cheque-template-editor/backgroundImage'

type FormValues = Omit<CreateChequePrintTemplateDto, 'bankName'> & { bankName: string }

const EMPTY: FormValues = {
  bankName: '',
  chequeSize: 'Regular',
  startingPositionFromTopEdge: undefined,
  chequeWidth: undefined,
  chequeHeight: undefined,
  isAccountPayable: false,
  accPayDistFromTopEdge: undefined,
  accPayDistFromLeftEdge: undefined,
  messageToShow: '',
  dateDistFromTopEdge: undefined,
  dateDistFromLeftEdge: undefined,
  payerNameFromTopEdge: undefined,
  payerNameFromLeftEdge: undefined,
  amtInWordsFromTopEdge: undefined,
  amtInWordsFromLeftEdge: undefined,
  amtInWordWidth: undefined,
  amtInWordsLineSpacing: undefined,
  amtInFiguresFromTopEdge: undefined,
  amtInFiguresFromLeftEdge: undefined,
  accNoDistFromTopEdge: undefined,
  accNoDistFromLeftEdge: undefined,
  signatoryFromTopEdge: undefined,
  signatoryFromLeftEdge: undefined,
}

export default function PlantillaChequeForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<FormValues>(EMPTY)
  const [pendienteRegenerar, setPendienteRegenerar] = useState(false)
  const [selectedId, setSelectedId] = useState<ChequeElementId | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [showGrid, setShowGrid] = useState(true)
  const [showRulers, setShowRulers] = useState(true)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [background, setBackground] = useState<ChequeBackgroundImage | null>(null)
  const [history, setHistory] = useState<{ past: FormValues[]; future: FormValues[] }>({ past: [], future: [] })

  const backgroundKey = id ?? 'nueva'

  const { data: existing, isLoading } = useQuery({
    queryKey: ['tesoreria-cheque-print-template', id],
    queryFn: () => getChequePrintTemplate(id!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) setValues(existing)
  }, [existing])

  useEffect(() => {
    setBackground(getBackgroundImage(backgroundKey))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundKey])

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
      if (e.key === 'Escape') { setSelectedId(null); return }

      if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        moveSelected(e.key, e.shiftKey)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, values])

  function moveSelected(key: string, shift: boolean) {
    const def = CHEQUE_ELEMENTS.find((d) => d.id === selectedId)
    if (!def) return
    const step = shift ? 1 : 0.1
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    if (dx === 0 && dy === 0) return
    beginTransaction()
    const top = (values[def.topKey] as number | undefined) ?? def.defaultTopCm
    const left = (values[def.leftKey] as number | undefined) ?? def.defaultLeftCm
    setValues((v) => ({
      ...v,
      [def.topKey]: Math.round(Math.max(0, top + dy) * 100) / 100,
      [def.leftKey]: Math.round(Math.max(0, left + dx) * 100) / 100,
    }))
  }

  function beginTransaction() {
    setHistory((h) => ({ past: [...h.past, values], future: [] }))
  }

  function undo() {
    setHistory((h) => {
      if (h.past.length === 0) return h
      const prev = h.past[h.past.length - 1]
      setValues(prev)
      return { past: h.past.slice(0, -1), future: [values, ...h.future] }
    })
  }

  function redo() {
    setHistory((h) => {
      if (h.future.length === 0) return h
      const next = h.future[0]
      setValues(next)
      return { past: [...h.past, values], future: h.future.slice(1) }
    })
  }

  function handleChange(patch: Partial<FormValues>) {
    setValues((v) => ({ ...v, ...patch }))
  }

  const isDirty = useDirtyCheck({ values }, !isEdit || !isLoading)
  useBeforeUnloadWarning(isDirty)

  const createMutation = useMutation({
    mutationFn: (dto: CreateChequePrintTemplateDto) => createChequePrintTemplate(dto),
    onSuccess: (t) => {
      toast.success('Plantilla creada — ajusta las posiciones y regenera cuando estén listas')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-templates'] })
      navigate(`/config/tesoreria/plantillas-cheque/${encodeURIComponent(t.bankName)}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la plantilla'),
  })

  const updateMutation = useMutation({
    mutationFn: (dto: Parameters<typeof updateChequePrintTemplate>[1]) => updateChequePrintTemplate(id!, dto),
    onSuccess: () => {
      toast.success('Posiciones actualizadas')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-template', id] })
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-templates'] })
      // No confiar en hasPrintFormat de la respuesta del PUT — el doc 41 advierte que puede no
      // reflejar el estado real hasta releer el detalle. Mostrar el banner siempre tras un PUT.
      setPendienteRegenerar(true)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la plantilla'),
  })

  const regenerarMutation = useMutation({
    mutationFn: () => regenerarChequePrintTemplate(id!),
    onSuccess: () => {
      toast.success('Plantilla regenerada')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-template', id] })
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-templates'] })
      setPendienteRegenerar(false)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al regenerar la plantilla'),
  })

  function handleSave() {
    if (!values.bankName) {
      toast.error('El nombre de la plantilla es requerido')
      return
    }
    if (isEdit) {
      // `values` es una variable (no un literal), así que TS permite el campo extra `bankName`
      // aunque el DTO de update no lo declare — el backend lo ignora, no es editable tras crear.
      updateMutation.mutate(values)
    } else {
      createMutation.mutate(values)
    }
  }

  async function handleUploadBackground(file: File) {
    const dataUrl = await readFileAsDataUrl(file)
    const next: ChequeBackgroundImage = { dataUrl, opacity: background?.opacity ?? 0.5, visible: true }
    const error = setBackgroundImage(backgroundKey, next)
    if (error) {
      toast.error(error)
      return
    }
    setBackground(next)
  }

  function handleClearBackground() {
    clearBackgroundImage(backgroundKey)
    setBackground(null)
  }

  function handleBackgroundOpacityChange(opacity: number) {
    if (!background) return
    const next = { ...background, opacity }
    setBackgroundImage(backgroundKey, next)
    setBackground(next)
  }

  function zoomByFactor(factor: number) {
    setZoom((z) => Math.min(2, Math.max(0.5, Math.round(z * factor * 100) / 100)))
  }

  function zoomStep(dir: 1 | -1) {
    const idx = ZOOM_LEVELS.findIndex((z) => z >= zoom)
    const nextIdx = dir === 1 ? Math.min(ZOOM_LEVELS.length - 1, idx + 1) : Math.max(0, idx - 1)
    setZoom(ZOOM_LEVELS[nextIdx] ?? DEFAULT_ZOOM)
  }

  if (isEdit && isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 24 }} />
        <span className="skeleton-box" style={{ height: 320, display: 'block' }} />
      </div>
    )
  }

  return (
    <div className="chq-editor-page">
      <div className="chq-editor-header">
        <a className="page-back-link" onClick={() => navigate('/config/tesoreria/plantillas-cheque')}>
          <ArrowLeft size={14} /> Plantillas de Cheque
        </a>
        <PageHeader
          title={isEdit ? `Editar Plantilla: ${id}` : 'Nueva Plantilla de Cheque'}
          description="Arrastra cada elemento sobre el cheque para posicionarlo, o ajusta las coordenadas exactas en el panel derecho"
        />
      </div>

      <div className="chq-editor-body">
        <div className="chq-canvas-area">
          <ChequeCanvas
            values={values}
            zoom={zoom}
            selectedId={selectedId}
            onSelectId={setSelectedId}
            onBeginTransaction={beginTransaction}
            onUpdateValues={handleChange}
            showGrid={showGrid}
            showRulers={showRulers}
            snapEnabled={snapEnabled}
            background={background}
            onZoomByFactor={zoomByFactor}
          />
          <ChequeEditorToolbar
            zoom={zoom}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            saving={createMutation.isPending || updateMutation.isPending}
            showGrid={showGrid}
            showRulers={showRulers}
            snapEnabled={snapEnabled}
            hasBackground={!!background}
            backgroundOpacity={background?.opacity ?? 0.5}
            pendienteRegenerar={pendienteRegenerar}
            regenerando={regenerarMutation.isPending}
            onZoomIn={() => zoomStep(1)}
            onZoomOut={() => zoomStep(-1)}
            onUndo={undo}
            onRedo={redo}
            onSave={handleSave}
            onToggleGrid={() => setShowGrid((v) => !v)}
            onToggleRulers={() => setShowRulers((v) => !v)}
            onToggleSnap={() => setSnapEnabled((v) => !v)}
            onUploadBackground={handleUploadBackground}
            onClearBackground={handleClearBackground}
            onBackgroundOpacityChange={handleBackgroundOpacityChange}
            onRegenerar={() => regenerarMutation.mutate()}
          />
        </div>

        <ChequePropertiesPanel
          values={values}
          isEdit={isEdit}
          selectedId={selectedId}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}
