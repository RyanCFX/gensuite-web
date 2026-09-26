import type { FeatureKey, ReporteKey } from './types'

/**
 * Catálogo de features por tenant — docs/tasks/80_features_tenant_discriminacion_ui.md §4.
 *
 * Es la tabla `public.features` real (20 claves con `type='modulo'`: 19 implementadas +
 * `servicios` reservado — ver `FeaturesMapDto` en openapi.json). Si algún día
 * el backend agrega una clave nueva, se agrega acá — nunca inventar claves fuera de esta tabla.
 *
 * Dos capas independientes para mostrar un ítem (§2): feature encendido (acá) Y permiso del
 * usuario (GET /me/permissions). Ver `moduloVisible` abajo.
 */

/** Las 20 claves con `type='modulo'` (19 implementadas + `servicios` reservado con
 * `implementado: false`). Verificado 1:1 contra `FeaturesMapDto` en openapi.json. */
export const FEATURE_KEYS: readonly FeatureKey[] = [
  'compras',
  'comprasOrdenes',
  'comprasSolicitudes',
  'devolucionesCompras',
  'gastos',
  'proveedores',
  'caja',
  'contabilidad',
  'cuentasPorCobrar',
  'cuentasPorPagar',
  'tesoreria',
  'inventario',
  'servicios',
  'relacionesComerciales',
  'cotizaciones',
  'despacho',
  'devoluciones',
  'notasCredito',
  'notasDebito',
  'pedidos',
] as const

/** Las 15 claves de reporte de §4.2. */
export const REPORTE_KEYS: readonly ReporteKey[] = [
  'ventas_por_periodo',
  'top_productos',
  'top_clientes',
  'ventas_por_vendedor',
  'compras_por_periodo',
  'gastos_por_periodo',
  'cuentas_por_cobrar',
  'cuentas_por_pagar',
  'stock_valorizado',
  'movimientos_inventario',
  'flujo_caja',
  'balance_general',
  'estado_resultados',
  'reporte_606',
  'reporte_607',
] as const

/**
 * Regla principal (§5): un módulo se muestra solo si el feature está encendido Y el usuario
 * tiene permiso sobre al menos una acción del módulo. `featureKey === null` = módulo núcleo
 * (§4.3), siempre pasa esta capa — la de permisos igual aplica.
 */
export function moduloVisible(
  featureKey: FeatureKey | null,
  tenantFeatures: Record<string, boolean> | null | undefined,
  permisoDeAlgunaAccionDelModulo: boolean,
): boolean {
  const tieneFeature =
    featureKey === null || tenantFeatures?.[featureKey] === true
  return tieneFeature && permisoDeAlgunaAccionDelModulo
}

// ─── Ruta → featureKey (§4.1 + mapeo a las rutas reales de este frontend) ───────
// NOTA de mapeo (ver reporte E2E): la tabla del spec usa prefijos del backend
// (`/compras`, `/cobros`, `/inventory`, `/invoicing/quotations`, …) que NO son las rutas del
// frontend (`/cotizaciones`, `/cobros/lista`, `/inventario/stock`, …). Esta tabla traduce cada
// prefijo del spec a las rutas reales. Orden: específicas primero (igual que RUTAS_PERMISOS).

export interface RutaFeature {
  /** Prefijo exacto o patrón. `:x` matchea un segmento; `*` matchea el resto. */
  pattern: string
  /** `null` = núcleo (§4.3), siempre pasa esta capa. */
  feature: FeatureKey | null
}

export const RUTAS_FEATURES: readonly RutaFeature[] = [
  // Ventas — Cotizaciones vive en /cotizaciones (spec: /invoicing/quotations)
  { pattern: '/cotizaciones/*', feature: 'cotizaciones' },
  { pattern: '/cotizaciones', feature: 'cotizaciones' },
  // Ventas — Pedidos (spec: /pedidos)
  { pattern: '/pedidos/*', feature: 'pedidos' },
  { pattern: '/pedidos', feature: 'pedidos' },
  // Ventas — Despacho (spec: /despachos)
  { pattern: '/despachos/*', feature: 'despacho' },
  { pattern: '/despachos', feature: 'despacho' },
  // Ventas — Notas de Crédito / Débito: dos claves, una pantalla cada una en este frontend
  // (el spec describe tabs dentro de /invoicing/credit-notes — acá son rutas separadas, se
  // gatea cada ruta por su propia clave, mismo efecto).
  { pattern: '/notas-credito', feature: 'notasCredito' },
  { pattern: '/notas-debito', feature: 'notasDebito' },
  // Ventas — Devoluciones (spec: /devoluciones)
  { pattern: '/devoluciones/*', feature: 'devoluciones' },
  { pattern: '/devoluciones', feature: 'devoluciones' },
  // Facturación de venta normal — NÚCLEO (§4.3), nunca se gatea.
  { pattern: '/facturas/*', feature: null },
  { pattern: '/facturas', feature: null },

  // Inventario (spec: /inventory, /transferencias). El CATÁLOGO de artículos es núcleo (§4.3)
  // aunque viva bajo /inventario/productos o /catalogo/* — solo se gatea el inventario operativo.
  { pattern: '/inventario/stock', feature: 'inventario' },
  { pattern: '/inventario/historial', feature: 'inventario' },
  { pattern: '/inventario/conteos', feature: 'inventario' },
  { pattern: '/inventario/zonas', feature: 'inventario' },
  { pattern: '/inventario/carga-inicial/*', feature: 'inventario' },
  { pattern: '/inventario/carga-inicial', feature: 'inventario' },
  { pattern: '/inventario/productos/*', feature: null },
  { pattern: '/inventario/productos', feature: null },
  { pattern: '/transferencias/*', feature: 'inventario' },
  { pattern: '/transferencias', feature: 'inventario' },
  // /catalogo/servicios es catálogo de servicios (items tipo servicio, parte del catálogo
  // núcleo) — NO es la clave reservada `servicios` (módulo futuro, implementado: false, sin
  // ruta). Nunca se gatea por `servicios`.
  { pattern: '/catalogo/cuentas-por-pagar', feature: 'cuentasPorPagar' },
  { pattern: '/catalogo/*', feature: null },

  // Compras (spec: /compras + subclaves). Recepciones y Costos de Importación pertenecen al
  // módulo Compras general (sin clave propia).
  { pattern: '/compras/recepciones/*', feature: 'compras' },
  { pattern: '/compras/recepciones', feature: 'compras' },
  { pattern: '/compras/costos-importacion/*', feature: 'compras' },
  { pattern: '/compras/costos-importacion', feature: 'compras' },
  { pattern: '/compras/solicitudes/*', feature: 'comprasSolicitudes' },
  { pattern: '/compras/solicitudes', feature: 'comprasSolicitudes' },
  { pattern: '/compras/ordenes/*', feature: 'comprasOrdenes' },
  { pattern: '/compras/ordenes', feature: 'comprasOrdenes' },
  { pattern: '/compras/*', feature: 'compras' },
  { pattern: '/compras', feature: 'compras' },
  // Devoluciones de compras (spec: /devoluciones-compras, depende de `compras` — el backend ya
  // garantiza la combinación, solo se lee el booleano final).
  { pattern: '/devoluciones-compras/*', feature: 'devolucionesCompras' },
  { pattern: '/devoluciones-compras', feature: 'devolucionesCompras' },
  // Gastos (spec: /gastos)
  { pattern: '/gastos/*', feature: 'gastos' },
  { pattern: '/gastos', feature: 'gastos' },
  // Proveedores (spec: /proveedores)
  { pattern: '/proveedores/*', feature: 'proveedores' },
  { pattern: '/proveedores', feature: 'proveedores' },
  // Relaciones comerciales B2B (spec: /relaciones → /relaciones-comerciales)
  { pattern: '/relaciones-comerciales/*', feature: 'relacionesComerciales' },
  { pattern: '/relaciones-comerciales', feature: 'relacionesComerciales' },

  // Finanzas — Caja/POS (spec: /caja, /pos → /caja/* y /turnos)
  { pattern: '/caja/*', feature: 'caja' },
  { pattern: '/turnos/*', feature: 'caja' },
  { pattern: '/turnos', feature: 'caja' },
  // Finanzas — Cuentas por cobrar (spec: /cobros)
  { pattern: '/cobros/*', feature: 'cuentasPorCobrar' },
  { pattern: '/cobros', feature: 'cuentasPorCobrar' },
  // Finanzas — Cuentas por pagar. Auditoría backend (punto 1) confirmó los gates reales:
  // Plan de Cuentas (`cuentas.controller.ts`) → `contabilidad`, Cuentas Bancarias + Bancos →
  // `tesoreria`, y el catálogo CxP (`catalog/cuentas-por-pagar`) → `cuentasPorPagar`. Este mapeo
  // ya coincide con esa corrección.
  { pattern: '/pagos/*', feature: 'cuentasPorPagar' },
  { pattern: '/pagos', feature: 'cuentasPorPagar' },
  // Finanzas — Tesorería (spec: /tesoreria)
  { pattern: '/tesoreria/*', feature: 'tesoreria' },
  { pattern: '/tesoreria', feature: 'tesoreria' },

  // Contabilidad (spec: /contabilidad, /journal-entry, /centros-costo, /departamentos →
  // /cuentas = Plan de Cuentas, /asientos = Journal Entry, /contabilidad/*, config afín).
  { pattern: '/cuentas/*', feature: 'contabilidad' },
  { pattern: '/cuentas', feature: 'contabilidad' },
  { pattern: '/asientos/*', feature: 'contabilidad' },
  { pattern: '/asientos', feature: 'contabilidad' },
  { pattern: '/contabilidad/*', feature: 'contabilidad' },
  { pattern: '/config/centros-costo', feature: 'contabilidad' },
  { pattern: '/config/departamentos', feature: 'contabilidad' },
  { pattern: '/config/ejercicio-fiscal', feature: 'contabilidad' },
  { pattern: '/config/retenciones', feature: 'contabilidad' },

  // Configuración — secciones de módulo específico (§6): solo con su feature encendido.
  // OJO `/config/bancos` (pantalla): hace CRUD contra `/cuentas-bancarias/bancos` (gate
  // `tesoreria`) — NO confundir con el endpoint `GET /config/bancos` (proxy de solo lectura del
  // Bank nativo, sin gate, usado por PaymentLinesEditor y SupplierFormPanel). La pantalla queda
  // gateada; el endpoint de lectura, no.
  { pattern: '/config/cajas', feature: 'caja' },
  { pattern: '/config/cobros', feature: 'cuentasPorCobrar' },
  { pattern: '/config/tesoreria/*', feature: 'tesoreria' },
  { pattern: '/config/tesoreria', feature: 'tesoreria' },
  { pattern: '/config/bancos', feature: 'tesoreria' },
  { pattern: '/config/cuentas-bancarias', feature: 'tesoreria' },

  // Reportes — se gatean por `reportesHabilitados` (ver REPORTE_KEY_POR_TIPO abajo), no por un
  // feature de módulo. Acá siempre pasan esta capa; el filtro real vive en ReportesPage +
  // RequireAccion (caso /reportes/:tipo).
  { pattern: '/reportes/*', feature: null },
  { pattern: '/reportes', feature: null },

  // Núcleo (§4.3): dashboard, clientes, usuarios, resto de configuración, e-CF, farmacia ARS
  // (vertical, no feature), apertura (migración de saldos), mi cuenta.
  { pattern: '/dashboard', feature: null },
  { pattern: '/inicio', feature: null },
  { pattern: '/clientes/*', feature: null },
  { pattern: '/clientes', feature: null },
  { pattern: '/usuarios', feature: null },
  { pattern: '/config/sucursales', feature: null },
  { pattern: '/ecf-recibidos/*', feature: null },
  { pattern: '/ecf-recibidos', feature: null },
  { pattern: '/ecf-emitidos/*', feature: null },
  { pattern: '/ecf-emitidos', feature: null },
]

function matchea(pattern: string, pathname: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2)
    return pathname === base || pathname.startsWith(base + '/')
  }
  return pathname === pattern
}

/** Devuelve la config de feature de la primera ruta que matchea, o `undefined`. */
export function resolverFeature(pathname: string): RutaFeature | undefined {
  return RUTAS_FEATURES.find((r) => matchea(r.pattern, pathname))
}

/** Feature que gatea un path, o `null` si es núcleo / sin entrada (fail-open). */
export function featureKeyForPath(pathname: string): FeatureKey | null {
  return resolverFeature(pathname)?.feature ?? null
}

// ─── Reportes: clave de ReportesPage (`REPORT_NAV.key`) → clave de `reportesHabilitados` ──
// Solo los reportes con correspondencia 1:1 en §4.2 se gatean por feature. Los que NO tienen
// clave en el spec (608, facturación fiscal, cuadre de caja/POS, libros diario/mayor, antigüedad
// y proyección de inventario, analítica de pedidos, solicitados, farmacia, despacho) se dejan
// pasar (fail-open, solo permiso).
//
// NOTA backend (auditoría punto 2): `reportes.controller.ts` no tiene ningún `@RequiereFeature`
// — `reportesHabilitados` hoy no bloquea nada en el servidor, así que este fail-open es tan
// "seguro" como el resto; la enforcement real requiere extender `FeatureGuard` (pendiente del
// backend, ver PLAN_FEATURES_TENANT.md §17.4). `top_productos` / `top_clientes` /
// `ventas_por_vendedor` / `gastos_por_periodo` están marcados `implementado: false` (sin endpoint
// real) — no tienen UI destino y no se les inventa una.

export const REPORTE_KEY_POR_TIPO: Record<string, ReporteKey | null> = {
  '606': 'reporte_606',
  '607': 'reporte_607',
  'balance': 'balance_general',
  'pl': 'estado_resultados',
  'ventas': 'ventas_por_periodo',
  'ventas-item-wise': 'ventas_por_periodo',
  'stock': 'stock_valorizado',
  'movimientos': 'movimientos_inventario',
  'cxcaging': 'cuentas_por_cobrar',
  'cxpaging': 'cuentas_por_pagar',
  'flujo-efectivo': 'flujo_caja',
  'compras-analitica': 'compras_por_periodo',
  'compras-registro': 'compras_por_periodo',
  'compras-item-wise': 'compras_por_periodo',
  'compras-ordenes-analitica': 'compras_por_periodo',
  // Sin clave en §4.2 → solo permiso (fail-open).
  '608': null,
  'facturacion-fiscal': null,
  'caja': null,
  'cuadreTurno': null,
  'corteCajaDia': null,
  'libroDiario': null,
  'libroMayor': null,
  'inventario-antiguedad': null,
  'inventario-proyeccion': null,
  'pedidos-analitica': null,
  'solicitudes': null,
  'farmacia-lotes': null,
  'farmacia-facturas-ars': null,
  'despacho-margen': null,
  'despacho-reservas': null,
  'despacho-faltantes': null,
  'despacho-pendientes-compra': null,
}

/** `true` si el reporte/tipo está habilitado para el tenant (fail-open si no hay clave). */
export function reporteVisible(
  tipo: string,
  reportesHabilitados: readonly string[] | null | undefined,
): boolean {
  const key = REPORTE_KEY_POR_TIPO[tipo]
  // Sin entrada o con `null` explícito = sin clave en el spec → solo aplica el permiso.
  if (!key) return true
  return reportesHabilitados?.includes(key) ?? true
}

// ─── Límites (§8) ─────────────────────────────────────────────────────────────

export function limiteUsuariosAlcanzado(limites: { maxUsuarios: number | null; usuariosActuales: number } | null | undefined): boolean {
  if (!limites || limites.maxUsuarios === null) return false
  return limites.usuariosActuales >= limites.maxUsuarios
}

export function limiteSucursalesAlcanzado(limites: { maxSucursales: number | null; sucursalesActuales: number } | null | undefined): boolean {
  if (!limites || limites.maxSucursales === null) return false
  return limites.sucursalesActuales >= limites.maxSucursales
}

/** Texto "4 de 10 usuarios" — sin contador si el límite es `null` (plan ilimitado/legado). */
export function textoContadorUsuarios(limites: { maxUsuarios: number | null; usuariosActuales: number } | null | undefined): string | null {
  if (!limites || limites.maxUsuarios === null) return null
  return `${limites.usuariosActuales} de ${limites.maxUsuarios} usuarios`
}

export function textoContadorSucursales(limites: { maxSucursales: number | null; sucursalesActuales: number } | null | undefined): string | null {
  if (!limites || limites.maxSucursales === null) return null
  return `${limites.sucursalesActuales} de ${limites.maxSucursales} sucursales`
}
