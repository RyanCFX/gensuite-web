import { createElementId } from './mocks'
import { DEFAULT_TABLE_COLUMNS } from './constants'
import type { ElementType, TemplateDocument, TemplateElement, TemplateFieldDef, TemplatePage } from './types'

const DEFAULT_POSITION = { x: 24, y: 24 }

export function createDefaultElement(type: ElementType, overrides: Partial<TemplateElement> = {}): TemplateElement {
  const base = {
    id: createElementId(),
    x: DEFAULT_POSITION.x,
    y: DEFAULT_POSITION.y,
    rotation: 0,
  }

  switch (type) {
    case 'text':
      return { ...base, type: 'text', text: 'Texto', width: 140, height: 20, fontSize: 11, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', align: 'left', ...overrides } as TemplateElement
    case 'qr':
      return { ...base, type: 'qr', binding: '', value: '', width: 80, height: 80, errorCorrection: 'M', ...overrides } as TemplateElement
    case 'barcode':
      return { ...base, type: 'barcode', binding: '', value: '', width: 160, height: 60, format: 'CODE128', ...overrides } as TemplateElement
    case 'formula':
      return { ...base, type: 'formula', formula: '', fields: [], width: 140, height: 20, fontSize: 11, align: 'left', ...overrides } as TemplateElement
    case 'line':
      return { ...base, type: 'line', width: 160, height: 1, style: 'solid', thickness: 1, ...overrides } as TemplateElement
    case 'logo':
      return { ...base, type: 'logo', src: null, processed: false, width: 100, height: 60, ...overrides } as TemplateElement
    case 'table':
      return { ...base, type: 'table', width: 240, height: 100, fontSize: 9, columns: DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c })), ...overrides } as TemplateElement
    case 'list':
      return { ...base, type: 'list', binding: '', width: 200, height: 60, fontSize: 10, ...overrides } as TemplateElement
    case 'date':
      return { ...base, type: 'date', binding: 'factura.fecha', width: 140, height: 18, format: 'dd/MM/yyyy', fontSize: 10, ...overrides } as TemplateElement
    case 'conditional':
      return { ...base, type: 'conditional', text: 'Texto condicional', rule: null, width: 160, height: 20, fontSize: 10, ...overrides } as TemplateElement
    case 'rectangle':
      return { ...base, type: 'rectangle', width: 120, height: 60, fill: 'transparent', stroke: '#111827', strokeWidth: 1, borderRadius: 0, ...overrides } as TemplateElement
    case 'group':
      return { ...base, type: 'group', width: 120, height: 60, childIds: [], ...overrides } as TemplateElement
    default:
      throw new Error(`Tipo de elemento no soportado: ${type}`)
  }
}

/** Al insertar un "dato disponible" desde la columna izquierda, se elige el tipo de elemento y
 * el binding más natural para ese campo (ej. items.tabla -> table). `empresa.logoUrl` no tiene
 * caso especial aquí porque nunca aparece en este catálogo — se filtra en apiAdapters.ts, ya
 * que el elemento Logo no soporta cargar una imagen desde una URL/binding, solo subida manual. */
export function createElementFromField(field: TemplateFieldDef): TemplateElement {
  if (field.key === 'items.tabla') {
    return createDefaultElement('table')
  }
  if (field.key === 'factura.fecha') {
    return createDefaultElement('date', { binding: field.key } as Partial<TemplateElement>)
  }
  return createDefaultElement('text', {
    binding: field.key,
    text: field.sample || field.label,
    width: Math.max(100, Math.min(240, field.label.length * 8 + 40)),
  } as Partial<TemplateElement>)
}

/** Clona un documento completo (todas sus páginas) con ids nuevos para cada página y cada
 * elemento (remapeando también `childIds` de los grupos, por página) — se usa al aplicar una
 * plantilla de la galería o un borrador, para que nunca queden ids compartidos con el objeto de
 * origen (la constante mock o un borrador ya guardado). */
export function cloneDocument(doc: TemplateDocument): TemplateDocument {
  const pages: TemplatePage[] = doc.pages.map((page) => {
    const idMap = new Map<string, string>()
    const elements = page.elements.map((el) => {
      const newId = createElementId()
      idMap.set(el.id, newId)
      return { ...el, id: newId }
    })
    const remapped = elements.map((el) =>
      el.type === 'group' ? { ...el, childIds: el.childIds.map((id) => idMap.get(id) ?? id) } : el,
    )
    return { id: createElementId('page'), elements: remapped }
  })
  return { type: doc.type, page: { ...doc.page }, pages }
}

/** Página vacía nueva para "Agregar página". */
export function createEmptyPage(): TemplatePage {
  return { id: createElementId('page'), elements: [] }
}
