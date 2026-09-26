/**
 * Tipos del módulo de features por tenant — docs/tasks/80_features_tenant_discriminacion_ui.md §3.
 *
 * Este frontend NUNCA enciende ni apaga features (eso lo hace GenSuite Control directo en
 * Postgres) — acá solo se LEE `GET /me/features` una vez al iniciar sesión y se decide qué
 * mostrar. Ocultar en el frontend es UX, no seguridad: la aplica `FeatureGuard` en cada request.
 */

export type FeatureKey =
  | 'compras'
  | 'comprasOrdenes'
  | 'comprasSolicitudes'
  | 'devolucionesCompras'
  | 'gastos'
  | 'proveedores'
  | 'caja'
  | 'contabilidad'
  | 'cuentasPorCobrar'
  | 'cuentasPorPagar'
  | 'tesoreria'
  | 'inventario'
  | 'servicios'
  | 'relacionesComerciales'
  | 'cotizaciones'
  | 'despacho'
  | 'devoluciones'
  | 'notasCredito'
  | 'notasDebito'
  | 'pedidos'

/** Claves de reporte de `reportesHabilitados` (§4.2) — presencia en el array = encendido. */
export type ReporteKey =
  | 'ventas_por_periodo'
  | 'top_productos'
  | 'top_clientes'
  | 'ventas_por_vendedor'
  | 'compras_por_periodo'
  | 'gastos_por_periodo'
  | 'cuentas_por_cobrar'
  | 'cuentas_por_pagar'
  | 'stock_valorizado'
  | 'movimientos_inventario'
  | 'flujo_caja'
  | 'balance_general'
  | 'estado_resultados'
  | 'reporte_606'
  | 'reporte_607'

export interface TenantLimites {
  /** `null` = sin límite (plan ilimitado o tenant legado). */
  maxUsuarios: number | null
  /** `null` = sin límite. */
  maxSucursales: number | null
  /** Ya calculados por el backend — NO recontar listas locales (paginación/filtros). */
  usuariosActuales: number
  sucursalesActuales: number
}

export interface MeFeatures {
  features: Record<FeatureKey, boolean>
  reportesHabilitados: ReporteKey[]
  limites: TenantLimites
}

/** Códigos de error del contrato §9. */
export const FEATURE_ERROR_CODES = {
  FEATURE_NO_CONTRATADO: 'FEATURE_NO_CONTRATADO',
  LIMITE_USUARIOS_ALCANZADO: 'LIMITE_USUARIOS_ALCANZADO',
  LIMITE_SUCURSALES_ALCANZADO: 'LIMITE_SUCURSALES_ALCANZADO',
  PERFIL_NO_CONTRATADO: 'PERFIL_NO_CONTRATADO',
} as const
