import type {
  TemplateDocument,
  TemplateElement,
  TemplateFieldCategory,
  TemplateGalleryItem,
  TemplatePage,
  TemplateSummary,
  TemplateType,
} from './types'
import { DEFAULT_TABLE_COLUMNS, TEMPLATE_FORMATS } from './constants'

function delay(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let idCounter = 0
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}_${idCounter}`
}

function singlePage(elements: TemplateElement[]): TemplatePage[] {
  return [{ id: nextId('page'), elements }]
}

// Las plantillas mock de pos_invoice se diseñaron originalmente para un ancho de página de
// 302px — ese valor era incorrecto (no correspondía a 80mm reales, ver TEMPLATE_FORMATS).
// Al corregir el ancho real de página a 576px (72mm imprimibles), esta escala reposiciona
// cada elemento (y su tamaño de fuente/grosor) proporcionalmente para conservar el mismo
// diseño relativo, ahora al tamaño físico correcto.
const POS_LEGACY_WIDTH = 302
const POS_SCALE = TEMPLATE_FORMATS.find((f) => f.type === 'pos_invoice')!.page.width / POS_LEGACY_WIDTH

function scalePosElements(elements: TemplateElement[]): TemplateElement[] {
  return elements.map((el) => {
    const scaled: TemplateElement = {
      ...el,
      x: el.x * POS_SCALE,
      y: el.y * POS_SCALE,
      width: el.width * POS_SCALE,
      height: el.height * POS_SCALE,
    }
    if ('fontSize' in scaled) scaled.fontSize = (el as { fontSize: number }).fontSize * POS_SCALE
    if ('thickness' in scaled) scaled.thickness = (el as { thickness: number }).thickness * POS_SCALE
    if ('strokeWidth' in scaled) scaled.strokeWidth = (el as { strokeWidth: number }).strokeWidth * POS_SCALE
    if ('borderRadius' in scaled) scaled.borderRadius = (el as { borderRadius: number }).borderRadius * POS_SCALE
    return scaled
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Datos disponibles (campos que se pueden enlazar a un elemento del canvas)
// ─────────────────────────────────────────────────────────────────────────

export const MOCK_AVAILABLE_FIELDS: TemplateFieldCategory[] = [
  {
    key: 'empresa',
    label: 'Empresa',
    fields: [
      { key: 'empresa.nombre', label: 'Nombre comercial', sample: 'Ferretería El Tornillo SRL' },
      { key: 'empresa.rnc', label: 'RNC', sample: '1-31-45678-9' },
      { key: 'empresa.direccion', label: 'Dirección', sample: 'Av. 27 de Febrero #123, Santo Domingo' },
      { key: 'empresa.telefono', label: 'Teléfono', sample: '(809) 555-1234' },
      { key: 'empresa.logo', label: 'Logo', sample: '' },
    ],
  },
  {
    key: 'factura',
    label: 'Factura',
    fields: [
      { key: 'factura.ncf', label: 'NCF', sample: 'B0100000123' },
      { key: 'factura.tipoNcf', label: 'Tipo de comprobante', sample: 'Consumo' },
      { key: 'factura.fecha', label: 'Fecha', sample: '2026-08-14' },
      { key: 'factura.numero', label: 'No. de factura', sample: 'FAC-001234' },
      { key: 'factura.vendedor', label: 'Vendedor', sample: 'Ryan Castro' },
    ],
  },
  {
    key: 'cliente',
    label: 'Cliente',
    fields: [
      { key: 'cliente.nombre', label: 'Nombre', sample: 'Juan Pérez' },
      { key: 'cliente.rncCedula', label: 'RNC / Cédula', sample: '001-1234567-8' },
      { key: 'cliente.direccion', label: 'Dirección', sample: 'Calle Segunda #45' },
      { key: 'cliente.telefono', label: 'Teléfono', sample: '(809) 555-9876' },
    ],
  },
  {
    key: 'totales',
    label: 'Totales',
    fields: [
      { key: 'totales.subtotal', label: 'Subtotal', sample: 'RD$ 1,000.00', numeric: true },
      { key: 'totales.itbis18', label: 'ITBIS 18%', sample: 'RD$ 180.00', numeric: true },
      { key: 'totales.itbis16', label: 'ITBIS 16%', sample: 'RD$ 0.00', numeric: true },
      { key: 'totales.exento', label: 'Exento', sample: 'RD$ 0.00', numeric: true },
      { key: 'totales.total', label: 'Total', sample: 'RD$ 1,180.00', numeric: true },
    ],
  },
  {
    key: 'items',
    label: 'Items',
    fields: [
      { key: 'items.tabla', label: 'Tabla de productos', sample: '' },
      { key: 'items.cantidad', label: 'Cantidad (por línea)', sample: '2', numeric: true },
      { key: 'items.precio', label: 'Precio unitario (por línea)', sample: '500.00', numeric: true },
    ],
  },
]

// TODO API: GET /template-editor/fields
// Debe devolver TemplateFieldCategory[] con los campos realmente disponibles para el tenant
// (agrupados por categoría, con su `key` de binding y un `sample` representativo). Esto permite
// que tenants con impuestos/monedas distintos (ej. sin ITBIS 16%, con IVU, etc.) reciban solo los
// campos que les aplican, sin tener que redeployar el editor.
export async function fetchAvailableFields(): Promise<TemplateFieldCategory[]> {
  await delay()
  return MOCK_AVAILABLE_FIELDS
}

// ─────────────────────────────────────────────────────────────────────────
// Plantillas por defecto (contenido inicial de cada documento)
// ─────────────────────────────────────────────────────────────────────────

function buildDefaultPosInvoice(): TemplateDocument {
  const page = TEMPLATE_FORMATS.find((f) => f.type === 'pos_invoice')!.page
  return {
    type: 'pos_invoice',
    page,
    pages: singlePage(scalePosElements([
      { id: nextId('el'), type: 'text', binding: 'empresa.nombre', text: 'Ferretería El Tornillo SRL', x: 20, y: 12, width: 262, height: 20, rotation: 0, fontSize: 13, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
      { id: nextId('el'), type: 'text', binding: 'empresa.rnc', text: 'RNC: 1-31-45678-9', x: 20, y: 34, width: 262, height: 16, rotation: 0, fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
      { id: nextId('el'), type: 'text', binding: 'empresa.direccion', text: 'Av. 27 de Febrero #123, Santo Domingo', x: 20, y: 50, width: 262, height: 16, rotation: 0, fontSize: 9, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
      { id: nextId('el'), type: 'line', x: 20, y: 74, width: 262, height: 1, rotation: 0, style: 'dashed', thickness: 1 },
      { id: nextId('el'), type: 'text', binding: 'factura.ncf', text: 'NCF: B0100000123', x: 20, y: 82, width: 180, height: 16, rotation: 0, fontSize: 10, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'date', binding: 'factura.fecha', x: 20, y: 100, width: 180, height: 16, rotation: 0, format: 'dd/MM/yyyy HH:mm', fontSize: 9 },
      { id: nextId('el'), type: 'text', binding: 'cliente.nombre', text: 'Cliente: Juan Pérez', x: 20, y: 120, width: 262, height: 16, rotation: 0, fontSize: 9, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'line', x: 20, y: 142, width: 262, height: 1, rotation: 0, style: 'solid', thickness: 1 },
      { id: nextId('el'), type: 'table', x: 20, y: 150, width: 262, height: 90, rotation: 0, fontSize: 9, columns: DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c })) },
      { id: nextId('el'), type: 'line', x: 20, y: 246, width: 262, height: 1, rotation: 0, style: 'solid', thickness: 1 },
      { id: nextId('el'), type: 'text', binding: 'totales.total', text: 'Total: RD$ 1,180.00', x: 20, y: 254, width: 262, height: 18, rotation: 0, fontSize: 11, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'right' },
      { id: nextId('el'), type: 'qr', binding: 'factura.ncf', x: 111, y: 284, width: 80, height: 80, rotation: 0, errorCorrection: 'M' },
    ])),
  }
}

function buildDefaultLabel(): TemplateDocument {
  const page = TEMPLATE_FORMATS.find((f) => f.type === 'label_5x2')!.page
  return {
    type: 'label_5x2',
    page,
    pages: singlePage([
      { id: nextId('el'), type: 'text', text: 'Nombre del producto', x: 10, y: 10, width: 380, height: 20, rotation: 0, fontSize: 12, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'text', text: 'RD$ 0.00', x: 10, y: 34, width: 180, height: 18, rotation: 0, fontSize: 11, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'barcode', binding: 'items.cantidad', x: 10, y: 70, width: 300, height: 70, rotation: 0, format: 'CODE128' },
    ]),
  }
}

const MOCK_DEFAULT_TEMPLATES: Record<TemplateType, () => TemplateDocument> = {
  pos_invoice: buildDefaultPosInvoice,
  label_5x2: buildDefaultLabel,
}

// ─────────────────────────────────────────────────────────────────────────
// Galería de plantillas prediseñadas ("Plantillas") — listas para usar tal cual
// ─────────────────────────────────────────────────────────────────────────

function buildMinimalPosInvoice(): TemplateDocument {
  const page = TEMPLATE_FORMATS.find((f) => f.type === 'pos_invoice')!.page
  return {
    type: 'pos_invoice',
    page,
    pages: singlePage(scalePosElements([
      { id: nextId('el'), type: 'text', binding: 'empresa.nombre', text: 'Ferretería El Tornillo SRL', x: 20, y: 14, width: 262, height: 20, rotation: 0, fontSize: 13, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
      { id: nextId('el'), type: 'date', binding: 'factura.fecha', x: 20, y: 40, width: 262, height: 16, rotation: 0, format: 'dd/MM/yyyy HH:mm', fontSize: 9 },
      { id: nextId('el'), type: 'line', x: 20, y: 62, width: 262, height: 1, rotation: 0, style: 'solid', thickness: 1 },
      { id: nextId('el'), type: 'table', x: 20, y: 70, width: 262, height: 90, rotation: 0, fontSize: 9, columns: DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c })) },
      { id: nextId('el'), type: 'line', x: 20, y: 166, width: 262, height: 1, rotation: 0, style: 'solid', thickness: 1 },
      { id: nextId('el'), type: 'text', binding: 'totales.total', text: 'Total: RD$ 1,180.00', x: 20, y: 174, width: 262, height: 18, rotation: 0, fontSize: 12, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'right' },
    ])),
  }
}

function buildCompletePosInvoice(): TemplateDocument {
  // Igual a la plantilla por defecto — sirve como punto de partida "completo" en la galería.
  return { ...buildDefaultPosInvoice() }
}

function buildLogoPosInvoice(): TemplateDocument {
  const page = TEMPLATE_FORMATS.find((f) => f.type === 'pos_invoice')!.page
  return {
    type: 'pos_invoice',
    page,
    pages: singlePage(scalePosElements([
      { id: nextId('el'), type: 'logo', src: null, processed: false, x: 111, y: 12, width: 80, height: 50, rotation: 0 },
      { id: nextId('el'), type: 'text', binding: 'empresa.rnc', text: 'RNC: 1-31-45678-9', x: 20, y: 68, width: 262, height: 16, rotation: 0, fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
      { id: nextId('el'), type: 'line', x: 20, y: 90, width: 262, height: 1, rotation: 0, style: 'dashed', thickness: 1 },
      { id: nextId('el'), type: 'text', binding: 'factura.ncf', text: 'NCF: B0100000123', x: 20, y: 98, width: 262, height: 16, rotation: 0, fontSize: 10, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'table', x: 20, y: 120, width: 262, height: 90, rotation: 0, fontSize: 9, columns: DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c })) },
      { id: nextId('el'), type: 'text', binding: 'totales.total', text: 'Total: RD$ 1,180.00', x: 20, y: 216, width: 262, height: 18, rotation: 0, fontSize: 11, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'right' },
      { id: nextId('el'), type: 'barcode', binding: 'factura.ncf', x: 71, y: 246, width: 160, height: 60, rotation: 0, format: 'CODE128' },
    ])),
  }
}

function buildSimpleLabel(): TemplateDocument {
  const page = TEMPLATE_FORMATS.find((f) => f.type === 'label_5x2')!.page
  return {
    type: 'label_5x2',
    page,
    pages: singlePage([
      { id: nextId('el'), type: 'text', text: 'Nombre del producto', x: 10, y: 20, width: 380, height: 24, rotation: 0, fontSize: 14, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
      { id: nextId('el'), type: 'text', text: 'RD$ 0.00', x: 10, y: 60, width: 380, height: 30, rotation: 0, fontSize: 18, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
    ]),
  }
}

function buildBarcodeLabel(): TemplateDocument {
  // Igual a la plantilla por defecto de etiqueta — variante con código de barras.
  return { ...buildDefaultLabel() }
}

const MOCK_TEMPLATE_GALLERY: TemplateGalleryItem[] = [
  {
    id: 'gallery_pos_minimal',
    type: 'pos_invoice',
    name: 'POS Minimalista',
    description: 'Solo lo esencial: encabezado, fecha, items y total.',
    document: buildMinimalPosInvoice(),
  },
  {
    id: 'gallery_pos_completa',
    type: 'pos_invoice',
    name: 'POS Completa',
    description: 'Empresa, NCF, cliente, items, total y QR de verificación.',
    document: buildCompletePosInvoice(),
  },
  {
    id: 'gallery_pos_logo',
    type: 'pos_invoice',
    name: 'POS con Logo y Código de Barras',
    description: 'Encabezado con logo y código de barras en vez de QR.',
    document: buildLogoPosInvoice(),
  },
  {
    id: 'gallery_label_simple',
    type: 'label_5x2',
    name: 'Etiqueta Simple',
    description: 'Nombre del producto y precio, centrados.',
    document: buildSimpleLabel(),
  },
  {
    id: 'gallery_label_barcode',
    type: 'label_5x2',
    name: 'Etiqueta con Código de Barras',
    description: 'Nombre, precio y código de barras del producto.',
    document: buildBarcodeLabel(),
  },
]

// TODO API: GET /template-editor/galeria
// Debe devolver TemplateGalleryItem[] — plantillas prediseñadas (propias del sistema o
// compartidas por otros tenants/plantillas "oficiales") que el usuario puede usar tal cual o
// como punto de partida. A futuro podría filtrarse por industria/rubro del tenant.
export async function fetchTemplateGallery(): Promise<TemplateGalleryItem[]> {
  await delay()
  return MOCK_TEMPLATE_GALLERY
}

// TODO API: GET /template-editor/templates/default?type={pos_invoice|label_5x2}
// Debe devolver el TemplateDocument (page + elements) que está marcado como plantilla activa/por
// defecto del tenant para ese formato. Si el tenant nunca ha guardado una, el backend debería
// devolver una plantilla base sugerida (equivalente a lo que aquí se genera localmente).
export async function fetchDefaultTemplate(type: TemplateType): Promise<TemplateDocument> {
  await delay()
  return MOCK_DEFAULT_TEMPLATES[type]()
}

// TODO API: GET /template-editor/templates
// Debe devolver TemplateSummary[] — todas las plantillas guardadas del tenant (id, tipo, nombre,
// updatedAt, isDefault) para poblar un futuro selector "Cargar plantilla existente".
export async function fetchTemplatesList(): Promise<TemplateSummary[]> {
  await delay()
  return [
    { id: 'tpl_1', type: 'pos_invoice', name: 'Plantilla POS (predeterminada)', updatedAt: new Date().toISOString(), isDefault: true },
  ]
}

// TODO API: POST /template-editor/templates
// Body: { type, page, pages, name? } — `pages` es un arreglo (una plantilla puede tener varias
// páginas, ej. un ticket largo dividido en tandas de impresión). Debe persistir la plantilla
// para el tenant y devolver { id, updatedAt }. Si `isDefault` se envía en true, debe marcarla
// como la plantilla activa para ese `type`, reemplazando la anterior por defecto.
export async function saveTemplate(doc: TemplateDocument): Promise<{ id: string; updatedAt: string }> {
  await delay(400)
  return { id: `tpl_${doc.type}_${doc.pages.length}`, updatedAt: new Date().toISOString() }
}

export function createElementId(prefix = 'el') {
  return nextId(prefix)
}
