import { useQuery, type QueryKey } from '@tanstack/react-query'
import { conSilencio403 } from '@/shared/api/client'
import type { ApiError } from '@/shared/api/types'

// useQuery para lookups que alimentan FILTROS de pantallas de tabla (sucursal, departamento…).
// Si el request falla por permisos/feature (403) no hay toast y `bloqueado` es true: la pantalla
// debe ocultar el filtro en vez de mostrar un error. No usar en formularios.

export function esErrorDePermiso(err: unknown): boolean {
  const e = err as ApiError | null | undefined
  return e?.statusCode === 403 || e?.code === 'FEATURE_NO_CONTRATADO'
}

export function useFiltroQuery<T>(opts: {
  queryKey: QueryKey
  queryFn: () => Promise<T>
  enabled?: boolean
  staleTime?: number
}) {
  const { queryFn, ...rest } = opts
  const query = useQuery({ ...rest, queryFn: () => conSilencio403(queryFn), retry: false })
  return { ...query, bloqueado: query.isError && esErrorDePermiso(query.error) }
}
