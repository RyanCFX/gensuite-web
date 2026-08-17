import type { ElementPaletteItem, PageSpec, TemplateType } from './types'

export interface TemplateFormatOption {
  type: TemplateType
  label: string
  page: PageSpec
  comingSoon?: boolean
}

// 576px @ 203dpi = 72mm imprimibles (el estándar real de una térmica de rollo de 80mm, ej.
// Star TSP100: el papel es de 80mm pero el área imprimible efectiva es ~72mm/576 dots).
// Etiqueta 5x2cm ~= 400x160px @203dpi (50mm x 20mm exactos). El alto de pos_invoice es
// dinámico (null) porque el ticket crece según el contenido — se usa una guía de altura
// mínima para trabajar cómodamente en el canvas.
export const TEMPLATE_FORMATS: TemplateFormatOption[] = [
  {
    type: 'pos_invoice',
    label: 'Factura POS — 80mm térmica',
    page: { width: 576, height: null, unit: 'px', dpi: 203 },
  },
  {
    type: 'label_5x2',
    label: 'Etiqueta 5x2cm',
    page: { width: 400, height: 160, unit: 'px', dpi: 203 },
  },
]

export const MIN_CANVAS_HEIGHT = 500
export const CANVAS_BOTTOM_MARGIN = 40

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
export const DEFAULT_ZOOM = 1

export const ELEMENT_PALETTE: ElementPaletteItem[] = [
  { type: 'text', label: 'Texto' },
  { type: 'qr', label: 'Código QR' },
  { type: 'barcode', label: 'Código de barras' },
  { type: 'formula', label: 'Cálculo matemático' },
  { type: 'date', label: 'Fecha' },
  { type: 'line', label: 'Línea' },
  { type: 'logo', label: 'Logo' },
  { type: 'table', label: 'Tabla' },
  { type: 'list', label: 'Lista' },
  { type: 'conditional', label: 'Condicional' },
  { type: 'rectangle', label: 'Rectángulo' },
  { type: 'group', label: 'Sección / grupo' },
]

export const DEFAULT_TABLE_COLUMNS = [
  { key: 'descripcion' as const, label: 'Descripción', visible: true },
  { key: 'cantidad' as const, label: 'Cant.', visible: true },
  { key: 'precio' as const, label: 'Precio', visible: true },
  { key: 'itbis' as const, label: 'ITBIS', visible: false },
  { key: 'total' as const, label: 'Total', visible: true },
]

export const CONDITION_OPERATOR_LABELS: Record<string, string> = {
  '==': 'es igual a',
  '!=': 'es distinto de',
  '>': 'mayor que',
  '<': 'menor que',
  '>=': 'mayor o igual que',
  '<=': 'menor o igual que',
  contains: 'contiene',
}
