import { client, conSilencio403 } from './client'
import { ENDPOINTS } from './endpoints'
import type { OpcionItem } from './types'

// Selects mínimos para formularios y filtros
// (docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §5).
// `value` es el identificador que espera el endpoint de negocio (el `name` de ERPNext);
// `label` es el texto a mostrar. Data-scope estricto en sucursales/almacenes: solo los
// asignados al usuario (lista vacía = ninguna asignada, no "todas").

function normalizeOpciones(raw: unknown): OpcionItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (item && typeof item === 'object') {
        const o = item as { value?: unknown; label?: unknown; name?: unknown }
        const value = o.value ?? o.name
        if (typeof value !== 'string') return null
        // Conserva los extras del recurso (tax_id, stock_uom…) además de value/label.
        return { ...(item as object), value, label: typeof o.label === 'string' ? o.label : value } as OpcionItem
      }
      if (typeof item === 'string') return { value: item, label: item }
      return null
    })
    .filter((x): x is OpcionItem => x !== null)
}

export interface OpcionesParams {
  q?: string
  limit?: number
  /** Solo en `almacenes`: filtra por sucursal (se combina con las sucursales asignadas al usuario). */
  branch?: string
  /** Resuelve esos values (máx. 50) aunque no estén en la primera página — para mostrar el label de un valor ya guardado. */
  ids?: string[]
  /** No mostrar el toast global si la request da 403 (el llamador oculta el control). */
  silent403?: boolean
}

/**
 * Lista mínima para un select. Acepta el recurso con o sin prefijo `lookup.`.
 * Funciona en los tres modos (off/sombra/activo) — el backend evalúa DocPerm en
 * off/sombra. 403 RECURSO_NO_PERMITIDO si el usuario no tiene ningún componente
 * que dependa del recurso (modo activo).
 */
export async function getOpciones(recurso: string, params?: OpcionesParams): Promise<OpcionItem[]> {
  const { silent403, ids, ...rest } = params ?? {}
  const query = { ...rest, ...(ids?.length ? { ids: ids.slice(0, 50).join(',') } : {}) }
  const get = () => client.get<{ success: true; data: unknown }>(ENDPOINTS.opciones.porRecurso(recurso), { params: query })
  const res = await (silent403 ? conSilencio403(get) : get())
  return normalizeOpciones(res.data.data)
}
