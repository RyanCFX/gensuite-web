import { RouteTabs } from './RouteTabs'

export function PlantillasTabs() {
  return (
    <RouteTabs
      tabs={[
        { label: 'Facturas', path: '/config/plantillas-facturas' },
        { label: 'Etiquetas', path: '/config/plantillas-etiquetas' },
        { label: 'Cheques', path: '/config/tesoreria/plantillas-cheque' },
      ]}
    />
  )
}
