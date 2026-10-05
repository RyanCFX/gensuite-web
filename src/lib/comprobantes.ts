// Comparaciones por tipo de comprobante — el ncfType llega como lo ve el tenant: E31, E32…
// si el e-CF está habilitado para ese tipo o la factura ya tiene e-NCF; B0x si es físico.
// Toda comparación ("¿es crédito fiscal?") debe aceptar los dos códigos.

/** B01/E31 son Crédito Fiscal. */
export function esCreditoFiscal(ncfType?: string | null): boolean {
  const t = (ncfType ?? '').toUpperCase()
  return t === 'B01' || t === 'E31'
}

/** B02/E32 son Consumo. */
export function esConsumo(ncfType?: string | null): boolean {
  const t = (ncfType ?? '').toUpperCase()
  return t === 'B02' || t === 'E32'
}
