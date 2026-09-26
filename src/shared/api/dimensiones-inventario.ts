// Catálogo → Dimensiones de Inventario — docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §3.
// Catálogo único por tenant de ejes configurables (Marca, Modelo, Año…) y sus valores. Cada
// artículo del catálogo elige cuáles usa (ver dimensiones/reglasCombinacion en catalog.ts).
import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  DimensionInventario,
  ListDimensionesResponse,
  CreateDimensionInventarioDto,
  UpdateDimensionInventarioDto,
  CreateDimensionInventarioResult,
  DimensionInventarioValor,
  CreateDimensionValorDto,
  UpdateDimensionValorDto,
  PaginationParams,
} from './types'

export async function listDimensiones() {
  const res = await client.get<ListDimensionesResponse>(ENDPOINTS.catalog.dimensionesInventario.list)
  return res.data
}

export async function createDimension(data: CreateDimensionInventarioDto) {
  const res = await client.post<{ success: true; data: CreateDimensionInventarioResult }>(
    ENDPOINTS.catalog.dimensionesInventario.list,
    data,
  )
  return unwrap(res)
}

export async function updateDimension(codigo: string, data: UpdateDimensionInventarioDto) {
  const res = await client.put<{ success: true; data: DimensionInventario }>(
    ENDPOINTS.catalog.dimensionesInventario.byId(codigo),
    data,
  )
  return unwrap(res)
}

/** Sin `DELETE` (§3.5) — este es el único botón que se ofrece: activa/desactiva sin body. */
export async function toggleDimension(codigo: string) {
  const res = await client.post<{ success: true; data: DimensionInventario }>(
    ENDPOINTS.catalog.dimensionesInventario.toggle(codigo),
  )
  return unwrap(res)
}

export interface ListValoresDimensionParams extends PaginationParams {
  /** id de un valor de la dimensión PADRE — habilita la cascada (§3.6). */
  padre?: string
  search?: string
}

export async function listValoresDimension(codigo: string, params?: ListValoresDimensionParams) {
  const res = await client.get<{ success: true; data: DimensionInventarioValor[]; meta: { limit: number; offset: number } }>(
    ENDPOINTS.catalog.dimensionesInventario.valores(codigo),
    { params },
  )
  return { items: res.data.data, meta: res.data.meta }
}

export async function createValorDimension(codigo: string, data: CreateDimensionValorDto) {
  const res = await client.post<{ success: true; data: DimensionInventarioValor }>(
    ENDPOINTS.catalog.dimensionesInventario.valores(codigo),
    data,
  )
  return unwrap(res)
}

/** No hay `DELETE` para valores tampoco — "renombrar" es crear uno nuevo y desactivar el viejo
 *  (`activo: false`) — el `id` nunca se puede cambiar (§3.6). */
export async function updateValorDimension(codigo: string, id: string, data: UpdateDimensionValorDto) {
  const res = await client.put<{ success: true; data: DimensionInventarioValor }>(
    ENDPOINTS.catalog.dimensionesInventario.valorById(codigo, id),
    data,
  )
  return unwrap(res)
}
