// Carga Inicial de Inventario (Stock Entry / Material Receipt) —
// docs/tasks/PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md
// Crea Y confirma en una sola llamada: no hay borrador, edición ni /importar por lote.

import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CrearCargaInicialDto,
  CargaInicialInventario,
  CargaInicialListItem,
  ListCargaInicialParams,
  PaginatedResponse,
} from './types'

export async function crearCargaInicial(dto: CrearCargaInicialDto) {
  const res = await client.post<{ success: true; data: CargaInicialInventario }>(ENDPOINTS.inventory.cargaInicial.list, dto)
  return unwrap(res)
}

export async function listCargaInicial(params?: ListCargaInicialParams) {
  const res = await client.get<PaginatedResponse<CargaInicialListItem>>(ENDPOINTS.inventory.cargaInicial.list, { params })
  return unwrapPaginated(res)
}

export async function getCargaInicial(id: string) {
  const res = await client.get<{ success: true; data: CargaInicialInventario }>(ENDPOINTS.inventory.cargaInicial.byId(id))
  return unwrap(res)
}

export async function cancelarCargaInicial(id: string) {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.inventory.cargaInicial.cancelar(id))
  return unwrap(res)
}
