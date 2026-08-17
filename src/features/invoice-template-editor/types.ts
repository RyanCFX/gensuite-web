// Modelo de datos del editor de plantillas de facturas/etiquetas.
// Basado en el esquema JSON de referencia: { templates: [{ type, page, elements }] }, extendido
// con soporte multi-página: cada documento tiene un `page` (mismo formato/tamaño físico para
// todas sus páginas) y un arreglo `pages`, cada una con su propio `elements`. Al imprimir, cada
// página se manda como un trabajo de impresión separado.

export type TemplateType = 'pos_invoice' | 'label_5x2'

export interface PageSpec {
  width: number
  height: number | null
  unit: 'px'
  dpi: number
}

export type ElementType =
  | 'text'
  | 'qr'
  | 'barcode'
  | 'formula'
  | 'line'
  | 'logo'
  | 'table'
  | 'list'
  | 'date'
  | 'conditional'
  | 'rectangle'
  | 'group'

export type TextAlign = 'left' | 'center' | 'right'

export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  locked?: boolean
}

export interface TextElement extends BaseElement {
  type: 'text'
  binding?: string
  text: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textDecoration: 'none' | 'underline'
  align: TextAlign
}

export interface QrElement extends BaseElement {
  type: 'qr'
  /** Campo enlazado (usado solo si `value` está vacío). */
  binding?: string
  /** Texto fijo introducido por el usuario — tiene prioridad sobre `binding` si no está vacío. */
  value?: string
  errorCorrection: 'L' | 'M' | 'Q' | 'H'
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode'
  /** Campo enlazado (usado solo si `value` está vacío). */
  binding?: string
  /** Texto fijo introducido por el usuario — tiene prioridad sobre `binding` si no está vacío. */
  value?: string
  format: 'CODE128' | 'EAN13'
}

export interface FormulaElement extends BaseElement {
  type: 'formula'
  formula: string
  fields: string[]
  fontSize: number
  align: TextAlign
}

export interface LineElement extends BaseElement {
  type: 'line'
  style: 'solid' | 'dashed'
  thickness: number
}

export interface LogoElement extends BaseElement {
  type: 'logo'
  src: string | null
  processed: boolean
}

export interface TableColumn {
  key: 'descripcion' | 'cantidad' | 'precio' | 'itbis' | 'total'
  label: string
  visible: boolean
}

export interface TableElement extends BaseElement {
  type: 'table'
  columns: TableColumn[]
  fontSize: number
}

export interface ListElement extends BaseElement {
  type: 'list'
  binding: string
  fontSize: number
}

export interface DateElement extends BaseElement {
  type: 'date'
  binding: string
  format: string
  fontSize: number
}

export type ConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains'

export interface ConditionalRule {
  field: string
  operator: ConditionOperator
  value: string
}

export interface ConditionalElement extends BaseElement {
  type: 'conditional'
  binding?: string
  text: string
  rule: ConditionalRule | null
  fontSize: number
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle'
  fill: string
  stroke: string
  strokeWidth: number
  borderRadius: number
}

export interface GroupElement extends BaseElement {
  type: 'group'
  childIds: string[]
}

export type TemplateElement =
  | TextElement
  | QrElement
  | BarcodeElement
  | FormulaElement
  | LineElement
  | LogoElement
  | TableElement
  | ListElement
  | DateElement
  | ConditionalElement
  | RectangleElement
  | GroupElement

export interface TemplatePage {
  id: string
  elements: TemplateElement[]
}

export interface TemplateDocument {
  type: TemplateType
  page: PageSpec
  pages: TemplatePage[]
}

export interface TemplateFieldDef {
  key: string
  label: string
  sample: string
  numeric?: boolean
}

export interface TemplateFieldCategory {
  key: string
  label: string
  fields: TemplateFieldDef[]
}

export interface ElementPaletteItem {
  type: ElementType
  label: string
}

export interface TemplateSummary {
  id: string
  type: TemplateType
  name: string
  updatedAt: string
  isDefault: boolean
}

/** Plantilla prediseñada de la galería ("Plantillas") — lista para usar tal cual o como punto
 * de partida, a diferencia de un borrador (que es trabajo propio del usuario en progreso). */
export interface TemplateGalleryItem {
  id: string
  type: TemplateType
  name: string
  description: string
  document: TemplateDocument
}

/** Borrador guardado localmente por el usuario (ver `drafts.ts` — persiste en localStorage
 * para no perderse al recargar la página, ya que todavía no existe backend real). */
export interface DraftSummary {
  id: string
  type: TemplateType
  name: string
  savedAt: string
}

export interface Draft extends DraftSummary {
  document: TemplateDocument
}
