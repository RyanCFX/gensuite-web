// Catálogo de Dimensiones de Inventario cacheado en memoria — docs/tasks/
// PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §10.4: ni `Item.dimensiones[].dimension` ni
// `stock-por-dimension` traen la etiqueta legible de la dimensión o del valor — hay que
// resolverlas contra GET /catalog/dimensiones-inventario y GET .../:codigo/valores. Este hook
// cachea ambos en el cache de react-query (staleTime largo, invalidado al crear/editar
// dimensiones o valores) para no repetir la llamada en cada fila de una tabla/selector.
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listDimensiones, listValoresDimension } from '@/shared/api/dimensiones-inventario'
import type { DimensionInventario, DimensionInventarioValor } from '@/shared/api/types'

const STALE_TIME = 5 * 60 * 1000

export function dimensionesInventarioQueryKey() {
  return ['dimensiones-inventario'] as const
}

export function valoresDimensionQueryKey(codigo: string, padre?: string) {
  return ['dimensiones-inventario', codigo, 'valores', padre ?? null] as const
}

/** Catálogo completo de dimensiones del tenant (activas e inactivas). */
export function useDimensionesInventario(opts?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: dimensionesInventarioQueryKey(),
    queryFn: listDimensiones,
    staleTime: STALE_TIME,
    enabled: opts?.enabled ?? true,
  })

  const porCodigo = useMemo(() => {
    const map = new Map<string, DimensionInventario>()
    for (const d of query.data?.data ?? []) map.set(d.codigo, d)
    return map
  }, [query.data])

  return {
    dimensiones: query.data?.data ?? [],
    activas: (query.data?.data ?? []).filter((d) => d.activo),
    espaciosLibres: query.data?.meta.espaciosLibres ?? 0,
    porCodigo,
    /** Resuelve `codigo → etiqueta`. Si el catálogo aún no cargó o el código no existe, cae al
     *  propio código para no dejar la UI en blanco. */
    etiquetaDe: (codigo: string) => porCodigo.get(codigo)?.etiqueta ?? codigo,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/** Invalida el cache del catálogo — llamar tras crear/editar/toggle una dimensión o un valor. */
export function useInvalidateDimensionesInventario() {
  const queryClient = useQueryClient()
  return {
    invalidarDimensiones: () => queryClient.invalidateQueries({ queryKey: dimensionesInventarioQueryKey() }),
    invalidarValores: (codigo: string) =>
      queryClient.invalidateQueries({ queryKey: ['dimensiones-inventario', codigo, 'valores'] }),
  }
}

/** Valores de una dimensión, opcionalmente filtrados por el valor elegido en su dimensión padre
 *  (cascada, §3.6). `enabled` se apaga solo si se pide una cascada (`requierePadre`) y todavía no
 *  hay un `padre` elegido — así el selector hijo queda vacío hasta que el usuario elige el padre. */
export function useValoresDimension(codigo: string | undefined, opts?: { padre?: string; requierePadre?: boolean; search?: string }) {
  const requierePadre = !!opts?.requierePadre
  const enabled = !!codigo && (!requierePadre || !!opts?.padre)
  const query = useQuery({
    queryKey: valoresDimensionQueryKey(codigo ?? '', opts?.padre),
    queryFn: () => listValoresDimension(codigo as string, { padre: opts?.padre, search: opts?.search, limit: 100 }),
    enabled,
    staleTime: STALE_TIME,
  })

  const items = (query.data?.items ?? []).filter((v) => v.activo)

  return {
    items,
    allItems: query.data?.items ?? [] as DimensionInventarioValor[],
    isLoading: enabled && query.isLoading,
    /** Resuelve `id → valor` (texto legible) para esta dimensión, incluyendo inactivos. */
    etiquetaDe: (id: string) => query.data?.items.find((v) => v.id === id)?.valor ?? id,
  }
}
