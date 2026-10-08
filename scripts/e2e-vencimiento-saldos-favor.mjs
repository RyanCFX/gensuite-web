/**
 * Pruebas end-to-end del módulo "Vencimiento y uso de notas de crédito y saldos a favor"
 * (docs/tasks/PROMPT_VENCIMIENTO_SALDOS_A_FAVOR_FRONTEND.md).
 *
 * Cubre cada aspecto del módulo y todo lo relacionado: configuración (§2), estados y
 * campos (§3), pantallas (§4), las tres acciones (§5), autorización con código (§6),
 * reglas de negocio (§7), errores nuevos (§8) y lo que NO hay que hacer (§9).
 *
 * Estrategia (igual que scripts/e2e-permisos-v2.mjs): el repo no tiene runner de tests
 * ni backend vivo para un E2E con red. Este script hace (a) pruebas de lógica sobre el
 * código REAL de `src/lib/creditoVencimiento.ts` (compilado a /tmp/credvenc antes — ver
 * "Compilar" abajo) y (b) verificaciones estáticas de que cada punto del checklist está
 * cableado (tipos, endpoints, API, pantallas, modales, hook, errores).
 *
 * Compilar (el lib importa tipos con `@/` — se sustituye por un stub local, solo para
 * tipos; el código de runtime probado es idéntico al real):
 *   mkdir -p /tmp/credvenc-src &&
 *   python3 -c "
 *   s = open('src/lib/creditoVencimiento.ts').read().replace(
 *     \"import type { ApiError, CreditoEstado } from '@/shared/api/types'\",
 *     \"type CreditoEstado = 'vigente' | 'por_vencer' | 'vencido' | 'perdido' | 'agotado\";
 *      interface ApiError { code: string; message: string; statusCode: number; details?: Record<string, unknown> }\")
 *   open('/tmp/credvenc-src/creditoVencimiento.ts', 'w').write(s)" &&
 *   npx tsc /tmp/credvenc-src/creditoVencimiento.ts --outDir /tmp/credvenc --module commonjs --target es2020 --skipLibCheck --ignoreConfig
 * Uso: node scripts/e2e-vencimiento-saldos-favor.mjs — salida 0 = todo verde.
 */
import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('/tmp/credvenc/')
const cv = require('/tmp/credvenc/creditoVencimiento.js')

let n = 0
const ok = (cond, label) => { n++; assert.ok(cond, label); console.log(`  ✓ ${label}`) }
const eq = (a, b, label) => { n++; assert.deepStrictEqual(a, b, label); console.log(`  ✓ ${label}`) }

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const src = (p) => readFileSync(`${ROOT}/${p}`, 'utf8')
const tiene = (p, s, label) => ok(src(p).includes(s), `${label} [${p}]`)
const noTiene = (p, s, label) => ok(!src(p).includes(s), `${label} [${p}]`)

// ─── (a) Lógica real: formato de fechas sin desfase de zona (§7.5) ───────────
console.log('§7.5 fechas (sin new Date(), sin UTC):')
eq(cv.formatVenceEl('2026-12-31'), '31/12/2026', 'YYYY-MM-DD -> DD/MM/AAAA')
eq(cv.formatVenceEl(null), '—', 'null -> «—» (tenant sin configurar)')
eq(cv.formatVenceEl(undefined), '—', 'undefined -> «—»')
eq(cv.formatVenceEl(''), '—', 'vacío -> «—»')
// §7.5 prohíbe convertir `venceEl` con Date/UTC (cambia el día). El único `new Date()`
// permitido es el de todayYMD() (fecha de hoy local, nunca un vencimiento).
{
  const libSinComentarios = src('src/lib/creditoVencimiento.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
  const usos = (libSinComentarios.match(/new Date\(/g) ?? []).length
  eq(usos, 1, 'un solo new Date() en código (todayYMD)')
  ok(!libSinComentarios.includes('parseISO'), 'el lib nunca parsea fechas con parseISO')
  const cuerpoFormat = libSinComentarios.slice(
    libSinComentarios.indexOf('export function formatVenceEl'),
    libSinComentarios.indexOf('export function todayYMD'),
  )
  ok(!cuerpoFormat.includes('Date'), 'formatVenceEl no toca Date (partición directa del string)')
}
ok(/^\d{4}-\d{2}-\d{2}$/.test(cv.todayYMD()), 'todayYMD() devuelve YYYY-MM-DD local')

// ─── (a) Lógica real: estados y badges (§3.2) ────────────────────────────────
console.log('§3.2 estados:')
eq(cv.creditoEstadoLabel('vigente', {}), 'Vigente', 'vigente')
eq(cv.creditoEstadoLabel('por_vencer', { diasRestantes: 40 }), 'Vence en 40 días', 'por_vencer 40 (badge verde en UI: vigente con fecha)')
eq(cv.creditoEstadoLabel('por_vencer', { diasRestantes: 3 }), 'Vence en 3 días', 'por_vencer 3 -> ámbar «Vence en 3 días»')
eq(cv.creditoEstadoLabel('por_vencer', { diasRestantes: 1 }), 'Vence en 1 día', 'singular «día»')
eq(cv.creditoEstadoLabel('por_vencer', { diasRestantes: 0 }), 'Vence hoy', 'diasRestantes 0 -> «Vence hoy»')
eq(cv.creditoEstadoLabel('vencido', { venceEl: '2026-10-01' }), 'Vencida el 01/10/2026', 'vencido -> rojo «Vencida el DD/MM/AAAA»')
eq(cv.creditoEstadoLabel('perdido', {}), 'Dada de baja', 'perdido -> gris «Dada de baja»')
eq(cv.creditoEstadoLabel('agotado', {}), 'Agotada', 'agotado')
eq(cv.creditoEstadoLabel(undefined, {}), '—', 'sin estado -> nada (pantalla idéntica a antes)')
eq(cv.CREDITO_ESTADO_BADGE.vigente, 'badge-success', 'badge vigente verde')
eq(cv.CREDITO_ESTADO_BADGE.por_vencer, 'badge-warning', 'badge por_vencer ámbar')
eq(cv.CREDITO_ESTADO_BADGE.vencido, 'badge-error', 'badge vencido rojo')
ok(cv.creditoNoAplicableTooltip('2026-10-01').includes('01/10/2026'), 'tooltip de fila deshabilitada con fecha')

// ─── (a) Lógica real: clasificadores de error (§8, §6.3) ─────────────────────
console.log('§8 errores:')
ok(cv.esPermisoRequeridoConPin({ statusCode: 403, code: 'PERMISO_REQUERIDO', details: { admiteAutorizacionPin: true } }), '403 PERMISO_REQUERIDO + admiteAutorizacionPin -> abre modal')
ok(!cv.esPermisoRequeridoConPin({ statusCode: 403, code: 'PERMISO_REQUERIDO', details: {} }), 'sin admiteAutorizacionPin -> NO abre modal')
ok(!cv.esPermisoRequeridoConPin({ statusCode: 403, code: 'PERMISO_INSUFICIENTE', details: { admiteAutorizacionPin: true } }), 'otro code -> NO abre modal')
ok(cv.esAutorizacionInvalida({ statusCode: 401, code: 'AUTORIZACION_INVALIDA' }), '401 AUTORIZACION_INVALIDA')
ok(cv.esCreditoVencidoError({ statusCode: 409, code: 'CREDITO_VENCIDO' }), '409 CREDITO_VENCIDO')
ok(cv.esCreditoVencidoError({ statusCode: 409, code: 'SALDO_FAVOR_VENCIDO' }), '409 SALDO_FAVOR_VENCIDO')
ok(!cv.esCreditoVencidoError({ statusCode: 409, code: 'OTRO' }), '409 sin code conocido -> genérico (origen ERPNext)')
eq(cv.AUTORIZACION_INVALIDA_MSG, 'Código inválido o sin permiso para autorizar esta acción.', 'mensaje genérico §6.3 (no revela causa)')

// ─── (b) §2 Configuración por tenant ─────────────────────────────────────────
console.log('§2 configuración:')
for (const f of ['creditoVigenciaDias', 'creditoUso', 'creditoRemanenteUnico', 'saldoFavorVigenciaDias', 'saldoVencidoCuenta']) {
  tiene('src/shared/api/types.ts', f, `FacturacionConfig trae ${f}`)
}
tiene('src/features/config/ConfigPage.tsx', 'Notas de crédito y saldos a favor', 'sección en Configuración → Facturación')
tiene('src/features/config/ConfigPage.tsx', "creditoUso === 'unico'", 'remanente solo visible con uso único')
tiene('src/features/config/ConfigPage.tsx', 'debe indicar la cuenta de saldos vencidos', 'validación unico+perder sin cuenta (caso §10.2)')
tiene('src/features/config/ConfigPage.tsx', 'saldoVencidoCuenta: saldoVencidoCuenta || null', 'quitar la cuenta manda null explícito')
tiene('src/features/config/ConfigPage.tsx', 'rootType="Income"', 'selector de cuentas de ingreso (hoja)')
tiene('src/features/config/ConfigPage.tsx', 'Consulte con su contador el tratamiento fiscal', 'advertencia al activar «perder»')
tiene('src/features/config/ConfigPage.tsx', '0 = no vencen', 'ayuda «0 = no vencen»')

// ─── (b) §3 Campos y totales ─────────────────────────────────────────────────
console.log('§3 campos:')
for (const f of ['venceEl', 'diasRestantes', 'estado', 'puedeAplicar', 'uso', 'remanente', 'origenSaldoFavor']) {
  tiene('src/shared/api/types.ts', f, `tipos traen ${f}`)
}
tiene('src/shared/api/types.ts', 'vencidoAmount', 'totales traen vencidoAmount')
tiene('src/shared/api/types.ts', 'SOLO lo aplicable hoy', 'balance documentado como aplicable')
tiene('src/shared/ui/CreditoEstadoBadge.tsx', 'CreditoEstadoBadge', 'badge reutilizable (sin estado no renderiza)')

// ─── (b) §4 Pantallas ────────────────────────────────────────────────────────
console.log('§4 pantallas:')
tiene('src/features/invoicing/CreditNotesPage.tsx', 'Vence', 'columna Vence en listado (§10.5: vacío = «—»)')
tiene('src/features/invoicing/CreditNotesPage.tsx', 'CreditoEstadoBadge', 'badge de vigencia en listado')
tiene('src/features/invoicing/CreditNotesPage.tsx', 'puedeAplicar', 'Aplicar habilitado por puedeAplicar')
tiene('src/features/invoicing/CreditNotesPage.tsx', 'creditoNoAplicableTooltip', 'nota vencida deshabilitada con motivo, no oculta')
tiene('src/features/invoicing/CreditNotesPage.tsx', 'estadoVigencia', 'filtro cliente por estado (sin filtro de servidor, §11)')
tiene('src/features/invoicing/CreditNoteDetail.tsx', 'Vigencia y uso', 'bloque Vigencia y uso en detalle')
tiene('src/features/invoicing/CreditNoteDetail.tsx', 'El sobrante de esta nota pasó a saldo a favor', 'origenSaldoFavor en detalle')
tiene('src/features/invoicing/CreditNoteDetail.tsx', 'CreditoAccionesButtons', 'botonera §5.4 en detalle')
tiene('src/features/invoicing/InvoiceDetail.tsx', 'vencidoAmount', 'vencido aparte en factura (§3.3, §10.8)')
tiene('src/features/invoicing/InvoiceDetail.tsx', 'No aplicable', 'filas vencidas deshabilitadas en factura (§4.2)')
tiene('src/features/invoicing/InvoiceDetail.tsx', 'ReactivarBotonInline', '«Reactivar» en filas vencidas (§4.2)')
tiene('src/features/invoicing/InvoiceDetail.tsx', 'origenSaldoFavor', 'nota refrescada tras someter (§4.3: submit invalida)')
tiene('src/features/customers/CustomerDetail.tsx', 'vencido', 'vencido aparte en cliente (§3.3)')
tiene('src/features/customers/CustomerDetail.tsx', 'CreditoEstadoBadge', 'badge por fila en cliente')
tiene('src/features/invoicing/CreditNoteActionModals.tsx', 'uso único', 'aviso de sobrante en aplicar (§10.10)')
tiene('src/features/invoicing/CreditNoteActionModals.tsx', 'Entiendo qué pasará con el sobrante', 'confirmación del sobrante (no bloquea parcial)')
tiene('src/features/invoicing/CreditNoteActionModals.tsx', 'esUsoUnicoConsumidoError', 'nota de uso único ya aplicada (§10.11)')

// ─── (b) §5 Las tres acciones × dos familias ─────────────────────────────────
console.log('§5 acciones:')
for (const r of ['reactivar', 'vencimiento', 'dar-de-baja']) {
  tiene('src/shared/api/endpoints.ts', r, `ruta de notas …/${r}`)
  tiene('src/shared/api/notes.ts', r === 'reactivar' ? 'reactivarCreditNote' : r === 'vencimiento' ? 'cambiarVencimientoCreditNote' : 'darDeBajaCreditNote', `API notas ${r}`)
}
for (const f of ['reactivarSaldoFavor', 'cambiarVencimientoSaldoFavor', 'darDeBajaSaldoFavor']) {
  tiene('src/shared/api/cobros.ts', f, `API saldos ${f}`)
}
tiene('src/shared/api/types.ts', 'ReactivarCreditoDto', 'DTO reactivar (motivo obligatorio)')
tiene('src/shared/api/types.ts', 'CambiarVencimientoDto', 'DTO cambiar (venceEl obligatorio, null = quitar)')
tiene('src/shared/api/types.ts', 'DarDeBajaDto', 'DTO baja')
tiene('src/shared/api/types.ts', 'AccionCreditoResult', 'resultado común (sinCambios, autorizadoConCodigo)')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'Usar la vigencia configurada', 'reactivar: vigencia configurada por default (§5.1)')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'Se revertirá el asiento de baja', 'aviso de reversión en perdido (§5.1)')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'Sin vencimiento', 'quitar vencimiento manda null (§5.2)')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'Se puede revertir reactivando', 'confirmación con monto en baja (§5.3)')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'Ir a Configuración', 'baja sin cuenta enlaza a configuración')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'Ya estaba vigente — sin cambios', 'idempotencia sinCambios (§5)')
noTiene('src/features/invoicing/CreditoAccionModals.tsx', "'agotado'", 'reactivar oculta en agotado (solo vencido/perdido) — ver puedeReactivar')

// ─── (b) §6 Autorización con código ───────────────────────────────────────────
console.log('§6 autorización:')
tiene('src/shared/hooks/useAccionConAutorizacion.ts', 'onSubmitInline', 'hook reutilizable con reintento inline')
tiene('src/shared/hooks/useAccionConAutorizacion.ts', 'admiteAutorizacionPin', 'abre modal solo con admiteAutorizacionPin')
tiene('src/shared/hooks/useAccionConAutorizacion.ts', 'Autorización requerida', 'título «Autorización requerida — …»')
tiene('src/shared/hooks/useAccionConAutorizacion.ts', 'Pida a un supervisor', 'aviso de usuario distinto')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'Autorizado por', 'toast «Autorizado por …» (§6.4)')
tiene('src/features/invoicing/CreditoAccionModals.tsx', 'onSubmitInline={pin.onSubmitInline}', 'reutiliza el PinModal existente (§6.2)')
noTiene('src/shared/hooks/useAccionConAutorizacion.ts', 'verifyAdminPin(', 'NO verifica por separado (§6.2, §9)')
noTiene('src/shared/hooks/useAccionConAutorizacion.ts', 'localStorage.setItem', 'PIN nunca en localStorage (§6.2, §9)')
noTiene('src/features/invoicing/CreditoAccionModals.tsx', 'verifyAdminPin(', 'modales NO llaman a verify-admin-pin (§9)')

// ─── (b) §7/§8/§9 reglas, errores y prohibiciones ─────────────────────────────
console.log('§7/§8/§9:')
noTiene('src/lib/creditoVencimiento.ts', 'diasRestantes:', 'la UI no recalcula días restantes (§9)')
tiene('src/features/invoicing/CreditNoteActionModals.tsx', 'CREDITO_VENCIDO', 'reembolso vencido ofrece reactivar (§4.4)')
tiene('src/features/invoicing/InvoiceDetail.tsx', '/venci/i', 'submit bloqueado por crédito vencido muestra mensaje (§4.3)')
for (const c of ['CREDITO_VENCIDO', 'SALDO_FAVOR_VENCIDO', 'CREDITO_USO_UNICO_CONSUMIDO', 'CREDITO_DADO_DE_BAJA', 'PERMISO_REQUERIDO', 'AUTORIZACION_INVALIDA']) {
  tiene('src/shared/api/types.ts', c, `código ${c} tipado (§8)`)
}
ok(!existsSync(`${ROOT}/src/shared/api/saldos-unificados.ts`), 'sin endpoint unificado inventado (§9, §11)')

// ─── (b) Regresión (§10.21): flujos sin vencimiento intactos ──────────────────
console.log('regresión:')
tiene('src/features/invoicing/CreditNoteActionModals.tsx', 'refundCreditNote', 'reembolso histórico intacto')
tiene('src/features/invoicing/CreditNoteActionModals.tsx', 'removerCreditNoteAplicada', 'deshacer aplicación intacto')
tiene('src/shared/api/invoices.ts', 'aplicar-saldo-favor', 'aplicar anticipo intacto')
tiene('src/features/invoicing/CreditNotesPage.tsx', '?? true', 'puedeAplicar ausente = habilitado (tenant sin configurar, §10.5)')

console.log(`\ne2e-vencimiento-saldos-favor: ${n} checks verdes`)
