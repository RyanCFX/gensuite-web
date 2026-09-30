/**
 * Pruebas end-to-end del módulo "Permisos v2 y dashboard modular"
 * (docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md).
 *
 * Cubre cada aspecto del módulo y todo lo relacionado: /me/acceso + store, filtros
 * bloqueados, selects /opciones, dashboard modular, gates .crear, admin de acceso,
 * usuarios v2, errores nuevos y JWT sin ak/ask.
 *
 * Estrategia (igual que scripts/e2e-features-tenant.mjs): el repo no tiene runner de
 * tests ni backend vivo con v2 para un E2E con red. Este script hace (a) pruebas de
 * lógica sobre el código REAL de `src/shared/permissions/acceso.ts` (compilado a
 * /tmp/accv2 antes — ver "Compilar" abajo) y (b) verificaciones estáticas de que cada
 * punto del checklist está cableado (endpoints, store, interceptor, dashboard, selects,
 * filtros, gates, admin, usuarios, errores).
 *
 * Compilar: npx tsc src/shared/permissions/acceso.ts --outDir /tmp/accv2 --module commonjs --target es2020 --skipLibCheck
 * Uso: node scripts/e2e-permisos-v2.mjs — salida 0 = todo verde.
 */
import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('/tmp/accv2/')
const acc = require('/tmp/accv2/acceso.js')

let n = 0
const ok = (cond, label) => { n++; assert.ok(cond, label); console.log(`  ✓ ${label}`) }
const eq = (a, b, label) => { n++; assert.deepStrictEqual(a, b, label); console.log(`  ✓ ${label}`) }

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const src = (p) => readFileSync(`${ROOT}/${p}`, 'utf8')
const tiene = (p, s, label) => ok(src(p).includes(s), `${label} [${p}]`)
const noTiene = (p, s, label) => ok(!src(p).includes(s), `${label} [${p}]`)

// ─── Catálogo de prueba ──────────────────────────────────────────────────────
const CAT = [
  {
    key: 'ventas', nombre: 'Ventas',
    pantallas: [
      {
        key: 'ventas.factura', nombre: 'Facturas',
        componentes: [
          { key: 'ventas.factura.listar', tipo: 'vista', nombre: 'Ver listado', parametro: null, incluirEnCompleta: true, requiere: [], recursos: [], otorgable: true },
          { key: 'ventas.factura.crear', tipo: 'accion', nombre: 'Nueva', parametro: null, incluirEnCompleta: true, requiere: [], recursos: [], otorgable: true },
          { key: 'ventas.factura.filtro.branch', tipo: 'filtro', nombre: 'Filtrar por sucursal', parametro: 'branch', incluirEnCompleta: true, requiere: ['ventas.factura.listar'], recursos: ['lookup.sucursales'], otorgable: true },
          { key: 'ventas.factura.margen', tipo: 'vista', nombre: 'Ver margen', parametro: null, incluirEnCompleta: false, requiere: [], recursos: [], otorgable: true },
        ],
      },
    ],
  },
]
const P = CAT[0].pantallas[0]
const vacio = () => ({ marcados: new Set(), incluirFuturos: true })

console.log('— pantallaDeAccion')
eq(acc.pantallaDeAccion('ventas.factura.anular'), 'ventas.factura', 'acción → pantalla')
eq(acc.pantallaDeAccion('caja'), 'caja', 'sin punto queda igual')

console.log('— puedeFiltrar / puedeConsultar')
const A_OFF = { ...acc.ACCESO_VACIO }
const A_ACT = {
  modo: 'activo', version: '1', modulos: new Set(['ventas']), pantallas: new Set(['ventas.factura']),
  componentes: new Set(['ventas.factura.listar']), recursos: new Set(['lookup.sucursales']),
  filtrosBloqueados: { 'ventas.factura': ['branch'] },
}
ok(acc.puedeFiltrar(null, 'ventas.factura', 'branch') === true, 'sin acceso = permitido')
ok(acc.puedeFiltrar(A_OFF, 'ventas.factura', 'branch') === true, 'off = permitido')
ok(acc.puedeFiltrar({ ...A_OFF, modo: 'sombra' }, 'ventas.factura', 'branch') === true, 'sombra = permitido')
ok(acc.puedeFiltrar(A_ACT, 'ventas.factura', 'branch') === false, 'activo + bloqueado = false')
ok(acc.puedeFiltrar(A_ACT, 'ventas.factura', 'customer') === true, 'activo + no bloqueado = true')
ok(acc.puedeFiltrar(A_ACT, 'otra.pantalla', 'branch') === true, 'pantalla ausente = true')
ok(acc.puedeConsultar(A_ACT, 'sucursales') === true, 'recurso permitido (sin prefijo)')
ok(acc.puedeConsultar(A_ACT, 'lookup.sucursales') === true, 'recurso permitido (con prefijo)')
ok(acc.puedeConsultar(A_ACT, 'proveedores') === false, 'recurso no permitido')
ok(acc.puedeConsultar(A_OFF, 'proveedores') === true, 'off = true (decide backend)')

console.log('— sanearFiltros')
{
  const params = { branch: 'SUC', customer: 'C1', limit: 50 }
  const { limpios, quitados } = acc.sanearFiltros(A_ACT, 'ventas.factura', params)
  eq(limpios, { customer: 'C1', limit: 50 }, 'quita branch')
  eq(quitados, ['branch'], 'reporta quitados')
  eq(params, { branch: 'SUC', customer: 'C1', limit: 50 }, 'no muta el original')
  const off = acc.sanearFiltros(A_OFF, 'ventas.factura', params)
  ok(off.limpios === params && off.quitados.length === 0, 'off = passthrough')
}

console.log('— requisitos y dependientes')
{
  const m1 = acc.conRequisitos(CAT, new Set(), 'ventas.factura.filtro.branch')
  ok(m1.has('ventas.factura.filtro.branch') && m1.has('ventas.factura.listar'), 'marca requisito transitivo')
  const deps = acc.dependientesMarcados(CAT, new Set(['ventas.factura.listar', 'ventas.factura.filtro.branch']), 'ventas.factura.listar')
  eq(deps, ['ventas.factura.filtro.branch'], 'dependientes del requisito')
}

console.log('— grantsDePantalla')
{
  eq(acc.grantsDePantalla(P, vacio()), [], 'nada = sin grants')
  const completa = { marcados: new Set(P.componentes.map((c) => c.key)), incluirFuturos: true }
  const g = acc.grantsDePantalla(P, completa)
  ok(g.some((x) => x.nivel === 'pantalla' && x.efecto === 'permitir'), 'completa = permitir pantalla')
  ok(g.some((x) => x.nivel === 'componente' && x.clave === 'ventas.factura.margen' && x.efecto === 'permitir'),
    'sensible marcada = permitir de componente (no entra por nivel)')
  const excepto = { marcados: new Set(['ventas.factura.listar', 'ventas.factura.crear', 'ventas.factura.margen']), incluirFuturos: true }
  const ge = acc.grantsDePantalla(P, excepto)
  ok(ge.some((x) => x.clave === 'ventas.factura.filtro.branch' && x.efecto === 'denegar'), 'excepto = denegar')
  ok(!ge.some((x) => x.clave === 'ventas.factura.margen' && x.efecto === 'denegar'), 'sensible sin marcar no se deniega')
  const pers = { marcados: new Set(['ventas.factura.listar']), incluirFuturos: false }
  eq(acc.grantsDePantalla(P, pers), [{ nivel: 'componente', clave: 'ventas.factura.listar', efecto: 'permitir' }], 'personalizada = por componente')
  const todoSinFuturos = { marcados: new Set(['ventas.factura.listar', 'ventas.factura.crear', 'ventas.factura.filtro.branch']), incluirFuturos: false }
  const gf = acc.grantsDePantalla(P, todoSinFuturos)
  ok(gf.some((x) => x.nivel === 'pantalla'), 'todo marcado (no sensibles) prefiere nivel pantalla')
}

console.log('— grantsDeModulo / grantsDelArbol')
{
  const completa = { marcados: new Set(P.componentes.map((c) => c.key)), incluirFuturos: true }
  const gm = acc.grantsDeModulo(CAT[0], { 'ventas.factura': completa })
  ok(gm.some((x) => x.nivel === 'modulo' && x.clave === 'ventas' && x.efecto === 'permitir'), 'módulo completo = permitir módulo')
  ok(gm.some((x) => x.clave === 'ventas.factura.margen' && x.efecto === 'permitir'), 'sensible explícita se conserva a nivel módulo')
  const parcial = { marcados: new Set(['ventas.factura.listar']), incluirFuturos: false }
  const gp = acc.grantsDelArbol(CAT, { 'ventas.factura': parcial })
  eq(gp, [{ nivel: 'componente', clave: 'ventas.factura.listar', efecto: 'permitir' }], 'parcial = por componente')
}

console.log('— estadoDesdeGrants (roundtrip)')
{
  const completa = { marcados: new Set(P.componentes.map((c) => c.key)), incluirFuturos: true }
  const grants = acc.grantsDelArbol(CAT, { 'ventas.factura': completa })
  const est = acc.estadoDesdeGrants(CAT, grants)
  ok(est['ventas.factura'].incluirFuturos === true, 'roundtrip conserva nivel alto')
  ok(est['ventas.factura'].marcados.has('ventas.factura.margen'), 'roundtrip conserva sensible explícita')
  const excepto = [{ nivel: 'pantalla', clave: 'ventas.factura', efecto: 'permitir' }, { nivel: 'componente', clave: 'ventas.factura.filtro.branch', efecto: 'denegar' }]
  const est2 = acc.estadoDesdeGrants(CAT, excepto)
  ok(!est2['ventas.factura'].marcados.has('ventas.factura.filtro.branch'), 'denegar quita de marcados')
  ok(!est2['ventas.factura'].marcados.has('ventas.factura.margen'), 'nivel alto no marca sensibles sin permitir explícito')
  const vencido = [{ nivel: 'componente', clave: 'ventas.factura.listar', efecto: 'permitir', expiraEn: '2000-01-01T00:00:00.000Z' }]
  const est3 = acc.estadoDesdeGrants(CAT, vencido)
  ok(est3['ventas.factura'].marcados.size === 0, 'grant vencido se ignora')
}

console.log('— esErrorDeAcceso')
for (const c of ['PERMISO_INSUFICIENTE', 'FILTRO_NO_PERMITIDO', 'RECURSO_NO_PERMITIDO', 'WIDGET_NO_PERMITIDO', 'WIDGET_NO_CONTRATADO'])
  ok(acc.esErrorDeAcceso(c) === true, `${c} = acceso`)
ok(acc.esErrorDeAcceso('VALIDATION_ERROR') === false, 'otro código = false')
ok(acc.esErrorDeAcceso(undefined) === false, 'undefined = false')

console.log('— cableado: endpoints y tipos')
tiene('src/shared/api/endpoints.ts', "acceso: '/me/acceso'", '/me/acceso')
tiene('src/shared/api/endpoints.ts', 'porRecurso', '/opciones/:recurso')
tiene('src/shared/api/endpoints.ts', "'/acceso/catalogo'", 'catálogo acceso')
tiene('src/shared/api/endpoints.ts', "'/acceso/perfiles'", 'perfiles acceso')
tiene('src/shared/api/endpoints.ts', "'/acceso/auditoria'", 'auditoría')
tiene('src/shared/api/endpoints.ts', "'/acceso/migrar'", 'migrar')
tiene('src/shared/api/endpoints.ts', "'/acceso/sincronizar-roles'", 'sincronizar')
tiene('src/shared/api/endpoints.ts', "'/dashboard/catalogo'", 'dashboard catálogo')
tiene('src/shared/api/endpoints.ts', '/dashboard/widgets/', 'dashboard widgets')
tiene('src/shared/api/acceso.ts', 'export async function getMiAcceso', 'getMiAcceso')
tiene('src/shared/api/acceso.ts', 'export async function putUsuarioAcceso', 'putUsuarioAcceso')
tiene('src/shared/api/acceso.ts', 'export async function getAccesoEfectivo', 'getAccesoEfectivo')
tiene('src/shared/api/opciones.ts', 'export async function getOpciones', 'getOpciones')
tiene('src/shared/api/types.ts', 'perfilesAcceso?: string[]', 'perfilesAcceso en invite')

console.log('— cableado: store + interceptor + errores')
tiene('src/stores/permissions.store.ts', 'pedirAcceso', 'store pide /me/acceso')
tiene('src/stores/permissions.store.ts', 'sincronizarAccesoEnFoco', 'refresco por foco')
tiene('src/shared/permissions/useAcceso.ts', 'useFiltrosPantalla', 'hook filtros por pantalla')
tiene('src/shared/api/client.ts', 'FILTRO_NO_PERMITIDO', 'interceptor 403 v2')
tiene('src/shared/api/client.ts', '_filtroRetried', 'reintento una vez sin bloqueados')
tiene('src/shared/api/client.ts', 'ULTIMO_ADMINISTRADOR', 'código ULTIMO_ADMINISTRADOR')
tiene('src/shared/api/client.ts', 'PERFIL_ACCESO_REQUERIDO', 'código PERFIL_ACCESO_REQUERIDO')
tiene('src/components/ProtectedRoute.tsx', 'sincronizarAccesoEnFoco', 'foco registrado')

console.log('— cableado: dashboard modular')
tiene('src/features/dashboard/DashboardPage.tsx', 'getDashboardCatalogo', 'catálogo')
tiene('src/features/dashboard/DashboardPage.tsx', 'LegacyDashboard', 'fallback legacy')
tiene('src/features/dashboard/DashboardPage.tsx', 'No tiene reportes disponibles', 'estado vacío')
noTiene('src/features/dashboard/DashboardPage.tsx', 'listInvoices', 'modular sin /invoices')
noTiene('src/features/dashboard/DashboardPage.tsx', 'listInventory', 'modular sin /inventory')
tiene('src/features/dashboard/LegacyDashboard.tsx', 'getDashboardData', 'legacy con summary')
for (const k of ['dashboard.ventas.total', 'dashboard.ventas.grafico', 'dashboard.ventas.top-productos', 'dashboard.ventas.top-clientes', 'dashboard.compras.total', 'dashboard.gastos.total', 'dashboard.gastos.mes', 'dashboard.cxc.saldo', 'dashboard.cobros.total', 'dashboard.cobros.mes', 'dashboard.finanzas.utilidad', 'dashboard.finanzas.ingresos-gastos', 'dashboard.inventario.bajo-minimo', 'dashboard.actividad.reciente', 'dashboard.actividad.pendientes'])
  tiene('src/features/dashboard/DashboardPage.tsx', k, `widget ${k}`)

console.log('— cableado: selects y filtros')
tiene('src/shared/hooks/useOpciones.ts', 'export function useOpciones', 'useOpciones')
tiene('src/shared/ui/OpcionesSelect.tsx', 'export function OpcionesSelect', 'OpcionesSelect')
tiene('src/shared/api/opcionesFallback.ts', 'fallbackSucursales', 'fallbacks legacy')
tiene('src/features/invoicing/InvoicesPage.tsx', "useFiltrosPantalla('ventas.factura')", 'filtros facturas')
tiene('src/features/invoicing/InvoicesPage.tsx', 'recurso="sucursales"', 'select sucursales facturas')
tiene('src/features/compras/ComprasPage.tsx', "useFiltrosPantalla('compras.factura')", 'filtros compras')
tiene('src/features/gastos/GastosPage.tsx', "useFiltrosPantalla('gastos')", 'filtros gastos')
tiene('src/features/inventory/StockPage.tsx', "useFiltrosPantalla('inventario.stock')", 'filtros stock')
tiene('src/features/reportes/ReportesPage.tsx', 'ReportePantallaContext', 'contexto pantalla por reporte')
tiene('src/features/reportes/ReportesPage.tsx', 'filtros.sanear', 'sanear en reportes')

console.log('— índice post-login (§4.2)')
tiene('src/App.tsx', 'IndicePostLogin', 'índice post-login')
tiene('src/App.tsx', "'/inicio'} replace", 'fallback a /inicio sin dashboard.ver')
{
  // `/` tiene que vivir DENTRO de ProtectedRoute: `fetch` de permisos solo se dispara
  // ahí; fuera, el estado quedaba en `idle` y el loader giraba para siempre (página en blanco).
  const app = src('src/App.tsx')
  const prot = app.indexOf('<Route element={<ProtectedRoute />}>')
  const indice = app.indexOf('<Route path="/" element={<IndicePostLogin />}')
  ok(prot !== -1 && indice > prot, 'ruta / dentro de ProtectedRoute [src/App.tsx]')
}

console.log('— cableado: gates .crear')
for (const [ruta, accion] of [
  ['/facturas/nueva', 'ventas.factura.crear'], ['/compras/nueva', 'compras.factura.crear'],
  ['/gastos/nuevo', 'gastos.crear'], ['/clientes/nuevo', 'clientes.crear'],
  ['/proveedores/nuevo', 'proveedores.crear'], ['/pedidos/nuevo', 'pedidos.crear'],
  ['/tesoreria/emisiones/nueva', 'tesoreria.emision.crear'], ['/despachos/nuevo', 'despachos.crear'],
]) {
  const rutas = src('src/shared/permissions/rutas.ts')
  ok(rutas.includes(`pattern: '${ruta}'`) && rutas.includes(`'${accion}'`), `ruta ${ruta} → ${accion}`)
}

console.log('— cableado: admin de acceso')
for (const f of ['src/features/acceso/AccesoPage.tsx', 'src/features/acceso/ArbolPermisos.tsx', 'src/features/acceso/PerfilDetail.tsx', 'src/features/acceso/ExplicacionAcceso.tsx', 'src/features/acceso/AccesoUsuarioTab.tsx'])
  ok(existsSync(`${ROOT}/${f}`), `existe ${f}`)
tiene('src/App.tsx', '/config/acceso', 'ruta /config/acceso')
tiene('src/components/layout/AppLayout.tsx', '"/config/acceso"', 'menú + ADMIN_ONLY')
tiene('src/shared/permissions/rutas.ts', "'/config/acceso', accion: null, soloSystemManager: true", 'gate SM admin acceso')
tiene('src/shared/api/acceso.ts', 'export async function putPerfilGrants', 'grants lista completa')
tiene('src/features/usuarios/UsuariosPage.tsx', 'ULTIMO_ADMINISTRADOR', 'ULTIMO_ADMINISTRADOR en usuarios')
tiene('src/features/usuarios/UsuariosPage.tsx', 'perfilesAcceso', 'invite/editar con perfilesAcceso')
tiene('src/features/usuarios/UsuariosPage.tsx', 'Acceso', 'tab Acceso en editar')
tiene('src/features/config/RolesPage.tsx', 'v2Activo', 'admin vieja marcada en activo')
tiene('src/features/config/PermisosPage.tsx', 'v2Activo', 'matriz marcada en activo')

console.log('— JWT sin ak/ask + sin llamadas directas a ERPNext')
{
  const store = src('src/stores/auth.store.ts')
  ok(!/claims\.(ak|ask)\b/.test(store) && !/api_key/.test(store), 'auth.store no lee ak/ask/api_key')
  const all = ['src/shared/api/storage.ts', 'src/shared/api/client.ts', 'src/shared/api/auth.ts'].map(src).join('\n')
  ok(!/api\/resource\//.test(all) && !/\/api\/method\//.test(all), 'sin /api/resource|method')
}

console.log('— openapi.json trae los endpoints v2 (tag "Permisos v2 (acceso)")')
{
  const openapi = JSON.parse(readFileSync(`${ROOT}/openapi.json`, 'utf8'))
  const paths = Object.keys(openapi.paths)
  for (const p of ['/api/v1/me/acceso', '/api/v1/opciones/{recurso}', '/api/v1/acceso/catalogo', '/api/v1/acceso/perfiles', '/api/v1/acceso/perfiles/{id}/grants', '/api/v1/acceso/usuarios/{email}/efectivo', '/api/v1/dashboard/catalogo', '/api/v1/dashboard/widgets/{key}'])
    ok(paths.includes(p), `openapi trae ${p}`)
  const props = openapi.components.schemas.InviteUsuarioDto.properties
  ok('perfilesAcceso' in props, 'openapi InviteUsuarioDto.perfilesAcceso')
}

console.log(`\nTODO VERDE — ${n} chequeos`)
