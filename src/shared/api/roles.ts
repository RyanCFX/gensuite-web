import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type { RoleDetail, RolePerfil, CreateRoleDto, UpdateRoleDto, CreatePerfilDto, UpdatePerfilRolesDto } from './types'

// CRUD de roles "admin" (detalle con usuarios asignados, crear/editar/eliminar).
// El listado simple de nombres (`GET /roles` → string[]) sigue viviendo en
// shared/api/usuarios.ts (listRoles) — se usa en dropdowns existentes y no cambia.

/** Forma recomendada de armar `perfiles` al invitar/editar un usuario (§6.2/§6.3 del prompt de
 *  Identidad Global) — evita huecos silenciosos de armar `roles` sueltos a mano. */
export async function getPerfiles(): Promise<RolePerfil[]> {
  // El backend responde cada perfil con la clave `nombre` (no `name`) — se normaliza acá para
  // que el resto del front pueda seguir tipando `RolePerfil.name` sin sorpresas.
  const res = await client.get<{ success: true; data: { nombre: string; roles: string[]; rolesEs?: string[] }[] }>(ENDPOINTS.roles.perfiles)
  return unwrap(res).map(({ nombre, roles, rolesEs }) => ({ name: nombre, roles, rolesEs }))
}

export async function getPerfilDetail(name: string): Promise<RolePerfil> {
  // El backend responde con la clave `nombre` — se normaliza a `name` igual que getPerfiles.
  const res = await client.get<{ success: true; data: { nombre: string; roles: string[]; rolesEs?: string[] } }>(ENDPOINTS.roles.perfilByName(name))
  const { nombre, roles, rolesEs } = unwrap(res)
  return { name: nombre, roles, rolesEs }
}

export async function createPerfil(dto: CreatePerfilDto): Promise<RolePerfil> {
  const res = await client.post<{ success: true; data: { nombre: string; roles: string[]; rolesEs?: string[] } }>(ENDPOINTS.roles.perfiles, dto)
  const { nombre, roles, rolesEs } = unwrap(res)
  return { name: nombre, roles, rolesEs }
}

export async function updatePerfilRoles(name: string, dto: UpdatePerfilRolesDto): Promise<RolePerfil> {
  const res = await client.put<{ success: true; data: { nombre: string; roles: string[]; rolesEs?: string[] } }>(ENDPOINTS.roles.perfilByName(name), dto)
  const { nombre, roles, rolesEs } = unwrap(res)
  return { name: nombre, roles, rolesEs }
}

export async function deletePerfil(name: string) {
  await client.delete(ENDPOINTS.roles.perfilByName(name))
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
