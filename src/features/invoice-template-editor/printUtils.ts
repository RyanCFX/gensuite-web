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
