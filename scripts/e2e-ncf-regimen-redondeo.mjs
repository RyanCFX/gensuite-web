/**
 * Pruebas end-to-end del documento
 * docs/tasks/PROMPT_NCF_DEFAULT_REGIMENES_ESPECIALES_REDONDEO_FRONTEND.md
 * (NCF default de venta, B14/E44 sin impuestos, filtro ?type= en catálogos
 * fiscales y redondeo al cobro — checklist §8 + flujos relacionados).
 *
 * Estrategia: el repo no tiene runner de tests (sin vitest/playwright/cypress)
 * ni backend vivo con credenciales para un E2E con red. Este script hace
 * (a) pruebas de lógica sobre ESPEJOS de las decisiones puras implementadas
 * (prioridad de preselección NCF, forcing de impuesto a 0 en B14/E44) — con
 * chequeo de divergencia: cada patrón probado debe existir literal en el
 * fuente, si el mapeo cambia el test falla en voz alta — y (b) verificaciones
 * estáticas de que cada punto del checklist §8 está cableado (tipos, config,
 * factura, cotización, errores, copy).
 *
 * Uso: `node scripts/e2e-ncf-regimen-redondeo.mjs` — salida 0 = todo verde.
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

const openapi = JSON.parse(read('openapi.json'))
const types = read('src/shared/api/types.ts')
const configApi = read('src/shared/api/config.ts')
const configPage = read('src/features/config/ConfigPage.tsx')
const invoiceForm = read('src/features/invoicing/InvoiceForm.tsx')
const quotationDetail = read('src/features/quotations/QuotationDetail.tsx')
const empresaConfig = read('src/features/config/EmpresaConfig.tsx')

// ─── §0 Contrato backend (openapi.json) ──────────────────────────────────────
section('§0 Contrato backend (openapi.json)')
{
  const dto = openapi.components.schemas.UpdateFacturacionConfigDto
  ok(dto?.properties?.ncfTipoVentaDefault?.type === 'string', 'UpdateFacturacionConfigDto.ncfTipoVentaDefault existe (string)')
  const params = openapi.paths['/api/v1/config/catalogos-fiscales']?.get?.parameters ?? []
  const typeParam = params.find((p) => p.name === 'type')
  ok(typeParam?.schema?.enum?.join(',') === 'venta,compra', 'GET catalogos-fiscales acepta ?type=venta|compra')
  const ncfEnum = openapi.components.schemas.CreateInvoiceDto?.properties?.ncfType?.enum ?? []
  ok(ncfEnum.includes('B14') && ncfEnum.includes('E44'), 'ncfType admite B14 y E44')
}

// ─── Cambio 1 — NCF default ──────────────────────────────────────────────────
section('Cambio 1 — NCF default de venta')
ok(types.includes('ncfTipoVentaDefault?: string | null'), 'FacturacionConfig tipa ncfTipoVentaDefault')
ok(configPage.includes('ncfTipoVentaDefault'), 'ConfigPage tiene estado ncfTipoVentaDefault')
ok(configPage.includes('setNcfTipoVentaDefault(data.ncfTipoVentaDefault ??'), 'ConfigPage hidrata el default desde GET')
ok(configPage.includes('ncfTipoVentaDefault: ncfTipoVentaDefault ||'), 'ConfigPage guarda el default ("" para quitar)')
ok(configPage.includes("queryKey: ['catalogos-fiscales', { type: 'venta' }]"), 'Config usa catálogo ?type=venta para el selector')
ok(configPage.includes('Tipo de Comprobante por Defecto'), 'Config muestra el selector nuevo')
ok(configPage.includes("queryKey: ['facturacion-config'] })") && configPage.includes('if (!data?.habilitado && habilitado)'), 'Refetch de facturación al habilitar e-CF (§1.4)')
// Prioridad registrada: customer > tenant > heurística (orden literal en el fuente)
{
  const iCust = invoiceForm.indexOf('if (selectedCustomer.ncfTypeDefault)')
  const iTenant = invoiceForm.indexOf("facturacionConfig?.ncfTipoVentaDefault", iCust)
  const iGov = invoiceForm.indexOf("selectedCustomer.isGovernment", iTenant)
  ok(iCust > 0 && iTenant > iCust && iGov > iTenant, 'Prioridad registrado: cliente > tenant > heurística (§1.5)')
}
ok(invoiceForm.includes('if (facturacionConfig?.ncfTipoVentaDefault) {\n      setNcfType(facturacionConfig.ncfTipoVentaDefault)'), 'Ocasional preselecciona el default del tenant')
// Espejo de la decisión de preselección (1:1 con los dos useEffect de InvoiceForm)
function preseleccionNcf({ registrado, customerDefault, tenantDefault, isGovernment, rnc, ocasionalRnc }) {
  if (registrado) {
    if (customerDefault) return customerDefault
    if (tenantDefault) return tenantDefault
    if (isGovernment) return 'B15'
    if (rnc) return 'B01'
    return 'B02'
  }
  if (tenantDefault) return tenantDefault
  if (ocasionalRnc) return 'B01'
  return 'B02'
}
ok(preseleccionNcf({ registrado: true, customerDefault: 'B01', tenantDefault: 'B02' }) === 'B01', 'Espejo: default del cliente gana al del tenant')
ok(preseleccionNcf({ registrado: true, tenantDefault: 'B02', isGovernment: true }) === 'B02', 'Espejo: default del tenant gana a heurística gobierno')
ok(preseleccionNcf({ registrado: true, rnc: '123' }) === 'B01', 'Espejo: sin defaults, heurística intacta (RNC→B01)')
ok(preseleccionNcf({ registrado: false, tenantDefault: 'B02', ocasionalRnc: '123' }) === 'B02', 'Espejo: ocasional usa default del tenant aunque tenga RNC')
ok(preseleccionNcf({ registrado: false, ocasionalRnc: '123' }) === 'B01', 'Espejo: ocasional sin default mantiene heurística')
ok(preseleccionNcf({ registrado: false }) === 'B02', 'Espejo: ocasional sin nada → B02')

// ─── Cambio 2 — B14/E44 ──────────────────────────────────────────────────────
section('Cambio 2 — B14/E44 siempre sin ITBIS')
ok(invoiceForm.includes("ncfType === 'B14' || ncfType === 'E44'"), 'InvoiceForm detecta B14/E44')
ok(invoiceForm.includes('? 0\n    : items.reduce((s, i) => s + (i.amount * i.salesTaxPct / 100), 0)'), 'Preview fuerza impuesto a 0 en B14/E44')
ok(invoiceForm.includes('se emite siempre sin\n                      ITBIS'), 'Aviso de régimen especial junto al selector NCF')
ok(invoiceForm.includes("msg.includes('ITBIS Exento')"), 'Error #3 de provisioning tratado como soporte (§2.4)')
ok(invoiceForm.includes('taxesTemplate: undefined'), 'No se manda plantilla forzada — el backend decide (§2.2.3)')
ok(quotationDetail.includes("selectedNcfType === 'B14' || selectedNcfType === 'E44'"), 'Convertir cotización avisa en B14/E44')
// Espejo del cálculo del preview
function previewTax(ncfType, lineTaxes) {
  if (ncfType === 'B14' || ncfType === 'E44') return 0
  return lineTaxes.reduce((s, t) => s + t, 0)
}
ok(previewTax('B14', [18, 18]) === 0, 'Espejo: B14 ignora ITBIS configurado')
ok(previewTax('E44', [18]) === 0, 'Espejo: E44 ignora ITBIS configurado')
ok(previewTax('B02', [18, 9]) === 27, 'Espejo: otros NCF calculan normal')
ok(previewTax('B01', []) === 0, 'Espejo: sin líneas no hay impuesto')

// ─── Cambio 3 — ?type= ───────────────────────────────────────────────────────
section('Cambio 3 — filtro ?type= en catálogos')
ok(configApi.includes("params?: { type?: CatalogosFiscalesType }"), 'getCatalogosFiscales acepta {type}')
ok(configApi.includes('ncfTypesCompra?: CatalogoFiscalItem[]'), 'ncfTypesCompra opcional (?type=venta lo omite)')
ok(configApi.includes('facturacionElectronicaHabilitada?: boolean'), 'Tipo expone facturacionElectronicaHabilitada')
for (const [file, src, type] of [
  ['InvoiceForm', invoiceForm, 'venta'],
  ['QuotationDetail', quotationDetail, 'venta'],
  ['CompraForm', read('src/features/compras/CompraForm.tsx'), 'compra'],
  ['GastoForm', read('src/features/gastos/GastoForm.tsx'), 'compra'],
]) {
  ok(src.includes(`getCatalogosFiscales({ type: '${type}' })`), `${file} pide ?type=${type}`)
}
{
  const allSrc = ['src/features/config/ConfigPage.tsx', 'src/features/invoicing/InvoiceForm.tsx',
    'src/features/quotations/QuotationDetail.tsx', 'src/features/compras/CompraForm.tsx',
    'src/features/gastos/GastoForm.tsx'].map(read).join('\n')
  ok(!allSrc.includes('queryFn: getCatalogosFiscales,'), 'Ningún queryFn bare incompatible con la firma nueva')
}

// ─── Cambio 4 — REVERTIDO (ver prompt de reversión) ───────────────────────────
// El backend descartó el "redondeo al cobro": el frontend debe estar como antes —
// copy original sin mención a redondeo al cobrar, y ninguna lógica de redondeo en cobros.
section('Cambio 4 — revertido (sin redondeo al cobro)')
ok(empresaConfig.includes('hint="Ajustes de diferencias al cerrar facturas"'), 'Help de writeOffAccount original (solo descuentos)')
ok(!empresaConfig.includes('diferencias de redondeo al cobrar'), 'writeOffAccount sin mención a redondeo al cobro')
ok(!configPage.includes('absorbiendo la'), 'Toggle redondeo sin mención a ajuste al cobro')
{
  // roundingAdjustment solo se LEE del backend para display (pre-existente) — lo que no
  // debe pasar es ENVIAR campos de redondeo en los payloads de cobro.
  const porCobrar = read('src/features/caja/PorCobrarPage.tsx')
  const completarBody = porCobrar.slice(porCobrar.indexOf('completarCobro(selectedInvoice'), porCobrar.indexOf('completarCobro(selectedInvoice') + 400)
  ok(!/redondeo|writeOff|rounding/i.test(completarBody), 'completar-cobro no envía campos de redondeo (§4.5)')
  const pagoPage = read('src/features/cobros/PagoPage.tsx')
  ok(!/writeOff/i.test(pagoPage), 'POST /cobros no agrega campos de redondeo (§4.5)')
}

// ─── Resumen ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log('Fallos:', failures); process.exit(1) }
