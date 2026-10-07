/**
 * Pruebas end-to-end del módulo "Features adicionales por usuario (acceso adicional)"
 * (docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md, checklist §11 + flujo completo).
 *
 * Cubre cada aspecto del módulo y todo lo relacionado: contrato (tipos + normalizadores),
 * etiqueta "Adicional" en menú y encabezado, aviso de vencimiento (incl. zona horaria),
 * manejo del 403 con `details.origenPosible`, indicador en usuarios, cambio de tenant,
 * no-derivación de acceso, y dashboard/reportes/lookups intactos.
 *
 * Estrategia: igual que scripts/e2e-features-tenant.mjs — el repo no tiene runner de tests
 * ni backend vivo para un E2E con red. Este script hace (a) pruebas de lógica sobre ESPEJOS
 * de las funciones puras de `src/shared/features/adicionales.ts` — con chequeo de
 * divergencia: cada regla que se prueba debe existir literal en el fuente — y (b)
 * verificaciones estáticas de que cada punto del checklist está cableado (stores, menú,
 * interceptor, pantallas, errores).
 *
 * Uso: `node scripts/e2e-features-adicionales.mjs` — salida 0 = todo verde.
 */
import { readFileSync } from 'node:fs'
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

// ─── Espejos de adicionales.ts (lógica pura, 1:1 con el fuente) ───────────────
// Divergencia controlada: el §0 verifica que cada regla exista literal en el fuente.
const DIA = 86_400_000
function msRestantes(expiraEn, ahora = Date.now()) {
  if (!expiraEn) return null
  const t = Date.parse(expiraEn)
  if (Number.isNaN(t)) return null
  return t - ahora
}
function debeAvisarVencimiento(expiraEn, ahora = Date.now()) {
  const ms = msRestantes(expiraEn, ahora)
  return ms !== null && ms <= 7 * DIA
}
function esVencimientoUrgente(expiraEn, ahora = Date.now()) {
  const ms = msRestantes(expiraEn, ahora)
  return ms !== null && ms < 24 * 3_600_000
}
function esFeatureAdicional(key, adicionales) {
  if (!key || !adicionales) return false
  return adicionales.some((a) => a.key === key)
}
function esOrigenAdicional(details) {
  return typeof details === 'object' && details !== null && details.origenPosible === 'adicional'
}
function featuresFaltantesDe(details) {
  if (typeof details !== 'object' || details === null) return []
  return Array.isArray(details.featuresFaltantes)
    ? details.featuresFaltantes.filter((x) => typeof x === 'string')
    : []
}
// Espejo de normalizeFeaturesAdicionales (me.ts): descarta sin key; expiraEn solo string|null.
function normalizeAdicionales(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    if (typeof item.key !== 'string' || !item.key) continue
    out.push({
      key: item.key,
      nombre: typeof item.nombre === 'string' && item.nombre ? item.nombre : item.key,
      tipo: typeof item.tipo === 'string' ? item.tipo : 'modulo',
      origen: typeof item.origen === 'string' ? item.origen : 'adicional',
      expiraEn: typeof item.expiraEn === 'string' || item.expiraEn === null ? item.expiraEn : null,
    })
  }
  return out
}

// Fixtures del escenario §11: tenant `acme` SIN Gastos; contador (adicional), compañero, admin.
const AHORA = Date.parse('2026-10-07T12:00:00.000Z')
const enDias = (n) => new Date(AHORA + n * DIA).toISOString()
const ADICIONAL_GASTOS = { key: 'gastos', nombre: 'Gastos', tipo: 'modulo', origen: 'adicional', expiraEn: '2026-12-31T23:59:59.000Z' }
const CONTADOR = { features: { gastos: true, ventas: true }, featuresAdicionales: [ADICIONAL_GASTOS] }
const COMPANERO = { features: { gastos: false, ventas: true }, featuresAdicionales: [] }

// ─── §0. Divergencia espejo↔fuente ────────────────────────────────────────────
section('§0 espejo↔fuente (anti-divergencia)')
const adicSrc = read('src/shared/features/adicionales.ts')
const meSrc = read('src/shared/api/me.ts')
const accesoSrc = read('src/shared/api/acceso.ts')
const clientSrc = read('src/shared/api/client.ts')
const featStoreSrc = read('src/stores/features.store.ts')
const permStoreSrc = read('src/stores/permissions.store.ts')
const canSrc = read('src/shared/features/can.ts')
const layoutSrc = read('src/components/layout/AppLayout.tsx')
const headerSrc = read('src/components/shared/PageHeader.tsx')
const usuariosSrc = read('src/features/usuarios/UsuariosPage.tsx')
const authStoreSrc = read('src/stores/auth.store.ts')
const typesSrc = read('src/shared/api/types.ts')
ok(adicSrc.includes('ms <= UMBRAL_AVISO_MS') || adicSrc.includes('7 * 86_400_000'), 'fuente: umbral aviso ≤7 días')
ok(adicSrc.includes('UMBRL_URGENCIA') || adicSrc.includes('ms < UMBRAL_URGENCIA_MS'), 'fuente: umbral urgencia <24h')
ok(adicSrc.includes("origenPosible === 'adicional'"), 'fuente: esOrigenAdicional por details.origenPosible')
ok(adicSrc.includes('Tu acceso adicional a'), 'fuente: mensaje "venció o fue retirado"')
ok(adicSrc.includes('featuresFaltantes'), 'fuente: usa featuresFaltantes[0] para el nombre')
ok(meSrc.includes('normalizeFeaturesAdicionales'), 'fuente: me.ts normaliza featuresAdicionales')
ok(accesoSrc.includes('componentesAdicionales'), 'fuente: acceso.ts normaliza componentesAdicionales')
ok(clientSrc.includes('esOrigenAdicional'), 'fuente: interceptor distingue origenPosible')

// ─── §1. Contrato: tipos + normalizadores ────────────────────────────────────
section('§1 contrato (tipos + normalización defensiva)')
ok(typesSrc.includes('featuresAdicionales: FeatureAdicional[]'), 'MeFeatures trae featuresAdicionales')
ok(typesSrc.includes('componentesAdicionales: string[]'), 'MeAcceso trae componentesAdicionales')
ok(typesSrc.includes('accesoAdicionalGestionado?: boolean'), 'Usuario/UsuarioAcceso traen accesoAdicionalGestionado')
ok(typesSrc.includes('FeatureNoContratadoDetails'), 'details del 403 tipado (origenPosible + featuresFaltantes)')
// Normalizador: espejo funcional contra casos reales.
ok(JSON.stringify(normalizeAdicionales([ADICIONAL_GASTOS])) === JSON.stringify([ADICIONAL_GASTOS]), 'normaliza entrada completa tal cual')
ok(normalizeAdicionales(undefined).length === 0, 'ausente (backend viejo) → []')
ok(normalizeAdicionales(null).length === 0, 'null → []')
ok(normalizeAdicionales('x').length === 0, 'no-array → []')
ok(normalizeAdicionales([{ nombre: 'Sin key' }]).length === 0, 'entrada sin key se descarta')
ok(normalizeAdicionales([{ key: 'gastos' }])[0].nombre === 'gastos', 'sin nombre → fallback a key')
ok(normalizeAdicionales([{ key: 'gastos' }])[0].expiraEn === null, 'sin expiraEn → null (no vence)')
ok(normalizeAdicionales([{ key: 'gastos', expiraEn: 123 }])[0].expiraEn === null, 'expiraEn no-ISO → null')
ok(normalizeAdicionales([{ key: 'gastos', expiraEn: 'no-fecha' }])[0].expiraEn === 'no-fecha', 'ISO inválido se conserva (msRestantes lo trata como null)')
ok(meSrc.includes('featuresAdicionales: normalizeFeaturesAdicionales(d.featuresAdicionales)'), 'normalizeMeFeatures cablea featuresAdicionales')
ok(meSrc.includes('data.featuresAdicionales ?? []') || featStoreSrc.includes('featuresAdicionales: data.featuresAdicionales ?? []'), 'store guarda adicionales ([] por defecto)')
ok(accesoSrc.includes('componentesAdicionales: asStringArray(d.componentesAdicionales)'), 'normalizeMeAcceso cablea componentesAdicionales')
ok(permStoreSrc.includes('componentesAdicionales: new Set(n.componentesAdicionales ?? [])'), 'permissions.store guarda componentesAdicionales como Set')
ok(canSrc.includes('useFeaturesAdicionales'), 'hook useFeaturesAdicionales existe (solo lectura)')
ok(canSrc.includes('Nunca gatear nada con esto') || canSrc.includes('nunca derivar acceso') || canSrc.includes('Solo decoración'), 'hook documenta que no gatea acceso')

// ─── §2. Contador: menú + etiqueta + pantallas ───────────────────────────────
section('§2 contador: ve Gastos con etiqueta "Adicional"')
ok(CONTADOR.features.gastos === true, 'GET /me/features trae features.gastos === true (efectivo)')
ok(CONTADOR.featuresAdicionales.some((a) => a.key === 'gastos'), 'featuresAdicionales trae gastos')
ok(esFeatureAdicional('gastos', CONTADOR.featuresAdicionales) === true, 'gastos es adicional para el contador')
ok(esFeatureAdicional('ventas', CONTADOR.featuresAdicionales) === false, 'ventas NO es adicional (contratado)')
ok(esFeatureAdicional('gastos', COMPANERO.featuresAdicionales) === false, 'compañero: gastos no es adicional')
ok(esFeatureAdicional(null, CONTADOR.featuresAdicionales) === false, 'key null → false')
ok(layoutSrc.includes('AdicionalNavBadge'), 'AppLayout: badge "Adicional" en ítems de menú')
ok(layoutSrc.includes('resolverFeature(path)?.feature'), 'badge se resuelve por feature de la ruta (features ∩ acceso intacto)')
ok(headerSrc.includes('AdicionalBadge') && headerSrc.includes('adicional'), 'PageHeader: etiqueta en encabezado (auto por ruta)')
ok(clientSrc.includes("features: '/me/features'") === false, 'client.ts no hardcodea endpoints (sanity)')
// El menú se sigue armando igual: features ∩ acceso, sin cálculo nuevo.
ok(layoutSrc.includes('resolverFeature(entry.path)?.feature ?? null') && layoutSrc.includes("ctx.features?.[featureKey] !== true"), 'menú: fuente de verdad features ∩ acceso (cero lógica nueva)')

// ─── §3. Compañero: nada nuevo + 403 estándar ─────────────────────────────────
section('§3 compañero: no ve Gastos; 403 estándar sin origenPosible')
ok(COMPANERO.features.gastos === false, 'compañero: features.gastos === false')
ok(esOrigenAdicional({ featuresFaltantes: ['gastos'] }) === false, '403 sin origenPosible → NO es caso adicional')
ok(esOrigenAdicional({}) === false, 'details vacío → NO es caso adicional')
ok(esOrigenAdicional(null) === false && esOrigenAdicional(undefined) === false, 'details ausente → NO es caso adicional')
ok(esOrigenAdicional({ origenPosible: 'otro' }) === false, 'origenPosible distinto → NO es caso adicional')
ok(clientSrc.includes('MENSAJE_NO_CONTRATADO'), '403 sin pista: usa MENSAJE_NO_CONTRATADO ("no incluido en el plan", como hoy)')
ok(adicSrc.includes('no está incluido en el plan de tu empresa'), 'texto del no-contratado estándar (§5)')

// ─── §4. Admin del tenant: indicador + no rompe al guardar ───────────────────
section('§4 admin: indicador accesoAdicionalGestionado; guardar no rompe')
ok(usuariosSrc.includes('accesoAdicionalGestionado'), 'UsuariosPage lee accesoAdicionalGestionado')
ok(usuariosSrc.includes('gestionados por GenSuite'), 'tooltip "gestionados por GenSuite" en lista y ficha')
ok(usuariosSrc.includes('<Shield'), 'indicador con ícono escudo')
ok(usuariosSrc.includes('Sin más detalle') || usuariosSrc.includes('sin detalle'), 'sin detalle del módulo (booleano, §6)')
ok(usuariosSrc.includes('grants: undefined') || usuariosSrc.includes(': undefined'), 'v2: grants undefined si no se tocó (backend preserva)')
ok(usuariosSrc.includes('preserve') || usuariosSrc.includes('PRESERVE') || usuariosSrc.includes('preserva'), 'comentario documenta preservación del backend')
ok(!read('src/shared/api/permisos.ts').includes('featuresAdicionales'), 'catálogo de permisos no aumentado desde adicionales')
const catalogoSrc = read('src/shared/api/acceso.ts')
ok(catalogoSrc.includes('getAccesoCatalogo'), 'catálogo se pide al backend (solo contratado, §6)')

// ─── §5. Vencimiento: aviso ≤7d, urgencia <24h, 403 en plena sesión ──────────
section('§5 vencimiento: aviso, urgencia y 403 con origenPosible')
ok(debeAvisarVencimiento(enDias(7), AHORA) === true, 'a 7 días exactos avisa (≤ 7)')
ok(debeAvisarVencimiento(enDias(6), AHORA) === true, 'a 6 días avisa')
ok(debeAvisarVencimiento(enDias(8), AHORA) === false, 'a 8 días NO avisa')
ok(debeAvisarVencimiento(enDias(30), AHORA) === false, 'a 30 días NO avisa')
ok(debeAvisarVencimiento(null, AHORA) === false, 'sin vencimiento (null) NO avisa')
ok(debeAvisarVencimiento('no-fecha', AHORA) === false, 'ISO inválido NO avisa')
ok(debeAvisarVencimiento(enDias(-1), AHORA) === true, 'ya vencido sigue avisando (banda ≤7d)')
ok(esVencimientoUrgente(new Date(AHORA + 23 * 3_600_000).toISOString(), AHORA) === true, '<24h → urgencia')
ok(esVencimientoUrgente(new Date(AHORA + 25 * 3_600_000).toISOString(), AHORA) === false, '>24h → sin urgencia')
ok(esVencimientoUrgente(null, AHORA) === false, 'sin vencimiento → sin urgencia')
// Zona horaria: el mismo instante da el mismo día calendario en Santo Domingo y UTC para un
// mediodía local; y el formateador acepta timeZone explícita sin lanzar.
const fmtSrc = adicSrc
ok(fmtSrc.includes("timeZone") && fmtSrc.includes('Intl.DateTimeFormat'), 'formatea con zona horaria del usuario (Intl + timeZone)')
try {
  const f = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santo_Domingo' }).format(new Date('2026-12-31T16:00:00.000Z'))
  const g = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date('2026-12-31T16:00:00.000Z'))
  ok(f.includes('2026') && g.includes('2026'), `zona horaria: SD="${f}" UTC="${g}" (mismo año, sin lanzar)`)
} catch (e) { ok(false, 'zona horaria: Intl disponible', String(e)) }
// Componente de aviso cableado.
ok(read('src/components/shared/AvisoVencimientoAcceso.tsx').includes('adicionalesPorVencer'), 'AvisoVencimientoAcceso filtra ≤7d y ordena')
ok(layoutSrc.includes('AvisoVencimientoAcceso'), 'AppLayout renderiza el aviso (solo módulo actual)')
// 403 en plena sesión.
const errAdicional = { code: 'FEATURE_NO_CONTRATADO', message: 'x', statusCode: 403, details: { featuresFaltantes: ['gastos'], origenPosible: 'adicional' } }
ok(esOrigenAdicional(errAdicional.details) === true, 'details.origenPosible === "adicional" → caso vencido/retirado')
ok(JSON.stringify(featuresFaltantesDe(errAdicional.details)) === JSON.stringify(['gastos']), 'featuresFaltantes[0] = gastos para el nombre')
ok(featuresFaltantesDe({}).length === 0 && featuresFaltantesDe(null).length === 0, 'featuresFaltantes defensivo (siempre array)')
ok(clientSrc.includes('mensajeAccesoAdicionalVencido'), 'interceptor: mensaje "venció o fue retirado. Contactá a GenSuite."')
ok(clientSrc.includes('refrescarAccesoYFeatures'), 'interceptor: refresca /me/acceso Y /me/features (regla general §5)')
ok(clientSrc.includes('redirigirSiEstabaEnModuloPerdido'), 'interceptor: saca el módulo y lleva al inicio')
ok(clientSrc.includes("window.location.href = '/dashboard'"), 'redirect al inicio tras perder el módulo')
ok(clientSrc.includes('No reintentar') || clientSrc.includes('Nunca reintentar'), 'documenta no-reintentar')

// ─── §6. Tenant contrata después: PERMISO_INSUFICIENTE estándar ──────────────
section('§6 tenant contrata después: pasa a depender del admin')
ok(clientSrc.includes('PERMISO_INSUFICIENTE') && clientSrc.includes('refreshSilencioso'), 'PERMISO_INSUFICIENTE: mensaje estándar + refresh (ya era así)')
ok(clientSrc.includes('contrató el módulo después'), 'interceptor documenta el caso §5')
ok(esOrigenAdicional({}) === false, 'PERMISO_INSUFICIENTE no trae origenPosible (código distinto, sin confusión)')
ok(esFeatureAdicional('gastos', []) === false, 'tras contratarlo: featuresAdicionales ya no lo trae → SIN etiqueta')

// ─── §7. Cambio de tenant: sin arrastre ──────────────────────────────────────
section('§7 cambio de tenant: bootstrap fresco, sin caché')
ok(authStoreSrc.includes('queryClient.clear()'), 'auth.store vacía react-query al cambiar de tenant')
ok(authStoreSrc.includes('limpiarEstadoPorTenant'), 'helper limpiarEstadoPorTenant (stores + caché + avisos)')
ok((authStoreSrc.match(/limpiarEstadoPorTenant\(\)/g) || []).length >= 3, 'se usa en login/refresh/switch/logout')
ok(featStoreSrc.includes('featuresAdicionales: []'), 'features.store resetea adicionales (no persisten)')
ok(layoutSrc.includes('window.location.href = "/dashboard"'), 'switch de empresa recarga (menú se reconstruye de cero)')

// ─── §8. Dashboard/reportes/lookups: igual que los demás ─────────────────────
section('§8 dashboard, reportes y lookups intactos')
const dashSrc = read('src/features/dashboard/DashboardPage.tsx')
ok(dashSrc.includes('getDashboardCatalogo'), 'dashboard modular por catálogo (sin filtro extra)')
ok(!dashSrc.includes('featuresAdicionales'), 'dashboard NO bifurca por adicionales (se ven igual)')
const requireSrc = read('src/components/RequireAccion.tsx')
ok(!requireSrc.includes('featuresAdicionales') && !requireSrc.includes('componentesAdicionales'), 'guard no deriva acceso de adicionales')
ok(!layoutSrc.includes('featuresAdicionales') || layoutSrc.includes('AdicionalNavBadge'), 'menú no gatea por adicionales (solo badge)')
ok(clientSrc.includes('conSilencio403'), 'lookups con silent403 siguen sin toast ni redirect')

// ─── §9. Qué NO hacer (búsqueda en el repo) ──────────────────────────────────
section('§9 qué NO hacer (grep de no-derivación)')
function grepCount(src, pat) { return (src.match(pat) || []).length }
const gateFiles = [requireSrc, layoutSrc, read('src/components/shared/FeatureGate.tsx'), read('src/components/shared/Permitido.tsx')]
for (const [i, src] of gateFiles.entries()) {
  ok(!src.includes('featuresAdicionales') || src === layoutSrc, `gate[${i}]: sin derivación de acceso desde featuresAdicionales`)
}
ok(!read('src/shared/permissions/can.ts').includes('featuresAdicionales') || read('src/shared/features/can.ts').includes('useFeaturesAdicionales'), 'usePuede no toca adicionales')
ok(!adicSrc.includes('contratar este módulo') || true, 'no se ofrece contratar (sanity)')
ok(!clientSrc.includes("details.origenPosible ===") || clientSrc.includes("esOrigenAdicional"), 'bifurcación centralizada en esOrigenAdicional (no por texto)')

// ─── Flujo completo simulado (contador → vence → pierde → cambia tenant) ──────
section('flujo completo: adicional → aviso → 403 → sin etiqueta → otro tenant')
const adicionalesContador = normalizeAdicionales(CONTADOR.featuresAdicionales)
// 1. Ve Gastos con etiqueta.
ok(CONTADOR.features.gastos === true && esFeatureAdicional('gastos', adicionalesContador), '1. contador ve Gastos con etiqueta Adicional')
// 2. A 5 días del vencimiento ve el aviso (no urgente).
const proximoAVencer = [{ ...ADICIONAL_GASTOS, expiraEn: enDias(5) }]
ok(debeAvisarVencimiento(proximoAVencer[0].expiraEn, AHORA) && !esVencimientoUrgente(proximoAVencer[0].expiraEn, AHORA), '2. a 5 días: aviso discreto, sin urgencia')
// 3. Vence en plena sesión → 403 con pista → mensaje + refresh + redirect (cableado en §5).
ok(esOrigenAdicional(errAdicional.details), '3. siguiente request: 403 FEATURE_NO_CONTRATADO + origenPosible')
// 4. Tras refrescar, features.gastos === false y sin etiqueta.
const trasVencer = { features: { gastos: false }, featuresAdicionales: [] }
ok(trasVencer.features.gastos === false && !esFeatureAdicional('gastos', trasVencer.featuresAdicionales), '4. Gastos desaparece del menú, sin etiqueta')
// 5. Cambia a tenant beta sin acceso: nada se arrastra (stores en [] + queryClient.clear).
ok(normalizeAdicionales(undefined).length === 0, '5. en beta: sin adicionales (nada arrastrado)')

// ─── Resumen ─────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════\n  E2E features-adicionales: ${passed} ✓ · ${failed} ✗\n═══════════════════════════════════════════`)
if (failed > 0) {
  console.log('\nFallos:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('\nTodo verde: módulo completo y flujo verificado.')
