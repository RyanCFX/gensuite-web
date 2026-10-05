import { useOpciones } from '@/shared/hooks/useOpciones'

/** Almacén de venta fijo y almacén de compra por defecto de una sucursal, tomados de los extras de
 *  `/opciones/sucursales` (comparte caché con los selects de sucursal; reemplaza GET /sucursales/:id). */
export function useSucursalAlmacenes(branch: string) {
  const { data, isFetched } = useOpciones('sucursales', { limit: 100, enabled: !!branch })
  const fila = data?.find((o) => o.value === branch)
  return {
    almacenVenta: fila?.custom_almacen_venta || null,
    almacenCompra: fila?.custom_almacen_compra || null,
    isFetched: !!branch && isFetched,
  }
}
