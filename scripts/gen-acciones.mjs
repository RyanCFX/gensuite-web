// Genera src/shared/permissions/acciones.generated.ts a partir del catálogo de acciones
// documentado en docs/PROMPT_PERMISOS_FRONTEND.md §16.
//
//   node scripts/gen-acciones.mjs
//
// El doc lista cada acción en una tabla markdown como `| \`modulo.entidad.accion\` | ... |`.
// Extraemos el primer token con backticks de cada fila de tabla que parezca un id de acción.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const doc = readFileSync(resolve(root, 'docs/PROMPT_PERMISOS_FRONTEND.md'), 'utf8')

const ids = new Set()
for (const m of doc.matchAll(/\|\s*`([a-z0-9]+(?:\.[a-z0-9-]+)+)`/g)) {
  ids.add(m[1])
}
const sorted = [...ids].sort()
if (sorted.length !== 394) {
  console.warn(`[gen-acciones] esperaba 394 acciones, encontré ${sorted.length} — revisá el doc`)
}

const out = `// GENERADO automáticamente por scripts/gen-acciones.mjs — NO editar a mano.
// Fuente: docs/PROMPT_PERMISOS_FRONTEND.md §16 (${sorted.length} acciones). Regenerar: node scripts/gen-acciones.mjs

export type AccionId =
${sorted.map((id) => `  | '${id}'`).join('\n')}

export const ACCIONES_CATALOGO: readonly AccionId[] = [
${sorted.map((id) => `  '${id}',`).join('\n')}
] as const
`

writeFileSync(resolve(root, 'src/shared/permissions/acciones.generated.ts'), out)
console.log(`[gen-acciones] ${sorted.length} acciones -> src/shared/permissions/acciones.generated.ts`)
