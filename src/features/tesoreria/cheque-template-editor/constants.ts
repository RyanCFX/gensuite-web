import type { CreateChequePrintTemplateDto } from '@/shared/api/types'

// Todo el modelo de la plantilla de cheque vive en centímetros (coordenadas desde el borde
// superior/izquierdo del papel pre-impreso — ver `ChequePrintTemplate` en shared/api/types.ts).
// El canvas solo convierte a px para pintar; el DTO que se envía al backend nunca cambia de forma.
export const PX_PER_CM = 96 / 2.54

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
export const DEFAULT_ZOOM = 1

export const GRID_CM = 0.5
export const SNAP_CM = 0.1
export const ARROW_STEP_CM = 0.1
export const ARROW_STEP_CM_SHIFT = 1

export const DEFAULT_CHEQUE_CM = { width: 19, height: 8.5 }
export const A4_CM = { width: 21, height: 29.7 }

export type ChequeElementId =
  | 'date'
  | 'payerName'
  | 'amtInWords'
  | 'amtInFigures'
  | 'accNo'
  | 'signatory'
  | 'accPay'

export interface ChequeElementDef {
  id: ChequeElementId
  label: string
  topKey: keyof CreateChequePrintTemplateDto
  leftKey: keyof CreateChequePrintTemplateDto
  widthKey?: keyof CreateChequePrintTemplateDto
  lineSpacingKey?: keyof CreateChequePrintTemplateDto
  sample: string
  nominalWidthCm: number
  nominalHeightCm: number
  defaultTopCm: number
  defaultLeftCm: number
  // Si es true, el elemento solo se dibuja/edita cuando `isAccountPayable` está activo.
  optional?: boolean
}

// Registro único de los 7 elementos que soporta el doctype `Cheque Print Template` de ERPNext.
// El canvas, el panel de propiedades y el mapeo hacia/desde el DTO iteran sobre este array — no
// hay paleta ni lista arrastrable porque el conjunto de elementos es fijo y cerrado.
export const CHEQUE_ELEMENTS: ChequeElementDef[] = [
  {
    id: 'date',
    label: 'Fecha',
    topKey: 'dateDistFromTopEdge',
    leftKey: 'dateDistFromLeftEdge',
    sample: '24/08/2026',
    nominalWidthCm: 3,
    nominalHeightCm: 0.5,
    defaultTopCm: 1,
    defaultLeftCm: 14,
  },
  {
    id: 'payerName',
    label: 'Beneficiario',
    topKey: 'payerNameFromTopEdge',
    leftKey: 'payerNameFromLeftEdge',
    sample: 'Nombre del Beneficiario',
    nominalWidthCm: 8,
    nominalHeightCm: 0.5,
    defaultTopCm: 2.2,
    defaultLeftCm: 2,
  },
  {
    id: 'amtInWords',
    label: 'Monto en Letras',
    topKey: 'amtInWordsFromTopEdge',
    leftKey: 'amtInWordsFromLeftEdge',
    widthKey: 'amtInWordWidth',
    lineSpacingKey: 'amtInWordsLineSpacing',
    sample: 'Quince mil doscientos pesos con 00/100',
    nominalWidthCm: 16,
    nominalHeightCm: 0.9,
    defaultTopCm: 3,
    defaultLeftCm: 1.5,
  },
  {
    id: 'amtInFigures',
    label: 'Monto en Números',
    topKey: 'amtInFiguresFromTopEdge',
    leftKey: 'amtInFiguresFromLeftEdge',
    sample: 'RD$ 15,200.00',
    nominalWidthCm: 3.5,
    nominalHeightCm: 0.5,
    defaultTopCm: 2.2,
    defaultLeftCm: 15.5,
  },
  {
    id: 'accNo',
    label: 'Cuenta',
    topKey: 'accNoDistFromTopEdge',
    leftKey: 'accNoDistFromLeftEdge',
    sample: '000-123456-7',
    nominalWidthCm: 4,
    nominalHeightCm: 0.4,
    defaultTopCm: 0.4,
    defaultLeftCm: 1,
  },
  {
    id: 'signatory',
    label: 'Firma',
    topKey: 'signatoryFromTopEdge',
    leftKey: 'signatoryFromLeftEdge',
    sample: 'Firma Autorizada',
    nominalWidthCm: 5,
    nominalHeightCm: 0.5,
    defaultTopCm: 7,
    defaultLeftCm: 13,
  },
  {
    id: 'accPay',
    label: 'Leyenda "Account Pay Only"',
    topKey: 'accPayDistFromTopEdge',
    leftKey: 'accPayDistFromLeftEdge',
    sample: 'ACCOUNT PAY ONLY',
    nominalWidthCm: 5,
    nominalHeightCm: 0.4,
    defaultTopCm: 4,
    defaultLeftCm: 1.5,
    optional: true,
  },
]
