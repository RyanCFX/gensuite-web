/** Detecta el error literal de Vega que dispara cuando el `vegaClientId` guardado para el tenant
 *  ya no existe allá (Client borrado, reconectado con otra API Key, o mezcla sandbox/producción).
 *  Puede aparecer en cualquier operación que emita un e-CF: completar cobro, someter factura,
 *  nota de crédito/débito, etc. — no es un bug de esa operación puntual, es un problema de
 *  configuración resoluble desde Configuración → Facturación Electrónica → Avanzado
 *  (ver docs/tasks/72_ecf_admin_desvincular_client_vega.md). */
export function esClienteEmisorNoEncontrado(message?: string | null): boolean {
  return !!message && /cliente emisor especificado/i.test(message)
}

export const ECF_ADMIN_ROUTE = '/config/ecf/admin'
