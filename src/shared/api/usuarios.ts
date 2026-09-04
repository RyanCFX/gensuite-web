import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Usuario,
  CreateUsuarioDto,
  UpdateUsuarioDto,
  PaginatedResponse,
  PaginationParams,
  UsuarioSucursales,
  UsuarioAlmacenesPermitidos,
} from './types'

export async function listUsuarios(params?: PaginationParams) {
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

export async function createUsuario(data: CreateUsuarioDto) {
  const res = await client.post<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.list, data)
  return unwrap(res)
}

export async function updateUsuario(email: string, data: Partial<UpdateUsuarioDto>) {
  const res = await client.put<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.byEmail(email), data)
  return unwrap(res)
}

export async function deleteUsuario(email: string) {
  await client.delete(ENDPOINTS.usuarios.byEmail(email))
}

export async function enableUsuario(email: string) {
  const res = await client.post<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.enable(email))
  return unwrap(res)
}

export async function resetPasswordUsuario(email: string) {
  await client.post(ENDPOINTS.usuarios.resetPassword(email))
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
