import { useEffect, useMemo, useRef, useState } from 'react'
import Moveable from 'react-moveable'
import Selecto from 'react-selecto'
import { Plus, X } from 'lucide-react'
import { CANVAS_BOTTOM_MARGIN, MIN_CANVAS_HEIGHT } from './constants'
import { TemplateEditorElementView } from './TemplateEditorElementView'
import type { PageSpec, TemplateElement, TemplateFieldCategory, TemplateFieldDef, TemplatePage } from './types'
import { readDragPayload } from './dragPayload'

interface Props {
  pageSpec: PageSpec
  pages: TemplatePage[]
  fields: TemplateFieldCategory[]
  zoom: number
  selectedIds: string[]
  onSelectIds: (ids: string[]) => void
  onBeginTransaction: () => void
  onUpdateElement: (id: string, patch: Partial<TemplateElement>) => void
  onInsertElementAt: (type: TemplateElement['type'], pageId: string, x: number, y: number) => void
  onInsertFieldAt: (field: TemplateFieldDef, pageId: string, x: number, y: number) => void
  onZoomByFactor: (factor: number) => void
  onAddPage: () => void
  onRemovePage: (pageId: string) => void
}

function contentHeightFor(pageSpec: PageSpec, elements: TemplateElement[]) {
  const tallest = elements.reduce((max, el) => Math.max(max, el.y + el.height), 0)
  const base = pageSpec.height ?? MIN_CANVAS_HEIGHT
  return Math.max(base, tallest + CANVAS_BOTTOM_MARGIN)
}

export function TemplateEditorCanvas({
  pageSpec, pages, fields, zoom, selectedIds, onSelectIds, onBeginTransaction, onUpdateElement, onInsertElementAt, onInsertFieldAt, onZoomByFactor, onAddPage, onRemovePage,
}: Props) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [pageNodes, setPageNodes] = useState<Record<string, HTMLDivElement>>({})
  const [elementNodes, setElementNodes] = useState<Record<string, HTMLDivElement>>({})
  const selectoRef = useRef<Selecto>(null)
  const moveableRef = useRef<Moveable>(null)
  // Cache de callbacks de ref estables por id — un callback inline nuevo en cada render haría que
  // React desmonte/remonte el nodo en cada ciclo (ref distinta -> detach+attach -> setState -> loop).
  const elementRefCallbacks = useRef<Map<string, (node: HTMLDivElement | null) => void>>(new Map())
  const pageRefCallbacks = useRef<Map<string, (node: HTMLDivElement | null) => void>>(new Map())
  // Posición/rotación de cada elemento al iniciar un gesto de arrastre/resize, usada para calcular
  // la posición final como start + delta en vez de confiar en la descomposición de la matriz de
  // transformación que expone Moveable (left/top) — con el canvas escalado por `zoom` esa
  // descomposición no siempre coincide con el modelo, lo que hacía "saltar" el elemento a otra
  // posición al soltarlo.
  const gestureStart = useRef<Record<string, { x: number; y: number; rotation: number }>>({})

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

  // A qué página pertenece cada elemento — usado para saber dónde montar Moveable (debe vivir
  // dentro del mismo `.tpl-canvas-page` escalado que sus elementos, ver nota más abajo) y para
  // limitar las guías de alineación a elementos de la misma página que la selección.
  const elementPageId = useMemo(() => {
    const map: Record<string, string> = {}
    pages.forEach((p) => p.elements.forEach((el) => { map[el.id] = p.id }))
    return map
  }, [pages])

  const selectedTargets = selectedIds
    .map((id) => elementNodes[id])
    .filter((n): n is HTMLDivElement => !!n)

  const selectedPageId = selectedIds.length > 0 ? elementPageId[selectedIds[0]] : undefined

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

  function getPageRefCallback(pageId: string) {
    let callback = pageRefCallbacks.current.get(pageId)
    if (!callback) {
      callback = (node: HTMLDivElement | null) => {
        setPageNodes((prev) => {
          if (node) {
            if (prev[pageId] === node) return prev
            return { ...prev, [pageId]: node }
          }
          if (!(pageId in prev)) return prev
          const next = { ...prev }
          delete next[pageId]
          return next
        })
      }
      pageRefCallbacks.current.set(pageId, callback)
    }
    return callback
  }

  function handleDrop(e: React.DragEvent, pageId: string) {
    e.preventDefault()
    const payload = readDragPayload(e)
    const pageNode = pageNodes[pageId]
    if (!payload || !pageNode) return
    const rect = pageNode.getBoundingClientRect()
    const x = Math.max(0, (e.clientX - rect.left) / zoom)
    const y = Math.max(0, (e.clientY - rect.top) / zoom)
    if (payload.kind === 'element') onInsertElementAt(payload.elementType, pageId, x, y)
    else onInsertFieldAt(payload.field, pageId, x, y)
  }

  return (
    <div className="tpl-canvas-scroll" ref={setScrollEl}>
      <div className="tpl-canvas-pages">
        {
          /* getPageRefCallback/getElementRefCallback read a memo cache of stable ref-callback
             closures (keyed by page/element id), not DOM/rendered data; without this cache every
             render would hand React a brand new inline callback per node, forcing a detach+attach
             cycle that causes an infinite update loop. */
          // eslint-disable-next-line react-hooks/refs
          pages.map((p, pageIndex) => {
          const canvasHeight = contentHeightFor(pageSpec, p.elements)
          const isActivePage = p.id === selectedPageId

          return (
            <div key={p.id} className="tpl-canvas-page-block">
              <div className="tpl-canvas-page-label-row">
                <span className="tpl-canvas-page-label">Página {pageIndex + 1}</span>
                {pages.length > 1 && (
                  <button type="button" className="tpl-canvas-page-remove" title="Eliminar página" onClick={() => onRemovePage(p.id)}>
                    <X size={11} />
                  </button>
                )}
              </div>
              <div
                className="tpl-canvas-page"
                ref={getPageRefCallback(p.id)}
                data-page-id={p.id}
                style={{ width: pageSpec.width, height: canvasHeight, transform: `scale(${zoom})` }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                onDrop={(e) => handleDrop(e, p.id)}
              >
                <div className="tpl-cut-guide" style={{ top: canvasHeight - CANVAS_BOTTOM_MARGIN / 2 }} />

                {
                  p.elements.map((el) => (
                  <div
                    key={el.id}
                    data-id={el.id}
                    ref={getElementRefCallback(el.id)}
                    className={`tpl-el${selectedIds.includes(el.id) ? ' tpl-el-selected' : ''}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: el.width,
                      height: el.height,
                      transform: `translate(${el.x}px, ${el.y}px) rotate(${el.rotation}deg)`,
                    }}
                  >
                    <TemplateEditorElementView element={el} fields={fields} />
                  </div>
                  ))
                }

                {/* Moveable se monta DENTRO del mismo elemento escalado (`.tpl-canvas-page`) que los
                    elementos que controla — si se monta como hermano fuera del
                    `transform: scale(zoom)`, su caja de selección queda calculada en otro sistema
                    de coordenadas y aparece desplazada respecto al elemento real. Por eso solo se
                    monta dentro de la página que realmente contiene la selección actual. */}
                {isActivePage && selectedTargets.length > 0 && (
                  <Moveable
                    ref={moveableRef}
                    target={selectedTargets}
                    container={pageNodes[p.id]}
                    draggable
                    resizable={selectedTargets.length === 1}
                    rotatable={selectedTargets.length === 1}
                    snappable
                    snapThreshold={5}
                    bounds={{ left: 0, top: 0, right: 0, bottom: 0, position: 'css' }}
                    elementGuidelines={p.elements
                      .filter((el) => !selectedIds.includes(el.id))
                      .map((el) => elementNodes[el.id])
                      .filter((n): n is HTMLDivElement => !!n)}
                    onDragStart={({ target, set }) => {
                      onBeginTransaction()
                      const id = target.getAttribute('data-id')
                      const el = id ? p.elements.find((e) => e.id === id) : undefined
                      if (!id || !el) return
                      gestureStart.current[id] = { x: el.x, y: el.y, rotation: el.rotation }
                      // Le decimos a Moveable la posición actual (en vez de asumir [0,0]) para que
                      // `beforeTranslate` sea directamente la nueva posición absoluta, no un delta
                      // que habría que sumar manualmente (sumar dos veces la posición inicial era
                      // el bug que hacía "saltar" el elemento a otro lugar al soltarlo).
                      set([el.x, el.y])
                    }}
                    onDrag={({ target, beforeTranslate }) => {
                      const id = target.getAttribute('data-id')
                      const start = id ? gestureStart.current[id] : undefined
                      if (!start) return
                      target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px) rotate(${start.rotation}deg)`
                    }}
                    onDragEnd={({ target, lastEvent }) => {
                      const id = target.getAttribute('data-id')
                      if (!id || !gestureStart.current[id] || !lastEvent) return
                      onUpdateElement(id, { x: lastEvent.beforeTranslate[0], y: lastEvent.beforeTranslate[1] })
                      delete gestureStart.current[id]
                    }}
                    onDragGroupStart={({ events }) => {
                      onBeginTransaction()
                      events.forEach(({ target, set }) => {
                        const id = target.getAttribute('data-id')
                        const el = id ? p.elements.find((e) => e.id === id) : undefined
                        if (!id || !el) return
                        gestureStart.current[id] = { x: el.x, y: el.y, rotation: el.rotation }
                        set([el.x, el.y])
                      })
                    }}
                    onDragGroup={({ events }) => events.forEach(({ target, beforeTranslate }) => {
                      const id = target.getAttribute('data-id')
                      const start = id ? gestureStart.current[id] : undefined
                      if (!start) return
                      target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px) rotate(${start.rotation}deg)`
                    })}
                    onDragGroupEnd={({ events }) => events.forEach(({ target, lastEvent }) => {
                      const id = target.getAttribute('data-id')
                      if (!id || !gestureStart.current[id] || !lastEvent) return
                      onUpdateElement(id, { x: lastEvent.beforeTranslate[0], y: lastEvent.beforeTranslate[1] })
                      delete gestureStart.current[id]
                    })}
                    onResizeStart={({ target, dragStart }) => {
                      onBeginTransaction()
                      const id = target.getAttribute('data-id')
                      const el = id ? p.elements.find((e) => e.id === id) : undefined
                      if (!id || !el) return
                      gestureStart.current[id] = { x: el.x, y: el.y, rotation: el.rotation }
                      if (dragStart) dragStart.set([el.x, el.y])
                    }}
                    onResize={({ target, width, height, drag }) => {
                      const id = target.getAttribute('data-id')
                      const start = id ? gestureStart.current[id] : undefined
                      if (!start) return
                      target.style.width = `${width}px`
                      target.style.height = `${height}px`
                      target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px) rotate(${start.rotation}deg)`
                    }}
                    onResizeEnd={({ target, lastEvent }) => {
                      const id = target.getAttribute('data-id')
                      if (!id || !gestureStart.current[id] || !lastEvent) return
                      onUpdateElement(id, {
                        width: lastEvent.width,
                        height: lastEvent.height,
                        x: lastEvent.drag.beforeTranslate[0],
                        y: lastEvent.drag.beforeTranslate[1],
                      })
                      delete gestureStart.current[id]
                    }}
                    onRotateStart={({ target }) => {
                      onBeginTransaction()
                      const id = target.getAttribute('data-id')
                      const el = id ? p.elements.find((e) => e.id === id) : undefined
                      if (id && el) gestureStart.current[id] = { x: el.x, y: el.y, rotation: el.rotation }
                    }}
                    onRotate={({ target, rotation }) => {
                      const id = target.getAttribute('data-id')
                      const start = id ? gestureStart.current[id] : undefined
                      if (!start) return
                      // La rotación gira alrededor del centro del propio elemento (transform-origin
                      // 50% 50%), así que x/y (la esquina superior-izquierda antes de rotar) no
                      // cambian.
                      target.style.transform = `translate(${start.x}px, ${start.y}px) rotate(${rotation}deg)`
                    }}
                    onRotateEnd={({ target, lastEvent }) => {
                      const id = target.getAttribute('data-id')
                      if (!id || !gestureStart.current[id] || !lastEvent) return
                      onUpdateElement(id, { rotation: lastEvent.rotation })
                      delete gestureStart.current[id]
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}

        <button type="button" className="tpl-add-page-btn" onClick={onAddPage}>
          <Plus size={15} /> Agregar página
        </button>
      </div>

      <Selecto
        ref={selectoRef}
        container={scrollEl}
        dragContainer={scrollEl}
        selectableTargets={['.tpl-el']}
        hitRate={0}
        selectByClick
        selectFromInside={false}
        toggleContinueSelect={['shift']}
        ratio={0}
        onDragStart={(e) => {
          const moveable = moveableRef.current
          const target = e.inputEvent.target as HTMLElement
          if (moveable && (moveable.isMoveableElement(target) || selectedTargets.some((t) => t === target || t.contains(target)))) {
            e.stop()
          }
        }}
        onSelectEnd={(e) => {
          const moveable = moveableRef.current
          if (e.isDragStart && moveable) {
            e.inputEvent.preventDefault()
            moveable.waitToChangeTarget().then(() => moveable.dragStart(e.inputEvent))
          }
          const ids = e.selected.map((node) => node.getAttribute('data-id')).filter((id): id is string => !!id)
          onSelectIds(ids)
        }}
      />
    </div>
  )
}
