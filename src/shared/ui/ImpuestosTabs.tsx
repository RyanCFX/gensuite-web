import { RouteTabs } from './RouteTabs'

export function ImpuestosTabs() {
  return (
    <RouteTabs
      tabs={[
        { label: 'Tasas de Impuesto', path: '/config/tasas-impuesto' },
        { label: 'Impuestos Ventas', path: '/config/impuestos-ventas' },
        { label: 'Impuestos Compras', path: '/config/impuestos-compras' },
        { label: 'Impuestos Artículo', path: '/config/impuestos-articulo' },
      ]}
    />
  )
}
