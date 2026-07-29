import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  TurnoCaja,
  AbrirTurnoDto,
  PreviewCierreTurno,
  CerrarTurnoDto,
  CierreTurnoResult,
  TurnoListItem,
  TurnoDetail,
  PaginatedResponse,
  PaginationParams,
} from './types'

// null si el cajero actual no tiene turno abierto
export async function getTurnoActual() {
  const res = await client.get<{ success: true; data: TurnoCaja | null }>(ENDPOINTS.pos.turnoActual)
  return unwrap(res)
}

export async function abrirTurno(data: AbrirTurnoDto) {
  const res = await client.post<{ success: true; data: TurnoCaja }>(ENDPOINTS.pos.turnoAbrir, data)
  return unwrap(res)
}

export async function getPreviewCierreTurno(openingEntryId: string) {
  const res = await client.get<{ success: true; data: PreviewCierreTurno }>(
    ENDPOINTS.pos.turnoPreviewCierre(openingEntryId),
  )
  return unwrap(res)
}

export async function cerrarTurno(openingEntryId: string, data: CerrarTurnoDto) {
  const res = await client.post<{ success: true; data: CierreTurnoResult }>(
    ENDPOINTS.pos.turnoCerrar(openingEntryId),
    data,
  )
  return unwrap(res)
}

export interface ListTurnosParams extends PaginationParams {
  cajero?: string
  status?: 'Open' | 'Closed'
  from?: string
  to?: string
}

export async function listTurnos(params?: ListTurnosParams) {
  const res = await client.get<PaginatedResponse<TurnoListItem>>(ENDPOINTS.pos.turnos, { params })
  return unwrapPaginated(res)
}

export async function getTurnoDetail(id: string) {
  const res = await client.get<{ success: true; data: TurnoDetail }>(ENDPOINTS.pos.turnoById(id))
  return unwrap(res)
}
