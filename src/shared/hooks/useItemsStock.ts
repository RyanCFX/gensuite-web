import { useQueries } from '@tanstack/react-query'
import { getItemStock } from '@/shared/api/catalog'
import type { ItemStock } from '@/shared/api/types'

/** Trae disponibilidad real (físico − reservado) por artículo, para validar líneas de venta antes
 *  de someter — docs/tasks/73_alertas_stock_disponible_reservado.md. Cachea por `itemCode`
 *  (independiente del almacén elegido en la línea) para no repetir la consulta al cambiar de
 *  almacén dentro del mismo formulario. Ítems sin stock real (servicios, combos, código vacío)
 *  se filtran antes de llamar — no hay `GET /catalog/items/:id/stock` que tenga sentido para ellos. */
export function useItemsStock(itemCodes: (string | undefined)[]): Map<string, ItemStock> {
  const uniqueCodes = [...new Set(itemCodes.filter((c): c is string => !!c))]
  const queries = useQueries({
    queries: uniqueCodes.map((code) => ({
      queryKey: ['item-stock', code],
      queryFn: () => getItemStock(code),
      staleTime: 30_000,
      retry: false,
    })),
  })
  const map = new Map<string, ItemStock>()
  uniqueCodes.forEach((code, i) => {
    const data = queries[i].data
    if (data) map.set(code, data)
  })
  return map
}

export interface DisponibleInfo {
  disponible: number
  reservedStock: number
  actualQty: number
}

/** Extrae la disponibilidad de un almacén específico del `ItemStock` de un artículo. `undefined`
 *  si todavía no se cargó el stock del artículo (no bloquear con datos incompletos); si el
 *  artículo no tiene ninguna fila para ese almacén, se asume 0 en todos los campos (nunca hubo
 *  stock ahí). */
export function resolveDisponible(stock: ItemStock | undefined, warehouse: string): DisponibleInfo | undefined {
  if (!stock || !warehouse) return undefined
  const w = stock.warehouses.find((x) => x.warehouse === warehouse)
  if (!w) return { disponible: 0, reservedStock: 0, actualQty: 0 }
  return { disponible: w.disponible, reservedStock: w.reservedStock, actualQty: w.qty }
}
