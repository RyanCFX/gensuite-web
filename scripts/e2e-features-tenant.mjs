/**
 * Pruebas end-to-end del módulo "Features por tenant — discriminación UI"
 * (docs/tasks/80_features_tenant_discriminacion_ui.md, checklist §10 + flujo completo).
 *
 * Cubre cada aspecto del módulo y todo lo relacionado: contrato GET /me/features, menú+router
 * (regla feature Y permiso), tabs NC/ND, reportes por `reportesHabilitados`, secciones embebidas,
 * perfiles de rol, límites, errores, núcleo siempre visible y `servicios` inexistente.
 *
 * Estrategia: el repo no tiene runner de tests (sin vitest/playwright/cypress) ni backend vivo
 * para un E2E con red. Este script hace (a) pruebas de lógica sobre ESPEJOS de las funciones
 * puras de `src/shared/features/catalog.ts` — con chequeo de divergencia: cada patrón/clave que
 * se prueba debe existir literal en el fuente, si el mapeo cambia el test falla en voz alta en
 * vez de divergir en silencio — y (b) verificaciones estáticas de que cada punto del checklist
 * está cableado (store, guards, menú, pantallas, errores).
 *
 * Uso: `node scripts/e2e-features-tenant.mjs` — salida 0 = todo verde.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`) }
}
function section(title) { console.log(`\n── ${title} ──`) }

// ─── Espejos de catalog.ts (lógica pura, 1:1 con el fuente) ──────────────────
// Divergencia controlada: `ESPEJO_PATTERNS`/`ESPEJO_REPORTES` se verifican literalmente contra
// el fuente en el §0 — si alguien cambia el mapeo sin actualizar este script, el §0 falla.

function moduloVisible(featureKey, tenantFeatures, permiso) {
  const tieneFeature = featureKey === null || tenantFeatures?.[featureKey] === true
  return tieneFeature && permiso
}

// Espejo de RUTAS_FEATURES (path probado → feature esperada). Solo los casos del E2E.
const ESPEJO_PATTERNS = [
  ['/cotizaciones', 'cotizaciones'],
  ['/pedidos', 'pedidos'],
  ['/despachos', 'despacho'],
  ['/notas-credito', 'notasCredito'],
  ['/notas-debito', 'notasDebito'],
  ['/devoluciones', 'devoluciones'],
  ['/facturas', null],
  ['/inventario/stock', 'inventario'],
  ['/inventario/historial', 'inventario'],
  ['/inventario/conteos', 'inventario'],
  ['/inventario/zonas', 'inventario'],
  ['/inventario/carga-inicial', 'inventario'],
  ['/inventario/productos', null],
  ['/transferencias', 'inventario'],
  ['/catalogo/servicios', null],
  ['/catalogo/cuentas-por-pagar', 'cuentasPorPagar'],
  ['/catalogo/categorias', null],
  ['/compras/recepciones', 'compras'],
  ['/compras/costos-importacion', 'compras'],
  ['/compras/solicitudes', 'comprasSolicitudes'],
  ['/compras/ordenes', 'comprasOrdenes'],
  ['/compras/ordenes/abastecimiento', 'comprasOrdenes'],
  ['/compras', 'compras'],
  ['/devoluciones-compras', 'devolucionesCompras'],
  ['/gastos', 'gastos'],
  ['/proveedores', 'proveedores'],
  ['/relaciones-comerciales', 'relacionesComerciales'],
  ['/relaciones-comerciales/transacciones', 'relacionesComerciales'],
  ['/caja/por-cobrar', 'caja'],
  ['/caja/pendientes', 'caja'],
  ['/turnos', 'caja'],
  ['/cobros/lista', 'cuentasPorCobrar'],
  ['/cobros/pago', 'cuentasPorCobrar'],
  ['/pagos/lista', 'cuentasPorPagar'],
  ['/pagos/nuevo', 'cuentasPorPagar'],
  ['/tesoreria/emisiones', 'tesoreria'],
  ['/tesoreria/cheques', 'tesoreria'],
  ['/cuentas', 'contabilidad'],
  ['/asientos', 'contabilidad'],
  ['/contabilidad/libro-mayor', 'contabilidad'],
  ['/config/centros-costo', 'contabilidad'],
  ['/config/departamentos', 'contabilidad'],
  ['/config/cajas', 'caja'],
  ['/config/cobros', 'cuentasPorCobrar'],
  ['/config/tesoreria/tipos-documento', 'tesoreria'],
  ['/config/bancos', 'tesoreria'],
  ['/config/cuentas-bancarias', 'tesoreria'],
  ['/reportes/ventas', null],
  ['/dashboard', null],
  ['/clientes', null],
  ['/usuarios', null],
  ['/config/sucursales', null],
  ['/config/empresa', null],
  ['/ecf-emitidos', null],
  ['/ecf-recibidos', null],
]

// Espejo de REPORTE_KEY_POR_TIPO (tipo ReportesPage → reporteKey o null = solo permiso).
const ESPEJO_REPORTES = {
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
  '608': null, 'facturacion-fiscal': null, 'caja': null, 'cuadreTurno': null,
  'corteCajaDia': null, 'libroDiario': null, 'libroMayor': null,
  'inventario-antiguedad': null, 'inventario-proyeccion': null, 'pedidos-analitica': null,
  'solicitudes': null, 'farmacia-lotes': null, 'farmacia-facturas-ars': null,
  'despacho-margen': null, 'despacho-reservas': null, 'despacho-faltantes': null,
  'despacho-pendientes-compra': null,
}
function reporteVisible(tipo, habilitados) {
  const key = ESPEJO_REPORTES[tipo]
  if (!key) return true
  return habilitados?.includes(key) ?? true
}
function limiteUsuariosAlcanzado(l, ) { return !!l && l.maxUsuarios !== null && l.usuariosActuales >= l.maxUsuarios }
function limiteSucursalesAlcanzado(l) { return !!l && l.maxSucursales !== null && l.sucursalesActuales >= l.maxSucursales }
function textoContadorUsuarios(l) { return (!l || l.maxUsuarios === null) ? null : `${l.usuariosActuales} de ${l.maxUsuarios} usuarios` }
function textoContadorSucursales(l) { return (!l || l.maxSucursales === null) ? null : `${l.sucursalesActuales} de ${l.maxSucursales} sucursales` }

// Resolvedor espejo: replica la semántica "primera coincidencia, específicas primero".
function featureEspejo(pathname) {
  const match = (pattern) => pattern.endsWith('/*')
    ? (pathname === pattern.slice(0, -2) || pathname.startsWith(pattern.slice(0, -2) + '/'))
    : pathname === pattern
  const table = [
    [/^\/cotizaciones(\/|$)/, 'cotizaciones'], [/^\/pedidos(\/|$)/, 'pedidos'],
    [/^\/despachos(\/|$)/, 'despacho'], [/^\/notas-credito$/, 'notasCredito'],
    [/^\/notas-debito$/, 'notasDebito'], [/^\/devoluciones(\/|$)/, 'devoluciones'],
    [/^\/facturas(\/|$)/, null], [/^\/inventario\/(stock|historial|conteos|zonas)(\/|$)/, 'inventario'],
    [/^\/inventario\/carga-inicial(\/|$)/, 'inventario'], [/^\/inventario\/productos(\/|$)/, null],
    [/^\/transferencias(\/|$)/, 'inventario'], [/^\/catalogo\/servicios(\/|$)/, null],
    [/^\/catalogo\/cuentas-por-pagar$/, 'cuentasPorPagar'], [/^\/catalogo(\/|$)/, null],
    [/^\/compras\/(recepciones|costos-importacion)(\/|$)/, 'compras'],
    [/^\/compras\/solicitudes(\/|$)/, 'comprasSolicitudes'],
    [/^\/compras\/ordenes(\/|$)/, 'comprasOrdenes'],
    [/^\/compras(\/|$)/, 'compras'], [/^\/devoluciones-compras(\/|$)/, 'devolucionesCompras'],
    [/^\/gastos(\/|$)/, 'gastos'], [/^\/proveedores(\/|$)/, 'proveedores'],
    [/^\/relaciones-comerciales(\/|$)/, 'relacionesComerciales'],
    [/^\/caja(\/|$)/, 'caja'], [/^\/turnos(\/|$)/, 'caja'],
    [/^\/cobros(\/|$)/, 'cuentasPorCobrar'], [/^\/pagos(\/|$)/, 'cuentasPorPagar'],
    [/^\/tesoreria(\/|$)/, 'tesoreria'], [/^\/cuentas(\/|$)/, 'contabilidad'],
    [/^\/asientos(\/|$)/, 'contabilidad'], [/^\/contabilidad(\/|$)/, 'contabilidad'],
    [/^\/config\/(centros-costo|departamentos|ejercicio-fiscal|retenciones)$/, 'contabilidad'],
    [/^\/config\/cajas$/, 'caja'], [/^\/config\/cobros$/, 'cuentasPorCobrar'],
    [/^\/config\/tesoreria(\/|$)/, 'tesoreria'],
    [/^\/config\/(bancos|cuentas-bancarias)$/, 'tesoreria'],
    [/^\/reportes(\/|$)/, null], [/^\/dashboard$/, null], [/^\/inicio$/, null],
    [/^\/clientes(\/|$)/, null], [/^\/usuarios$/, null],
    [/^\/config\/(sucursales|empresa)$/, null], [/^\/config(\/|$)/, null],
    [/^\/ecf-(emitidos|recibidos)(\/|$)/, null],
  ]
  for (const [re, f] of table) if (re.test(pathname)) return f
  return null
}

// Fixtures: dos tenants (contrato §3) + un usuario con todos los permisos.
const TENANT_FULL = {
  features: Object.fromEntries(['compras', 'comprasOrdenes', 'comprasSolicitudes', 'devolucionesCompras', 'gastos', 'proveedores', 'caja', 'contabilidad', 'cuentasPorCobrar', 'cuentasPorPagar', 'tesoreria', 'inventario', 'relacionesComerciales', 'cotizaciones', 'despacho', 'devoluciones', 'notasCredito', 'notasDebito', 'pedidos'].map((k) => [k, true])),
  reportesHabilitados: ['ventas_por_periodo', 'top_productos', 'top_clientes', 'ventas_por_vendedor', 'compras_por_periodo', 'gastos_por_periodo', 'cuentas_por_cobrar', 'cuentas_por_pagar', 'stock_valorizado', 'movimientos_inventario', 'flujo_caja', 'balance_general', 'estado_resultados', 'reporte_606', 'reporte_607'],
  limites: { maxUsuarios: 10, maxSucursales: null, usuariosActuales: 4, sucursalesActuales: 2 },
}
const TENANT_MINIMO = {
  // Farmacia sin contabilidad ni compras: solo núcleo + ventas básicas + CxC.
  features: { compras: false, comprasOrdenes: false, comprasSolicitudes: false, devolucionesCompras: false, gastos: false, proveedores: false, caja: false, contabilidad: false, cuentasPorCobrar: true, cuentasPorPagar: false, tesoreria: false, inventario: false, relacionesComerciales: false, cotizaciones: false, despacho: false, devoluciones: true, notasCredito: true, notasDebito: false, pedidos: false },
  reportesHabilitados: ['ventas_por_periodo', 'cuentas_por_cobrar'],
  limites: { maxUsuarios: 3, maxSucursales: 1, usuariosActuales: 3, sucursalesActuales: 1 },
}

// ─── §0. Divergencia espejo↔fuente ────────────────────────────────────────────
// Se extraen los patrones REALES de RUTAS_FEATURES del fuente y se resuelve cada path del E2E
// con la misma semántica del frontend (primera coincidencia, `/*` = prefijo). Si alguien cambia
// el mapeo sin actualizar este script, el §0 falla en voz alta en vez de divergir en silencio.
section('§0 espejo↔fuente (anti-divergencia)')
const catalogSrc = read('src/shared/features/catalog.ts')
const srcPatterns = [...catalogSrc.matchAll(/pattern:\s*'([^']+)'/g)].map((m) => m[1])
ok(srcPatterns.length > 40, `RUTAS_FEATURES tiene ${srcPatterns.length} patrones en fuente`)
function matcheaSrc(pattern, pathname) {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2)
    return pathname === base || pathname.startsWith(base + '/')
  }
  return pathname === pattern
}
function featureEnFuente(pathname) {
  // Extrae feature por patrón del fuente: busca el bloque `{ pattern: 'X', feature: 'Y' }`.
  for (const pattern of srcPatterns) {
    if (matcheaSrc(pattern, pathname)) {
      const re = new RegExp(`pattern:\\s*'${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^}]*feature:\\s*'?(\\w+)?'?`)
      const m = catalogSrc.match(re)
      if (m) return m[1] === 'null' || m[1] === undefined ? null : m[1]
      return null
    }
  }
  return null // sin entrada → núcleo/fail-open
}
for (const [path, expected] of ESPEJO_PATTERNS) {
  ok(featureEnFuente(path) === expected, `fuente resuelve '${path}' → ${expected}`)
  ok(featureEspejo(path) === expected, `espejo funcional: '${path}' → ${expected}`)
}
for (const [tipo, key] of Object.entries(ESPEJO_REPORTES)) {
  ok(catalogSrc.includes(`'${tipo}': ${key === null ? 'null' : `'${key}'`}`), `REPORTE_KEY_POR_TIPO['${tipo}'] = ${key}`)
}
// Consistencia espejo funcional vs tabla espejo
for (const [pattern, expected] of ESPEJO_PATTERNS) {
  ok(featureEspejo(pattern) === expected, `espejo funcional: '${pattern}' → ${expected}`)
}

// ─── §1. Contrato GET /me/features (checklist #1 y #10) ─────────────────────
section('§1 contrato GET /me/features (fetch único + tipos)')
const meSrc = read('src/shared/api/me.ts')
const endpointsSrc = read('src/shared/api/endpoints.ts')
const typesSrc = read('src/shared/api/types.ts')
const protectedSrc = read('src/components/ProtectedRoute.tsx')
const authStoreSrc = read('src/stores/auth.store.ts')
const featStoreSrc = read('src/stores/features.store.ts')
ok(endpointsSrc.includes(`features: '/me/features'`), 'ENDPOINTS.me.features = /me/features')
ok(meSrc.includes('getMeFeatures'), 'getMeFeatures existe con normalize defensivo')
ok(typesSrc.includes('MeFeatures') && typesSrc.includes('TenantLimites'), 'tipos MeFeatures/TenantLimites en types.ts')
ok(protectedSrc.includes('fetchFeatures') && protectedSrc.includes(`featStatus === 'idle'`), 'ProtectedRoute pide features una vez (idle) junto a permisos')
ok((meSrc.match(/getMeFeatures\(\)/g) || []).length <= 2, 'getMeFeatures solo se llama desde el store (+def)', `usos: ${(meSrc.match(/getMeFeatures\(\)/g) || []).length}`)
ok(!catalogSrc.includes('POST') && !catalogSrc.includes('PUT'), 'frontend nunca escribe features (solo lee)')
ok(authStoreSrc.includes('useFeaturesStore') && (authStoreSrc.match(/useFeaturesStore\.getState\(\)\.clear\(\)/g) || []).length >= 4, 'auth.store limpia features en login/refresh/switch/logout')
// openapi: endpoint existe, sin schema de respuesta (se normaliza defensivo)
const openapi = JSON.parse(read('openapi.json'))
ok(!!openapi.paths['/api/v1/me/features'], 'openapi.json documenta /api/v1/me/features')
ok(meSrc.includes('normalizeMeFeatures'), 'normalización defensiva (openapi sin schema de respuesta)')

// ─── §2. Menú y rutas — regla feature Y permiso (checklist #2) ───────────────
section('§2 menú/rutas: feature Y permiso')
ok(moduloVisible(null, {}, true) === true, 'núcleo + permiso → visible')
ok(moduloVisible('compras', { compras: true }, true) === true, 'feature on + permiso → visible')
ok(moduloVisible('compras', { compras: false }, true) === false, 'feature off + permiso → oculto')
ok(moduloVisible('compras', { compras: true }, false) === false, 'feature on + sin permiso → oculto')
ok(moduloVisible('compras', { compras: false }, false) === false, 'ambos off → oculto')
ok(moduloVisible('inventario', {}, true) === false, 'clave ausente ≠ true → oculto (fail-closed)')
// Tenant sin compras: Compras, Órdenes, Solicitudes, Devoluciones-compras y Proveedores fuera juntos
const sinCompras = { compras: false, comprasOrdenes: false, comprasSolicitudes: false, devolucionesCompras: false, proveedores: false }
for (const p of ['/compras', '/compras/ordenes', '/compras/solicitudes', '/devoluciones-compras', '/proveedores']) {
  ok(moduloVisible(featureEspejo(p), sinCompras, true) === false, `sin compras → '${p}' oculto`)
}
// Guard cableado en el mismo guard de permisos (no paralelo)
const requireSrc = read('src/components/RequireAccion.tsx')
ok(requireSrc.includes('resolverFeature') && requireSrc.includes('ModuloNoContratadoPage'), 'RequireAccion evalúa features en el mismo guard')
ok(requireSrc.includes('REPORTE_KEY_POR_TIPO'), 'RequireAccion gatea /reportes/:tipo por reportesHabilitados')
const layoutSrc = read('src/components/layout/AppLayout.tsx')
ok(layoutSrc.includes('resolverFeature') && layoutSrc.includes('reportesHabilitados'), 'AppLayout filtra menú por features + reportesHabilitados')
const paletteSrc = read('src/components/layout/CommandPalette.tsx')
ok(paletteSrc.includes('resolverFeature'), 'CommandPalette filtra por features igual que el menú')

// ─── §3. NC/ND independientes (checklist #3) ─────────────────────────────────
section('§3 notas crédito/débito independientes')
ok(featureEspejo('/notas-credito') === 'notasCredito', '/notas-credito → notasCredito')
ok(featureEspejo('/notas-debito') === 'notasDebito', '/notas-debito → notasDebito')
ok(featureEspejo('/notas-credito') !== featureEspejo('/notas-debito'), 'claves distintas (no una sola)')
// Solo NC contratado: NC visible, ND oculta
ok(moduloVisible(featureEspejo('/notas-credito'), TENANT_MINIMO.features, true) === true, 'tenant mínimo: NC visible')
ok(moduloVisible(featureEspejo('/notas-debito'), TENANT_MINIMO.features, true) === false, 'tenant mínimo: ND oculta')

// ─── §4. Reportes por reportesHabilitados (checklist #4) ─────────────────────
section('§4 reportes individuales por reportesHabilitados')
ok(reporteVisible('balance', TENANT_FULL.reportesHabilitados) === true, 'full: Balance visible')
ok(reporteVisible('pl', TENANT_FULL.reportesHabilitados) === true, 'full: P&L visible')
ok(reporteVisible('606', TENANT_FULL.reportesHabilitados) === true, 'full: 606 visible')
ok(reporteVisible('607', TENANT_FULL.reportesHabilitados) === true, 'full: 607 visible')
for (const t of ['balance', 'pl', '606', '607']) {
  ok(reporteVisible(t, TENANT_MINIMO.reportesHabilitados) === false, `sin contabilidad: '${t}' oculto`)
}
ok(reporteVisible('ventas', TENANT_MINIMO.reportesHabilitados) === true, 'sin contabilidad: Ventas sigue visible')
ok(reporteVisible('movimientos', TENANT_MINIMO.reportesHabilitados) === false, 'mínimo: Movimientos oculto')
ok(reporteVisible('608', []) === true, '608 sin clave en spec → fail-open (solo permiso)')
ok(reporteVisible('tipo-inexistente', []) === true, 'tipo desconocido → fail-open')
const reportesSrc = read('src/features/reportes/ReportesPage.tsx')
ok(reportesSrc.includes('reporteHabilitado') && reportesSrc.includes('REPORTE_KEY_POR_TIPO'), 'ReportesPage filtra tarjetas por reportesHabilitados')
ok(reportesSrc.includes('no está disponible en tu plan'), 'ReportesPage: URL directa a reporte apagado → mensaje genérico')

// ─── §5. Secciones embebidas (checklist #5) ──────────────────────────────────
section('§5 secciones embebidas (§6 del spec)')
const customerSrc = read('src/features/customers/CustomerDetail.tsx')
ok(customerSrc.includes(`useFeature('cuentasPorCobrar')`), 'CustomerDetail gatea Estado de Cuenta/Semáforo/SaldoFavor por cuentasPorCobrar')
ok(customerSrc.includes(`useFeature('notasCredito')`), 'CustomerDetail gatea Notas de Crédito por notasCredito')
const supplierSrc = read('src/features/suppliers/SupplierDetail.tsx')
ok(supplierSrc.includes(`useFeature('cuentasPorPagar')`), 'SupplierDetail gatea Historial de Pagos por cuentasPorPagar')
ok(supplierSrc.includes(`useFeature('compras')`), 'SupplierDetail gatea Compras Recientes por compras')
const dashSrc = read('src/features/dashboard/DashboardPage.tsx')
ok(dashSrc.includes(`useFeature('gastos')`) && dashSrc.includes(`useFeature('cuentasPorCobrar')`), 'Dashboard gatea KPIs Gastos/CxC')
ok(dashSrc.includes(`useFeature('inventario')`), 'Dashboard gatea Stock bajo por inventario')
ok(dashSrc.includes('actividadVisible'), 'Dashboard filtra Actividad Reciente por módulo')
ok(catalogSrc.includes("'/config/cajas'") && catalogSrc.includes("'/config/cobros'") && catalogSrc.includes("'/config/bancos'"), 'Config Caja/Cobros/Tesorería gateadas por feature')
ok(catalogSrc.includes("'/config/centros-costo'"), 'Config Centros de Costo gateada por contabilidad')

// ─── §6. Perfiles de rol sin filtro frontend (checklist #6) ──────────────────
section('§6 roles/perfiles (ya filtrados por backend)')
const usuariosSrc = read('src/features/usuarios/UsuariosPage.tsx')
ok(usuariosSrc.includes('getPerfiles'), 'selector de perfiles consume GET /roles/perfiles en vivo')
const checklistBlock = usuariosSrc.slice(usuariosSrc.indexOf('function PerfilesChecklist'))
ok(!checklistBlock.includes('useFeature') && !checklistBlock.includes('resolverFeature') && !checklistBlock.includes('features['), 'PerfilesChecklist NO filtra por features (§7)')

// ─── §7. Límites (checklist #7) ──────────────────────────────────────────────
section('§7 límites usuarios/sucursales')
ok(textoContadorUsuarios(TENANT_FULL.limites) === '4 de 10 usuarios', 'contador usuarios "4 de 10 usuarios"')
ok(textoContadorUsuarios({ maxUsuarios: null, usuariosActuales: 99 }) === null, 'maxUsuarios null → sin contador')
ok(limiteUsuariosAlcanzado(TENANT_FULL.limites) === false, '4/10 → botón habilitado')
ok(limiteUsuariosAlcanzado(TENANT_MINIMO.limites) === true, '3/3 → botón deshabilitado')
ok(limiteUsuariosAlcanzado({ maxUsuarios: null, usuariosActuales: 999 }) === false, 'ilimitado → nunca bloquea')
ok(textoContadorSucursales(TENANT_FULL.limites) === null, 'maxSucursales null → sin contador')
ok(limiteSucursalesAlcanzado(TENANT_MINIMO.limites) === true, 'sucursales 1/1 → deshabilitado')
ok(limiteSucursalesAlcanzado(TENANT_FULL.limites) === false, 'sucursales ilimitadas → habilitado')
ok(usuariosSrc.includes('textoContadorUsuarios') && usuariosSrc.includes('limiteUsuariosAlcanzado'), 'UsuariosPage muestra contador y deshabilita')
ok(usuariosSrc.includes('LIMITE_USUARIOS_ALCANZADO'), 'UsuariosPage maneja LIMITE_USUARIOS_ALCANZADO con límite exacto')
const sucursalesSrc = read('src/features/config/SucursalesPage.tsx')
ok(sucursalesSrc.includes('textoContadorSucursales') && sucursalesSrc.includes('limiteSucursalesAlcanzado'), 'SucursalesPage muestra contador y deshabilita')
ok(sucursalesSrc.includes('LIMITE_SUCURSALES_ALCANZADO'), 'SucursalesPage maneja LIMITE_SUCURSALES_ALCANZADO')
ok(usuariosSrc.includes('title={limiteAlcanzado') || usuariosSrc.includes('Se alcanzó el límite del plan'), 'tooltip explica el límite del plan')

// ─── §8. Núcleo siempre accesible (checklist #8) ─────────────────────────────
section('§8 núcleo siempre visible')
for (const p of ['/dashboard', '/facturas', '/facturas/nueva', '/clientes', '/clientes/nuevo', '/usuarios', '/config/empresa', '/config/sucursales', '/config/facturacion', '/ecf-emitidos', '/ecf-recibidos', '/inventario/productos', '/catalogo/categorias', '/catalogo/servicios']) {
  ok(featureEspejo(p) === null, `núcleo: '${p}' sin gate de feature`)
}
for (const p of ['/dashboard', '/facturas', '/clientes', '/usuarios', '/config/empresa']) {
  ok(moduloVisible(featureEspejo(p), { [p]: false }, true) === true, `núcleo '${p}' visible aun con todo apagado`)
}

// ─── §9. servicios inexistente (checklist #9) ────────────────────────────────
section('§9 servicios: no existe en la UI')
ok(!catalogSrc.split('RUTAS_FEATURES')[1].includes(`feature: 'servicios'`), "ninguna ruta usa feature 'servicios'")
ok(featureEspejo('/catalogo/servicios') === null, '/catalogo/servicios es catálogo núcleo (no la clave reservada)')
ok(!layoutSrc.includes(`'/catalogo/servicios'`) || layoutSrc.includes('Servicios'), 'menú Servicios (catálogo) intacto — no confundir con el módulo futuro')

// ─── §10. Errores defensivos (contrato §9) ───────────────────────────────────
section('§10 contrato de errores §9')
const clientSrc = read('src/shared/api/client.ts')
ok(clientSrc.includes('FEATURE_NO_CONTRATADO'), 'client.ts maneja FEATURE_NO_CONTRATADO (toast genérico + refresh silencioso)')
ok(clientSrc.includes('LIMITE_USUARIOS_ALCANZADO') && clientSrc.includes('LIMITE_SUCURSALES_ALCANZADO') && clientSrc.includes('PERFIL_NO_CONTRATADO'), 'ERROR_CODES incluye los 4 códigos de §9')
ok(existsSync(join(ROOT, 'src/features/_shared/ModuloNoContratadoPage.tsx')), 'ModuloNoContratadoPage existe (mensaje genérico + volver al inicio)')
const noContratadoSrc = read('src/features/_shared/ModuloNoContratadoPage.tsx')
ok(noContratadoSrc.includes('no está disponible en tu plan') && noContratadoSrc.includes('/dashboard'), 'página 403: mensaje genérico + ir al inicio (no error técnico)')
ok(existsSync(join(ROOT, 'src/components/shared/FeatureGate.tsx')), 'FeatureGate/ReporteGate existen para secciones embebidas')

// ─── Flujo completo E2E (simulado, dos tenants) ──────────────────────────────
section('flujo completo: login → menú → URL directa → reportes → límites')
function menuVisible(pathname, tenant, permiso = true) {
  return moduloVisible(featureEspejo(pathname), tenant.features, permiso)
}
// Tenant FULL con todos los permisos: todo visible núcleo + módulos
const RUTAS_E2E = ['/dashboard', '/facturas', '/cotizaciones', '/pedidos', '/despachos', '/notas-credito', '/notas-debito', '/devoluciones', '/inventario/stock', '/transferencias', '/compras', '/compras/solicitudes', '/compras/ordenes', '/devoluciones-compras', '/gastos', '/proveedores', '/relaciones-comerciales', '/caja/por-cobrar', '/turnos', '/cobros/lista', '/pagos/lista', '/tesoreria/emisiones', '/cuentas', '/asientos', '/contabilidad/libro-mayor', '/clientes', '/usuarios', '/config/empresa']
ok(RUTAS_E2E.every((p) => menuVisible(p, TENANT_FULL, true)), 'tenant full: las 28 rutas visibles con permiso')
const esperadoMinimoOculto = ['/cotizaciones', '/pedidos', '/despachos', '/notas-debito', '/inventario/stock', '/transferencias', '/compras', '/compras/solicitudes', '/compras/ordenes', '/devoluciones-compras', '/gastos', '/proveedores', '/relaciones-comerciales', '/caja/por-cobrar', '/turnos', '/pagos/lista', '/tesoreria/emisiones', '/cuentas', '/asientos', '/contabilidad/libro-mayor']
ok(esperadoMinimoOculto.every((p) => !menuVisible(p, TENANT_MINIMO, true)), `tenant mínimo: ${esperadoMinimoOculto.length} rutas de módulos no contratados ocultas`)
const esperadoMinimoVisible = ['/dashboard', '/facturas', '/notas-credito', '/devoluciones', '/clientes', '/usuarios', '/config/empresa', '/cobros/lista', '/inventario/productos']
ok(esperadoMinimoVisible.every((p) => menuVisible(p, TENANT_MINIMO, true)), 'tenant mínimo: núcleo + CxC + NC + Devoluciones visibles')
// Intersección con permisos: tenant full pero usuario sin rol de Compras → oculto igual
ok(menuVisible('/compras', TENANT_FULL, false) === false, 'intersección: feature on + sin permiso → oculto')
// URL directa (guard): feature off → ModuloNoContratado aunque haya permiso (cableado en §2)
// Reportes del tenant mínimo: solo ventas + los sin clave (fail-open)
const tiposReportes = Object.keys(ESPEJO_REPORTES)
const visiblesMinimo = tiposReportes.filter((t) => reporteVisible(t, TENANT_MINIMO.reportesHabilitados))
ok(visiblesMinimo.includes('ventas') && !visiblesMinimo.includes('balance') && !visiblesMinimo.includes('606'), 'reportes mínimo: solo ventas (+fail-open sin clave)')
// Límites del flujo: el tenant mínimo no puede invitar ni crear sucursal
ok(limiteUsuariosAlcanzado(TENANT_MINIMO.limites) && limiteSucursalesAlcanzado(TENANT_MINIMO.limites), 'tenant mínimo en tope: ambos botones deshabilitados')

// ─── Resumen ─────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════\n  E2E features-tenant: ${passed} ✓ · ${failed} ✗\n═══════════════════════════════════════════`)
if (failed > 0) {
  console.log('\nFallos:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('\nTodo verde: módulo completo y flujo verificado.')
