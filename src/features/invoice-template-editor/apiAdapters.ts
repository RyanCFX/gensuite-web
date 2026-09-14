// Adapta la forma plana que devuelve GET /plantillas/campos-disponibles ({key, label, array}[])
// a TemplateFieldCategory[] (agrupado por categoría), que es lo que ya consumen
// TemplateEditorRightPanel/TemplateEditorElementView. La API no agrupa ni da un "sample" — se
// derivan aquí a partir del prefijo de la key (antes del primer punto).

import type { CampoDisponiblePlantilla, GaleriaPlantillaDto } from '@/shared/api/types'
import { fromApiType } from './typeMapping'
import type { TemplateDocument, TemplateFieldCategory, TemplateGalleryItem } from './types'

const CATEGORY_LABELS: Record<string, string> = {
  empresa: 'Empresa',
  factura: 'Factura',
  cliente: 'Cliente',
  ecf: 'e-CF',
  pagos: 'Pagos',
  items: 'Items',
  producto: 'Producto',
  // Solo lo devuelve `campos-disponibles` en tenants del vertical farmacia, y cada valor es
  // `null` en una factura sin aseguradora (docs/PROMPT_FARMACIA_V2_FRONTEND.md §8.2).
  seguro: 'Seguro (ARS)',
}

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

// `empresa.logoUrl` es una URL de imagen — arrastrarlo como campo de texto solo produce texto
// plano con la URL cruda, nunca una imagen (eso requiere el elemento dedicado "Logo", que sube
// su propio archivo). Se excluye del catálogo de texto para que no aparezca ahí.
//
// OJO: `ecf.qrBase64` NO se excluye aquí aunque también es un campo de imagen (base64) — sigue
// siendo necesario en este mismo catálogo porque alimenta el selector "Campo que alimenta el
// QR" del elemento QR (ver `ALL_FIELD_KEYS` en TemplateEditorRightPanel.tsx), que ya sabe
// tratarlo como imagen especial (ver el caso `ecf.qrBase64` en TemplateEditorElementView) — solo
// sería un problema si alguien lo arrastrara como campo de TEXTO suelto, que es un error de uso
// mucho menos probable que con el logo (que aparece primero en la lista de "Empresa").
const NOT_DRAGGABLE_AS_TEXT = new Set(['empresa.logoUrl'])

export function mapCamposToFieldCategories(campos: CampoDisponiblePlantilla[]): TemplateFieldCategory[] {
  const byCategory = new Map<string, TemplateFieldCategory>()
  for (const campo of campos) {
    if (NOT_DRAGGABLE_AS_TEXT.has(campo.key)) continue
    const categoryKey = campo.key.split('.')[0]
    let category = byCategory.get(categoryKey)
    if (!category) {
      category = { key: categoryKey, label: categoryLabel(categoryKey), fields: [] }
      byCategory.set(categoryKey, category)
    }
    category.fields.push({
      key: campo.key,
      label: campo.label,
      // La API no da un valor de muestra — se usa el label como placeholder visible en el
      // modo diseño del canvas (sin datos reales todavía).
      sample: campo.array ? '' : campo.label,
      array: campo.array,
    })
  }
  return Array.from(byCategory.values())
}

// `document` viaja como blob opaco (`Record<string, unknown>` en el DTO) — mismo cast directo
// que ya se usa para `documentJson` en el resto del módulo (ver `getPlantillaDefault` en
// store.ts). OJO: a diferencia de `documentJson` (que siempre lo trae, porque lo escribió el
// propio editor), el `document` del catálogo fijo de galería viene SIN `type` interno — se
// fuerza aquí desde el `type` ya mapeado del DTO, que sí es confiable. Sin esto, `applyDocument`
// (que usa `document.type` para decidir a qué formato aplicar la plantilla) rompe el store
// entero al recibir `type: undefined`.
export function mapGaleriaItemToTemplateGalleryItem(dto: GaleriaPlantillaDto): TemplateGalleryItem {
  const type = fromApiType(dto.type)
  return {
    id: dto.id,
    type,
    name: dto.name,
    description: dto.description,
    document: { ...(dto.document as unknown as TemplateDocument), type },
  }
}
