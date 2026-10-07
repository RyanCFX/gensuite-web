import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  MeAcceso,
  AccesoCatalogo,
  PlantillaAcceso,
  PerfilAcceso,
  PerfilAccesoDetail,
  UsuarioAcceso,
  AccesoEfectivo,
  AuditoriaAccesoPage,
  Grant,
} from './types'

// Permisos v2 — docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md.
// Normalización defensiva: el openapi.json del repo todavía no documenta estos
// endpoints, los shapes siguen los ejemplos del documento.

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function normalizeMeAcceso(raw: unknown): MeAcceso {
  const d = (raw ?? {}) as Record<string, unknown>
  const modo = d.modo
  const filtros = d.filtrosBloqueados && typeof d.filtrosBloqueados === 'object'
    ? d.filtrosBloqueados as Record<string, unknown>
    : {}
  const filtrosBloqueados: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(filtros)) filtrosBloqueados[k] = asStringArray(v)
  return {
    modo: modo === 'activo' || modo === 'sombra' ? modo : 'off',
    version: typeof d.version === 'string' ? d.version : '',
    modulos: asStringArray(d.modulos),
    pantallas: asStringArray(d.pantallas),
    componentes: asStringArray(d.componentes),
    // Acceso adicional (docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md §2.2): subconjunto
    // de `componentes`, solo para la UI. Defensivo: ausente en backends viejos → [].
    componentesAdicionales: asStringArray(d.componentesAdicionales),
    recursos: asStringArray(d.recursos),
    filtrosBloqueados,
  }
}

/** Autoservicio: cada usuario puede leer el suyo. Pedir junto con /me/permissions. */
export async function getMiAcceso(): Promise<MeAcceso> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.acceso)
  return normalizeMeAcceso(res.data.data)
}

export async function getAccesoCatalogo(otorgable = true): Promise<AccesoCatalogo> {
  const res = await client.get<{ success: true; data: AccesoCatalogo }>(ENDPOINTS.acceso.catalogo, {
    params: { otorgable },
  })
  return unwrap(res)
}

export async function listPlantillasAcceso(): Promise<PlantillaAcceso[]> {
  const res = await client.get<{ success: true; data: PlantillaAcceso[] }>(ENDPOINTS.acceso.plantillas)
  return unwrap(res)
}

export async function listPerfilesAcceso(): Promise<PerfilAcceso[]> {
  const res = await client.get<{ success: true; data: PerfilAcceso[] }>(ENDPOINTS.acceso.perfiles)
  return unwrap(res)
}

export async function getPerfilAcceso(id: string): Promise<PerfilAccesoDetail> {
  const res = await client.get<{ success: true; data: PerfilAccesoDetail }>(ENDPOINTS.acceso.perfil(id))
  return unwrap(res)
}

export async function createPerfilAcceso(dto: {
  nombre: string
  descripcion?: string
  plantilla?: string
  grants?: Grant[]
}): Promise<PerfilAccesoDetail> {
  const res = await client.post<{ success: true; data: PerfilAccesoDetail }>(ENDPOINTS.acceso.perfiles, dto)
  return unwrap(res)
}

export async function patchPerfilAcceso(id: string, dto: { nombre?: string; descripcion?: string }): Promise<PerfilAccesoDetail> {
  const res = await client.patch<{ success: true; data: PerfilAccesoDetail }>(ENDPOINTS.acceso.perfil(id), dto)
  return unwrap(res)
}

/** Reemplaza la lista COMPLETA de grants del perfil. */
export async function putPerfilGrants(id: string, grants: Grant[], motivo?: string): Promise<PerfilAccesoDetail> {
  const res = await client.put<{ success: true; data: PerfilAccesoDetail }>(
    ENDPOINTS.acceso.perfilGrants(id),
    motivo ? { grants, motivo } : { grants },
  )
  return unwrap(res)
}

export async function deletePerfilAcceso(id: string): Promise<{ message: string }> {
  const res = await client.delete<{ success: true; data: { message: string } }>(ENDPOINTS.acceso.perfil(id))
  return unwrap(res)
}

export async function getUsuarioAcceso(email: string): Promise<UsuarioAcceso> {
  const res = await client.get<{ success: true; data: UsuarioAcceso }>(ENDPOINTS.acceso.usuario(email))
  return unwrap(res)
}

/** `perfiles` reemplaza los asignados; `grants` reemplaza las excepciones solo si se envía. */
export async function putUsuarioAcceso(
  email: string,
  dto: { perfiles: string[]; grants?: Grant[]; motivo?: string },
): Promise<UsuarioAcceso> {
  const res = await client.put<{ success: true; data: UsuarioAcceso }>(ENDPOINTS.acceso.usuario(email), dto)
  return unwrap(res)
}

export async function getAccesoEfectivo(email: string, explicar = true): Promise<AccesoEfectivo> {
  const res = await client.get<{ success: true; data: AccesoEfectivo }>(ENDPOINTS.acceso.usuarioEfectivo(email), {
    params: explicar ? { explicar: true } : undefined,
  })
  return unwrap(res)
}

export async function getAuditoriaAcceso(params?: { limit?: number; offset?: number }): Promise<AuditoriaAccesoPage> {
  const res = await client.get<{ success: true; data: AuditoriaAccesoPage }>(ENDPOINTS.acceso.auditoria, { params })
  return unwrap(res)
}

export async function migrarAcceso(reemplazar = false): Promise<{ perfiles: string[]; usuarios: number; personalizados: number }> {
  const res = await client.post<{ success: true; data: { perfiles: string[]; usuarios: number; personalizados: number } }>(
    ENDPOINTS.acceso.migrar,
    { reemplazar },
  )
  return unwrap(res)
}

export async function sincronizarRolesAcceso(): Promise<Record<string, unknown>> {
  const res = await client.post<{ success: true; data: Record<string, unknown> }>(ENDPOINTS.acceso.sincronizarRoles)
  return unwrap(res)
}
