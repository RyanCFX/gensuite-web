import { useQuery, useQueries } from '@tanstack/react-query'
import { listRelacionesComerciales, getRelacionComercial } from '@/shared/api/relaciones'
import type { RelacionComercialDetalle } from '@/shared/api/types'

/** Resuelve la relación comercial (B2B) activa cuyo `customer`/`supplier` local coincide con
 *  `valor` — usado por `CompraDetail`/`InvoiceDetail` para saber si el proveedor/cliente del
 *  documento es un socio con relación activa. No existe un endpoint "relación por
 *  proveedor/cliente" (docs/tasks/relaciones_comerciales), así que se resuelve listando las
 *  relaciones activas del tenant y trayendo el detalle de cada una — aceptable porque un tenant
 *  típico tiene pocas relaciones comerciales; si esto crece, convendría pedirle al backend un
 *  endpoint directo. */
export function useRelacionComercialPorContraparte(
  campo: 'customer' | 'supplier',
  valor: string | undefined,
  enabled: boolean,
): RelacionComercialDetalle | undefined {
  const { data: relacionesActivas } = useQuery({
    queryKey: ['relaciones-comerciales-activas-lookup'],
    queryFn: () => listRelacionesComerciales({ limit: 100 }),
    staleTime: 5 * 60_000,
    enabled,
  })

  const idsActivas = (relacionesActivas?.items ?? []).filter((r) => r.status === 'activa').map((r) => r.id)
  const detalles = useQueries({
    queries: idsActivas.map((relId) => ({
      queryKey: ['relacion-comercial-lookup', relId],
      queryFn: () => getRelacionComercial(relId),
      staleTime: 5 * 60_000,
      enabled,
    })),
  })

  return detalles.map((q) => q.data).find((r) => r && r[campo] === valor)
}
