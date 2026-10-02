import type { ElementPaletteItem, PageSpec, RepeaterLine, TemplateType } from './types'

export interface TemplateFormatOption {
  type: TemplateType
  label: string
  page: PageSpec
  comingSoon?: boolean
}

// 600px @ 203dpi = 75mm imprimibles (el estándar real de una térmica de rollo de 80mm, ej.
// Star TSP100: el papel es de 80mm pero el área imprimible efectiva es ~75mm/600 dots).
// Etiqueta 5x2cm ~= 400x160px @203dpi (50mm x 20mm exactos). El alto de pos_invoice es
// dinámico (null) porque el ticket crece según el contenido — se usa una guía de altura
// mínima para trabajar cómodamente en el canvas.
export const TEMPLATE_FORMATS: TemplateFormatOption[] = [
  {
    type: 'pos_invoice',
    label: 'Factura POS — 80mm térmica',
    page: { width: 600, height: null, unit: 'px', dpi: 203 },
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
  { type: 'repeater', label: 'Lista de productos/servicios' },
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
  // Vertical farmacia: cada fila de `items.tabla` trae además `coberturaArs` y `montoPaciente`
  // (`null` sin aseguradora). Nacen ocultas — el usuario las activa en la plantilla de farmacia.
  { key: 'coberturaArs' as const, label: 'ARS', visible: false },
  { key: 'montoPaciente' as const, label: 'Paciente', visible: false },
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

// Líneas por defecto del repetidor nuevo (ejemplo del prompt con 2 líneas por producto):
//   Nombre producto
//   2 * $150.00   ITBIS $54.00 = $354.00
export const DEFAULT_REPEATER_LINES: RepeaterLine[] = [
  { tokens: [{ kind: 'field', key: 'descripcion' }], align: 'left', fontSize: 10 },
  {
    tokens: [
      { kind: 'field', key: 'cantidad' },
      { kind: 'text', text: ' * $' },
      { kind: 'field', key: 'precio' },
      { kind: 'text', text: '   ITBIS $' },
      { kind: 'field', key: 'itbis' },
      { kind: 'text', text: ' = $' },
      { kind: 'field', key: 'total' },
    ],
    align: 'left',
    fontSize: 9,
  },
]

export const DEFAULT_REPEATER_LINE_GAP = 2
export const DEFAULT_REPEATER_BLOCK_GAP = 4

/** Tokens de campo disponibles por binding origen del repetidor. */
export const REPEATER_ITEM_TOKENS: { key: string; label: string }[] = [
  { key: 'descripcion', label: 'Descripción' },
  { key: 'codigo', label: 'Código' },
  { key: 'cantidad', label: 'Cantidad' },
  { key: 'precio', label: 'Precio' },
  { key: 'itbis', label: 'ITBIS ($)' },
  { key: 'itbisPct', label: 'ITBIS (%)' },
  { key: 'descuentoPct', label: 'Descuento (%)' },
  { key: 'monto', label: 'Monto (sin ITBIS)' },
  { key: 'total', label: 'Total (con ITBIS)' },
  { key: 'uom', label: 'Unidad (UoM)' },
]

export const REPEATER_PAGO_TOKENS: { key: string; label: string }[] = [
  { key: 'modoPago', label: 'Modo de pago' },
  { key: 'monto', label: 'Monto' },
  { key: 'numeroTarjeta', label: 'Nº tarjeta' },
  { key: 'codigoAutorizacion', label: 'Cód. autorización' },
  { key: 'banco', label: 'Banco' },
  { key: 'numeroCheque', label: 'Nº cheque' },
]

export function repeaterTokensFor(binding: string): { key: string; label: string }[] {
  return binding === 'pagos.tabla' ? REPEATER_PAGO_TOKENS : REPEATER_ITEM_TOKENS
}
