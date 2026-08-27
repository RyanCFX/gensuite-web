import type { CreateChequePrintTemplateDto } from '@/shared/api/types'
import type { ChequeElementDef } from './constants'

export interface ElementBox {
  xCm: number
  yCm: number
  wCm: number
  hCm: number
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

// Lee la posición/tamaño de un elemento desde el DTO plano, sustituyendo por la posición por
// defecto del registro cuando el campo aún no tiene valor (plantilla nueva o campo nunca tocado).
export function readElement(values: CreateChequePrintTemplateDto, def: ChequeElementDef): ElementBox {
  const top = values[def.topKey] as number | undefined
  const left = values[def.leftKey] as number | undefined
  const width = def.widthKey ? (values[def.widthKey] as number | undefined) : undefined
  return {
    xCm: left ?? def.defaultLeftCm,
    yCm: top ?? def.defaultTopCm,
    wCm: width ?? def.nominalWidthCm,
    hCm: def.nominalHeightCm,
  }
}

// Aplica un cambio de posición/tamaño (parcial) de un elemento sobre el DTO, devolviendo un nuevo
// objeto de valores. Solo escribe los campos que el doctype realmente persiste para ese elemento
// (la mayoría son anclas: solo x/y; únicamente `amtInWords` guarda ancho).
export function writeElement(
  values: CreateChequePrintTemplateDto,
  def: ChequeElementDef,
  patch: Partial<ElementBox>,
): CreateChequePrintTemplateDto {
  const next = { ...values }
  if (patch.xCm !== undefined) next[def.leftKey] = round2(Math.max(0, patch.xCm)) as never
  if (patch.yCm !== undefined) next[def.topKey] = round2(Math.max(0, patch.yCm)) as never
  if (patch.wCm !== undefined && def.widthKey) next[def.widthKey] = round2(Math.max(0.1, patch.wCm)) as never
  return next
}
