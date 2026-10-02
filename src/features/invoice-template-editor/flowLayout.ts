import { DEFAULT_REPEATER_LINES } from './constants'
import type { RepeaterElement, RepeaterLine, RepeaterLineAlign, TableElement, TemplateElement } from './types'

// Altura estimada de los elementos de flujo (tabla y repetidor) con datos reales, y
// desplazamiento ("empuje") de los elementos que están debajo.
//
// El canvas del editor posiciona todo en absoluto con alto fijo — con 2 filas de muestra eso
// alcanza. Pero al imprimir con datos reales (N artículos / M métodos de pago) el bloque
// necesita más alto: esta función calcula cuánto más y corre hacia abajo todo lo que está
// debajo, para que nada se superponga. Solo se aplica cuando hay `values` reales
// (vista previa con datos e impresión); en modo diseño no se usa.

const LINE_HEIGHT_FACTOR = 1.25

export interface NormalizedRepeaterLine {
  tokens: RepeaterLine['tokens']
  align: RepeaterLineAlign
  fontSize: number
  bold: boolean
  italic: boolean
}

/** Normaliza el formato de una línea a valores concretos — una línea sin formato definido
 * hereda el del elemento: sin negrita, sin cursiva, alineada a la izquierda. */
export function normalizeRepeaterLine(line: RepeaterLine): NormalizedRepeaterLine {
  return {
    tokens: Array.isArray(line.tokens) ? line.tokens : [],
    align: line.align ?? 'left',
    fontSize: typeof line.fontSize === 'number' && line.fontSize > 0 ? line.fontSize : 10,
    bold: !!line.bold,
    italic: !!line.italic,
  }
}

function normalizedLines(el: RepeaterElement): NormalizedRepeaterLine[] {
  return normalizeRepeaterLines(el.lines)
}

/** Normaliza todas las líneas del elemento (o las por defecto si no trae ninguna). */
export function normalizeRepeaterLines(lines: RepeaterLine[] | undefined): NormalizedRepeaterLine[] {
  const raw = Array.isArray(lines) && lines.length > 0 ? lines : DEFAULT_REPEATER_LINES
  return raw.map(normalizeRepeaterLine)
}

/** Filas de muestra para modo diseño (sin `values`): 2 por binding. */
export function sampleRepeaterRows(binding: string): Record<string, unknown>[] {
  if (binding === 'pagos.tabla') {
    return [
      { modoPago: 'Efectivo', monto: 500, numeroTarjeta: null, codigoAutorizacion: null, banco: null, numeroCheque: null },
      { modoPago: 'Tarjeta', monto: 354, numeroTarjeta: '**** 1234', codigoAutorizacion: 'A1B2C3', banco: null, numeroCheque: null },
    ]
  }
  return [
    { descripcion: 'Nombre producto', codigo: 'PROD-001', cantidad: 2, precio: 150, itbis: 54, itbisPct: 18, descuentoPct: 0, monto: 300, total: 354, uom: 'Und' },
    { descripcion: 'Segundo producto', codigo: 'PROD-002', cantidad: 1, precio: 200, itbis: 36, itbisPct: 18, descuentoPct: 10, monto: 180, total: 216, uom: 'Und' },
  ]
}

/** Filas del repetidor: con `values` reales (key ausente o no-arreglo = vacío, sin error),
 * o las 2 filas de muestra en modo diseño. */
export function resolveRepeaterRows(
  binding: string,
  values: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  if (!values) return sampleRepeaterRows(binding)
  const raw = values[binding]
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
}

/** Alto que necesita el repetidor para `rowCount` registros. */
export function repeaterContentHeight(el: RepeaterElement, rowCount: number): number {
  if (rowCount <= 0) return 0
  const lines = normalizedLines(el)
  const lineGap = typeof el.lineGap === 'number' ? el.lineGap : 2
  const blockGap = typeof el.blockGap === 'number' ? el.blockGap : 4
  const blockHeight =
    lines.reduce((sum, l) => sum + l.fontSize * LINE_HEIGHT_FACTOR + 2, 0) +
    lineGap * Math.max(0, lines.length - 1)
  return rowCount * blockHeight + blockGap * Math.max(0, rowCount - 1)
}

/** Alto que necesita la tabla para `rowCount` filas (1 fila de encabezado + N de datos). */
export function tableContentHeight(el: TableElement, rowCount: number): number {
  const rowH = el.fontSize * LINE_HEIGHT_FACTOR + 5
  return (1 + Math.max(0, rowCount)) * rowH
}

function flowContentHeight(el: TemplateElement, values: Record<string, unknown>): number | null {
  if (el.type === 'repeater') {
    return repeaterContentHeight(el, resolveRepeaterRows(el.binding ?? 'items.tabla', values).length)
  }
  if (el.type === 'table') {
    const raw = values['items.tabla']
    return tableContentHeight(el, Array.isArray(raw) ? raw.length : 0)
  }
  return null
}

/** Recalcula `y`/`height` de los elementos: cada tabla/repetidor crece a su alto de contenido
 * y todo lo que empieza por debajo de su borde inferior original se corre hacia abajo.
 * Devuelve los elementos ajustados (mismo orden) y el crecimiento total de la página. */
export function layoutPageWithFlow<T extends TemplateElement>(
  elements: T[],
  values: Record<string, unknown>,
): { elements: T[]; extraHeight: number } {
  const order = elements.map((el, i) => ({ el, i })).sort((a, b) => a.el.y - b.el.y || a.i - b.i)
  const newY = new Map<string, number>()
  const newH = new Map<string, number>()

  for (const { el } of order) {
    const contentH = flowContentHeight(el as TemplateElement, values)
    const y = el.y + accumulatedShift(el, elements, newH)
    newY.set(el.id, y)
    if (contentH !== null && contentH > el.height) {
      newH.set(el.id, contentH)
    } else {
      newH.set(el.id, el.height)
    }
  }

  const adjusted = elements.map((el) => ({ ...el, y: newY.get(el.id) ?? el.y, height: newH.get(el.id) ?? el.height }))
  const bottom = (list: T[]) => list.reduce((m, el) => Math.max(m, el.y + el.height), 0)
  return { elements: adjusted, extraHeight: Math.max(0, bottom(adjusted) - bottom(elements)) }
}

function accumulatedShift(
  el: TemplateElement,
  all: TemplateElement[],
  newH: Map<string, number>,
): number {
  let shift = 0
  for (const other of all) {
    if (other.id === el.id) continue
    const otherNewH = newH.get(other.id)
    if (otherNewH === undefined) continue
    // Solo empuja lo que estaba estrictamente debajo del borde inferior original del otro.
    const originalBottom = other.y + other.height
    if (el.y >= originalBottom - 0.5) {
      shift += Math.max(0, otherNewH - other.height)
    }
  }
  return shift
}
