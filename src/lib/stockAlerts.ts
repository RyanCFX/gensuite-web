import type { ApiError, StockInsufficientOrReservedDetails } from '@/shared/api/types'
import { ERROR_CODES, isApiErrorCode } from '@/shared/api/client'

/** Arma un mensaje claro a partir del `details` estructurado de un 400
 *  `STOCK_INSUFFICIENT_OR_RESERVED` (docs/tasks/73_alertas_stock_disponible_reservado.md §4.1).
 *  Cuando no viene `details` (submit nativo de ERPNext), usa el `message` del backend tal cual. */
export function formatStockInsufficientMessage(err: ApiError): string {
  if (!isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) return err.message
  const details = err.details as StockInsufficientOrReservedDetails | undefined
  if (!details) return err.message
  const { itemCode, warehouse, disponible, reservedStock, solicitado } = details
  return reservedStock > 0
    ? `${itemCode}: pediste ${solicitado} en ${warehouse}, pero solo hay ${disponible} disponibles (${reservedStock} reservadas para otro cliente).`
    : `${itemCode}: pediste ${solicitado} en ${warehouse}, pero solo hay ${disponible} disponibles.`
}
