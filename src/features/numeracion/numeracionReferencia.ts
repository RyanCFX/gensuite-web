import type { NombradoPor, NumeracionModo } from '@/shared/api/types'

// ─── Numeración de documentos — referencia de UI ─────────────────────────────
// docs/tasks/PROMPT_NUMERACION_DOCUMENTOS_FRONTEND.md §3.1: tabla completa copiada a una
// constante de referencia. `ruta` = segmento de URL; `feature` = clave en `GET /me/features`;
// `accion` = clave en `GET /me/permissions`. El backend también devuelve `feature` y `accion`
// en el índice — esta tabla es solo referencia/orden de presentación y fallback, NO la fuente
// de verdad (esa es `GET /config/numeracion`, §2 regla de oro).

export interface NumeracionReferencia {
  slug: string
  ruta: string
  nombre: string
  doctype: string
  ejemplo: string
  modo: NumeracionModo
  area: string
  feature: string
  accion: string
}

/** Orden de presentación recomendado = orden de la tabla §3.1, agrupado por área. */
export const NUMERACION_REFERENCIA: readonly NumeracionReferencia[] = [
  { area: 'Ventas', slug: 'cliente', ruta: 'cliente', nombre: 'Clientes', doctype: 'Customer', ejemplo: 'CLI-00001', modo: 'series', feature: 'numeracionCliente', accion: 'config.numeracion.cliente' },
  { area: 'Ventas', slug: 'cotizacion', ruta: 'cotizacion', nombre: 'Cotizaciones', doctype: 'Quotation', ejemplo: 'COT-2026-00001', modo: 'series', feature: 'numeracionCotizacion', accion: 'config.numeracion.cotizacion' },
  { area: 'Ventas', slug: 'pedido', ruta: 'pedido', nombre: 'Pedidos', doctype: 'Sales Order', ejemplo: 'PED-2026-00001', modo: 'series', feature: 'numeracionPedido', accion: 'config.numeracion.pedido' },
  { area: 'Ventas', slug: 'despacho', ruta: 'despacho', nombre: 'Despachos', doctype: 'Delivery Note', ejemplo: 'DES-2026-00001', modo: 'series', feature: 'numeracionDespacho', accion: 'config.numeracion.despacho' },
  { area: 'Ventas', slug: 'facturaVenta', ruta: 'factura-venta', nombre: 'Facturas de venta', doctype: 'Sales Invoice', ejemplo: 'FAC-2026-00001', modo: 'series', feature: 'numeracionFacturaVenta', accion: 'config.numeracion.factura-venta' },
  { area: 'Ventas', slug: 'notaCreditoVenta', ruta: 'nota-credito-venta', nombre: 'Notas de crédito de venta (devoluciones)', doctype: 'Sales Invoice', ejemplo: 'NC-FAC-2026-00001', modo: 'regla-devolucion', feature: 'numeracionNotaCreditoVenta', accion: 'config.numeracion.nota-credito-venta' },
  { area: 'Compras', slug: 'proveedor', ruta: 'proveedor', nombre: 'Proveedores', doctype: 'Supplier', ejemplo: 'PROV-00001', modo: 'series', feature: 'numeracionProveedor', accion: 'config.numeracion.proveedor' },
  { area: 'Compras', slug: 'solicitudCompra', ruta: 'solicitud-compra', nombre: 'Solicitudes de compra', doctype: 'Material Request', ejemplo: 'SOL-COM-2026-00001', modo: 'series', feature: 'numeracionSolicitudCompra', accion: 'config.numeracion.solicitud-compra' },
  { area: 'Compras', slug: 'solicitudCotizacion', ruta: 'solicitud-cotizacion', nombre: 'Solicitudes de cotización (RFQ)', doctype: 'Request for Quotation', ejemplo: 'RFQ-2026-00001', modo: 'series', feature: 'numeracionSolicitudCotizacion', accion: 'config.numeracion.solicitud-cotizacion' },
  { area: 'Compras', slug: 'cotizacionProveedor', ruta: 'cotizacion-proveedor', nombre: 'Cotizaciones de proveedor', doctype: 'Supplier Quotation', ejemplo: 'COT-PROV-2026-00001', modo: 'series', feature: 'numeracionCotizacionProveedor', accion: 'config.numeracion.cotizacion-proveedor' },
  { area: 'Compras', slug: 'ordenCompra', ruta: 'orden-compra', nombre: 'Órdenes de compra', doctype: 'Purchase Order', ejemplo: 'OC-2026-00001', modo: 'series', feature: 'numeracionOrdenCompra', accion: 'config.numeracion.orden-compra' },
  { area: 'Compras', slug: 'recepcionCompra', ruta: 'recepcion-compra', nombre: 'Recepciones de compra', doctype: 'Purchase Receipt', ejemplo: 'REC-2026-00001', modo: 'series', feature: 'numeracionRecepcionCompra', accion: 'config.numeracion.recepcion-compra' },
  { area: 'Compras', slug: 'facturaCompra', ruta: 'factura-compra', nombre: 'Facturas de compra y gastos', doctype: 'Purchase Invoice', ejemplo: 'COMP-2026-00001', modo: 'series', feature: 'numeracionFacturaCompra', accion: 'config.numeracion.factura-compra' },
  { area: 'Inventario', slug: 'movimientoInventario', ruta: 'movimiento-inventario', nombre: 'Movimientos de inventario', doctype: 'Stock Entry', ejemplo: 'MOV-2026-00001', modo: 'series', feature: 'numeracionMovimientoInventario', accion: 'config.numeracion.movimiento-inventario' },
  { area: 'Inventario', slug: 'ajusteInventario', ruta: 'ajuste-inventario', nombre: 'Ajustes de inventario', doctype: 'Stock Reconciliation', ejemplo: 'AJU-2026-00001', modo: 'series', feature: 'numeracionAjusteInventario', accion: 'config.numeracion.ajuste-inventario' },
  { area: 'Inventario', slug: 'lote', ruta: 'lote', nombre: 'Lotes', doctype: 'Batch', ejemplo: 'LOT-2026-00001', modo: 'lote', feature: 'numeracionLote', accion: 'config.numeracion.lote' },
  { area: 'Contabilidad', slug: 'pago', ruta: 'pago', nombre: 'Pagos y cobros', doctype: 'Payment Entry', ejemplo: 'PAG-2026-00001', modo: 'series', feature: 'numeracionPago', accion: 'config.numeracion.pago' },
  { area: 'Contabilidad', slug: 'asientoDiario', ruta: 'asiento-diario', nombre: 'Asientos de diario', doctype: 'Journal Entry', ejemplo: 'DI-2026-00001', modo: 'series', feature: 'numeracionAsientoDiario', accion: 'config.numeracion.asiento-diario' },
  { area: 'Contabilidad', slug: 'solicitudPago', ruta: 'solicitud-pago', nombre: 'Solicitudes de pago', doctype: 'Payment Request', ejemplo: 'PR-2026-00001', modo: 'series', feature: 'numeracionSolicitudPago', accion: 'config.numeracion.solicitud-pago' },
  { area: 'RRHH', slug: 'empleado', ruta: 'empleado', nombre: 'Empleados', doctype: 'Employee', ejemplo: 'EMP-00001', modo: 'series', feature: 'numeracionEmpleado', accion: 'config.numeracion.empleado' },
  { area: 'RRHH', slug: 'reclamoGastos', ruta: 'reclamo-gastos', nombre: 'Reclamos de gastos', doctype: 'Expense Claim', ejemplo: 'GAST-2026-00001', modo: 'series', feature: 'numeracionReclamoGastos', accion: 'config.numeracion.reclamo-gastos' },
  { area: 'Activos', slug: 'activo', ruta: 'activo', nombre: 'Activos fijos', doctype: 'Asset', ejemplo: 'ACT-2026-00001', modo: 'series', feature: 'numeracionActivo', accion: 'config.numeracion.activo' },
] as const

export const NUMERACION_AREAS_ORDEN = ['Ventas', 'Compras', 'Inventario', 'Contabilidad', 'RRHH', 'Activos'] as const

/** Rutas con aclaración fiscal obligatoria (§8.4): el NCF se configura aparte. */
export const NUMERACION_RUTAS_FISCALES = new Set(['factura-venta', 'nota-credito-venta', 'factura-compra'])

/** Etiqueta del chip de `modo` en el índice — solo cuando no es `series` (§7.2). */
export function etiquetaModo(modo: NumeracionModo): string | null {
  if (modo === 'regla-devolucion') return 'Regla de devoluciones'
  if (modo === 'lote') return 'Prefijo de lote'
  return null
}

// ─── Visibilidad del ítem de menú (§7.1) ─────────────────────────────────────
// Mostrar solo si existe al menos un tipo accesible: algún `features.numeracion*` en `true`
// Y el usuario tiene alguna acción `config.numeracion.*` en `true`. Mientras los features no
// están listos, fail-open (el contenido real igual lo decide el índice).

export function mostrarItemNumeracion(ctx: {
  acciones: Record<string, boolean>
  features: Record<string, boolean> | null
  featuresReady: boolean
}): boolean {
  if (!ctx.featuresReady) return true
  const algunFeature = NUMERACION_REFERENCIA.some((t) => ctx.features?.[t.feature] === true)
  if (!algunFeature) return false
  return NUMERACION_REFERENCIA.some((t) => ctx.acciones[t.accion] === true)
}

// ─── Validación de plantillas en el cliente (§4.3/§6.5) ──────────────────────
// Replica las reglas del servidor para feedback inmediato — el servidor manda (§10.3).

/** Caracteres permitidos: `A-Z a-z 0-9 - _ . / # { }` y espacio. */
export const PLANTILLA_REGEX = /^[A-Za-z0-9\-_./#{} ]+$/

export const PLANTILLA_MAX_LONGITUD = 100

export const SERIES_MAX_CANTIDAD = 20

export function validarPlantilla(plantilla: string): string | null {
  const valor = plantilla.trim()
  if (!valor) return 'La plantilla no puede estar vacía'
  if (valor.length > PLANTILLA_MAX_LONGITUD) return `Máximo ${PLANTILLA_MAX_LONGITUD} caracteres`
  if (!PLANTILLA_REGEX.test(valor)) return 'Solo se permiten letras, números, `- _ . / # { }` y espacio'
  return null
}

/** La regla de devoluciones debe terminar en `.` + `#`s (§6.2). */
export function validarPlantillaReglaDevolucion(plantilla: string): string | null {
  const base = validarPlantilla(plantilla)
  if (base) return base
  if (!/\.#+\s*$/.test(plantilla.trim())) return 'La plantilla debe terminar en dígitos (ej. `NC-FAC-.YYYY.-.#####`)'
  return null
}

export function validarListaSeries(plantillas: string[], validarCada = validarPlantilla): string | null {
  if (plantillas.length === 0) return 'Debe quedar al menos una serie'
  if (plantillas.length > SERIES_MAX_CANTIDAD) return `Máximo ${SERIES_MAX_CANTIDAD} plantillas`
  const vistas = new Set<string>()
  for (const p of plantillas) {
    const err = validarCada(p)
    if (err) return err
    const normalizada = p.trim()
    if (vistas.has(normalizada)) return `Plantilla duplicada: ${normalizada}`
    vistas.add(normalizada)
  }
  return null
}

// ─── Cálculo del "próximo documento" para el diálogo de contador (§6.5) ──────
// Dígitos = cantidad de `#` finales de la plantilla; 5 si no hay.

export function digitosDePlantilla(plantilla: string): number {
  const m = /(#+)\s*$/.exec(plantilla)
  return m ? m[1].length : 5
}

export function proximoConValor(prefijo: string, plantilla: string, valor: number): string {
  return `${prefijo}${String(valor + 1).padStart(digitosDePlantilla(plantilla), '0')}`
}

// ─── Opciones de `nombradoPor` — solo cliente/proveedor (§6.4) ───────────────
// El backend acepta 4 valores en un solo enum pero ERPNext valida por tipo: ofrecer solo los
// 3 que corresponden. Enviar `Supplier Name` a un cliente falla.

export function opcionesNombradoPor(ruta: string): { value: NombradoPor; label: string }[] | null {
  if (ruta === 'cliente') {
    return [
      { value: 'Customer Name', label: 'Nombre del cliente' },
      { value: 'Naming Series', label: 'Serie de numeración' },
      { value: 'Auto Name', label: 'Automático (hash)' },
    ]
  }
  if (ruta === 'proveedor') {
    return [
      { value: 'Supplier Name', label: 'Nombre del proveedor' },
      { value: 'Naming Series', label: 'Serie de numeración' },
      { value: 'Auto Name', label: 'Automático (hash)' },
    ]
  }
  return null
}

/** Chips de tokens que se insertan en la posición del cursor (§6.1 ayuda). */
export const PLANTILLA_TOKENS = ['.YYYY.', '.YY.', '.MM.', '.DD.', '.FY.', '.#####'] as const

/**
 * Opciones del autocompletado de plantillas: al escribir `..` en el campo se abre un menú
 * con estas opciones (igual se puede escribir manual). `muestra` es un ejemplo de salida.
 */
export const PLANTILLA_OPCIONES: readonly { token: string; etiqueta: string; muestra: string }[] = [
  { token: '.YYYY.', etiqueta: 'Año (4 dígitos)', muestra: '2026' },
  { token: '.YY.', etiqueta: 'Año (2 dígitos)', muestra: '26' },
  { token: '.MM.', etiqueta: 'Mes', muestra: '10' },
  { token: '.DD.', etiqueta: 'Día', muestra: '06' },
  { token: '.FY.', etiqueta: 'Año fiscal', muestra: 'FY 2026' },
  { token: '.#####', etiqueta: 'Consecutivo (5 dígitos)', muestra: '00001' },
  { token: '.####', etiqueta: 'Consecutivo (4 dígitos)', muestra: '0001' },
]

// ─── Numeración por sucursal — actualización del prompt (§2/§4-§6) ────────────
// SOLO documentación de referencia para tests: la UI decide con el flag `soportaSucursal`
// que trae el servidor (índice y estado), nunca con esta lista. 14 tipos la soportan; 8 no
// (cotizacion, cliente, proveedor, solicitud-compra, solicitud-cotizacion, lote,
// asiento-diario, reclamo-gastos) porque no tienen campo sucursal en ERPNext.

/** Rutas (segmento) que soportan reglas por sucursal, según §2 de la actualización. */
export const NUMERACION_SOPORTA_SUCURSAL_DOC: ReadonlySet<string> = new Set([
  'pedido', 'despacho', 'factura-venta', 'nota-credito-venta', 'cotizacion-proveedor',
  'orden-compra', 'recepcion-compra', 'factura-compra', 'movimiento-inventario',
  'ajuste-inventario', 'pago', 'solicitud-pago', 'empleado', 'activo',
])

export const REGLAS_SUCURSAL_MAX_CANTIDAD = 100

/**
 * Validación de una plantilla de regla por sucursal (§5): mismos caracteres y 100 de las
 * series, pero ADEMÁS debe terminar en `.` + `#`s (si no, 400).
 */
export function validarPlantillaSucursal(plantilla: string): string | null {
  return validarPlantillaReglaDevolucion(plantilla)
}

export interface ReglaSucursalBorrador {
  sucursal: string
  plantilla: string
}

/** Validación de la lista completa de reglas (§5): sin sucursal/plantilla repetidas, ≤ 100. */
export function validarListaReglasSucursal(reglas: ReglaSucursalBorrador[]): string | null {
  if (reglas.length > REGLAS_SUCURSAL_MAX_CANTIDAD) {
    return `Máximo ${REGLAS_SUCURSAL_MAX_CANTIDAD} reglas por sucursal`
  }
  const sucursales = new Set<string>()
  const plantillas = new Set<string>()
  for (const r of reglas) {
    if (!r.sucursal) return 'Elegí la sucursal de cada regla'
    const err = validarPlantillaSucursal(r.plantilla)
    if (err) return err
    if (sucursales.has(r.sucursal)) return `Sucursal duplicada: ${r.sucursal}`
    sucursales.add(r.sucursal)
    const normalizada = r.plantilla.trim()
    if (plantillas.has(normalizada)) return `Dos sucursales no pueden usar la misma plantilla: ${normalizada}`
    plantillas.add(normalizada)
  }
  return null
}

// ─── Textos de ayuda permanentes (§4.6 de la actualización) ──────────────────

export const AYUDA_SUCURSAL_GENERAL =
  'Los documentos de una sucursal usan su propia numeración. Si una sucursal no tiene regla, se usa la serie predeterminada.'

export const AYUDA_SUCURSAL_FACTURA_VENTA =
  'Estas reglas no se aplican a devoluciones. Las notas de crédito se numeran en el tipo Notas de crédito de venta.'

export const AYUDA_SUCURSAL_NOTA_CREDITO =
  'La regla general de devoluciones (arriba) sirve de respaldo para las sucursales sin regla propia.'

export const AYUDA_SUCURSAL_MIGRACION =
  'Si la sucursal ya emitió documentos con otro formato, empezará en 00001 con el prefijo nuevo. Si coincide con documentos existentes, usa Fijar contador para continuar la secuencia y evitar nombres duplicados.'
