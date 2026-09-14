import type { AccionId } from './acciones.generated'

/**
 * Mapa ruta → acción de lectura (docs/PROMPT_PERMISOS_FRONTEND.md §6). Es la fuente de verdad
 * única para: (a) el guard de router (`RequireAccion`) y (b) el filtrado del menú lateral.
 *
 * - `accion`: acción de lectura que habilita la ruta. `null` = ruta de autoservicio / infra que
 *   se muestra a cualquier usuario autenticado (§13.5).
 * - `soloFarmacia`: además exige `vertical === 'farmacia'` (§6 — se evalúa antes que `acciones`).
 * - `soloSystemManager`: meta-administración, se gatea por rol y no por acción (§15).
 *
 * El orden importa: se elige la primera entrada cuyo `pattern` matchea el pathname, así que las
 * rutas más específicas van primero.
 */
export interface RutaPermiso {
  /** Prefijo exacto o patrón. `:x` matchea un segmento; `*` matchea el resto. */
  pattern: string
  accion: AccionId | null
  soloFarmacia?: boolean
  soloSystemManager?: boolean
}

export const RUTAS_PERMISOS: readonly RutaPermiso[] = [
  { pattern: '/dashboard', accion: 'dashboard.ver' },
  { pattern: '/inicio', accion: null },

  // Clientes
  { pattern: '/clientes/*', accion: 'clientes.listar' },
  { pattern: '/clientes', accion: 'clientes.listar' },

  // Catálogo
  { pattern: '/catalogo/categorias', accion: 'catalogo.categorias.listar' },
  { pattern: '/catalogo/marcas', accion: 'catalogo.marcas.listar' },
  { pattern: '/catalogo/cuentas-por-pagar', accion: 'catalogo.cuentas-pagar.listar' },
  { pattern: '/catalogo/combos', accion: 'catalogo.combos.listar' },
  { pattern: '/catalogo/descuentos', accion: 'catalogo.descuentos.listar' },
  { pattern: '/catalogo/servicios/*', accion: 'catalogo.items.listar' },
  { pattern: '/catalogo/servicios', accion: 'catalogo.items.listar' },
  { pattern: '/catalogo/atributos', accion: 'catalogo.atributos.listar' },

  // Farmacia ARS (vertical)
  { pattern: '/farmacia/aseguradoras/*', accion: 'aseguradoras.listar', soloFarmacia: true },
  { pattern: '/farmacia/aseguradoras', accion: 'aseguradoras.listar', soloFarmacia: true },
  { pattern: '/farmacia/lotes/*', accion: 'farmacia.lotes.listar', soloFarmacia: true },
  { pattern: '/farmacia/lotes', accion: 'farmacia.lotes.listar', soloFarmacia: true },

  // Cotizaciones
  { pattern: '/cotizaciones/*', accion: 'cotizaciones.listar' },
  { pattern: '/cotizaciones', accion: 'cotizaciones.listar' },

  // Pedidos
  { pattern: '/pedidos/*', accion: 'pedidos.listar' },
  { pattern: '/pedidos', accion: 'pedidos.listar' },

  // Despachos (Delivery Note) — docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §2.
  // Gateado también por el flag despachoHabilitado en el menú (AppLayout) — acá solo el permiso.
  { pattern: '/despachos/*', accion: 'despachos.ver' },
  { pattern: '/despachos', accion: 'despachos.ver' },

  // Transferencias entre almacenes
  { pattern: '/transferencias/*', accion: 'inventario.transferencias.listar' },
  { pattern: '/transferencias', accion: 'inventario.transferencias.listar' },

  // Facturación
  { pattern: '/facturas/*', accion: 'ventas.factura.listar' },
  { pattern: '/facturas', accion: 'ventas.factura.listar' },
  { pattern: '/notas-credito', accion: 'ventas.nota-credito.listar' },
  { pattern: '/notas-debito', accion: 'ventas.nota-debito.crear' },
  { pattern: '/devoluciones/*', accion: 'ventas.devolucion.listar' },
  { pattern: '/devoluciones', accion: 'ventas.devolucion.listar' },

  // Inventario
  { pattern: '/inventario/productos/*', accion: 'catalogo.items.listar' },
  { pattern: '/inventario/productos', accion: 'catalogo.items.listar' },
  { pattern: '/inventario/stock', accion: 'inventario.stock.consultar' },
  { pattern: '/inventario/historial', accion: 'inventario.historial.consultar' },
  { pattern: '/inventario/conteos', accion: 'inventario.conteos.listar' },
  { pattern: '/inventario/zonas', accion: 'inventario.zonas.listar' },

  // Compras (marcador Compras RD ya resuelto en acciones; la lectura no lo exige)
  { pattern: '/compras/recepciones/*', accion: 'compras.recepcion.listar' },
  { pattern: '/compras/recepciones', accion: 'compras.recepcion.listar' },
  { pattern: '/compras/solicitudes/*', accion: 'compras.solicitud.listar' },
  { pattern: '/compras/solicitudes', accion: 'compras.solicitud.listar' },
  { pattern: '/compras/ordenes/*', accion: 'compras.orden.listar' },
  { pattern: '/compras/ordenes', accion: 'compras.orden.listar' },
  { pattern: '/compras/costos-importacion/*', accion: 'compras.costos-importacion.listar' },
  { pattern: '/compras/costos-importacion', accion: 'compras.costos-importacion.listar' },
  { pattern: '/compras/*', accion: 'compras.factura.listar' },
  { pattern: '/compras', accion: 'compras.factura.listar' },

  // Devoluciones de compras — sin acción propia en el catálogo; se apoya en la lectura de compras
  { pattern: '/devoluciones-compras/*', accion: 'compras.factura.listar' },
  { pattern: '/devoluciones-compras', accion: 'compras.factura.listar' },

  // e-CF
  { pattern: '/ecf-recibidos/*', accion: 'ecf.recibidos.listar' },
  { pattern: '/ecf-recibidos', accion: 'ecf.recibidos.listar' },
  { pattern: '/ecf-emitidos/*', accion: 'ecf.emitidos.listar' },
  { pattern: '/ecf-emitidos', accion: 'ecf.emitidos.listar' },

  // Gastos (marcador Gastos RD ya resuelto en acciones)
  { pattern: '/gastos/*', accion: 'gastos.listar' },
  { pattern: '/gastos', accion: 'gastos.listar' },

  // Proveedores
  { pattern: '/proveedores/*', accion: 'proveedores.listar' },
  { pattern: '/proveedores', accion: 'proveedores.listar' },

  // Caja / Cobros / Pagos
  { pattern: '/caja/pendientes', accion: 'caja.listar' },
  { pattern: '/caja/por-cobrar', accion: 'caja.listar' },
  { pattern: '/turnos/*', accion: 'pos.turno.listar' },
  { pattern: '/turnos', accion: 'pos.turno.listar' },
  { pattern: '/cobros/lista', accion: 'cobros.pago.listar' },
  { pattern: '/cobros/pago', accion: 'cobros.pago.crear' },
  { pattern: '/cobros/aging', accion: 'cobros.aging.exportar' },
  { pattern: '/cobros/semaforo', accion: 'cobros.pago.listar' },
  { pattern: '/cobros/*', accion: 'cobros.pago.listar' },
  { pattern: '/pagos/lista', accion: 'cobros.pago.listar' },
  { pattern: '/pagos/pendientes', accion: 'cobros.pago.listar' },
  { pattern: '/pagos/nuevo', accion: 'cobros.pago.crear' },
  { pattern: '/pagos/aging', accion: 'cobros.aging.exportar' },
  { pattern: '/pagos/*', accion: 'cobros.pago.listar' },

  // Tesorería
  { pattern: '/tesoreria/emisiones/*', accion: 'tesoreria.emision.listar' },
  { pattern: '/tesoreria/emisiones', accion: 'tesoreria.emision.listar' },
  { pattern: '/tesoreria/depositos/*', accion: 'tesoreria.deposito.listar' },
  { pattern: '/tesoreria/depositos', accion: 'tesoreria.deposito.listar' },
  { pattern: '/tesoreria/transferencias/*', accion: 'tesoreria.transferencia.listar' },
  { pattern: '/tesoreria/transferencias', accion: 'tesoreria.transferencia.listar' },
  { pattern: '/tesoreria/movimientos', accion: 'tesoreria.movimientos-banco.listar' },
  { pattern: '/tesoreria/cheques/*', accion: 'tesoreria.cheques.listar' },
  { pattern: '/tesoreria/cheques', accion: 'tesoreria.cheques.listar' },

  // Usuarios
  { pattern: '/usuarios', accion: 'usuarios.listar' },

  // Reportes — una entrada por reporte del catálogo §16; la pantalla igual re-valida adentro
  { pattern: '/reportes/ventas', accion: 'reportes.ventas.ver' },
  { pattern: '/reportes/607', accion: 'reportes.dgii607.ver' },
  { pattern: '/reportes/606', accion: 'reportes.dgii606.ver' },
  { pattern: '/reportes/608', accion: 'reportes.dgii608.ver' },
  { pattern: '/reportes/balance', accion: 'reportes.contabilidad.balance-general.ver' },
  { pattern: '/reportes/stock', accion: 'reportes.inventario.valoracion.ver' },
  { pattern: '/reportes/movimientos', accion: 'reportes.inventario.movimientos.ver' },
  { pattern: '/reportes/cuadreTurno', accion: 'reportes.pos.cuadre-turno.ver' },
  { pattern: '/reportes/caja', accion: 'reportes.caja.cuadre.ver' },
  { pattern: '/reportes/corteCajaDia', accion: 'reportes.pos.corte-caja-dia.ver' },
  { pattern: '/reportes/facturacion-fiscal', accion: 'reportes.dgii.facturacion-fiscal.ver' },
  { pattern: '/reportes/flujo-efectivo', accion: 'reportes.contabilidad.flujo-efectivo.ver' },
  { pattern: '/reportes/compras-analitica', accion: 'reportes.compras.analitica.ver' },
  { pattern: '/reportes/compras-registro', accion: 'reportes.compras.registro.ver' },
  { pattern: '/reportes/compras-item-wise', accion: 'reportes.compras.item-wise.ver' },
  { pattern: '/reportes/compras-ordenes-analitica', accion: 'reportes.compras.ordenes-analitica.ver' },
  { pattern: '/reportes/ventas-item-wise', accion: 'reportes.ventas.item-wise.ver' },
  { pattern: '/reportes/pedidos-analitica', accion: 'reportes.pedidos.analitica.ver' },
  { pattern: '/reportes/inventario-antiguedad', accion: 'reportes.inventario.antiguedad.ver' },
  { pattern: '/reportes/inventario-proyeccion', accion: 'reportes.inventario.proyeccion.ver' },
  { pattern: '/reportes/despacho-margen', accion: 'reportes.despacho.margen.ver' },
  { pattern: '/reportes/despacho-reservas', accion: 'reportes.despacho.reservas.ver' },
  { pattern: '/reportes/despacho-faltantes', accion: 'reportes.despacho.faltantes.ver' },
  { pattern: '/reportes/despacho-pendientes-compra', accion: 'reportes.despacho.pendientes-compra.ver' },
  { pattern: '/reportes/solicitudes', accion: 'reportes.solicitudes.ver' },
  { pattern: '/reportes/farmacia-lotes', accion: 'farmacia.reportes.lotes.listar', soloFarmacia: true },
  { pattern: '/reportes/farmacia-facturas-ars', accion: 'farmacia.reportes.facturas-ars.listar', soloFarmacia: true },
  { pattern: '/reportes/*', accion: null },
  { pattern: '/reportes', accion: null },

  // Facturas de Apertura (Migración de Saldos) — docs/tasks/PROMPT_APERTURA_FRONTEND.md §2.
  // Las rutas específicas (nueva/importar) van antes que el catch-all /apertura/ventas/* (detalle).
  { pattern: '/apertura/diagnostico', accion: 'apertura.preparar.ver' },
  { pattern: '/apertura/ventas/nueva', accion: 'apertura.ventas.crear' },
  { pattern: '/apertura/ventas/importar', accion: 'apertura.ventas.crear' },
  { pattern: '/apertura/ventas/*', accion: 'apertura.ventas.listar' },
  { pattern: '/apertura/ventas', accion: 'apertura.ventas.listar' },
  { pattern: '/apertura/compras/nueva', accion: 'apertura.compras.crear' },
  { pattern: '/apertura/compras/importar', accion: 'apertura.compras.crear' },
  { pattern: '/apertura/compras/*', accion: 'apertura.compras.listar' },
  { pattern: '/apertura/compras', accion: 'apertura.compras.listar' },
  { pattern: '/apertura/resumen', accion: 'apertura.resumen.ver' },

  // Contabilidad
  { pattern: '/cuentas/*', accion: 'contabilidad.cuentas.listar' },
  { pattern: '/cuentas', accion: 'contabilidad.cuentas.listar' },
  { pattern: '/asientos/*', accion: 'contabilidad.asientos.listar' },
  { pattern: '/asientos', accion: 'contabilidad.asientos.listar' },
  { pattern: '/contabilidad/cierre-periodo', accion: 'contabilidad.cierre-periodo.listar' },
  { pattern: '/contabilidad/libro-diario', accion: 'contabilidad.libros.ver' },
  { pattern: '/contabilidad/libro-mayor', accion: 'contabilidad.libros.ver' },

  // Configuración
  { pattern: '/config/empresa', accion: 'config.empresa.ver' },
  { pattern: '/config/ncf', accion: 'config.ncf.listar' },
  { pattern: '/config/ecf/admin', accion: null, soloSystemManager: true },
  { pattern: '/config/ecf/certificacion', accion: null, soloSystemManager: true },
  { pattern: '/config/ecf/contingencia', accion: null, soloSystemManager: true },
  { pattern: '/config/sucursales', accion: 'sucursales.listar' },
  { pattern: '/config/plantillas-facturas', accion: 'plantillas.impresion.listar' },
  { pattern: '/config/plantillas-etiquetas', accion: 'plantillas.impresion.listar' },
  { pattern: '/config/cajas', accion: null, soloSystemManager: true },
  { pattern: '/config/centros-costo', accion: 'contabilidad.centros-costo.listar' },
  { pattern: '/config/bancos', accion: 'tesoreria.bancos.listar' },
  { pattern: '/config/cuentas-bancarias', accion: 'tesoreria.cuentas-bancarias.listar' },
  { pattern: '/config/tesoreria/tipos-documento', accion: 'tesoreria.tipos-documento.listar' },
  { pattern: '/config/tesoreria/plantillas-cheque/*', accion: 'tesoreria.plantillas-cheque.listar' },
  { pattern: '/config/tesoreria/plantillas-cheque', accion: 'tesoreria.plantillas-cheque.listar' },
  { pattern: '/config/departamentos', accion: 'departamentos.listar' },
  { pattern: '/config/impresoras', accion: 'impresoras.listar' },
  { pattern: '/config/retenciones', accion: 'config.retenciones.listar' },
  { pattern: '/config/ajustes-avanzados', accion: 'config.seguridad.ver' },
  { pattern: '/config/recalculo-valuacion', accion: 'inventario.valuacion.consultar' },
  { pattern: '/config/notificaciones', accion: 'notificaciones.tipos.listar' },
  { pattern: '/config/ecf', accion: 'config.ecf.ver' },
  { pattern: '/config/cobros', accion: 'config.cobros.ver' },
  { pattern: '/config/facturacion', accion: 'config.facturacion.ver' },
  { pattern: '/config/monedas', accion: 'monedas.ver' },
  { pattern: '/config/metodos-pago', accion: 'config.metodos-pago.listar' },
  { pattern: '/config/denominaciones', accion: 'config.denominaciones.listar' },
  { pattern: '/config/uom', accion: 'config.uom.listar' },
  { pattern: '/config/listas-precio', accion: 'config.listas-precio.listar' },
  { pattern: '/config/ejercicio-fiscal', accion: 'config.ejercicio-fiscal.listar' },
  { pattern: '/config/grupos-clientes', accion: 'clientes.grupos.listar' },
  { pattern: '/config/grupos-proveedores', accion: 'config.grupos-proveedores.listar' },
  { pattern: '/config/almacenes', accion: 'inventario.almacenes.listar' },
  { pattern: '/config/tasas-impuesto', accion: 'config.tasas-impuesto.listar' },
  { pattern: '/config/impuestos-ventas', accion: 'config.impuestos-ventas.ver' },
  { pattern: '/config/impuestos-compras', accion: 'config.impuestos-compras.ver' },
  { pattern: '/config/impuestos-articulo', accion: 'config.item-tax-templates.ver' },
  { pattern: '/config/permisos', accion: null, soloSystemManager: true },
  { pattern: '/config/roles/*', accion: null, soloSystemManager: true },
  { pattern: '/config/roles', accion: null, soloSystemManager: true },
  { pattern: '/config/auditoria-pin', accion: null, soloSystemManager: true },
  { pattern: '/config/farmacia', accion: null, soloFarmacia: true, soloSystemManager: true },
  // /config/:seccion — catch-all de secciones misceláneas; la propia ConfigPage valida
  { pattern: '/config/*', accion: null },
  { pattern: '/config', accion: null },
]

function matchea(pattern: string, pathname: string): boolean {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2)
    return pathname === base || pathname.startsWith(base + '/')
  }
  return pathname === pattern
}

/** Devuelve la config de permiso de la primera ruta que matchea, o `undefined` si no hay ninguna. */
export function resolverRuta(pathname: string): RutaPermiso | undefined {
  return RUTAS_PERMISOS.find((r) => matchea(r.pattern, pathname))
}
