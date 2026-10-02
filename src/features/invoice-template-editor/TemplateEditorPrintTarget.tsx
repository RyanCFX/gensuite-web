import { TemplateEditorElementView } from './TemplateEditorElementView'
import { layoutPageWithFlow } from './flowLayout'
import type { TemplateDocument, TemplateElement, TemplateFieldCategory } from './types'

// El navegador renderiza CSS en "px" a 96dpi por convención. El modelo de la plantilla usa
// "px" a su propio `page.dpi` (203 para térmicas). `scale = 96 / dpi` se usa para "hornear" cada
// x/y/width/height/fontSize del elemento a su valor final en px de pantalla (ver `scaleElement`
// más abajo) — el tamaño FÍSICO resultante en el papel sigue siendo exactamente `page.width`
// convertido a mm, sin necesidad de un `transform: scale()` en el contenedor.
const CSS_PX_PER_INCH = 96

interface Props {
  doc: TemplateDocument
  fields: TemplateFieldCategory[]
  values?: Record<string, unknown>
  /** Impresión en lote (ej. etiquetas, §3.2 del doc de la tarea) — una entrada por instancia a
   * imprimir, en el mismo orden que se pidió. Cuando se pasa (no vacío), `doc.pages` se repite
   * una vez por cada entrada (cada una con sus propios `values`) y se ignora la prop `values`. */
  labels?: Record<string, unknown>[]
}

/** Multiplica por `factor` todos los campos de `el` que son una medida en px del modelo (x/y/
 * width/height siempre; fontSize/thickness/strokeWidth/borderRadius según el tipo) — todo lo
 * demás (binding, texto, colores, rotation en grados) queda igual. Usado para "hornear" el
 * escalado 203dpi -> 96dpi directamente en cada elemento en vez de un `transform: scale()` en
 * el contenedor (ver nota de `TemplateEditorPrintTarget` sobre por qué se evita el transform). */
function scaleElement(el: TemplateElement, factor: number): TemplateElement {
  const base = { ...el, x: el.x * factor, y: el.y * factor, width: el.width * factor, height: el.height * factor }
  switch (el.type) {
    case 'text':
    case 'formula':
    case 'table':
    case 'list':
    case 'date':
    case 'conditional':
      return { ...base, fontSize: el.fontSize * factor } as TemplateElement
    case 'repeater': {
      const lines = Array.isArray(el.lines) ? el.lines : []
      return {
        ...base,
        lines: lines.map((l) => ({ ...l, fontSize: (l.fontSize ?? 10) * factor, tokens: l.tokens.map((t) => ({ ...t })) })),
        lineGap: el.lineGap * factor,
        blockGap: el.blockGap * factor,
      } as TemplateElement
    }
    case 'line':
      return { ...base, thickness: Math.max(1, el.thickness * factor) } as TemplateElement
    case 'rectangle':
      return { ...base, strokeWidth: el.strokeWidth * factor, borderRadius: el.borderRadius * factor } as TemplateElement
    default:
      return base
  }
}

/** Nodo invisible en pantalla (ver `.tpl-print-root` en index.css) que solo se muestra al
 * imprimir — es lo único visible en la hoja/ticket físico cuando se llama a `window.print()`.
 * Cada página de la plantilla se manda como un trabajo de impresión separado (`break-after:
 * page` entre cada una, ver `.tpl-print-page-wrap` en index.css).
 *
 * No se usa `transform: scale()` para pasar de 203dpi a 96dpi (como hacía antes esta página) —
 * cada elemento se escala individualmente con `scaleElement` y se posiciona ya en sus
 * coordenadas/tamaños finales en px de pantalla. Eliminar el `transform` NO fue suficiente por sí
 * solo (confirmado con un PDF real de "Guardar como PDF" generado por Chrome: el texto de la fila
 * de la tabla de items directamente no existe en el content stream del PDF — no es un problema de
 * posición/color/recorte, Chrome omite imprimir ese nodo por completo). Cada wrapper de elemento
 * ahora lleva además `break-inside: avoid` / `page-break-inside: avoid`: Chrome tiene bugs de
 * paginación de impresión conocidos donde un descendiente de un ancestro `position: absolute`
 * puede quedar fuera del cálculo de fragmentación de página y se descarta del render — esto
 * fuerza a tratar cada elemento como una unidad indivisible para ese cálculo (pendiente de
 * confirmar con un PDF real que esto sí lo resuelve). */
export function TemplateEditorPrintTarget({ doc, fields, values, labels }: Props) {
  const scale = CSS_PX_PER_INCH / doc.page.dpi
  const instances = labels && labels.length > 0 ? labels : [values]

  function pageHeight(elements: TemplateElement[]) {
    return doc.page.height ?? elements.reduce((max, el) => Math.max(max, el.y + el.height), 0) + 24
  }

  return (
    <div className="tpl-print-root">
      {instances.map((instanceValues, instanceIndex) =>
        doc.pages.map((page) => {
          // Con datos reales, tablas y repetidores crecen y empujan lo de abajo — el alto de
          // la página y las posiciones se recalculan con ese layout de flujo.
          const flowed = instanceValues ? layoutPageWithFlow(page.elements, instanceValues).elements : page.elements
          const height = pageHeight(flowed)
          const scaledWidth = doc.page.width * scale
          const scaledHeight = height * scale
          return (
            <div
              key={`${instanceIndex}_${page.id}`}
              className="tpl-print-page-wrap"
              style={{ width: scaledWidth, height: scaledHeight }}
            >
              <div className="tpl-print-page" style={{ width: scaledWidth, height: scaledHeight }}>
                {flowed.map((el) => {
                  const scaled = scaleElement(el, scale)
                  return (
                    <div
                      key={el.id}
                      style={{
                        position: 'absolute',
                        left: scaled.x,
                        top: scaled.y,
                        width: scaled.width,
                        height: scaled.height,
                        transform: `rotate(${el.rotation}deg)`,
                        breakInside: 'avoid',
                        pageBreakInside: 'avoid',
                      }}
                    >
                      <TemplateEditorElementView element={scaled} fields={fields} values={instanceValues} />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }),
      )}
    </div>
  )
}
