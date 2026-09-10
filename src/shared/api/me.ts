import { client } from './client'
import { ENDPOINTS } from './endpoints'
import type { DocumentPermissions, MePermissions } from './types'

/**
 * `GET /me/permissions` no tiene JSON Schema documentado en openapi.json (solo se menciona
 * `acciones`/`doctypes`/`roles` en prosa) y `vertical` no aparece en absoluto en el schema de
 * esta ruta — normalizamos defensivamente en vez de asumir la forma, igual que ya hace
 * `getPermisosCatalogo()` en `./permisos.ts`. Cualquier valor de `vertical` que no sea
 * literalmente "farmacia" (incluido ausente) se trata como "general".
 */
function normalizeMePermissions(raw: unknown): MePermissions {
  const d = (raw ?? {}) as Record<string, unknown>
  return {
    email: typeof d.email === 'string' ? d.email : '',
    roles: Array.isArray(d.roles) ? d.roles.filter((r): r is string => typeof r === 'string') : [],
    doctypes: d.doctypes && typeof d.doctypes === 'object' ? (d.doctypes as MePermissions['doctypes']) : {},
    acciones: d.acciones && typeof d.acciones === 'object' ? (d.acciones as Record<string, boolean>) : {},
    vertical: d.vertical === 'farmacia' ? 'farmacia' : 'general',
  }
}

export async function getMePermissions(): Promise<MePermissions> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.permissions)
  return normalizeMePermissions(res.data.data)
}

export async function getMePermissionsForDoc(doctype: string, name: string): Promise<DocumentPermissions> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.permissionsByDoc(doctype, name))
  const d = (res.data.data ?? {}) as Record<string, unknown>
  return {
    doctype: typeof d.doctype === 'string' ? d.doctype : doctype,
    name: typeof d.name === 'string' ? d.name : name,
    permisos: d.permisos && typeof d.permisos === 'object' ? (d.permisos as DocumentPermissions['permisos']) : {},
  }
}
