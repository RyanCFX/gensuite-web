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
  | 'repeater'
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
  /** `coberturaArs`/`montoPaciente` solo traen valor en facturas con cobertura ARS (§8.2 del doc
   *  de Farmacia v2); en el resto quedan vacías, así que nacen invisibles.
   *  `monto` es alias histórico de `total` (lee `row.monto` igual) — plantillas guardadas
   *  anteriores a la unificación de keys lo traen (confirmado en la default de jbc); el
   *  renderer los trata igual, no crear columnas nuevas con esta key.
   *  `itbis`/`total` ahora sí vienen en `items.tabla` (repeater + render-data nuevo);
   *  `codigo`/`uom`/`descuentoPct`/`itbisPct` son columnas nuevas disponibles para la tabla. */
  key: 'descripcion' | 'codigo' | 'cantidad' | 'precio' | 'itbis' | 'itbisPct' | 'descuentoPct' | 'total' | 'monto' | 'uom' | 'coberturaArs' | 'montoPaciente'
  label: string
  visible: boolean
}

export interface TableElement extends BaseElement {
  type: 'table'
  columns: TableColumn[]
  fontSize: number
}

// ─── Elemento repetidor "Lista de productos/servicios" ──────────────────────
// Repetidor sobre `items.tabla` (o `pagos.tabla` con la misma pieza), distinto de la tabla
// de columnas: cada registro se imprime como un bloque de N líneas (no una fila de celdas).
// Toda la configuración vive dentro de `documentJson` — el backend la trata como blob opaco
// y nunca la interpreta.
export type RepeaterItemTokenKey =
  | 'descripcion' | 'codigo' | 'cantidad' | 'precio' | 'itbis' | 'itbisPct'
  | 'descuentoPct' | 'monto' | 'total' | 'uom'

export type RepeaterPagoTokenKey =
  | 'modoPago' | 'monto' | 'numeroTarjeta' | 'codigoAutorizacion' | 'banco' | 'numeroCheque'

export type RepeaterTokenKey = RepeaterItemTokenKey | RepeaterPagoTokenKey

export type RepeaterToken = { kind: 'field'; key: RepeaterTokenKey } | { kind: 'text'; text: string }

/** Alineación de una línea del repetidor — `justify` distribuye el contenido entre ambos
 * extremos (texto a la izquierda y monto a la derecha en la misma línea). */
export type RepeaterLineAlign = TextAlign | 'justify'

export interface RepeaterLine {
  /** Contenido y orden de la línea: tokens de campo mezclados con texto fijo. */
  tokens: RepeaterToken[]
  /** Formato propio de la línea (aplica a todos sus tokens y textos fijos). Todo opcional:
   * una línea sin formato definido hereda el del elemento — sin negrita, sin cursiva,
   * alineada a la izquierda (fontSize por defecto 10). Las plantillas ya guardadas, sin
   * estos campos, siguen renderizando igual que antes. */
  align?: RepeaterLineAlign
  fontSize?: number
  bold?: boolean
  italic?: boolean
}

export interface RepeaterElement extends BaseElement {
  type: 'repeater'
  /** Tabla origen: `items.tabla` (productos) o `pagos.tabla` (métodos de pago). */
  binding: string
  /** Líneas por producto/método — el usuario define qué va en cada línea. */
  lines: RepeaterLine[]
  /** Separación vertical entre líneas de un mismo bloque (px del modelo). */
  lineGap: number
  /** Separación vertical entre bloques de registros distintos (px del modelo). */
  blockGap: number
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
  | RepeaterElement
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
  /** Si es true, el valor real (en render-data) es un arreglo de objetos (tabla), no un
   * escalar — viene tal cual de GET /plantillas/campos-disponibles para catálogos reales. */
  array?: boolean
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
