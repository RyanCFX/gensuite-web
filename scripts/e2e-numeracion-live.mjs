/**
 * E2E con red AUTENTICADA del módulo "Numeración de documentos"
 * (docs/tasks/PROMPT_NUMERACION_DOCUMENTOS_FRONTEND.md §5 — flujo de punta a punta).
 *
 * Lee credenciales de variables de entorno (nunca hardcodear secretos):
 *   E2E_API      base del BFF (default http://207.180.235.134:4000)
 *   E2E_EMAIL    email de login
 *   E2E_PASSWORD password
 *   E2E_TENANT   slug del tenant (default: el `tenant` del login)
 *
 * Estrategia de escritura SEGURA: solo operaciones idempotentes — PUT de la MISMA lista de
 * series (verifica el path de escritura sin cambiar nada, §10.7) y PUT de contador con el
 * MISMO valor actual (no-op semántico). Además verifica que el backend RECHACE lo inválido
 * (400 con plantilla mala, 400 con serie duplicada/reservada). Nada baja contadores ni agrega
 * series reales.
 *
 * Uso: `E2E_EMAIL=... E2E_PASSWORD=... node scripts/e2e-numeracion-live.mjs` — salida 0 = verde.
 */
import { writeFileSync } from 'node:fs'

const API = process.env.E2E_API ?? 'http://207.180.235.134:4000'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('Faltan E2E_EMAIL / E2E_PASSWORD')
  process.exit(2)
}

let passed = 0
let failed = 0
const failures = []
const report = []
function ok(cond, label, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`) }
  report.push(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`)
}
function section(t) { console.log(`\n── ${t} ──`); report.push(`\n## ${t}`) }

let TOKEN = ''
let TENANT = process.env.E2E_TENANT ?? ''
const H = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, 'X-Tenant': TENANT })

async function req(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: H(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch { /* no-json */ }
  return { status: r.status, data }
}

// ─── 0. Login ────────────────────────────────────────────────────────────────
section('0. Login y tenant')
{
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const data = await r.json()
  // El BFF responde 201 al login (no 200): el frontend usa `unwrap` y no depende del status.
  ok((r.status === 200 || r.status === 201) && data.success, `login 200/201 (dio ${r.status})`)
  TOKEN = data.data.access_token
  const REFRESH = data.data.refresh_token
  const slugs = (data.data.tenants ?? []).map((t) => t.slug)
  ok(slugs.length > 0, `tenants del usuario: ${slugs.join(', ')}`)
  if (!TENANT) TENANT = data.data.tenant?.slug ?? slugs[0]
  ok(!!TENANT, `tenant de prueba: ${TENANT}`)
  if (TENANT && TENANT !== data.data.tenant?.slug) {
    // El access_token viene atado al tenant del login: hay que cambiar de empresa
    // (sin esto el backend responde TENANT_MISMATCH, que es lo correcto).
    const sw = await fetch(`${API}/api/v1/auth/switch-tenant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ refreshToken: REFRESH, tenant: TENANT }),
    })
    const swData = await sw.json()
    ok((sw.status === 200 || sw.status === 201) && swData.success, `switch-tenant a ${TENANT} (dio ${sw.status})`)
    if (swData.success) TOKEN = swData.data.access_token
  }
}

// ─── 1. Features y permisos (§4.6) ───────────────────────────────────────────
section('1. Features y permisos (§4.6)')
let FEATURES = {}
{
  const f = await req('GET', '/api/v1/me/features')
  ok(f.status === 200, `GET /me/features 200 (dio ${f.status})`)
  FEATURES = f.data?.data?.features ?? {}
  const numKeys = Object.keys(FEATURES).filter((k) => k.startsWith('numeracion'))
  const numOn = numKeys.filter((k) => FEATURES[k] === true)
  // El prompt dice 22 claves nuevas; openapi FeaturesMapDto aún no las trae (ver e2e estático §0)
  // pero el endpoint real SÍ las trae — el schema está desactualizado, no el backend.
  console.log(`  · claves numeracion* en /me/features: ${numKeys.length}, encendidas: ${numOn.length}${numOn.length ? ` (${numOn.join(', ')})` : ''}`)
  report.push(`claves numeracion* en /me/features: ${numKeys.length}, encendidas: ${numOn.length}`)
  ok(numKeys.length === 22, `las 22 claves existen en /me/features (${numKeys.length}/22)`)
  const p = await req('GET', '/api/v1/me/permissions')
  ok(p.status === 200, `GET /me/permissions 200 (dio ${p.status})`)
  const acciones = p.data?.data?.acciones ?? {}
  const numAcc = Object.keys(acciones).filter((k) => k.startsWith('config.numeracion.'))
  console.log(`  · acciones config.numeracion.*: ${numAcc.length}, en true: ${numAcc.filter((k) => acciones[k]).length}`)
  report.push(`acciones config.numeracion.*: ${numAcc.length} (true: ${numAcc.filter((k) => acciones[k]).length})`)
}

// ─── 2. Índice (§4.1) ────────────────────────────────────────────────────────
section('2. Índice (§4.1)')
let INDICE = []
{
  const r = await req('GET', '/api/v1/config/numeracion')
  ok(r.status === 200 && r.data?.success === true, `GET índice 200 + sobre success (dio ${r.status})`)
  INDICE = r.data?.data ?? []
  console.log(`  · tipos visibles: ${INDICE.length}`)
  const modos = {}
  let rutaSinApiV1 = 0
  for (const t of INDICE) {
    modos[t.modo] = (modos[t.modo] ?? 0) + 1
    if (typeof t.ruta === 'string' && t.ruta.startsWith('/api/v1/')) {
      // §4.1: el frontend debe usar solo el último segmento.
      const seg = t.ruta.split('/').pop()
      if (seg && t.ruta.endsWith(`/${seg}`)) rutaSinApiV1++
    }
    for (const f of ['slug', 'doctype', 'area', 'nombre', 'ejemplo', 'modo', 'ruta', 'feature', 'accion']) {
      if (!(f in t)) { ok(false, `tipo ${t.slug ?? '?'} trae campo ${f}`); break }
    }
  }
  ok(true, `modos en índice: ${JSON.stringify(modos)}`)
  if (INDICE.length === 0) {
    // §7.3: data: [] NO es un error — el tenant no tiene tipos habilitados (dos puertas §2).
    ok(true, 'índice vacío = estado vacío válido §7.3 (sin features/permiso en este tenant)')
    report.push('SKIP §3-§6: sin tipos accesibles en este tenant — escritura/preview no probables sin cambiar el plan')
  } else {
    ok(rutaSinApiV1 === INDICE.length, `todas las rutas incluyen /api/v1 (${rutaSinApiV1}/${INDICE.length})`)
  }
}

// ─── 3. Estado por modo (§4.2) ───────────────────────────────────────────────
section('3. Estado por modo (§4.2)')
const porRuta = (seg) => INDICE.find((t) => (t.ruta.split('/').pop() ?? t.ruta) === seg)
async function traeEstado(seg) {
  const t0 = Date.now()
  const r = await req('GET', `/api/v1/config/numeracion/${seg}`)
  return { r, ms: Date.now() - t0 }
}
let ESTADOS = {}
// Si el índice está vacío, los detalles deben dar 403 FEATURE_NO_CONTRATADO (§9) —
// eso también se verifica (es el comportamiento esperado, no un fallo).
const ESPERA_403 = INDICE.length === 0
for (const seg of ['factura-venta', 'nota-credito-venta', 'lote', 'cliente', 'reclamo-gastos']) {
  const { r, ms } = await traeEstado(seg)
  if (r.status === 200) {
    ESTADOS[seg] = r.data.data
    const e = r.data.data
    ok(true, `${seg}: 200 en ${ms}ms, modo=${e.modo}, series=${e.series.length}, reservadas=${e.reservadas.length}`)
    if (e.series.length > 0) {
      const s0 = e.series[0]
      ok(s0.esPredeterminada === true, `${seg}: primera serie es predeterminada`)
      ok('proximo' in s0 && 'prefijo' in s0 && 'contador' in s0, `${seg}: serie trae proximo+prefijo+contador`)
    }
    // Actualización numeración por sucursal: campos nuevos del contrato.
    ok(typeof e.soportaSucursal === 'boolean', `${seg}: trae soportaSucursal (${e.soportaSucursal})`)
    ok(Array.isArray(e.reglasSucursal), `${seg}: trae reglasSucursal (n=${e.reglasSucursal?.length})`)
    if (Array.isArray(e.reglasSucursal) && e.reglasSucursal.length > 0) {
      const r0 = e.reglasSucursal[0]
      ok('sucursal' in r0 && 'plantilla' in r0 && 'prefijo' in r0 && 'contador' in r0 && 'proximo' in r0, `${seg}: regla trae sucursal+plantilla+prefijo+contador+proximo`)
    }
    if (seg === 'cliente') ok('nombradoPor' in e, `cliente trae nombradoPor (${e.nombradoPor})`)
    if (seg === 'lote') ok(e.lote && 'usarSerie' in e.lote, `lote trae lote.usarSerie (${e.lote?.usarSerie})`)
  } else {
    const code = r.data?.error?.code
    console.log(`  · ${seg}: ${r.status} code=${code} — ${r.data?.error?.message ?? ''}`)
    report.push(`${seg}: HTTP ${r.status} code=${code}`)
    if (ESPERA_403) {
      ok(r.status === 403 && code === 'FEATURE_NO_CONTRATADO', `${seg}: 403 FEATURE_NO_CONTRATADO (puerta feature cerrada, §9)`)
    } else {
      ok(r.status === 403 || r.status === 409, `${seg}: error esperado con forma (403/409), dio ${r.status}`)
    }
  }
}

// ─── 4. Preview (§4.5) ───────────────────────────────────────────────────────
section('4. Preview (§4.5)')
{
  const seg = 'factura-venta'
  if (ESPERA_403) {
    const r = await req('POST', `/api/v1/config/numeracion/${seg}/preview`, { plantilla: 'FAC-.YYYY.-' })
    ok(r.status === 403 && r.data?.error?.code === 'FEATURE_NO_CONTRATADO', `preview sin feature → 403 FEATURE_NO_CONTRATADO (dio ${r.status})`)
    console.log('  · SKIP resto de §4-§6: sin tipos accesibles (ver §2)')
    report.push('SKIP §4-§6 escrituras: tenant sin numeración habilitada')
    console.log(`\n${passed} passed, ${failed} failed`)
    writeFileSync('/tmp/e2e-numeracion-live-report.txt', `${report.join('\n')}\n\n${passed} passed, ${failed} failed\n`)
    if (failures.length) { console.log('\nFallos:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
    process.exit(0)
  }
  const r = await req('POST', `/api/v1/config/numeracion/${seg}/preview`, { plantilla: 'FAC-.YYYY.-' })
  ok(r.status === 200, `preview 200 (dio ${r.status})`)
  const arr = r.data?.data
  ok(Array.isArray(arr) && arr.length === 3, `devuelve 3 ejemplos (dio ${JSON.stringify(arr)?.slice(0, 80)})`)
  if (Array.isArray(arr) && arr.length === 3) {
    ok(arr.every((x) => /00001|00002|00003/.test(x)), `empiezan en 00001: ${arr.join(', ')}`)
  }
  const mala = await req('POST', `/api/v1/config/numeracion/${seg}/preview`, { plantilla: '@@@' })
  ok(mala.status === 200 && Array.isArray(mala.data?.data) && mala.data.data.length === 0, `plantilla inválida → data: [] (dio ${mala.status} ${JSON.stringify(mala.data?.data)})`)
}

// ─── 5. Escrituras idempotentes (§4.3 PUT mismo estado) ──────────────────────
section('5. PUT idempotente (§4.3/§10.7)')
{
  const seg = 'factura-venta'
  const antes = ESTADOS[seg]
  if (!antes) { ok(false, 'sin estado de factura-venta, no se puede probar PUT'); }
  else {
    const lista = antes.series.map((s) => s.plantilla)
    // PUT idempotente con series + reglasSucursal iguales (mismo PUT, §3 actualización).
    const reglasAntes = (antes.reglasSucursal ?? []).map((x) => ({ sucursal: x.sucursal, plantilla: x.plantilla }))
    const body = antes.soportaSucursal ? { series: lista, reglasSucursal: reglasAntes } : { series: lista }
    const r = await req('PUT', `/api/v1/config/numeracion/${seg}`, body)
    ok(r.status === 200, `PUT mismo estado → 200 (dio ${r.status})`)
    if (r.status === 200) {
      const despues = r.data.data.series.map((s) => s.plantilla)
      ok(JSON.stringify(despues) === JSON.stringify(lista), 'la respuesta trae el estado actualizado completo')
      if (antes.soportaSucursal) {
        const rd = (r.data.data.reglasSucursal ?? []).map((x) => ({ sucursal: x.sucursal, plantilla: x.plantilla }))
        ok(JSON.stringify(rd) === JSON.stringify(reglasAntes), 'reglasSucursal inalteradas en PUT idempotente')
      }
    } else {
      console.log(`  · PUT error: ${JSON.stringify(r.data)?.slice(0, 300)}`)
    }
    // Rechazos esperados (el servidor manda)
    const vacio = await req('PUT', `/api/v1/config/numeracion/${seg}`, { series: [] })
    ok(vacio.status === 400, `PUT series: [] en modo series → 400 (dio ${vacio.status})`)
    const dup = await req('PUT', `/api/v1/config/numeracion/${seg}`, { series: [...lista, lista[0]].filter(Boolean) })
    ok(dup.status === 400, `PUT con duplicada → 400 (dio ${dup.status})`)
    const mala = await req('PUT', `/api/v1/config/numeracion/${seg}`, { series: ['FAC@MALA'] })
    ok(mala.status === 400, `PUT plantilla inválida → 400 (dio ${mala.status})`)
    if (antes.reservadas.length > 0) {
      const res = await req('PUT', `/api/v1/config/numeracion/${seg}`, { series: [...lista, antes.reservadas[0]] })
      ok(res.status === 400, `PUT con reservada → 400 (dio ${res.status})`)
    }
    const loteEnSeries = await req('PUT', '/api/v1/config/numeracion/lote', { series: ['X-.#'] })
    ok(loteEnSeries.status === 400, `PUT series en modo lote → 400 (dio ${loteEnSeries.status})`)
  }
}

// ─── 6. Contador no-op (§4.4 — mismo valor) ───────────────────────────────────
section('6. Contador no-op (§4.4)')
{
  const seg = 'factura-venta'
  const antes = ESTADOS[seg]?.series?.[0]
  if (!antes || antes.prefijo === null) { ok(false, 'sin serie evaluable para probar contador'); }
  else {
    const r = await req('PUT', `/api/v1/config/numeracion/${seg}/contador`, { plantilla: antes.plantilla, valor: antes.contador ?? 0 })
    ok(r.status === 200, `PUT contador mismo valor → 200 (dio ${r.status})`)
    if (r.status === 200) {
      const s = r.data.data.series.find((x) => x.plantilla === antes.plantilla)
      ok(s?.proximo === antes.proximo, `próximo inalterado (${s?.proximo})`)
    } else {
      console.log(`  · contador error: ${JSON.stringify(r.data)?.slice(0, 300)}`)
    }
    const fantasma = await req('PUT', `/api/v1/config/numeracion/${seg}/contador`, { plantilla: 'NO-EXISTE-.###', valor: 1 })
    ok(fantasma.status === 400, `contador de plantilla inexistente → 400 (dio ${fantasma.status})`)
  }
}

// ─── Resumen ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
writeFileSync('/tmp/e2e-numeracion-live-report.txt', `${report.join('\n')}\n\n${passed} passed, ${failed} failed\n`)
if (failures.length) {
  console.log('\nFallos:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
