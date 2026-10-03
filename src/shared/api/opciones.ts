import { client } from './client'
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
        return { value, label: typeof o.label === 'string' ? o.label : value }
      }
      if (typeof item === 'string') return { value: item, label: item }
      return null
    })
    .filter((x): x is OpcionItem => x !== null)
}

export interface OpcionesParams {
  q?: string
  limit?: number
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
  const { silent403, ...query } = params ?? {}
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.opciones.porRecurso(recurso), {
    params: query,
    ...(silent403 ? { silent403: true } : {}),
  } as Parameters<typeof client.get>[1])
  return normalizeOpciones(res.data.data)
}
