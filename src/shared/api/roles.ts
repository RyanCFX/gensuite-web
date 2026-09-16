import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type { RoleDetail, RolePerfil, CreateRoleDto, UpdateRoleDto } from './types'

// CRUD de roles "admin" (detalle con usuarios asignados, crear/editar/eliminar).
// El listado simple de nombres (`GET /roles` → string[]) sigue viviendo en
// shared/api/usuarios.ts (listRoles) — se usa en dropdowns existentes y no cambia.

/** Forma recomendada de armar `perfiles` al invitar/editar un usuario (§6.2/§6.3 del prompt de
 *  Identidad Global) — evita huecos silenciosos de armar `roles` sueltos a mano. */
export async function getPerfiles(): Promise<RolePerfil[]> {
  // El backend responde cada perfil con la clave `nombre` (no `name`) — se normaliza acá para
  // que el resto del front pueda seguir tipando `RolePerfil.name` sin sorpresas.
  const res = await client.get<{ success: true; data: { nombre: string; roles: string[] }[] }>(ENDPOINTS.roles.perfiles)
  return unwrap(res).map(({ nombre, roles }) => ({ name: nombre, roles }))
}

export async function getRoleDetail(name: string): Promise<RoleDetail> {
  const res = await client.get<{ success: true; data: RoleDetail }>(ENDPOINTS.roles.byName(name))
  return res.data.data
}

export async function createRole(dto: CreateRoleDto) {
  const res = await client.post<{ success: true; data: RoleDetail }>(ENDPOINTS.roles.list, dto)
  return res.data.data
}

export async function updateRole(name: string, dto: UpdateRoleDto) {
  const res = await client.put<{ success: true; data: RoleDetail }>(ENDPOINTS.roles.byName(name), dto)
  return res.data.data
}

export async function deleteRole(name: string) {
  await client.delete(ENDPOINTS.roles.byName(name))
}
