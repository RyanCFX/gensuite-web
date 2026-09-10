import { useQuery } from '@tanstack/react-query'
import { getMePermissionsForDoc } from '@/shared/api/me'
import type { DocumentPermissions } from '@/shared/api/types'

/**
 * Permisos de nivel 2, evaluados sobre un documento concreto
 * (`GET /api/v1/me/permissions/:doctype/:name`, docs/PROMPT_PERMISOS_FRONTEND.md §3 / §7.2).
 *
 * Se pide al abrir una pantalla de detalle, en paralelo con el documento. Sabe cosas que el
 * nivel 1 no: reglas `if_owner`, restricciones por sucursal/almacén/compañía (User Permissions)
 * y el marcador Compras/Gastos. Combinar SIEMPRE con `docstatus` vía `accionesDoc()` (§8).
 *
 * Cacheado 5 min: los permisos de un usuario no cambian mientras trabaja (§5.2). Un 403 fuerza
 * el refresco del nivel 1 desde el interceptor de axios.
 */
export function useDocPermisos(doctype: string, name: string | undefined) {
  const query = useQuery<DocumentPermissions>({
    queryKey: ['doc-permisos', doctype, name],
    queryFn: () => getMePermissionsForDoc(doctype, name as string),
    enabled: !!name,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return {
    permisos: query.data?.permisos,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
