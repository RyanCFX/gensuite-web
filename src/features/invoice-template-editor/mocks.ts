import type {
  TemplateDocument,
  TemplateElement,
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
      { id: nextId('el'), type: 'line', x: 20, y: 58, width: 262, height: 1, rotation: 0, style: 'dashed', thickness: 1 },
      { id: nextId('el'), type: 'text', binding: 'factura.ncf', text: 'NCF: B0100000123', x: 20, y: 66, width: 180, height: 16, rotation: 0, fontSize: 10, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'date', binding: 'factura.fecha', x: 20, y: 84, width: 180, height: 16, rotation: 0, format: 'dd/MM/yyyy HH:mm', fontSize: 9 },
      { id: nextId('el'), type: 'text', binding: 'cliente.nombre', text: 'Cliente: Juan Pérez', x: 20, y: 104, width: 262, height: 16, rotation: 0, fontSize: 9, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'line', x: 20, y: 126, width: 262, height: 1, rotation: 0, style: 'solid', thickness: 1 },
      { id: nextId('el'), type: 'table', x: 20, y: 134, width: 262, height: 90, rotation: 0, fontSize: 9, columns: DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c })) },
      { id: nextId('el'), type: 'line', x: 20, y: 230, width: 262, height: 1, rotation: 0, style: 'solid', thickness: 1 },
      { id: nextId('el'), type: 'text', binding: 'factura.total', text: 'Total: RD$ 1,180.00', x: 20, y: 238, width: 262, height: 18, rotation: 0, fontSize: 11, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'right' },
      { id: nextId('el'), type: 'qr', binding: 'factura.ncf', x: 111, y: 268, width: 80, height: 80, rotation: 0, errorCorrection: 'M' },
    ])),
  }
}

function buildDefaultLabel(): TemplateDocument {
  const page = TEMPLATE_FORMATS.find((f) => f.type === 'label_5x2')!.page
  return {
    type: 'label_5x2',
    page,
    pages: singlePage([
      { id: nextId('el'), type: 'text', binding: 'producto.nombre', text: 'Nombre del producto', x: 10, y: 10, width: 380, height: 20, rotation: 0, fontSize: 12, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'text', binding: 'producto.precio', text: 'RD$ 0.00', x: 10, y: 34, width: 180, height: 18, rotation: 0, fontSize: 11, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'left' },
      { id: nextId('el'), type: 'barcode', binding: 'producto.codigoBarras', x: 10, y: 70, width: 300, height: 70, rotation: 0, format: 'CODE128' },
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
      { id: nextId('el'), type: 'text', binding: 'factura.total', text: 'Total: RD$ 1,180.00', x: 20, y: 174, width: 262, height: 18, rotation: 0, fontSize: 12, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'right' },
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
      { id: nextId('el'), type: 'text', binding: 'factura.total', text: 'Total: RD$ 1,180.00', x: 20, y: 216, width: 262, height: 18, rotation: 0, fontSize: 11, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'right' },
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
      { id: nextId('el'), type: 'text', binding: 'producto.nombre', text: 'Nombre del producto', x: 10, y: 20, width: 380, height: 24, rotation: 0, fontSize: 14, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
      { id: nextId('el'), type: 'text', binding: 'producto.precio', text: 'RD$ 0.00', x: 10, y: 60, width: 380, height: 30, rotation: 0, fontSize: 18, fontWeight: 'bold', fontStyle: 'normal', textDecoration: 'none', align: 'center' },
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
