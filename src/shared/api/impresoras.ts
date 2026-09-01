import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type { CreateImpresoraDto, Impresora, UpdateImpresoraDto } from './types'

// El cliente axios pone `Content-Type: application/json` por default en toda request — con un
// body vacío, este BFF (Fastify) rechaza eso con 400 antes de llegar al controller (ver
// docs/tasks/55_..., mismo hallazgo aplicado aquí para el DELETE sin body).
const NO_BODY_CONFIG = { headers: { 'Content-Type': undefined } }

export async function listImpresoras() {
  const res = await client.get<{ success: true; data: Impresora[] }>(ENDPOINTS.impresoras.list)
  return unwrap(res)
}

export async function createImpresora(data: CreateImpresoraDto) {
  const res = await client.post<{ success: true; data: Impresora }>(ENDPOINTS.impresoras.list, data)
  return unwrap(res)
}

export async function updateImpresora(id: string, data: UpdateImpresoraDto) {
  const res = await client.put<{ success: true; data: Impresora }>(ENDPOINTS.impresoras.byId(id), data)
  return unwrap(res)
}

export async function deleteImpresora(id: string) {
  await client.delete(ENDPOINTS.impresoras.byId(id), NO_BODY_CONFIG)
}

/** `null` = el usuario no ha seleccionado ninguna impresora (o la que tenía fue eliminada) —
 * no es un error, cae al diálogo de impresión del navegador. */
export async function getMiSeleccion() {
  const res = await client.get<{ success: true; data: Impresora | null }>(ENDPOINTS.impresoras.miSeleccion)
  return unwrap(res)
}

export async function setMiSeleccion(impresoraId: string | null) {
  const res = await client.put<{ success: true; data: Impresora | null }>(
    ENDPOINTS.impresoras.miSeleccion,
    { impresoraId },
  )
  return unwrap(res)
}
