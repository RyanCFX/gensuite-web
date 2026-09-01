// El editor usa TemplateType ('pos_invoice' | 'label_5x2') internamente — incluido dentro de
// documentJson y en borradores ya guardados en localStorage. La API usa un valor distinto, con
// espacio literal ("Pos Invoice" | "Label 5x2"). Nunca renombrar TemplateType: este mapeo es la
// única frontera entre ambos namespaces.

import type { PlantillaApiType } from '@/shared/api/types'
import type { TemplateType } from './types'

const TEMPLATE_TYPE_TO_API: Record<TemplateType, PlantillaApiType> = {
  pos_invoice: 'Pos Invoice',
  label_5x2: 'Label 5x2',
}

const API_TYPE_TO_TEMPLATE_TYPE: Record<PlantillaApiType, TemplateType> = {
  'Pos Invoice': 'pos_invoice',
  'Label 5x2': 'label_5x2',
}

export function toApiType(type: TemplateType): PlantillaApiType {
  return TEMPLATE_TYPE_TO_API[type]
}

export function fromApiType(type: PlantillaApiType): TemplateType {
  return API_TYPE_TO_TEMPLATE_TYPE[type]
}
