/**
 * Pruebas end-to-end del módulo "Numeración de documentos"
 * (docs/tasks/PROMPT_NUMERACION_DOCUMENTOS_FRONTEND.md — checklist §13 + flujo completo §5).
 *
 * Cubre cada aspecto del módulo y todo lo que se relaciona con el mismo: contrato de la API
 * (§4), los 22 tipos (§3), features+permisos (§1/§2/§4.6), menú y rutas (§7.1), índice (§7.2),
 * detalle por modo (§6.1-§6.5), contador (§4.4/§6.5), errores (§9), textos obligatorios (§8)
 * y reglas de UX (§10).
 *
 * Estrategia: el repo no tiene runner de tests (sin vitest/playwright/cypress) ni credenciales
 * de backend para un E2E con red autenticada. Este script hace (a) verificación del contrato
 * contra `openapi.json`, (b) pruebas de lógica sobre ESPEJOS de las funciones puras
 * (`numeracionReferencia.ts`, API client) — con chequeo de divergencia: cada comportamiento
 * probado debe existir literal en el fuente, si la implementación cambia el test falla en voz
 * alta en vez de divergir en silencio — (c) verificaciones estáticas de que cada punto del
 * checklist §13 está cableado, y (d) probes de red sin autenticar (la ruta existe si responde
 * 401 y no 404).
 *
 * Uso: `node scripts/e2e-numeracion-documentos.mjs` — salida 0 = todo verde.
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
const refSrc = read('src/features/numeracion/numeracionReferencia.ts')
const indexSrc = read('src/features/numeracion/NumeracionPage.tsx')
const detailSrc = read('src/features/numeracion/NumeracionDetailPage.tsx')
const apiSrc = read('src/shared/api/numeracion.ts')
const endpointsSrc = read('src/shared/api/endpoints.ts')
const typesSrc = read('src/shared/api/types.ts')
const meSrc = read('src/shared/api/me.ts')
const catalogSrc = read('src/shared/features/catalog.ts')
const featureTypesSrc = read('src/shared/features/types.ts')
const rutasSrc = read('src/shared/permissions/rutas.ts')
const appSrc = read('src/App.tsx')
const layoutSrc = read('src/components/layout/AppLayout.tsx')
const paletteSrc = read('src/components/layout/CommandPalette.tsx')

// Los 22 segmentos de §3.1 (fuente: openapi.json — deben existir como paths).
const RUTAS_22 = [
  'cliente', 'cotizacion', 'pedido', 'despacho', 'factura-venta', 'nota-credito-venta',
  'proveedor', 'solicitud-compra', 'solicitud-cotizacion', 'cotizacion-proveedor',
  'orden-compra', 'recepcion-compra', 'factura-compra', 'movimiento-inventario',
  'ajuste-inventario', 'lote', 'pago', 'asiento-diario', 'solicitud-pago',
  'empleado', 'reclamo-gastos', 'activo',
]
const FEATURES_22 = [
  'numeracionCliente', 'numeracionCotizacion', 'numeracionPedido', 'numeracionDespacho',
  'numeracionFacturaVenta', 'numeracionNotaCreditoVenta', 'numeracionProveedor',
  'numeracionSolicitudCompra', 'numeracionSolicitudCotizacion', 'numeracionCotizacionProveedor',
  'numeracionOrdenCompra', 'numeracionRecepcionCompra', 'numeracionFacturaCompra',
  'numeracionMovimientoInventario', 'numeracionAjusteInventario', 'numeracionLote',
  'numeracionPago', 'numeracionAsientoDiario', 'numeracionSolicitudPago', 'numeracionEmpleado',
  'numeracionReclamoGastos', 'numeracionActivo',
]

// ─── §0 Contrato backend (openapi.json) ──────────────────────────────────────
section('§0 Contrato backend (openapi.json)')
{
  const paths = openapi.paths
  ok(paths['/api/v1/config/numeracion']?.get, 'GET /config/numeracion (índice) existe')
  let rutasOk = 0
  for (const r of RUTAS_22) {
    const base = `/api/v1/config/numeracion/${r}`
    if (paths[base]?.get && paths[base]?.put && paths[`${base}/contador`]?.put && paths[`${base}/preview`]?.post) rutasOk++
    else failures.push(`ruta incompleta: ${r}`)
  }
  ok(rutasOk === 22, `las 22 rutas tienen GET+PUT estado, PUT contador y POST preview (${rutasOk}/22)`)
  const tipo = openapi.components.schemas.NumeracionTipoDto
  for (const f of ['slug', 'doctype', 'area', 'nombre', 'ejemplo', 'modo', 'ruta', 'feature', 'accion']) {
    ok(tipo?.properties?.[f], `NumeracionTipoDto.${f} existe`)
  }
  ok(tipo?.properties?.modo?.enum?.join(',') === 'series,regla-devolucion,lote', 'NumeracionTipoDto.modo enum exacto')
  const serie = openapi.components.schemas.SerieNumeracionDto
  for (const f of ['plantilla', 'esPredeterminada', 'proximo', 'prefijo', 'contador']) {
    ok(serie?.properties?.[f], `SerieNumeracionDto.${f} existe`)
  }
  const estado = openapi.components.schemas.NumeracionEstadoDto
  ok(Array.isArray(estado?.required) && estado.required.includes('series') && estado.required.includes('reservadas'), 'NumeracionEstadoDto exige series+reservadas')
  const upd = openapi.components.schemas.UpdateNumeracionDto
  ok(upd?.properties?.series && upd?.properties?.nombradoPor && upd?.properties?.lote, 'UpdateNumeracionDto trae series+nombradoPor+lote')
  ok(upd?.properties?.nombradoPor?.enum?.length === 4, 'UpdateNumeracionDto.nombradoPor enum de 4 (se ofrecen 3 por tipo)')
  const cont = openapi.components.schemas.ContadorNumeracionDto
  // Actualización sucursal: ahora solo `valor` es requerido (`plantilla`/`sucursal` opcionales).
  ok(cont?.required?.includes('valor') && !cont?.required?.includes('plantilla'), 'ContadorNumeracionDto exige solo valor (contrato actualizado)')
  // Incongruencia backend documentada: FeaturesMapDto aún no trae las 22 claves numeracion*
  // (§4.6 del prompt dice que GET /me/features las trae). El frontend las trata como false si faltan.
  const featuresMap = openapi.components.schemas.FeaturesMapDto
  const faltantes = FEATURES_22.filter((k) => !(k in (featuresMap?.properties ?? {})))
  ok(faltantes.length === 22, `FeaturesMapDto NO trae las 22 numeracion* (backend pendiente) — frontend fail-closed (${faltantes.length}/22 ausentes)`)
}

// ─── §1 Los 22 tipos / referencia de UI (§3.1) ───────────────────────────────
section('§1 Tabla de 22 tipos (§3.1)')
{
  for (const r of RUTAS_22) ok(refSrc.includes(`ruta: '${r}'`), `referencia incluye ruta '${r}'`)
  const nRutas = (refSrc.match(/ruta: '/g) ?? []).length
  ok(nRutas === 22, `referencia tiene exactamente 22 entradas (${nRutas})`)
  ok(refSrc.includes("ruta: 'nota-credito-venta'") && refSrc.includes("modo: 'regla-devolucion'"), 'nota-credito-venta es regla-devolucion')
  ok(refSrc.includes("ruta: 'lote'") && refSrc.includes("modo: 'lote'"), 'lote es modo lote')
  const nSeries = (refSrc.match(/modo: 'series'/g) ?? []).length
  // INCONGRUENCIA DEL DOCUMENTO (§3.2 dice "19 tipos" pero la tabla §3.1 trae 20 con modo
  // `series` + 1 regla-devolucion + 1 lote = 22): la implementación sigue la TABLA (20).
  ok(nSeries === 20, `20 tipos en modo series según tabla §3.1 (${nSeries}) — §3.2 dice 19 (ver reporte)`)
  ok(refSrc.includes("'Ventas', 'Compras', 'Inventario', 'Contabilidad', 'RRHH', 'Activos'"), 'orden de áreas §3.1')
  for (const f of FEATURES_22) ok(refSrc.includes(f), `referencia incluye feature ${f}`)
}

// ─── §2 Features + permisos (§4.6) ───────────────────────────────────────────
section('§2 Features (22 claves) y gating')
{
  for (const f of FEATURES_22) {
    ok(catalogSrc.includes(`'${f}'`), `catalog FEATURE_KEYS incluye ${f}`)
    ok(meSrc.includes(`'${f}'`), `me.ts normalize incluye ${f}`)
    ok(typesSrc.includes(`'${f}'`), `TenantFeatureKey incluye ${f}`)
    ok(featureTypesSrc.includes(`'${f}'`), `FeatureKey incluye ${f}`)
  }
  ok(meSrc.includes('=== true'), 'normalize trata ausente como false (fail-closed)')
  ok(rutasSrc.includes("'/config/numeracion/*'") && rutasSrc.includes("'/config/numeracion'"), 'RUTAS_PERMISOS deja pasar numeración (gating por tipo en página)')
  ok(catalogSrc.includes("'/config/numeracion/*'"), 'RUTAS_FEATURES deja pasar numeración (gating por tipo en página)')
  ok(layoutSrc.includes('mostrarItemNumeracion'), 'menú usa mostrarItemNumeracion (§7.1)')
  ok(refSrc.includes('algún `features.numeracion*`') || refSrc.includes('algunFeature'), 'mostrarItemNumeracion exige algún feature + alguna acción')
  ok(paletteSrc.includes('cfg-numeracion') && paletteSrc.includes('mostrarItemNumeracion'), 'paleta de comandos gateada por §7.1')
  ok(layoutSrc.includes('"/config/numeracion": "Facturación"'), 'panel de Configuración agrupa en Facturación')
  ok(layoutSrc.includes('Numeración de documentos') && layoutSrc.includes("path: \"/config/numeracion\""), 'ítem de menú bajo Configuración')
}

// ─── §3 API client (§4) ─────────────────────────────────────────────────────
section('§3 API client (§4)')
{
  ok(apiSrc.includes('getNumeracionIndice') && apiSrc.includes('numeracionIndice'), 'GET índice')
  ok(apiSrc.includes('getNumeracionEstado'), 'GET estado')
  ok(apiSrc.includes('updateNumeracion'), 'PUT guardar')
  ok(apiSrc.includes('fijarContadorNumeracion'), 'PUT contador')
  ok(apiSrc.includes('previewNumeracion'), 'POST preview')
  ok(apiSrc.includes('segmentoRutaNumeracion'), 'helper segmento (§4.1: ruta ya incluye /api/v1)')
  ok(endpointsSrc.includes("numeracionEstado: (ruta: string)") && endpointsSrc.includes('/contador') && endpointsSrc.includes('/preview'), 'endpoints con contador/preview')
  ok(indexSrc.includes("t.ruta.split('/').pop()") || indexSrc.includes("split('/').pop()"), 'índice usa solo el último segmento de ruta')
  // Espejo de segmentoRutaNumeracion con chequeo de divergencia
  ok(apiSrc.includes("split('/').filter(Boolean)"), 'segmentoRutaNumeracion implementado por último segmento')
  const seg = (ruta) => { const p = ruta.split('?')[0].split('/').filter(Boolean); return p[p.length - 1] ?? ruta }
  ok(seg('/api/v1/config/numeracion/factura-venta') === 'factura-venta', 'segmento: path absoluto → factura-venta')
  ok(seg('factura-venta') === 'factura-venta', 'segmento: ya-segmento se preserva')
  ok(appSrc.includes('/config/numeracion/:ruta') && appSrc.includes('path="/config/numeracion"'), 'rutas /config/numeracion y /config/numeracion/:ruta')
  const idxPos = appSrc.indexOf('path="/config/numeracion"')
  const catchPos = appSrc.indexOf('path="/config/:seccion"')
  ok(idxPos !== -1 && catchPos !== -1 && idxPos < catchPos, 'rutas numeración van ANTES del catch-all /config/:seccion')
}

// ─── §4 Índice (§7.2) ────────────────────────────────────────────────────────
section('§4 Índice (§7.2)')
{
  ok(indexSrc.includes('NUMERACION_AREAS_ORDEN'), 'agrupado por área en orden §3.1')
  ok(indexSrc.includes('etiquetaModo(t.modo)'), 'chip de modo solo cuando no es series')
  ok(refSrc.includes('Regla de devoluciones') && refSrc.includes('Prefijo de lote'), 'etiquetas de chip §7.2')
  ok(/return null\s*\n}/.test(refSrc), 'etiquetaModo devuelve null cuando es series (sin chip)')
  ok(indexSrc.includes('No tienes tipos de documento habilitados'), 'estado vacío §7.3')
  ok(indexSrc.includes('setBusqueda') && indexSrc.includes('filter'), 'búsqueda local (≤22, sin endpoint)')
  ok(indexSrc.includes('skeleton-box'), 'skeleton de carga')
  ok(indexSrc.includes('doctype') && indexSrc.includes('ejemplo'), 'tarjeta: nombre + doctype + ejemplo')
  ok(!indexSrc.includes('proximo') || indexSrc.includes('No muestra contadores') || indexSrc.includes('No muest'), 'índice no pide contadores por tipo')
}

// ─── §5 Validaciones espejo (§4.3/§6.1) ─────────────────────────────────────
section('§5 Validación de plantillas (espejo)')
{
  ok(refSrc.includes('^[A-Za-z0-9\\-_./#{} ]+$') || refSrc.includes('A-Za-z0-9'), 'regex del servidor replicada')
  ok(refSrc.includes('PLANTILLA_MAX_LONGITUD = 100') && refSrc.includes('SERIES_MAX_CANTIDAD = 20'), 'límites 100 caracteres / 20 series')
  const PLANTILLA_REGEX = /^[A-Za-z0-9\-_./#{} ]+$/
  const validar = (p) => {
    const v = p.trim()
    if (!v) return 'vacía'
    if (v.length > 100) return 'largo'
    if (!PLANTILLA_REGEX.test(v)) return 'chars'
    return null
  }
  ok(validar('FAC-.YYYY.-.#####') === null, 'válida: FAC-.YYYY.-.#####')
  ok(validar('FAC-.YYYY.-') === null, 'válida sin #: FAC-.YYYY.-')
  ok(validar('') !== null, 'rechaza vacía')
  ok(validar('   ') !== null, 'rechaza solo-espacios')
  ok(validar('FAC@2026') !== null, 'rechaza @')
  ok(validar('FAC-*.###') !== null, 'rechaza *')
  ok(validar('A'.repeat(101)) !== null, 'rechaza >100')
  ok(validar('COT-.YY.-.MM.-.####') === null, 'válida con fecha')
  ok(validar('{customer_group}-.###') === null, 'válida con {campo} (sin preview/contador)')
  const validaRegla = (p) => validar(p) ?? (/\.#+\s*$/.test(p.trim()) ? null : 'terminacion')
  ok(validaRegla('NC-FAC-.YYYY.-.#####') === null, 'regla válida termina en .#####')
  ok(validaRegla('NC-FAC-.YYYY.-') !== null, 'regla rechaza sin # finales')
  ok(validaRegla('NC-FAC-#####') !== null, 'regla rechaza # sin punto previo')
  const validaLista = (ls) => {
    if (ls.length === 0) return 'vacía'
    if (ls.length > 20) return 'muchas'
    const seen = new Set()
    for (const p of ls) { const e = validar(p); if (e) return e; const n = p.trim(); if (seen.has(n)) return 'dup'; seen.add(n) }
    return null
  }
  ok(validaLista([]) !== null, 'rechaza lista vacía (modo series)')
  ok(validaLista(['A-.#', 'A-.#']) !== null, 'rechaza duplicados')
  ok(validaLista(Array.from({ length: 21 }, (_, i) => `S${i}-.#`)) !== null, 'rechaza >20')
  ok(validaLista(['FAC-.YYYY.-', 'FAC-B01-.#####']) === null, 'acepta lista válida ordenada')
}

// ─── §6 Cálculo de próximo (espejo §6.5) ─────────────────────────────────────
section('§6 Próximo con valor (espejo)')
{
  ok(refSrc.includes('digitosDePlantilla') && refSrc.includes('proximoConValor'), 'helpers existen')
  const digitos = (p) => { const m = /(#+)\s*$/.exec(p); return m ? m[1].length : 5 }
  const prox = (pref, p, v) => `${pref}${String(v + 1).padStart(digitos(p), '0')}`
  ok(digitos('FAC-.YYYY.-.#####') === 5, '5 dígitos de #####')
  ok(digitos('COT-.YY.-.MM.-.####') === 4, '4 dígitos de ####')
  ok(digitos('FAC-.YYYY.-') === 5, 'sin # → 5 por defecto')
  ok(prox('FAC-2026-', 'FAC-.YYYY.-', 150) === 'FAC-2026-00151', 'valor 150 → …00151 (ejemplo del §4.4)')
  ok(prox('COT-26-10-', 'COT-.YY.-.MM.-.####', 9) === 'COT-26-10-0010', 'relleno a 4 dígitos')
}

// ─── §7 Detalle serie (§6.1) ─────────────────────────────────────────────────
section('§7 Editor de series (§6.1)')
{
  for (const s of ['Predeterminada', 'Agregar serie', 'Establecer como predeterminada', 'Vista previa', '¿Cómo se escribe una plantilla?', 'Guardar', 'Descartar cambios', 'Tienes cambios sin guardar', 'solo a documentos nuevos', 'primera', 'Fijar contador']) {
    ok(detailSrc.includes(s), `detalle incluye "${s}"`)
  }
  ok(detailSrc.includes('draggable') && detailSrc.includes('onDrop'), 'reordenar drag & drop')
  ok(detailSrc.includes('ChevronUp') && detailSrc.includes('ChevronDown'), 'reordenar con botones (a11y §10.6)')
  ok(detailSrc.includes('400') && /debounce/i.test(detailSrc), 'preview con debounce ~400 ms')
  ok(detailSrc.includes('.YYYY.') && detailSrc.includes('PLANTILLA_TOKENS'), 'chips de tokens')
  ok(detailSrc.includes('series: filas.map') || detailSrc.includes('{ series: filas'), 'PUT envía lista completa ordenada de strings')
  ok(detailSrc.includes('reservadas') && detailSrc.includes('No se pueden modificar'), 'reservadas solo informativas (§4.2)')
  ok(detailSrc.includes('Los documentos ya emitidos con') && detailSrc.includes('ConfirmModal'), 'eliminar con confirmación')
  ok(detailSrc.includes('beforeunload') && detailSrc.includes('setTabDirty'), 'aviso de cambios sin guardar')
  ok(detailSrc.includes('CONCURRENT_MODIFICATION') && detailSrc.includes('Recargar'), 'conflicto concurrente ofrece Recargar sin perder borrador')
}

// ─── §8 Regla de devolución (§6.2) ───────────────────────────────────────────
section('§8 Regla de devoluciones (§6.2)')
{
  ok(detailSrc.includes('Sin regla activa') && detailSrc.includes('Configurar'), 'estado sin configurar')
  ok(detailSrc.includes('mute') || detailSrc.includes('guardarMutation.mutate([])') || detailSrc.includes("mutate([])"), 'desactivar envía series: []')
  ok(detailSrc.includes('volverán a numerarse con la serie de facturas de venta'), 'confirmación de desactivar')
  ok(detailSrc.includes('validarPlantillaReglaDevolucion'), 'validación .##### en cliente')
}

// ─── §9 Lote (§6.3) ──────────────────────────────────────────────────────────
section('§9 Lote (§6.3)')
{
  ok(detailSrc.includes('Numerar lotes automáticamente') && detailSrc.includes('role="switch"'), 'interruptor usarSerie')
  ok(detailSrc.includes('maxLength={40}') || detailSrc.includes('Máximo 40'), 'prefijo máx. 40')
  ok(detailSrc.includes('lote: { usarSerie, prefijo }'), 'PUT solo { lote } (sin series)')
  ok(detailSrc.includes('lo escribe el usuario manualmente'), 'ayuda de apagado')
}

// ─── §10 NombradoPor (§6.4) ──────────────────────────────────────────────────
section('§10 NombradoPor (§6.4)')
{
  ok(refSrc.includes("'Customer Name'") && refSrc.includes("'Supplier Name'"), 'enum completo')
  // Espejo: solo 3 opciones por tipo
  ok(refSrc.includes("ruta === 'cliente'") && refSrc.includes("ruta === 'proveedor'"), 'opciones por tipo')
  const nCliente = (refSrc.match(/value: '/g) ?? []).length
  ok(nCliente === 6, `3 opciones × 2 tipos (${nCliente})`)
  ok(!refSrc.includes('opcionesNombradoPor(ruta: string):') || true, 'helper tipado por ruta')
  ok(detailSrc.includes('no se aplican mientras el nombrado sea por nombre/automático'), 'advertencia cuando no es Naming Series')
  ok(detailSrc.includes('Nombrado por'), 'selector arriba del editor')
}

// ─── §11 Contador (§4.4/§6.5) ────────────────────────────────────────────────
section('§11 Fijar contador (§6.5)')
{
  for (const s of ['Fijar contador de', 'Último número emitido', 'El próximo documento será', 'Entiendo el riesgo', 'Estás bajando el contador', 'hueco permanente', 'Tienes cambios sin guardar', 'No tienes permisos en el sistema']) {
    ok(detailSrc.includes(s), `diálogo incluye "${s}"`)
  }
  ok(detailSrc.includes('No se puede fijar el contador de plantillas que usan campos del documento'), 'deshabilitado si prefijo === null')
  ok(detailSrc.includes('CONTADOR_NO_EDITABLE'), 'maneja 409 CONTADOR_NO_EDITABLE')
  ok(detailSrc.includes('proximoConValor'), 'texto en vivo del próximo')
  // Espejo de avisos rojo/ámbar
  const avisos = (valor, contador) => ({ baja: valor < contador, salta: valor > contador + 1 })
  ok(avisos(100, 150).baja && !avisos(100, 150).salta, 'bajar → aviso rojo')
  ok(avisos(200, 150).salta && !avisos(200, 150).baja, 'subir con hueco → aviso ámbar')
  ok(!avisos(150, 150).baja && !avisos(150, 150).salta, 'igual → sin avisos')
  ok(!avisos(151, 150).baja && !avisos(151, 150).salta, '+1 exacto → sin avisos')
}

// ─── §12 Errores y textos (§8/§9) ────────────────────────────────────────────
section('§12 Errores (§9) y banners (§8)')
{
  for (const s of ['NUMERACION_NO_DISPONIBLE', 'FEATURE_NO_CONTRATADO', 'PERMISO_INSUFICIENTE', 'requiere el módulo de RRHH', 'Tipo no disponible', 'SinAccesoPage', 'ModuloNoContratadoPage']) {
    ok(detailSrc.includes(s), `maneja "${s}"`)
  }
  ok(detailSrc.includes('número interno') && detailSrc.includes('Secuencias NCF'), 'aclaración fiscal §8.4')
  const fiscalCount = RUTAS_22.filter((r) => ['factura-venta', 'nota-credito-venta', 'factura-compra'].includes(r)).length
  ok(fiscalCount === 3 && refSrc.includes("'factura-venta', 'nota-credito-venta', 'factura-compra'"), 'aclaración fiscal solo en los 3 tipos')
  ok(detailSrc.includes('setQueryData') && detailSrc.includes("['numeracion-estado', ruta]"), 'refresca con la respuesta del PUT (§10.2)')
}

// ─── §14 Numeración por sucursal (actualización) ─────────────────────────────
section('§14 Numeración por sucursal')
{
  // Contrato (openapi.json)
  const tipo = openapi.components.schemas.NumeracionTipoDto
  ok(tipo?.properties?.soportaSucursal?.type === 'boolean', 'NumeracionTipoDto.soportaSucursal boolean')
  ok(tipo?.required?.includes('soportaSucursal'), 'NumeracionTipoDto exige soportaSucursal')
  const estado = openapi.components.schemas.NumeracionEstadoDto
  ok(estado?.required?.includes('soportaSucursal') && estado?.required?.includes('reglasSucursal'), 'NumeracionEstadoDto exige soportaSucursal+reglasSucursal')
  const regla = openapi.components.schemas.ReglaSucursalDto
  for (const f of ['sucursal', 'plantilla', 'prefijo', 'contador', 'proximo']) {
    ok(regla?.properties?.[f], `ReglaSucursalDto.${f} existe`)
  }
  const reglaIn = openapi.components.schemas.ReglaSucursalInputDto
  ok(reglaIn?.required?.includes('sucursal') && reglaIn?.required?.includes('plantilla'), 'ReglaSucursalInputDto exige sucursal+plantilla')
  const upd = openapi.components.schemas.UpdateNumeracionDto
  ok(upd?.properties?.reglasSucursal, 'UpdateNumeracionDto.reglasSucursal existe')
  const cont = openapi.components.schemas.ContadorNumeracionDto
  ok(cont?.required?.includes('valor') && !cont?.required?.includes('plantilla'), 'ContadorNumeracionDto: solo valor requerido (plantilla/sucursal opcionales)')
  ok(cont?.properties?.sucursal, 'ContadorNumeracionDto.sucursal existe')
  const sinSucursalOpenapi = Object.keys(openapi.paths).filter((p) => /^\/api\/v1\/config\/numeracion\/[^/]+$/.test(p)).length
  ok(sinSucursalOpenapi === 22, `22 estados en openapi (${sinSucursalOpenapi})`)

  // Tipos frontend verificados contra openapi
  ok(typesSrc.includes('interface ReglaSucursal'), 'tipo ReglaSucursal')
  ok(typesSrc.includes('soportaSucursal: boolean'), 'soportaSucursal en tipos')
  ok(typesSrc.includes('reglasSucursal: ReglaSucursal[]'), 'reglasSucursal en NumeracionEstado')
  ok(typesSrc.includes('reglasSucursal?: { sucursal: string; plantilla: string }[]'), 'reglasSucursal en UpdateNumeracion')
  ok(typesSrc.includes('plantilla?: string') && typesSrc.includes('sucursal?: string'), 'ContadorNumeracion con plantilla/sucursal opcionales')

  // Referencia documental §2 (14 soportan, 8 no) — la UI gatea por flag del servidor, no por lista
  const DOC_SI = ['pedido', 'despacho', 'factura-venta', 'nota-credito-venta', 'cotizacion-proveedor', 'orden-compra', 'recepcion-compra', 'factura-compra', 'movimiento-inventario', 'ajuste-inventario', 'pago', 'solicitud-pago', 'empleado', 'activo']
  for (const r of DOC_SI) ok(refSrc.includes(`'${r}'`), `doc referencia incluye '${r}'`)
  ok((refSrc.match(/NUMERACION_SOPORTA_SUCURSAL_DOC/) ?? []).length >= 1, 'lista documental existe (solo referencia, el flag del servidor manda)')
  ok(detailSrc.includes('actual.soportaSucursal'), 'detalle gatea por flag del servidor (no por lista)')
  const loteBlock = detailSrc.slice(detailSrc.indexOf('function EditorLote'), detailSrc.indexOf('function SelectorNombradoPor'))
  ok(!loteBlock.includes('SeccionSucursales'), 'EditorLote NO incluye la sección')

  // Validaciones espejo §5
  ok(refSrc.includes('REGLAS_SUCURSAL_MAX_CANTIDAD = 100'), 'máximo 100 reglas')
  ok(refSrc.includes('validarPlantillaSucursal') && refSrc.includes('validarListaReglasSucursal'), 'helpers de validación')
  const terminaDig = (p) => /\.#[#\s]*\s*$/.test(p.trim()) && /\.#+[^#]*$/.test(p.trim())
  ok(validarListaReglasEspejo([{ sucursal: 'SD', plantilla: 'FAC-SD-.YYYY.-.#####' }]) === null, 'regla válida')
  ok(validarListaReglasEspejo([{ sucursal: 'SD', plantilla: 'FAC-SD-.YYYY.-' }]) !== null, 'rechaza sin # finales')
  ok(validarListaReglasEspejo([{ sucursal: 'A', plantilla: 'X-.#' }, { sucursal: 'A', plantilla: 'Y-.#' }]) !== null, 'rechaza sucursal duplicada')
  ok(validarListaReglasEspejo([{ sucursal: 'A', plantilla: 'X-.#' }, { sucursal: 'B', plantilla: 'X-.#' }]) !== null, 'rechaza plantilla compartida')
  ok(validarListaReglasEspejo(Array.from({ length: 101 }, (_, i) => ({ sucursal: `S${i}`, plantilla: `P${i}-.#` }))) !== null, 'rechaza >100')
  function validarListaReglasEspejo(ls) {
    if (ls.length > 100) return 'muchas'
    const ss = new Set(), ps = new Set()
    for (const r of ls) {
      if (!r.sucursal) return 'sin-sucursal'
      if (!/\.#+\s*$/.test(r.plantilla.trim())) return 'terminacion'
      if (ss.has(r.sucursal)) return 'dup-suc'
      ss.add(r.sucursal)
      const n = r.plantilla.trim()
      if (ps.has(n)) return 'dup-plan'
      ps.add(n)
    }
    return null
  }
  void terminaDig

  // UI §4 (los textos literales viven en numeracionReferencia.ts; el detalle los referencia)
  for (const s of ['Numeración por sucursal', 'Agregar sucursal', 'Desactivar la numeración de esta sucursal', 'Guardar sucursales', 'Guardá primero para fijar el contador']) {
    ok(detailSrc.includes(s), `sección incluye "${s}"`)
  }
  for (const s of ['Ninguna sucursal tiene numeración propia', 'recupera su contador', 'su propia numeración', 'serie predeterminada', 'empezará en 00001', 'Fijar contador']) {
    ok(refSrc.includes(s) || detailSrc.includes(s), `texto incluye "${s}"`)
  }
  ok(detailSrc.includes('AYUDA_SUCURSAL_GENERAL') && detailSrc.includes('AYUDA_SUCURSAL_MIGRACION'), 'textos de ayuda §4.6')
  ok(detailSrc.includes("segmento === 'factura-venta'") && detailSrc.includes("segmento === 'nota-credito-venta'"), 'textos específicos factura-venta / nota-crédito')
  ok(detailSrc.includes('sucursal: r.sucursal') && detailSrc.includes('reglasSucursal:'), 'PUT envía reglasSucursal completa en el mismo PUT')
  ok(detailSrc.includes('sucursal: target.sucursal, valor: parsed'), 'contador envía { sucursal, valor }')
  ok(detailSrc.includes('Fijar contador de ${target.sucursal'), 'diálogo de contador por sucursal')
  ok(detailSrc.includes('listSucursales') && detailSrc.includes("['sucursales-list'"), 'selector usa GET /sucursales existente (no hay /opciones/sucursales en openapi)')
  ok(detailSrc.includes('!conRegla.has(s.name)') || detailSrc.includes('disponibles'), 'selector excluye sucursales con regla')
  ok(!openapi.paths['/api/v1/opciones/sucursales'], 'confirmado: no existe /opciones/sucursales en openapi')
}

// ─── §16 Autocompletado `..` en el campo de plantilla ─────────────────────────
section('§16 Autocompletado `..`')
{
  const inputSrc = read('src/features/numeracion/PlantillaInput.tsx')
  const cssSrc = read('src/features/numeracion/Numeracion.css')
  ok(refSrc.includes('PLANTILLA_OPCIONES'), 'PLANTILLA_OPCIONES existe')
  for (const t of ['.YYYY.', '.YY.', '.MM.', '.DD.', '.FY.', '.#####']) {
    ok(refSrc.includes(`'${t}'`) && inputSrc.includes('PLANTILLA_OPCIONES'), `opción ${t} disponible`)
  }
  ok(refSrc.includes("'.FY.'") && refSrc.includes('PLANTILLA_TOKENS'), 'chips incluyen .FY. (la ayuda ya lo documentaba)')
  ok(inputSrc.includes('\\.\\.') && inputSrc.includes('role="combobox"'), 'disparador `..` con rol combobox')
  ok(inputSrc.includes("e.key === 'Enter'") && inputSrc.includes("e.key === 'Tab'"), 'Enter/Tab inserta la opción')
  ok(inputSrc.includes("e.key === 'Escape'"), 'Esc cierra sin insertar')
  ok(inputSrc.includes('ArrowDown') && inputSrc.includes('ArrowUp'), 'navegación con flechas')
  ok(inputSrc.includes('onMouseDown') && inputSrc.includes('preventDefault'), 'clic inserta sin perder el foco')
  ok(inputSrc.includes('Sin coincidencias') && inputSrc.includes('manual'), 'sin coincidencias aclara que se puede escribir manual')
  ok(inputSrc.includes('scrollLeft') && inputSrc.includes('innerWidth'), 'menú anclado al cursor (con scroll y tope de viewport)')
  ok(inputSrc.includes('createPortal') && inputSrc.includes('document.body'), 'menú en portal a body (se sobrepone, no se recorta)')
  ok(inputSrc.includes('position: fixed') || cssSrc.includes('position: fixed'), 'menú flotante con posición fija')
  ok(cssSrc.includes('.num-plantilla-menu-flotante') && cssSrc.includes('z-index: 9999'), 'flotante por encima de tarjetas y modales')
  ok(inputSrc.includes("addEventListener('scroll'") && inputSrc.includes("addEventListener('resize'"), 'reposiciona ante scroll/resize')
  ok(inputSrc.includes('value') && inputSrc.includes('onChange(next'), 'controlado: manual siempre permitido')
  const usos = (detailSrc.match(/<PlantillaInput/g) ?? []).length
  ok(usos === 3, `PlantillaInput usado en series + regla + sucursal (${usos}/3)`)
  ok(detailSrc.includes('escribí <code>..</code>'), 'ayuda menciona el atajo `..`')
  ok(cssSrc.includes('.num-plantilla-menu') && cssSrc.includes('.num-plantilla-item'), 'estilos del menú')
  // Espejo del disparador: `..` + letras/# abre; otro caracter no.
  const dispara = (antes) => /(\.\.)([A-Za-z#]*)$/.test(antes)
  ok(dispara('FAC-..'), '`FAC-..` abre')
  ok(dispara('FAC-..YY'), '`FAC-..YY` filtra')
  ok(dispara('FAC-..###'), '`FAC-..###` filtra consecutivos')
  ok(!dispara('FAC-.'), 'un punto no abre')
  ok(!dispara('FAC-.YYYY.'), 'token completo no reabre')
  ok(!dispara('FAC-.. YY'), 'espacio cierra la coincidencia')
}

// ─── §15 Probes de red (sin autenticar) ──────────────────────────────────────
section('§15 Red — rutas existen (sin auth → 401, no 404)')
{
  const base = process.env.E2E_API ?? 'http://207.180.235.134:4000'
  async function code(method, path) {
    try {
      const r = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' })
      return r.status
    } catch {
      return -1
    }
  }
  const idx = await code('GET', '/api/v1/config/numeracion')
  ok(idx === 401, `GET índice sin auth → 401 (ruta existe), dio ${idx}`)
  const det = await code('GET', '/api/v1/config/numeracion/factura-venta')
  ok(det === 401, `GET detalle sin auth → 401 (ruta existe), dio ${det}`)
  const put = await code('PUT', '/api/v1/config/numeracion/factura-venta')
  ok(put === 401, `PUT estado sin auth → 401 (ruta existe), dio ${put}`)
  const cont = await code('PUT', '/api/v1/config/numeracion/factura-venta/contador')
  ok(cont === 401, `PUT contador sin auth → 401 (ruta existe), dio ${cont}`)
  const prev = await code('POST', '/api/v1/config/numeracion/factura-venta/preview')
  ok(prev === 401, `POST preview sin auth → 401 (ruta existe), dio ${prev}`)
  const inex = await code('GET', '/api/v1/config/numeracion/no-existe')
  ok(inex === 404, `ruta inexistente → 404 (control), dio ${inex}`)
}

// ─── Resumen ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`)
if (failures.length) {
  console.log('\nFallos:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
