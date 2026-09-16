import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Usuario,
  UsuarioLookupResult,
  InviteUsuarioDto,
  InviteUsuarioResult,
  UpdateUsuarioDto,
  MembershipStatus,
  PaginatedResponse,
  PaginationParams,
  UsuarioSucursales,
  UsuarioAlmacenesPermitidos,
} from './types'

export interface ListUsuariosParams extends PaginationParams {
  status?: MembershipStatus;
}

export async function listUsuarios(params?: ListUsuariosParams) {
  const res = await client.get<PaginatedResponse<Usuario>>(ENDPOINTS.usuarios.list, { params })
  return unwrapPaginated(res)
}

export async function getUsuario(email: string) {
  const res = await client.get<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.byEmail(email))
  return unwrap(res)
}

/** Resuelve un usuario por su código de carnet/QR/barcode (adminCode) — para cualquier pantalla
 *  con lector conectado que necesite identificar a alguien sin escribir su email (selección de
 *  cajero al abrir turno POS, override de PIN de administrador, etc.). 404 si no existe. */
export async function buscarUsuarioPorCodigo(codigo: string) {
  const res = await client.get<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.buscarCodigo(codigo))
  return unwrap(res)
}

/** Paso previo obligatorio antes de mostrar el formulario de invitar (§6.2) — nunca revela en
 *  qué otros tenants está la persona, solo nombre/apellido/teléfono y su estado en ESTE tenant. */
export async function lookupUsuario(email: string): Promise<UsuarioLookupResult> {
  const res = await client.get<{ success: true; data: UsuarioLookupResult }>(ENDPOINTS.usuarios.lookup, { params: { email } })
  return unwrap(res)
}

/** Invita — nunca crea con contraseña (§6.3). El backend maneja re-invitación automáticamente si
 *  ya existía una fila para este email en este tenant en un estado no-`accepted`. */
export async function inviteUsuario(data: InviteUsuarioDto): Promise<InviteUsuarioResult> {
  const res = await client.post<{ success: true; data: InviteUsuarioResult }>(ENDPOINTS.usuarios.list, data)
  return unwrap(res)
}

export async function updateUsuario(email: string, data: Partial<UpdateUsuarioDto>) {
  const res = await client.put<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.byEmail(email), data)
  return unwrap(res)
}

/** Revoca el acceso de alguien que ya lo tenía — definitivo hasta una nueva invitación (§6.7). */
export async function revocarUsuario(email: string, reason?: string) {
  await client.delete(ENDPOINTS.usuarios.byEmail(email), { data: reason ? { reason } : undefined })
}

/** Temporal — pensado para reactivarse después con `reactivarUsuario` (§6.7). */
export async function suspenderUsuario(email: string, reason?: string) {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.usuarios.suspender(email), reason ? { reason } : undefined)
  return unwrap(res)
}

/** Solo tiene sentido desde `suspended` — vuelve directo a `accepted` (§6.7). */
export async function reactivarUsuario(email: string) {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.usuarios.reactivar(email))
  return unwrap(res)
}

/** Reenvía el correo de invitación con un link nuevo (el anterior queda invalidado) — para
 *  cualquier estado que no sea `accepted` (§6.4). */
export async function reinvitarUsuario(email: string) {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.usuarios.reinvitar(email))
  return unwrap(res)
}

export async function listRoles(): Promise<Array<{ id: string; label: string; }>> {
  const res = await client.get<{ success: true; data: Array<{ id: string; label: string }> }>(ENDPOINTS.roles.list)
  return unwrap(res)
}

export async function getUsuarioSucursales(email: string) {
  const res = await client.get<{ success: true; data: UsuarioSucursales }>(ENDPOINTS.usuarios.sucursales(email))
  return unwrap(res)
}

export async function updateUsuarioSucursales(email: string, branches: string[]) {
  const res = await client.put<{ success: true; data: UsuarioSucursales }>(ENDPOINTS.usuarios.sucursales(email), { branches })
  return unwrap(res)
}

export async function getUsuarioAlmacenesPermitidos(email: string) {
  const res = await client.get<{ success: true; data: UsuarioAlmacenesPermitidos }>(ENDPOINTS.usuarios.almacenesPermitidos(email))
  return unwrap(res)
}
