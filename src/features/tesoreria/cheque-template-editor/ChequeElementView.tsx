import type { CreateChequePrintTemplateDto } from '@/shared/api/types'
import { PX_PER_CM, type ChequeElementDef } from './constants'

interface Props {
  def: ChequeElementDef
  values: CreateChequePrintTemplateDto
}

// Dibuja el texto de muestra de un elemento sobre el cheque. `amtInWords` es el único que ocupa
// más de una línea — usa el espaciado entre líneas configurado (en cm) para partir la muestra.
export function ChequeElementView({ def, values }: Props) {
  if (def.id === 'amtInWords') {
    const lineSpacingCm = (values.amtInWordsLineSpacing as number | undefined) ?? 0.5
    const words = def.sample.split(' ')
    const mid = Math.ceil(words.length / 2)
    const lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
    return (
      <div className="chq-el-text chq-el-text-multiline">
        {lines.map((line, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 0 : lineSpacingCm * PX_PER_CM - 14 }}>
            {line}
          </div>
        ))}
      </div>
    )
  }

  return <div className="chq-el-text">{def.sample}</div>
}
