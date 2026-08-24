import { useEffect, useMemo, useRef, useState } from 'react'
import Moveable from 'react-moveable'
import type { CreateChequePrintTemplateDto } from '@/shared/api/types'
import { ChequeElementView } from './ChequeElementView'
import { readElement, writeElement } from './mapping'
import { CHEQUE_ELEMENTS, GRID_CM, PX_PER_CM, SNAP_CM, type ChequeElementId } from './constants'
import type { ChequeBackgroundImage } from './backgroundImage'

interface Props {
  values: CreateChequePrintTemplateDto
  zoom: number
  selectedId: ChequeElementId | null
  onSelectId: (id: ChequeElementId | null) => void
  onBeginTransaction: () => void
  onUpdateValues: (patch: Partial<CreateChequePrintTemplateDto>) => void
  showGrid: boolean
  showRulers: boolean
  snapEnabled: boolean
  background: ChequeBackgroundImage | null
  onZoomByFactor: (factor: number) => void
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

export function ChequeCanvas({
  values, zoom, selectedId, onSelectId, onBeginTransaction, onUpdateValues,
  showGrid, showRulers, snapEnabled, background, onZoomByFactor,
}: Props) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [sheetNode, setSheetNode] = useState<HTMLDivElement | null>(null)
  const [elementNodes, setElementNodes] = useState<Record<string, HTMLDivElement>>({})
  const moveableRef = useRef<Moveable>(null)
  // Caché de callbacks de ref estables por id — un callback inline nuevo en cada render forzaría a
  // React a desmontar/remontar el nodo (ref distinta -> detach+attach -> setState -> loop).
  const elementRefCallbacks = useRef<Map<string, (node: HTMLDivElement | null) => void>>(new Map())
  // Posición de cada elemento al iniciar un gesto de arrastre/resize — usada para calcular la
  // posición final como start + delta en vez de confiar en la descomposición de matriz que expone
  // Moveable (left/top), que no coincide con el modelo cuando el canvas está escalado por `zoom`.
  const gestureStart = useRef<Record<string, { xCm: number; yCm: number }>>({})

  useEffect(() => {
    if (!scrollEl) return
    function handleWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      onZoomByFactor(e.deltaY > 0 ? 0.9 : 1.1)
    }
    scrollEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => scrollEl.removeEventListener('wheel', handleWheel)
  }, [scrollEl, onZoomByFactor])

  const chequeWidthCm = values.chequeWidth ?? 19
  const chequeHeightCm = values.chequeHeight ?? 8.5
  const isA4 = values.chequeSize === 'A4'
  const chequeOffsetTopCm = isA4 ? (values.startingPositionFromTopEdge ?? 0) : 0

  // En A4 se dibuja la hoja completa y el cheque como recuadro desplazado; en Regular la "hoja"
  // es el propio cheque. Las coordenadas de cada elemento son siempre relativas al cheque (así
  // las genera el print format), no a la hoja A4.
  const sheetWidthCm = isA4 ? 21 : chequeWidthCm
  const sheetHeightCm = isA4 ? 29.7 : chequeHeightCm

  const visibleElements = useMemo(
    () => CHEQUE_ELEMENTS.filter((def) => !def.optional || values.isAccountPayable),
    [values.isAccountPayable],
  )

  function getElementRefCallback(id: string) {
    let callback = elementRefCallbacks.current.get(id)
    if (!callback) {
      callback = (node: HTMLDivElement | null) => {
        setElementNodes((prev) => {
          if (node) {
            if (prev[id] === node) return prev
            return { ...prev, [id]: node }
          }
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
      elementRefCallbacks.current.set(id, callback)
    }
    return callback
  }

  const selectedTarget = selectedId ? elementNodes[selectedId] : undefined
  const selectedDef = selectedId ? CHEQUE_ELEMENTS.find((d) => d.id === selectedId) : undefined

  const gridSizePx = GRID_CM * PX_PER_CM
  const rulerMarksV = showRulers ? Array.from({ length: Math.ceil(sheetHeightCm) + 1 }, (_, i) => i) : []
  const rulerMarksH = showRulers ? Array.from({ length: Math.ceil(sheetWidthCm) + 1 }, (_, i) => i) : []

  return (
    <div className="chq-canvas-scroll" ref={setScrollEl}>
      <div className="chq-canvas-inner" style={{ transform: `scale(${zoom})` }}>
        {showRulers && (
          <>
            <div className="chq-ruler chq-ruler-h" style={{ width: sheetWidthCm * PX_PER_CM }}>
              {rulerMarksH.map((cm) => (
                <span key={cm} className="chq-ruler-mark" style={{ left: cm * PX_PER_CM }}>{cm}</span>
              ))}
            </div>
            <div className="chq-ruler chq-ruler-v" style={{ height: sheetHeightCm * PX_PER_CM }}>
              {rulerMarksV.map((cm) => (
                <span key={cm} className="chq-ruler-mark" style={{ top: cm * PX_PER_CM }}>{cm}</span>
              ))}
            </div>
          </>
        )}

        <div
          className="chq-sheet"
          style={{ width: sheetWidthCm * PX_PER_CM, height: sheetHeightCm * PX_PER_CM }}
          onClick={(e) => { if (e.target === e.currentTarget) onSelectId(null) }}
        >
          <div
            ref={setSheetNode}
            className={`chq-cheque${isA4 ? ' chq-cheque-a4-inset' : ''}`}
            style={{
              width: chequeWidthCm * PX_PER_CM,
              height: chequeHeightCm * PX_PER_CM,
              top: chequeOffsetTopCm * PX_PER_CM,
              // Color de línea fijo (no ligado al tema): el papel del cheque siempre es blanco,
              // en claro u oscuro, así que la cuadrícula debe ser siempre el mismo gris tenue
              // sobre blanco — usar `var(--border-subtle)` aquí se volvía casi negro en modo
              // oscuro (ese token es para superficies oscuras, no para dibujar sobre papel).
              backgroundImage: showGrid
                ? `repeating-linear-gradient(to right, rgba(17,24,39,0.08) 0, rgba(17,24,39,0.08) 1px, transparent 1px, transparent ${gridSizePx}px), repeating-linear-gradient(to bottom, rgba(17,24,39,0.08) 0, rgba(17,24,39,0.08) 1px, transparent 1px, transparent ${gridSizePx}px)`
                : undefined,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onSelectId(null) }}
          >
            {background?.visible && (
              <img
                className="chq-bg-image"
                src={background.dataUrl}
                alt=""
                style={{ opacity: background.opacity }}
                draggable={false}
              />
            )}

            {visibleElements.map((def) => {
              const box = readElement(values, def)
              return (
                <div
                  key={def.id}
                  data-id={def.id}
                  ref={getElementRefCallback(def.id)}
                  className={`chq-el${selectedId === def.id ? ' chq-el-selected' : ''}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: box.wCm * PX_PER_CM,
                    height: box.hCm * PX_PER_CM,
                    transform: `translate(${box.xCm * PX_PER_CM}px, ${box.yCm * PX_PER_CM}px)`,
                  }}
                  onClick={(e) => { e.stopPropagation(); onSelectId(def.id) }}
                >
                  <ChequeElementView def={def} values={values} />
                </div>
              )
            })}

            {selectedTarget && selectedDef && (
              <Moveable
                ref={moveableRef}
                target={selectedTarget}
                container={sheetNode}
                draggable
                resizable={!!selectedDef.widthKey}
                renderDirections={selectedDef.widthKey ? ['e', 'w'] : []}
                rotatable={false}
                snappable
                snapThreshold={5}
                snapGridWidth={snapEnabled ? SNAP_CM * PX_PER_CM : undefined}
                snapGridHeight={snapEnabled ? SNAP_CM * PX_PER_CM : undefined}
                isDisplaySnapDigit={false}
                bounds={{ left: 0, top: 0, right: 0, bottom: 0, position: 'css' }}
                elementGuidelines={visibleElements
                  .filter((d) => d.id !== selectedId)
                  .map((d) => elementNodes[d.id])
                  .filter((n): n is HTMLDivElement => !!n)}
                onDragStart={({ target, set }) => {
                  onBeginTransaction()
                  const id = target.getAttribute('data-id') as ChequeElementId | null
                  const def = id ? CHEQUE_ELEMENTS.find((d) => d.id === id) : undefined
                  if (!id || !def) return
                  const box = readElement(values, def)
                  gestureStart.current[id] = { xCm: box.xCm, yCm: box.yCm }
                  // Le indicamos a Moveable la posición actual (en vez de asumir [0,0]) para que
                  // `beforeTranslate` sea directamente la posición absoluta nueva, no un delta.
                  set([box.xCm * PX_PER_CM, box.yCm * PX_PER_CM])
                }}
                onDrag={({ target, beforeTranslate }) => {
                  target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px)`
                }}
                onDragEnd={({ target, lastEvent }) => {
                  const id = target.getAttribute('data-id') as ChequeElementId | null
                  const def = id ? CHEQUE_ELEMENTS.find((d) => d.id === id) : undefined
                  if (!id || !def || !gestureStart.current[id] || !lastEvent) return
                  onUpdateValues(writeElement(values, def, {
                    xCm: round2(lastEvent.beforeTranslate[0] / PX_PER_CM),
                    yCm: round2(lastEvent.beforeTranslate[1] / PX_PER_CM),
                  }))
                  delete gestureStart.current[id]
                }}
                onResizeStart={({ target, dragStart }) => {
                  onBeginTransaction()
                  const id = target.getAttribute('data-id') as ChequeElementId | null
                  const def = id ? CHEQUE_ELEMENTS.find((d) => d.id === id) : undefined
                  if (!id || !def) return
                  const box = readElement(values, def)
                  gestureStart.current[id] = { xCm: box.xCm, yCm: box.yCm }
                  if (dragStart) dragStart.set([box.xCm * PX_PER_CM, box.yCm * PX_PER_CM])
                }}
                onResize={({ target, width, drag }) => {
                  target.style.width = `${width}px`
                  target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px)`
                }}
                onResizeEnd={({ target, lastEvent }) => {
                  const id = target.getAttribute('data-id') as ChequeElementId | null
                  const def = id ? CHEQUE_ELEMENTS.find((d) => d.id === id) : undefined
                  if (!id || !def || !gestureStart.current[id] || !lastEvent) return
                  onUpdateValues(writeElement(values, def, {
                    wCm: round2(lastEvent.width / PX_PER_CM),
                    xCm: round2(lastEvent.drag.beforeTranslate[0] / PX_PER_CM),
                    yCm: round2(lastEvent.drag.beforeTranslate[1] / PX_PER_CM),
                  }))
                  delete gestureStart.current[id]
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
