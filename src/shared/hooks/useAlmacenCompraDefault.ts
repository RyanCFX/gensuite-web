import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSucursalAlmacenes } from '@/shared/hooks/useSucursalAlmacenes'
import { getProveedorDetalle } from '@/shared/api/formularios'

/**
 * Almacén de compra por defecto para las líneas de un documento de compra
 * (orden, recepción o compra) — misma resolución que aplica el backend al
 * recibir (ver `Supplier.almacenCompraDefault`, `Sucursal.almacenCompra` y
 * `ALMACEN_COMPRA_NO_CONFIGURADO` en `@/shared/api/client`):
 *
 *   proveedor.almacenCompraDefault > sucursal.almacenCompra > (lo que ya hubiera)
 *
 * Rellena las filas sin almacén (o con el default anterior/personal) solo en
 * modo creación — nunca pisa un almacén elegido a mano ni valores hidratados
 * en edición. Devuelve el default resuelto para usarlo al agregar filas nuevas
 * (`emptyItem(autoWarehouse || defaultWh)`).
 */
export function useAlmacenCompraDefault<T extends { warehouse: string }>(opts: {
  supplierId: string
  branch: string
  /** En edición no se tocan las líneas — mandan los valores del servidor. */
  isEdit: boolean
  setItems: React.Dispatch<React.SetStateAction<T[]>>
  /** Default personal del usuario — cede ante proveedor/sucursal. */
  defaultWh?: string
  /** Cantidad de filas — al agregar una (nace con `defaultWh`), se le aplica el default. */
  itemCount: number
}): string {
  const { supplierId, branch, isEdit, setItems, defaultWh, itemCount } = opts

  // Comparte caché con los `['supplier', id]` que ya piden los formularios.
  const { data: supplierDetail } = useQuery({
    queryKey: ['proveedor-detalle', supplierId],
    queryFn: () => getProveedorDetalle(supplierId),
    enabled: !!supplierId,
    staleTime: 5 * 60_000,
  })
  const { almacenCompra: almacenCompraSucursal } = useSucursalAlmacenes(branch)

  const autoWarehouse = supplierDetail?.almacenCompraDefault || almacenCompraSucursal || ''
  const prevAutoRef = useRef<string | null>(null)

  /* eslint-disable react-hooks/exhaustive-deps --
     setItems es estable y defaultWh solo alimenta el valor inicial del ref. Se
     re-ejecuta al cambiar el default resuelto o al agregar/quitar filas (las
     nuevas nacen con `defaultWh` y acá migran). Limpiar un almacén a mano no
     re-dispara el efecto — se respeta. */
  useEffect(() => {
    if (isEdit) return
    // El default personal ocupa las filas iniciales — si luego resuelve un
    // default de proveedor/sucursal, esas filas también migran (una vez por
    // cambio). La elección manual nunca se toca.
    const prev = prevAutoRef.current ?? defaultWh ?? ''
    prevAutoRef.current = autoWarehouse || prev
    if (!autoWarehouse || autoWarehouse === prev) return
    setItems((prevItems) =>
      prevItems.map((row) =>
        !row.warehouse || row.warehouse === prev ? { ...row, warehouse: autoWarehouse } : row,
      ),
    )
  }, [autoWarehouse, itemCount, isEdit])

  return autoWarehouse
}
