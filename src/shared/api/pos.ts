import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type { TurnoCaja, AbrirTurnoDto, PreviewCierreTurno, CerrarTurnoDto, CierreTurnoResult } from './types'

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
