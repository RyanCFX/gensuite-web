import { toast } from 'sonner'
import { getMiSeleccion } from '@/shared/api/impresoras'
import { printHtmlViaQz } from '@/shared/printing/qz'
import type { TemplateDocument, TemplateType } from './types'

const MM_PER_INCH = 25.4

/** Ancho nominal del rollo/papel físico, distinto del ancho imprimible del contenido —
 * declarar `@page`/html/body con el ancho del ROLLO (no el del contenido) y centrar el
 * contenido dentro de ese ancho es lo que evita que el driver de impresión reparta el
 * sobrante entre márgenes por su cuenta (lo cual salía descentrado hacia la izquierda). */
const PAPER_WIDTH_MM: Partial<Record<TemplateType, number>> = {
  pos_invoice: 80,
}

/** Tamaño del contenido (el área imprimible que ocupa el ticket/etiqueta en sí). */
export function pageSizeMm(doc: TemplateDocument) {
  const width = (doc.page.width / doc.page.dpi) * MM_PER_INCH
  const height = doc.page.height ? (doc.page.height / doc.page.dpi) * MM_PER_INCH : null
  return { width, height }
}

/** Ancho del papel/rollo físico a declarar en `@page`/html/body — puede ser mayor que el
 * ancho del contenido (ej. rollo de 80mm con 72mm imprimibles); si no hay un valor conocido
 * para el tipo, se asume igual al del contenido (ej. etiquetas troqueladas a medida exacta). */
export function paperWidthMm(doc: TemplateDocument): number {
  return PAPER_WIDTH_MM[doc.type] ?? pageSizeMm(doc).width
}

function printableCss(): string {
  // Las reglas que centran y recortan el ticket (`.tpl-print-root`/`.tpl-print-page-wrap`/
  // `.tpl-print-page` en index.css) viven dentro de `@media print` — no es seguro asumir si el
  // motor de render de QZ Tray evalúa ese media query o no (confirmado con hardware real:
  // forzar `display:block !important` fuera del media asumiendo que NO se evaluaba rompió el
  // layout, porque si SÍ se evaluaba, ese `!important` ganaba la cascada sobre el `display:flex
  // !important` del `@media print` y el ticket perdía el centrado/clip — salía descentrado y
  // cortado a la mitad). Por eso se excluyen las reglas `@media print` del CSS copiado y se
  // proveen equivalentes SIN condicionar a ningún media query — funcionan evalúe QZ el media o no.
  const css = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .filter((rule) => !(rule instanceof CSSMediaRule && rule.media.mediaText.includes('print')))
          .map((rule) => rule.cssText)
          .join('\n')
      } catch {
        // Hoja cross-origin (rara en este bundle, pero no debe tumbar la impresión) — se omite.
        return ''
      }
    })
    .join('\n')
  const printRootCss = `
    html, body { margin: 0; padding: 0; }
    .tpl-print-root {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0;
      padding: 0;
    }
    .tpl-print-page-wrap {
      position: relative;
      flex-shrink: 0;
      overflow: hidden;
    }
    .tpl-print-page {
      position: absolute;
      top: 0;
      left: 0;
      margin: 0;
      transform-origin: top left;
      background: #ffffff;
    }
  `
  return `${css}\n${printRootCss}`
}

/** Serializa CADA página/instancia impresa (`.tpl-print-page-wrap` dentro de
 * `.tpl-print-root`, ver TemplateEditorPrintTarget) a su propio documento HTML
 * autocontenido — uno por elemento del array. Necesario para el trabajo `pixel/html` de QZ
 * Tray, que rasteriza en un contexto aislado sin acceso a las hojas de estilo de la página.
 *
 * Una plantilla puede tener varias páginas (ej. un ticket largo dividido en tandas) o, en
 * etiquetas, varias instancias en lote — cada una debe llegar a la impresora como un trabajo
 * de impresión SEPARADO (no todas concatenadas en un solo HTML), porque así es como la
 * impresora térmica sabe dónde cortar el papel entre una y otra; un solo job con todo junto
 * imprime todo seguido sin cortes intermedios. */
function buildStandaloneHtmlPages(): string[] {
  const wraps = Array.from(document.querySelectorAll('.tpl-print-page-wrap'))
  if (wraps.length === 0) throw new Error('No hay contenido de impresión montado en el DOM')
  const css = printableCss()
  return wraps.map(
    (wrap) =>
      `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="tpl-print-root">${wrap.outerHTML}</div></body></html>`,
  )
}

const PRINT_STYLE_TAG_ID = 'tpl-print-page-size'

/** Imprime el documento — directo vía QZ Tray si el usuario tiene una impresora configurada
 * (§ImpresorasPage), o el diálogo nativo del navegador si no ("ninguna"). Reutilizable tanto
 * desde el editor (test print) como desde cualquier otra pantalla que ya tenga el print target
 * montado con el documento correspondiente (ej. cierre de venta en Caja/POS). Nunca deja al
 * usuario sin poder imprimir: si QZ falla (Tray no corriendo, impresora no encontrada, etc.)
 * cae automáticamente al diálogo del navegador. */
export async function printDocument(doc: TemplateDocument): Promise<void> {
  // `null` = el usuario no seleccionó ninguna impresora (o falló la consulta) — no es un error,
  // simplemente cae al diálogo del navegador más abajo.
  const printerConfig = await getMiSeleccion().catch(() => null)

  if (printerConfig) {
    try {
      const pages = buildStandaloneHtmlPages()
      // Secuencial (no en paralelo): cada página es un trabajo de impresión/corte separado —
      // deben llegar a la impresora en orden, una tras otra.
      for (const pageHtml of pages) {
        await printHtmlViaQz(printerConfig.qzPrinterName, pageHtml, pageSizeMm(doc))
      }
      return
    } catch (err) {
      console.error('Fallo al imprimir vía QZ Tray, usando el diálogo del navegador', err)
      toast.error(`No se pudo imprimir en "${printerConfig.name}" — se abrirá el diálogo del navegador`)
    }
  }

  printViaBrowserDialog(doc)
}

function printViaBrowserDialog(doc: TemplateDocument) {
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
