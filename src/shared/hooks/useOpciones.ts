import { useQuery } from '@tanstack/react-query'
import { getOpciones } from '@/shared/api/opciones'
import type { OpcionItem } from '@/shared/api/types'
import type { ApiError } from '@/shared/api/types'

// Selects mínimos para formularios y filtros (GET /opciones/:recurso).
// docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §5.
//
// `fallback` (opcional): listado de administración legacy que alimenta el select cuando
// el backend todavía no expone /opciones (404). Una vez que un recurso da 404, las
// siguientes consultas van directo al fallback sin reintentar el 404. Cuando el backend
// v2 esté desplegado en todos los tenants, los fallbacks se pueden retirar.

type FallbackFn = (q: string, limit: number) => Promise<OpcionItem[]>

const sinOpciones = new Set<string>()

export interface UseOpcionesOpts {
  q?: string
  limit?: number
  enabled?: boolean
  fallback?: FallbackFn
  staleTime?: number
  silent403?: boolean
}

export function useOpciones(recurso: string, opts?: UseOpcionesOpts) {
  const q = opts?.q ?? ''
  const limit = opts?.limit ?? 50
  const fallback = opts?.fallback
  return useQuery({
    queryKey: ['opciones', recurso, q, limit],
    queryFn: async (): Promise<OpcionItem[]> => {
      if (!sinOpciones.has(recurso)) {
        try {
          return await getOpciones(recurso, { q, limit, silent403: opts?.silent403 })
        } catch (err) {
          const status = (err as ApiError)?.statusCode
          if (status === 404 && fallback) {
            sinOpciones.add(recurso)
          } else {
            throw err
          }
        }
      }
      if (fallback) return fallback(q, limit)
      return []
    },
    enabled: opts?.enabled ?? true,
    retry: false,
    staleTime: opts?.staleTime ?? 5 * 60_000,
    gcTime: 30 * 60_000,
  })
}

/** Para tests: olvida qué recursos dieron 404. */
export function resetOpcionesFallback() {
  sinOpciones.clear()
}
