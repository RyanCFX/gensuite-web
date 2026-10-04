import { MutationCache, QueryClient } from '@tanstack/react-query'

export const queryClient: QueryClient = new QueryClient({
  // Tras cualquier escritura exitosa, los datos transaccionales cacheados (listados, detalles, stock…)
  // pasan a "vencidos" SIN refetch inmediato: al volver a esas pantallas se re-piden. Así no hace
  // falta que cada mutación conozca todas las pantallas afectadas. La referencia (configs, opciones)
  // se excluye: se invalida solo cuando una pantalla de administración la escribe.
  mutationCache: new MutationCache({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        refetchType: 'none',
        predicate: (q) => {
          const root = q.queryKey[0]
          return root !== 'opciones' && !(CLAVES_REFERENCIA as readonly unknown[]).includes(root) && !q.meta?.global
        },
      })
    },
  }),
  defaultOptions: {
    queries: {
      // Datos transaccionales: 1 min. Los de referencia (configs, catálogos, opciones) usan los
      // `setQueryDefaults` de abajo.
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/** Datos de referencia que casi nunca cambian: se cachean con expiración larga. Se invalidan solos
 *  cuando una pantalla de administración los escribe (ver `invalidarReferenciaTrasEscritura`). */
export const CLAVES_REFERENCIA = [
  'facturacion-config', 'ecf-config', 'ecf-tipos', 'catalogos-fiscales', 'impuestos-compras', 'impuestos-ventas',
  'retenciones-all', 'denominaciones', 'stock-settings', 'cuentas-empresa', 'layaway-config', 'bancos', 'empresa',
  'warehouses', 'almacenes', 'sucursales-all', 'sucursal', 'usuarioSucursales', 'usuarioAlmacenesPermitidos',
  'tesoreria-tipos-documento', 'brands', 'categories', 'dimensiones-inventario', 'monedas-tasa-vigente',
] as const

for (const key of CLAVES_REFERENCIA) queryClient.setQueryDefaults([key], { staleTime: 1000 * 60 * 30 })

const ESCRITURA_REFERENCIA =
  /^\/?(config|sucursales|usuarios|roles|monedas|departamentos|centros-costo|cuentas-bancarias|aseguradoras|cajas|bancos|tesoreria\/tipos-documento|catalog\/(categories|brands|dimensiones-inventario|uom)|customers\/groups|suppliers\/groups|acceso|permisos)/

/** Tras escribir en una pantalla de administración se invalida la referencia cacheada (opciones de
 *  selects, configs, catálogos) para que formularios y filtros no sigan mostrando datos viejos. */
export function invalidarReferenciaTrasEscritura(method: string | undefined, url: string | undefined) {
  if (!method || method.toLowerCase() === 'get' || !url || !ESCRITURA_REFERENCIA.test(url.replace(/^\/api\/v\d+/, ''))) return
  void queryClient.invalidateQueries({ queryKey: ['opciones'] })
  for (const key of CLAVES_REFERENCIA) void queryClient.invalidateQueries({ queryKey: [key] })
}

let versionReferencia: string | null = null

/** `X-Reference-Version` cambia cuando alguien escribe datos de referencia del tenant. Si cambió desde
 *  la última vez que la vimos (otro usuario, otra pestaña), se invalida la referencia cacheada. */
export function registrarVersionReferencia(version: string | null | undefined) {
  if (!version) return
  const anterior = versionReferencia
  versionReferencia = version
  if (anterior !== null && anterior !== version) {
    void queryClient.invalidateQueries({ queryKey: ['opciones'] })
    for (const key of CLAVES_REFERENCIA) void queryClient.invalidateQueries({ queryKey: [key] })
  }
}
