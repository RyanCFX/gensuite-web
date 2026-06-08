import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Usuario,
  CreateUsuarioDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

export async function listUsuarios(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<Usuario>>(ENDPOINTS.usuarios.list, { params })
  return unwrapPaginated(res)
}

export async function getUsuario(email: string) {
  const res = await client.get<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.byEmail(email))
  return unwrap(res)
}

export async function createUsuario(data: CreateUsuarioDto) {
  const res = await client.post<{ success: true; data: Usuario }>(ENDPOINTS.usuarios.list, data)
  return unwrap(res)
}

export async function updateUsuario(email: string, data: Partial<CreateUsuarioDto>) {
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

// NOTE: /roles returns string[] (not Role[]) — e.g. ["Administrator", "Accounts User", ...]
export async function listRoles(): Promise<string[]> {
  const res = await client.get<{ success: true; data: string[] }>(ENDPOINTS.roles.list)
  return unwrap(res)
}
