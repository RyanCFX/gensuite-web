import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  NotificacionTipoListItem,
  NotificacionTipo,
  UpdateNotificacionTipoDto,
  NotificacionCanalEmail,
  UpdateNotificacionCanalEmailDto,
  NotificacionLogEntry,
  NotificacionLogResumen,
  ListNotificacionLogsParams,
  ProbarNotificacionDto,
} from './types'

export async function listNotificacionTipos() {
  const res = await client.get<{ success: true; data: NotificacionTipoListItem[] }>(ENDPOINTS.notificaciones.tipos)
  return unwrap(res)
}

export async function getNotificacionTipo(codigo: string) {
  const res = await client.get<{ success: true; data: NotificacionTipo }>(ENDPOINTS.notificaciones.tipoByCodigo(codigo))
  return unwrap(res)
}

export async function updateNotificacionTipo(codigo: string, data: UpdateNotificacionTipoDto) {
  const res = await client.put<{ success: true; data: NotificacionTipo }>(ENDPOINTS.notificaciones.tipoByCodigo(codigo), data)
  return unwrap(res)
}

export async function getNotificacionCanalEmail() {
  const res = await client.get<{ success: true; data: NotificacionCanalEmail }>(ENDPOINTS.notificaciones.canalEmail)
  return unwrap(res)
}

export async function updateNotificacionCanalEmail(data: UpdateNotificacionCanalEmailDto) {
  const res = await client.put<{ success: true; data: { message: string } }>(ENDPOINTS.notificaciones.canalEmail, data)
  return unwrap(res)
}

// ─── Historial de envíos (observabilidad) ─────────────────────────────────────

export async function listNotificacionLogs(params?: ListNotificacionLogsParams) {
  const res = await client.get(ENDPOINTS.notificaciones.logs, { params })
  return unwrapPaginated<NotificacionLogEntry>(res)
}

export async function getNotificacionLogResumen(dias?: number) {
  const res = await client.get<{ success: true; data: NotificacionLogResumen }>(
    ENDPOINTS.notificaciones.logsResumen,
    { params: { dias } },
  )
  return unwrap(res)
}

// ─── Enviar correo de prueba ──────────────────────────────────────────────────

export async function probarNotificacionTipo(codigo: string, data: ProbarNotificacionDto) {
  const res = await client.post<{ success: true; data: { message: string } }>(
    ENDPOINTS.notificaciones.probar(codigo),
    data,
  )
  return unwrap(res)
}
