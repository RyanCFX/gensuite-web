import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  PrincipioActivo,
  PrincipioActivoDetalle,
  CreatePrincipioActivoDto,
  UpdatePrincipioActivoDto,
  ListPrincipiosActivosParams,
  DeshabilitarPrincipioActivoResult,
  FusionarPrincipioActivoDto,
  FusionarPrincipioActivoResult,
  PaginatedResponse,
} from './types'

// ─── Catálogo maestro de Principios Activos (vertical Farmacia) — docs/tasks/
// PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §5 ────────────────────────────────

export async function listPrincipiosActivos(params?: ListPrincipiosActivosParams) {
  const res = await client.get<PaginatedResponse<PrincipioActivo>>(ENDPOINTS.farmacia.principiosActivos.list, { params })
  return unwrapPaginated(res)
}

export async function getPrincipioActivo(id: string) {
  const res = await client.get<{ success: true; data: PrincipioActivoDetalle }>(
    ENDPOINTS.farmacia.principiosActivos.byId(id),
  )
  return unwrap(res)
}

/** Puede rechazar con 409 si el nombre normalizado ya existe — el error trae `candidato` con el
 *  registro existente, manejo especial obligatorio (§5.2/§11), nunca tratarlo como validación
 *  genérica. */
export async function createPrincipioActivo(data: CreatePrincipioActivoDto) {
  const res = await client.post<{ success: true; data: PrincipioActivo }>(
    ENDPOINTS.farmacia.principiosActivos.list,
    data,
  )
  return unwrap(res)
}

/** Si se manda `nombre`, el `id` del recurso cambia en la respuesta (es también el
 *  identificador) — navegar a la nueva URL tras guardar, nunca seguir usando el `id` viejo
 *  (§5.6). Mismo 409 de duplicado que al crear. */
export async function updatePrincipioActivo(id: string, data: UpdatePrincipioActivoDto) {
  const res = await client.put<{ success: true; data: PrincipioActivo }>(
    ENDPOINTS.farmacia.principiosActivos.byId(id),
    data,
  )
  return unwrap(res)
}

/** Nunca borra — deshabilita (§5.7). */
export async function deshabilitarPrincipioActivo(id: string) {
  const res = await client.delete<{ success: true; data: DeshabilitarPrincipioActivoResult }>(
    ENDPOINTS.farmacia.principiosActivos.byId(id),
  )
  return unwrap(res)
}

/** Fusiona el `:id` (absorbido, queda deshabilitado) dentro de `data.destino` (§5.8) —
 *  irreversible en la práctica. */
export async function fusionarPrincipioActivo(id: string, data: FusionarPrincipioActivoDto) {
  const res = await client.post<{ success: true; data: FusionarPrincipioActivoResult }>(
    ENDPOINTS.farmacia.principiosActivos.fusionar(id),
    data,
  )
  return unwrap(res)
}
