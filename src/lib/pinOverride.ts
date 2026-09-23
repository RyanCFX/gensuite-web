/**
 * POST/PUT /invoices, /pedidos e /invoicing/quotations pueden rechazar una línea con un 400 cuyo
 * `message` dice que el precio neto no puede ser menor al costo de compra del artículo. No hay
 * código de error dedicado — se detecta por patrón en el mensaje, igual que "máximo de descuento".
 * Cuando ocurre, el formulario abre el modal de PIN administrativo y reintenta el mismo request
 * agregando `pinOverride` en vez de mostrarlo como error final.
 */
export function isCostoCompraError(err: { statusCode?: number; message?: string } | null | undefined): boolean {
  return err?.statusCode === 400 && /no puede ser menor al costo de compra/i.test(err.message ?? '')
}
