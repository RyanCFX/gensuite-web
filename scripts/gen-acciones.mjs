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
// 6 de `catalogo.servicios.*` (openapi.json: Lista de Servicios —
// ver/nuevo/activar/editar/precios/eliminar). Ya estaban en el generado anterior.
const EXTRAS_SERVICIOS = [
  'catalogo.servicios.activar',
  'catalogo.servicios.actualizar-precios',
  'catalogo.servicios.crear',
  'catalogo.servicios.editar',
  'catalogo.servicios.eliminar',
  'catalogo.servicios.listar',
]
// Acciones de Delivery con cobro contra entrega — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §1.
// No están en PROMPT_PERMISOS_FRONTEND.md §16 (el doc usa grupos con `|` que el regex de
// arriba no expande), así que se listan explícitas acá para que el regen las conserve.
const EXTRAS_DELIVERY = [
  'delivery.pendientes.listar',
  'delivery.viajes.listar',
  'delivery.viajes.crear',
  'delivery.viajes.editar',
  'delivery.viajes.despachar',
  'delivery.viajes.cancelar',
  'delivery.viajes.imprimir',
  'delivery.entregas.confirmar',
  'delivery.entregas.anular',
  'delivery.cobros.listar',
  'delivery.cobros.conciliar',
  'delivery.cobros.conciliar-con-diferencia',
  'delivery.repartidores.listar',
  'delivery.repartidores.crear',
  'delivery.repartidores.editar',
  'delivery.vehiculos.listar',
  'delivery.vehiculos.crear',
  'delivery.vehiculos.editar',
  'config.delivery.habilitar',
  'config.delivery.deshabilitar',
  'config.delivery.configurar',
]
for (const id of [...EXTRAS_SERVICIOS, ...EXTRAS_DELIVERY]) ids.add(id)
const sorted = [...ids].sort()

const out = `// GENERADO automáticamente por scripts/gen-acciones.mjs — NO editar a mano.
// Fuente: docs/PROMPT_PERMISOS_FRONTEND.md §16 + docs/tasks/PROMPT_DELIVERY_FRONTEND.md §1 (${sorted.length} acciones). Regenerar: node scripts/gen-acciones.mjs

export type AccionId =
${sorted.map((id) => `  | '${id}'`).join('\n')}

export const ACCIONES_CATALOGO: readonly AccionId[] = [
${sorted.map((id) => `  '${id}',`).join('\n')}
] as const
`

writeFileSync(resolve(root, 'src/shared/permissions/acciones.generated.ts'), out)
console.log(`[gen-acciones] ${sorted.length} acciones -> src/shared/permissions/acciones.generated.ts`)
