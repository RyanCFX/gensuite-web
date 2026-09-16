// docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md §7 — detalle de inventario por artículo+almacén
// vía GET /inventory?itemCode=X&warehouse=Y. A diferencia de useItemsStock (que trae solo
// disponible/reservedStock/actualQty desde /catalog/items/:id/stock), esto expone también
// reservedQty ("en pedido", informativo, NO bloqueante) y el resto de los campos de InventoryItem.

import { useQueries } from '@tanstack/react-query'
import { listInventory } from '@/shared/api/inventory'
import type { InventoryItem } from '@/shared/api/types'

export interface ItemWarehousePair {
  itemCode: string
  warehouse: string
}

function keyOf(p: ItemWarehousePair) {
  return `${p.itemCode}::${p.warehouse}`
}

export function useItemInventory(pairs: (ItemWarehousePair | undefined)[]): Map<string, InventoryItem> {
  const uniquePairs = [...new Map(
    pairs.filter((p): p is ItemWarehousePair => !!p?.itemCode && !!p?.warehouse).map((p) => [keyOf(p), p]),
  ).values()]

  const queries = useQueries({
    queries: uniquePairs.map((p) => ({
      queryKey: ['inventory-item', p.itemCode, p.warehouse],
      queryFn: async () => {
        const res = await listInventory({ itemCode: p.itemCode, warehouse: p.warehouse, limit: 1 })
        return res.items[0]
      },
      staleTime: 30_000,
      retry: false,
    })),
  })

  const map = new Map<string, InventoryItem>()
  uniquePairs.forEach((p, i) => {
    const data = queries[i].data
    if (data) map.set(keyOf(p), data)
  })
  return map
}
