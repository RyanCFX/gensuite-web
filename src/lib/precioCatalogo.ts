/**
 * Candados "Permitir Modificar Precio Libremente" (`permitirModificarPrecioServicios` /
 * `permitirModificarPrecioProductos` en `GET /config/facturacion`): con el toggle correspondiente
 * apagado, el precio BRUTO de una línea de cotización/pedido/factura debe coincidir EXACTAMENTE con uno de los 3 precios de catálogo del
 * artículo (Precio A/B/C). Si no coincide, el endpoint responde 400 con un mensaje como:
 *
 *   "El precio de PROD-001 (90) no coincide con ninguno de los precios de venta configurados
 *    del artículo (Precio A/B/C) — la edición manual de precio está deshabilitada."
 *
 * No hay código de error dedicado — se detecta por patrón en el mensaje (igual que
 * `isPinPrecioError` en `pinOverride.ts`). A diferencia de ese, acá NO hay PIN que lo salve
 * (`pinOverride` no aplica: el problema no es que el precio sea bajo, sino que no es uno de los
 * precios de catálogo). El descuento no cuenta para la comparación — solo el bruto.
 */

import type { ItemPrices } from '@/shared/api/types'

/** Tipo de artículo tal como lo guarda la línea de venta (`catalogItem.type`, espejo de
 *  `Item.custom_item_type`: Servicio → 'service'). */
export type TipoArticuloLinea = 'product' | 'service' | 'combo' | string | undefined

/** Config mínima para decidir el candado de una línea (subset de `FacturacionConfig`). */
export interface PrecioCatalogoConfig {
  permitirModificarPrecioServicios?: boolean
  permitirModificarPrecioProductos?: boolean
}

/**
 * ¿La línea lleva precio bloqueado a catálogo? `service` se rige por el toggle de servicios;
 * todo lo demás (producto, combo o tipo desconocido — ej. línea hidratada sin catálogo) se rige
 * por el de productos. `undefined` (config aún cargando o tenant sin el campo) = editable, igual
 * que el default `true` del backend. Si el backend clasificara un combo de otra forma, el 400 se
 * muestra igual de forma clara en el formulario — el candado de UI es solo anticipación.
 */
export function precioBloqueadoParaLinea(itemType: TipoArticuloLinea, config?: PrecioCatalogoConfig | null): boolean {
  if (!config) return false
  if (itemType === 'service') return config.permitirModificarPrecioServicios === false
  return config.permitirModificarPrecioProductos === false
}

/** 400 porque el `rate` no es ninguno de los precios A/B/C del artículo. Sin PIN que lo salve. */
export function isPrecioCatalogoError(err: { statusCode?: number; message?: string } | null | undefined): boolean {
  return err?.statusCode === 400 && /no coincide con ninguno de los precios de venta configurados/i.test(err.message ?? '')
}

/** Precios de catálogo registrados del artículo (solo los tiers que tienen valor). */
export function preciosCatalogoDisponibles(prices?: ItemPrices | null): { tier: 'A' | 'B' | 'C'; price: number }[] {
  if (!prices) return []
  return (['A', 'B', 'C'] as const)
    .map((tier) => ({ tier, price: prices[tier] }))
    .filter((p): p is { tier: 'A' | 'B' | 'C'; price: number } => typeof p.price === 'number')
}
