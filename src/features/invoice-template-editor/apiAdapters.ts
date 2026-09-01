// Adapta la forma plana que devuelve GET /plantillas/campos-disponibles ({key, label, array}[])
// a TemplateFieldCategory[] (agrupado por categoría), que es lo que ya consumen
// TemplateEditorRightPanel/TemplateEditorElementView. La API no agrupa ni da un "sample" — se
// derivan aquí a partir del prefijo de la key (antes del primer punto).

import type { CampoDisponiblePlantilla } from '@/shared/api/types'
import type { TemplateFieldCategory } from './types'

const CATEGORY_LABELS: Record<string, string> = {
  empresa: 'Empresa',
  factura: 'Factura',
  cliente: 'Cliente',
  ecf: 'e-CF',
  pagos: 'Pagos',
  items: 'Items',
  producto: 'Producto',
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
