import { TemplateEditorElementView } from './TemplateEditorElementView'
import type { TemplateDocument, TemplateElement, TemplateFieldCategory } from './types'

// El navegador renderiza CSS en "px" a 96dpi por convención. El modelo de la plantilla usa
// "px" a su propio `page.dpi` (203 para térmicas). Escalando el árbol (ya construido en las
// mismas unidades que el canvas, sin necesidad de duplicar el renderer) por `96 / dpi`, el
// tamaño FÍSICO resultante en el papel es exactamente `page.width` convertido a mm — sin
// tener que convertir cada x/y/width/fontSize individualmente a mm.
const CSS_PX_PER_INCH = 96

interface Props {
  doc: TemplateDocument
  fields: TemplateFieldCategory[]
}

/** Nodo invisible en pantalla (ver `.tpl-print-root` en index.css) que solo se muestra al
 * imprimir — es lo único visible en la hoja/ticket físico cuando se llama a `window.print()`.
 * Cada página de la plantilla se manda como un trabajo de impresión separado (`break-after:
 * page` entre cada una, ver `.tpl-print-page-wrap` en index.css). */
export function TemplateEditorPrintTarget({ doc, fields }: Props) {
  const scale = CSS_PX_PER_INCH / doc.page.dpi

  function pageHeight(elements: TemplateElement[]) {
    return doc.page.height ?? elements.reduce((max, el) => Math.max(max, el.y + el.height), 0) + 24
  }

  return (
    <div className="tpl-print-root">
      {doc.pages.map((page) => {
        const height = pageHeight(page.elements)
        return (
          // El wrapper tiene el tamaño FÍSICO real ya escalado (post-transform) — flexbox lo
          // centra usando estas dimensiones reales. `.tpl-print-page` adentro conserva su
          // ancho "de modelo" (sin escalar) y solo se ve más chico visualmente por su propio
          // `transform: scale()`; centrar por flexbox el elemento SIN transformar centraría
          // según su caja de layout original (576px), no según su tamaño visual real
          // (~72mm/272px).
          <div key={page.id} className="tpl-print-page-wrap" style={{ width: doc.page.width * scale, height: height * scale }}>
            <div className="tpl-print-page" style={{ width: doc.page.width, height, transform: `scale(${scale})` }}>
              {page.elements.map((el) => (
                <div
                  key={el.id}
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
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
