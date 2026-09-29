/**
 * POST/PUT /invoices, /pedidos e /invoicing/quotations pueden rechazar una línea con un 400 cuyo
 * `message` dice que el precio neto no puede ser menor al costo de compra del artículo. No hay
 * código de error dedicado — se detecta por patrón en el mensaje, igual que "máximo de descuento".
 * Cuando ocurre, el formulario abre el modal de PIN administrativo y reintenta el mismo request
 * agregando `pinOverride` en vez de mostrarlo como error final.
 *
 * docs/tasks/81_compras_precio_minimo_pdf_conduce_ncf_default.md §1 agrega un segundo motivo con
 * el MISMO mecanismo (`pinOverride`, acción `override_costo_minimo`): el precio neto por debajo
 * del precio mínimo ("Precio C"). El mensaje del backend dice "...está por debajo del precio
 * mínimo (X) — requiere autorización con PIN." — mismo formato, motivo distinto.
 * `isPinPrecioError` cubre ambos; `isCostoCompraError` se conserva por compatibilidad.
 */
export function isCostoCompraError(err: { statusCode?: number; message?: string } | null | undefined): boolean {
  return err?.statusCode === 400 && /no puede ser menor al costo de compra/i.test(err.message ?? '')
}

/** 400 por precio bajo el mínimo ("Precio C") — requiere el mismo PIN que el piso de costo. */
export function isPrecioMinimoError(err: { statusCode?: number; message?: string } | null | undefined): boolean {
  return err?.statusCode === 400 && /por debajo del precio m[ií]nimo/i.test(err.message ?? '')
}

/** `true` si el 400 se resuelve reenviando con `pinOverride` (costo o precio mínimo). */
export function isPinPrecioError(err: { statusCode?: number; message?: string } | null | undefined): boolean {
  return isCostoCompraError(err) || isPrecioMinimoError(err)
}
