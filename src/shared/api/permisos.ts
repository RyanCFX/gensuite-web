import { client } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  PermisoRow,
  PermisoPtype,
  CreatePermisoDto,
  UpdatePermisoDto,
  RemovePermisoDto,
  AssignPermisoDto,
  PermisosCatalogo,
  PermisoCatalogoItem,
} from './types'

export const PERMISO_PTYPES: PermisoPtype[] = [
  'read', 'write', 'create', 'delete', 'submit', 'cancel', 'amend',
  'report', 'export', 'import', 'share', 'print', 'email', 'select',
]

export const PERMISO_PTYPE_LABELS: Record<PermisoPtype, string> = {
  read: 'Leer',
  write: 'Escribir',
  create: 'Crear',
  delete: 'Eliminar',
  submit: 'Confirmar',
  cancel: 'Cancelar',
  amend: 'Enmendar',
  report: 'Reportes',
  export: 'Exportar',
  import: 'Importar',
  share: 'Compartir',
  print: 'Imprimir',
  email: 'Correo',
  select: 'Seleccionar',
}

/**
 * `GET /permisos/catalogo` no tiene schema documentado en openapi.json. En la
 * práctica ERPNext (`get_roles_and_doctypes`) devuelve `{ label, value, label_es }[]` —
 * `label_es` es la traducción al español que usamos para mostrar en los
 * selects, pero normalizamos defensivamente también strings sueltos u
 * objetos `{name}` sin `label_es`, por si el shape cambia entre versiones.
 */
function normalizeCatalogoItems(raw: unknown): PermisoCatalogoItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') return { value: item }
      if (item && typeof item === 'object') {
        const obj = item as { value?: unknown; name?: unknown; label?: unknown; label_es?: unknown }
        const val = obj.value ?? obj.name ?? obj.label
        if (typeof val !== 'string') return null
        return { value: val, label_es: typeof obj.label_es === 'string' ? obj.label_es : undefined }
      }
      return null
    })
    .filter((v): v is PermisoCatalogoItem => v !== null)
}

export async function getPermisosCatalogo(): Promise<PermisosCatalogo> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.permisos.catalogo)
  const data = (res.data.data ?? {}) as { doctypes?: unknown; roles?: unknown }
  return {
    doctypes: normalizeCatalogoItems(data.doctypes),
    roles: normalizeCatalogoItems(data.roles),
  }
}

export async function getPermisos(params?: { doctype?: string; role?: string }): Promise<PermisoRow[]> {
  const res = await client.get<{ success: true; data: PermisoRow[] }>(ENDPOINTS.permisos.list, { params })
  return res.data.data ?? []
}

export async function createPermiso(dto: CreatePermisoDto) {
  const res = await client.post<{ success: true; data: PermisoRow }>(ENDPOINTS.permisos.list, dto)
  return res.data.data
}

export async function updatePermisoFlag(dto: UpdatePermisoDto) {
  const res = await client.put<{ success: true; data: PermisoRow }>(ENDPOINTS.permisos.list, dto)
  return res.data.data
}

// Primer DELETE-con-body de este proyecto — el resto de la API usa el id en la
// URL, pero /permisos identifica la regla por (doctype, role, permlevel) en el
// body, tal como documenta RemovePermisoDto en openapi.json.
export async function deletePermiso(dto: RemovePermisoDto) {
  await client.delete(ENDPOINTS.permisos.list, { data: dto })
}

export async function resetPermisos(doctype: string) {
  await client.post(ENDPOINTS.permisos.reset, { doctype })
}

export async function assignPermiso(dto: AssignPermisoDto) {
  const res = await client.post<{ success: true; data: PermisoRow }>(ENDPOINTS.permisos.asignar, dto)
  return res.data.data
}
