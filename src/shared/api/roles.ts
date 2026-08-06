import { client } from './client'
import { ENDPOINTS } from './endpoints'
import type { RoleDetail, CreateRoleDto, UpdateRoleDto } from './types'

// CRUD de roles "admin" (detalle con usuarios asignados, crear/editar/eliminar).
// El listado simple de nombres (`GET /roles` → string[]) sigue viviendo en
// shared/api/usuarios.ts (listRoles) — se usa en dropdowns existentes y no cambia.

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
