// GENERADO automáticamente por scripts/gen-acciones.mjs — NO editar a mano.
// Fuente: docs/PROMPT_PERMISOS_FRONTEND.md §16 (424 acciones). Regenerar: node scripts/gen-acciones.mjs

export type AccionId =
  | 'apertura.compras.anular'
  | 'apertura.compras.crear'
  | 'apertura.compras.listar'
  | 'apertura.inventario.anular'
  | 'apertura.inventario.crear'
  | 'apertura.inventario.listar'
  | 'apertura.preparar.ejecutar'
  | 'apertura.preparar.ver'
  | 'apertura.resumen.ver'
  | 'apertura.ventas.anular'
  | 'apertura.ventas.crear'
  | 'apertura.ventas.listar'
  | 'aseguradoras.crear'
  | 'aseguradoras.editar'
  | 'aseguradoras.eliminar'
  | 'aseguradoras.listar'
  | 'caja.cobrar'
  | 'caja.descartar'
  | 'caja.listar'
  | 'catalogo.atributos.crear'
  | 'catalogo.atributos.editar'
  | 'catalogo.atributos.listar'
  | 'catalogo.categorias.crear'
  | 'catalogo.categorias.editar'
  | 'catalogo.categorias.eliminar'
  | 'catalogo.categorias.listar'
  | 'catalogo.combos.crear'
  | 'catalogo.combos.editar'
  | 'catalogo.combos.eliminar'
  | 'catalogo.combos.listar'
  | 'catalogo.cuentas-pagar.crear'
  | 'catalogo.cuentas-pagar.editar'
  | 'catalogo.cuentas-pagar.eliminar'
  | 'catalogo.cuentas-pagar.listar'
  | 'catalogo.descuentos.crear'
  | 'catalogo.descuentos.editar'
  | 'catalogo.descuentos.listar'
  | 'catalogo.items.activar'
  | 'catalogo.items.actualizar-precios'
  | 'catalogo.items.asignar-ubicacion'
  | 'catalogo.items.consultar-stock'
  | 'catalogo.items.crear'
  | 'catalogo.items.editar'
  | 'catalogo.items.eliminar'
  | 'catalogo.items.generar-variantes'
  | 'catalogo.items.imprimir-etiqueta'
  | 'catalogo.items.listar'
  | 'catalogo.marcas.crear'
  | 'catalogo.marcas.editar'
  | 'catalogo.marcas.eliminar'
  | 'catalogo.marcas.listar'
  | 'clientes.crear'
  | 'clientes.editar'
  | 'clientes.eliminar'
  | 'clientes.estado-cuenta.imprimir'
  | 'clientes.estado-cuenta.ver'
  | 'clientes.grupos.crear'
  | 'clientes.grupos.editar'
  | 'clientes.grupos.eliminar'
  | 'clientes.grupos.listar'
  | 'clientes.listar'
  | 'cobros.aging.exportar'
  | 'cobros.pago.anular'
  | 'cobros.pago.crear'
  | 'cobros.pago.editar'
  | 'cobros.pago.imprimir'
  | 'cobros.pago.listar'
  | 'cobros.pago.someter'
  | 'compras.costos-importacion.anular'
  | 'compras.costos-importacion.crear'
  | 'compras.costos-importacion.listar'
  | 'compras.costos-importacion.someter'
  | 'compras.factura.anular'
  | 'compras.factura.aplicar-saldo'
  | 'compras.factura.crear'
  | 'compras.factura.devolver'
  | 'compras.factura.editar'
  | 'compras.factura.eliminar'
  | 'compras.factura.enmendar'
  | 'compras.factura.importar-lineas-oc'
  | 'compras.factura.imprimir'
  | 'compras.factura.listar'
  | 'compras.factura.someter'
  | 'compras.factura.ver-asientos'
  | 'compras.orden.anular'
  | 'compras.orden.crear'
  | 'compras.orden.editar'
  | 'compras.orden.eliminar'
  | 'compras.orden.enmendar'
  | 'compras.orden.facturar'
  | 'compras.orden.imprimir'
  | 'compras.orden.listar'
  | 'compras.orden.recibir'
  | 'compras.orden.someter'
  | 'compras.recepcion.anular'
  | 'compras.recepcion.crear'
  | 'compras.recepcion.editar'
  | 'compras.recepcion.enmendar'
  | 'compras.recepcion.facturar'
  | 'compras.recepcion.imprimir-etiquetas'
  | 'compras.recepcion.listar'
  | 'compras.recepcion.someter'
  | 'compras.solicitud.anular'
  | 'compras.solicitud.crear'
  | 'compras.solicitud.editar'
  | 'compras.solicitud.eliminar'
  | 'compras.solicitud.enmendar'
  | 'compras.solicitud.generar-orden'
  | 'compras.solicitud.imprimir'
  | 'compras.solicitud.listar'
  | 'compras.solicitud.someter'
  | 'config.accounts-settings.editar'
  | 'config.accounts-settings.ver'
  | 'config.apartados.editar'
  | 'config.apartados.ver'
  | 'config.bancos.ver'
  | 'config.buying-settings.editar'
  | 'config.buying-settings.ver'
  | 'config.catalogos-fiscales.ver'
  | 'config.cobros.editar'
  | 'config.cobros.ver'
  | 'config.currencies.ver'
  | 'config.denominaciones.crear'
  | 'config.denominaciones.editar'
  | 'config.denominaciones.listar'
  | 'config.despacho.configurar'
  | 'config.despacho.deshabilitar'
  | 'config.despacho.habilitar'
  | 'config.ecf.contingencia.administrar'
  | 'config.ecf.editar'
  | 'config.ecf.secuencias.administrar'
  | 'config.ecf.ver'
  | 'config.ejercicio-fiscal.cerrar'
  | 'config.ejercicio-fiscal.crear'
  | 'config.ejercicio-fiscal.editar'
  | 'config.ejercicio-fiscal.listar'
  | 'config.ejercicio-fiscal.reabrir'
  | 'config.empresa.editar'
  | 'config.empresa.ver'
  | 'config.facturacion.editar'
  | 'config.facturacion.ver'
  | 'config.farmacia.habilitar'
  | 'config.grupos-proveedores.crear'
  | 'config.grupos-proveedores.editar'
  | 'config.grupos-proveedores.eliminar'
  | 'config.grupos-proveedores.listar'
  | 'config.impuestos-compras.ver'
  | 'config.impuestos-ventas.ver'
  | 'config.item-tax-templates.ver'
  | 'config.listas-precio.crear'
  | 'config.listas-precio.editar'
  | 'config.listas-precio.eliminar'
  | 'config.listas-precio.listar'
  | 'config.metodos-pago.crear'
  | 'config.metodos-pago.editar'
  | 'config.metodos-pago.listar'
  | 'config.ncf.crear'
  | 'config.ncf.editar'
  | 'config.ncf.listar'
  | 'config.paises.ver'
  | 'config.pos.deshabilitar'
  | 'config.pos.habilitar'
  | 'config.retenciones.crear'
  | 'config.retenciones.editar'
  | 'config.retenciones.eliminar'
  | 'config.retenciones.listar'
  | 'config.seguridad.editar'
  | 'config.seguridad.ver'
  | 'config.selling-settings.editar'
  | 'config.selling-settings.ver'
  | 'config.stock-settings.editar'
  | 'config.stock-settings.ver'
  | 'config.tasas-impuesto.crear'
  | 'config.tasas-impuesto.editar'
  | 'config.tasas-impuesto.eliminar'
  | 'config.tasas-impuesto.listar'
  | 'config.uom.crear'
  | 'config.uom.editar'
  | 'config.uom.eliminar'
  | 'config.uom.listar'
  | 'contabilidad.asientos.anular'
  | 'contabilidad.asientos.crear'
  | 'contabilidad.asientos.listar'
  | 'contabilidad.asientos.someter'
  | 'contabilidad.centros-costo.crear'
  | 'contabilidad.centros-costo.editar'
  | 'contabilidad.centros-costo.eliminar'
  | 'contabilidad.centros-costo.listar'
  | 'contabilidad.cierre-periodo.confirmar'
  | 'contabilidad.cierre-periodo.crear'
  | 'contabilidad.cierre-periodo.listar'
  | 'contabilidad.cuentas.crear'
  | 'contabilidad.cuentas.editar'
  | 'contabilidad.cuentas.listar'
  | 'contabilidad.libros.imprimir'
  | 'contabilidad.libros.ver'
  | 'cotizaciones.anular'
  | 'cotizaciones.convertir-factura'
  | 'cotizaciones.convertir-pedido'
  | 'cotizaciones.crear'
  | 'cotizaciones.editar'
  | 'cotizaciones.eliminar'
  | 'cotizaciones.enmendar'
  | 'cotizaciones.imprimir'
  | 'cotizaciones.listar'
  | 'cotizaciones.someter'
  | 'dashboard.ver'
  | 'departamentos.crear'
  | 'departamentos.editar'
  | 'departamentos.eliminar'
  | 'departamentos.listar'
  | 'despachos.cancelar'
  | 'despachos.crear'
  | 'despachos.devolver'
  | 'despachos.editar'
  | 'despachos.facturar'
  | 'despachos.imprimir'
  | 'despachos.someter'
  | 'despachos.ver'
  | 'ecf.emitidos.imprimir'
  | 'ecf.emitidos.listar'
  | 'ecf.emitidos.refrescar'
  | 'ecf.emitidos.regenerar'
  | 'ecf.recibidos.aceptar-rechazar'
  | 'ecf.recibidos.cargar-xml'
  | 'ecf.recibidos.listar'
  | 'farmacia.lotes.crear'
  | 'farmacia.lotes.facturar'
  | 'farmacia.lotes.facturas-elegibles'
  | 'farmacia.lotes.imprimir'
  | 'farmacia.lotes.listar'
  | 'farmacia.lotes.marcar-en-revision'
  | 'farmacia.lotes.recalcular'
  | 'farmacia.lotes.vincular-facturas'
  | 'farmacia.reportes.facturas-ars.listar'
  | 'farmacia.reportes.lotes.listar'
  | 'gastos.anular'
  | 'gastos.aplicar-saldo'
  | 'gastos.crear'
  | 'gastos.editar'
  | 'gastos.enmendar'
  | 'gastos.listar'
  | 'gastos.someter'
  | 'gastos.ver-asientos'
  | 'impresoras.administrar'
  | 'impresoras.listar'
  | 'inventario.almacenes.crear'
  | 'inventario.almacenes.editar'
  | 'inventario.almacenes.eliminar'
  | 'inventario.almacenes.listar'
  | 'inventario.carga-inicial.anular'
  | 'inventario.carga-inicial.crear'
  | 'inventario.carga-inicial.listar'
  | 'inventario.conteos.crear'
  | 'inventario.conteos.listar'
  | 'inventario.conteos.someter'
  | 'inventario.historial.consultar'
  | 'inventario.lotes.consultar'
  | 'inventario.seriales.consultar'
  | 'inventario.stock.consultar'
  | 'inventario.transferencias.anular'
  | 'inventario.transferencias.crear'
  | 'inventario.transferencias.listar'
  | 'inventario.transferencias.someter'
  | 'inventario.ubicaciones.asignar'
  | 'inventario.ubicaciones.crear'
  | 'inventario.ubicaciones.distribuir'
  | 'inventario.ubicaciones.editar'
  | 'inventario.ubicaciones.editar-asignacion'
  | 'inventario.ubicaciones.eliminar'
  | 'inventario.ubicaciones.listar'
  | 'inventario.ubicaciones.mover'
  | 'inventario.ubicaciones.quitar-asignacion'
  | 'inventario.valuacion.consultar'
  | 'inventario.valuacion.recalcular'
  | 'inventario.zonas.crear'
  | 'inventario.zonas.editar'
  | 'inventario.zonas.eliminar'
  | 'inventario.zonas.listar'
  | 'monedas.habilitar'
  | 'monedas.preview.ver'
  | 'monedas.tasas.crear'
  | 'monedas.tasas.editar'
  | 'monedas.tasas.eliminar'
  | 'monedas.tasas.sincronizar'
  | 'monedas.tasas.ver'
  | 'monedas.ver'
  | 'notificaciones.canales-email.editar'
  | 'notificaciones.canales-email.ver'
  | 'notificaciones.logs.listar'
  | 'notificaciones.tipos.editar'
  | 'notificaciones.tipos.listar'
  | 'notificaciones.tipos.probar'
  | 'pedidos.anular'
  | 'pedidos.crear'
  | 'pedidos.editar'
  | 'pedidos.enmendar'
  | 'pedidos.facturar'
  | 'pedidos.imprimir'
  | 'pedidos.listar'
  | 'pedidos.someter'
  | 'plantillas.impresion.crear'
  | 'plantillas.impresion.editar'
  | 'plantillas.impresion.eliminar'
  | 'plantillas.impresion.listar'
  | 'pos.cajas.crear'
  | 'pos.cajas.editar'
  | 'pos.cajas.eliminar'
  | 'pos.cajas.listar'
  | 'pos.turno.abrir'
  | 'pos.turno.cerrar'
  | 'pos.turno.imprimir-cierre'
  | 'pos.turno.listar'
  | 'proveedores.crear'
  | 'proveedores.editar'
  | 'proveedores.listar'
  | 'reportes.caja.cuadre.imprimir'
  | 'reportes.caja.cuadre.ver'
  | 'reportes.compras.analitica.imprimir'
  | 'reportes.compras.analitica.ver'
  | 'reportes.compras.item-wise.imprimir'
  | 'reportes.compras.item-wise.ver'
  | 'reportes.compras.ordenes-analitica.imprimir'
  | 'reportes.compras.ordenes-analitica.ver'
  | 'reportes.compras.registro.imprimir'
  | 'reportes.compras.registro.ver'
  | 'reportes.contabilidad.balance-general.imprimir'
  | 'reportes.contabilidad.balance-general.ver'
  | 'reportes.contabilidad.flujo-efectivo.imprimir'
  | 'reportes.contabilidad.flujo-efectivo.ver'
  | 'reportes.contabilidad.ingresos-egresos.imprimir'
  | 'reportes.contabilidad.ingresos-egresos.ver'
  | 'reportes.despacho.faltantes.ver'
  | 'reportes.despacho.margen.ver'
  | 'reportes.despacho.pendientes-compra.ver'
  | 'reportes.despacho.reservas.ver'
  | 'reportes.dgii.facturacion-fiscal.imprimir'
  | 'reportes.dgii.facturacion-fiscal.ver'
  | 'reportes.dgii606.ver'
  | 'reportes.dgii607.ver'
  | 'reportes.dgii608.ver'
  | 'reportes.inventario.antiguedad.imprimir'
  | 'reportes.inventario.antiguedad.ver'
  | 'reportes.inventario.movimientos.imprimir'
  | 'reportes.inventario.movimientos.ver'
  | 'reportes.inventario.proyeccion.imprimir'
  | 'reportes.inventario.proyeccion.ver'
  | 'reportes.inventario.valoracion.imprimir'
  | 'reportes.inventario.valoracion.ver'
  | 'reportes.pedidos.analitica.imprimir'
  | 'reportes.pedidos.analitica.ver'
  | 'reportes.pos.corte-caja-dia.imprimir'
  | 'reportes.pos.corte-caja-dia.ver'
  | 'reportes.pos.cuadre-turno.imprimir'
  | 'reportes.pos.cuadre-turno.ver'
  | 'reportes.solicitudes.ver'
  | 'reportes.ventas.imprimir'
  | 'reportes.ventas.item-wise.imprimir'
  | 'reportes.ventas.item-wise.ver'
  | 'reportes.ventas.ver'
  | 'sucursales.crear'
  | 'sucursales.editar'
  | 'sucursales.eliminar'
  | 'sucursales.listar'
  | 'tesoreria.bancos.crear'
  | 'tesoreria.bancos.editar'
  | 'tesoreria.bancos.listar'
  | 'tesoreria.cheques.anular'
  | 'tesoreria.cheques.imprimir'
  | 'tesoreria.cheques.listar'
  | 'tesoreria.cuentas-bancarias.crear'
  | 'tesoreria.cuentas-bancarias.editar'
  | 'tesoreria.cuentas-bancarias.eliminar'
  | 'tesoreria.cuentas-bancarias.listar'
  | 'tesoreria.deposito.anular'
  | 'tesoreria.deposito.crear'
  | 'tesoreria.deposito.editar'
  | 'tesoreria.deposito.listar'
  | 'tesoreria.deposito.someter'
  | 'tesoreria.emision.anular'
  | 'tesoreria.emision.crear'
  | 'tesoreria.emision.editar'
  | 'tesoreria.emision.imprimir'
  | 'tesoreria.emision.listar'
  | 'tesoreria.emision.someter'
  | 'tesoreria.movimientos-banco.listar'
  | 'tesoreria.plantillas-cheque.crear'
  | 'tesoreria.plantillas-cheque.editar'
  | 'tesoreria.plantillas-cheque.listar'
  | 'tesoreria.tipos-documento.crear'
  | 'tesoreria.tipos-documento.editar'
  | 'tesoreria.tipos-documento.listar'
  | 'tesoreria.transferencia.anular'
  | 'tesoreria.transferencia.crear'
  | 'tesoreria.transferencia.editar'
  | 'tesoreria.transferencia.listar'
  | 'tesoreria.transferencia.someter'
  | 'usuarios.crear'
  | 'usuarios.editar'
  | 'usuarios.listar'
  | 'ventas.devolucion.anular'
  | 'ventas.devolucion.crear'
  | 'ventas.devolucion.imprimir'
  | 'ventas.devolucion.listar'
  | 'ventas.factura.anular'
  | 'ventas.factura.aplicar-saldo'
  | 'ventas.factura.crear'
  | 'ventas.factura.devolver'
  | 'ventas.factura.editar'
  | 'ventas.factura.enmendar'
  | 'ventas.factura.imprimir'
  | 'ventas.factura.imprimir-pos'
  | 'ventas.factura.listar'
  | 'ventas.factura.recalcular-cobertura'
  | 'ventas.factura.someter'
  | 'ventas.factura.ver-asientos'
  | 'ventas.nota-credito.aplicar'
  | 'ventas.nota-credito.crear'
  | 'ventas.nota-credito.imprimir'
  | 'ventas.nota-credito.listar'
  | 'ventas.nota-credito.reembolsar'
  | 'ventas.nota-credito.someter'
  | 'ventas.nota-debito.crear'
  | 'ventas.nota-debito.imprimir'

export const ACCIONES_CATALOGO: readonly AccionId[] = [
  'apertura.compras.anular',
  'apertura.compras.crear',
  'apertura.compras.listar',
  'apertura.inventario.anular',
  'apertura.inventario.crear',
  'apertura.inventario.listar',
  'apertura.preparar.ejecutar',
  'apertura.preparar.ver',
  'apertura.resumen.ver',
  'apertura.ventas.anular',
  'apertura.ventas.crear',
  'apertura.ventas.listar',
  'aseguradoras.crear',
  'aseguradoras.editar',
  'aseguradoras.eliminar',
  'aseguradoras.listar',
  'caja.cobrar',
  'caja.descartar',
  'caja.listar',
  'catalogo.atributos.crear',
  'catalogo.atributos.editar',
  'catalogo.atributos.listar',
  'catalogo.categorias.crear',
  'catalogo.categorias.editar',
  'catalogo.categorias.eliminar',
  'catalogo.categorias.listar',
  'catalogo.combos.crear',
  'catalogo.combos.editar',
  'catalogo.combos.eliminar',
  'catalogo.combos.listar',
  'catalogo.cuentas-pagar.crear',
  'catalogo.cuentas-pagar.editar',
  'catalogo.cuentas-pagar.eliminar',
  'catalogo.cuentas-pagar.listar',
  'catalogo.descuentos.crear',
  'catalogo.descuentos.editar',
  'catalogo.descuentos.listar',
  'catalogo.items.activar',
  'catalogo.items.actualizar-precios',
  'catalogo.items.asignar-ubicacion',
  'catalogo.items.consultar-stock',
  'catalogo.items.crear',
  'catalogo.items.editar',
  'catalogo.items.eliminar',
  'catalogo.items.generar-variantes',
  'catalogo.items.imprimir-etiqueta',
  'catalogo.items.listar',
  'catalogo.marcas.crear',
  'catalogo.marcas.editar',
  'catalogo.marcas.eliminar',
  'catalogo.marcas.listar',
  'clientes.crear',
  'clientes.editar',
  'clientes.eliminar',
  'clientes.estado-cuenta.imprimir',
  'clientes.estado-cuenta.ver',
  'clientes.grupos.crear',
  'clientes.grupos.editar',
  'clientes.grupos.eliminar',
  'clientes.grupos.listar',
  'clientes.listar',
  'cobros.aging.exportar',
  'cobros.pago.anular',
  'cobros.pago.crear',
  'cobros.pago.editar',
  'cobros.pago.imprimir',
  'cobros.pago.listar',
  'cobros.pago.someter',
  'compras.costos-importacion.anular',
  'compras.costos-importacion.crear',
  'compras.costos-importacion.listar',
  'compras.costos-importacion.someter',
  'compras.factura.anular',
  'compras.factura.aplicar-saldo',
  'compras.factura.crear',
  'compras.factura.devolver',
  'compras.factura.editar',
  'compras.factura.eliminar',
  'compras.factura.enmendar',
  'compras.factura.importar-lineas-oc',
  'compras.factura.imprimir',
  'compras.factura.listar',
  'compras.factura.someter',
  'compras.factura.ver-asientos',
  'compras.orden.anular',
  'compras.orden.crear',
  'compras.orden.editar',
  'compras.orden.eliminar',
  'compras.orden.enmendar',
  'compras.orden.facturar',
  'compras.orden.imprimir',
  'compras.orden.listar',
  'compras.orden.recibir',
  'compras.orden.someter',
  'compras.recepcion.anular',
  'compras.recepcion.crear',
  'compras.recepcion.editar',
  'compras.recepcion.enmendar',
  'compras.recepcion.facturar',
  'compras.recepcion.imprimir-etiquetas',
  'compras.recepcion.listar',
  'compras.recepcion.someter',
  'compras.solicitud.anular',
  'compras.solicitud.crear',
  'compras.solicitud.editar',
  'compras.solicitud.eliminar',
  'compras.solicitud.enmendar',
  'compras.solicitud.generar-orden',
  'compras.solicitud.imprimir',
  'compras.solicitud.listar',
  'compras.solicitud.someter',
  'config.accounts-settings.editar',
  'config.accounts-settings.ver',
  'config.apartados.editar',
  'config.apartados.ver',
  'config.bancos.ver',
  'config.buying-settings.editar',
  'config.buying-settings.ver',
  'config.catalogos-fiscales.ver',
  'config.cobros.editar',
  'config.cobros.ver',
  'config.currencies.ver',
  'config.denominaciones.crear',
  'config.denominaciones.editar',
  'config.denominaciones.listar',
  'config.despacho.configurar',
  'config.despacho.deshabilitar',
  'config.despacho.habilitar',
  'config.ecf.contingencia.administrar',
  'config.ecf.editar',
  'config.ecf.secuencias.administrar',
  'config.ecf.ver',
  'config.ejercicio-fiscal.cerrar',
  'config.ejercicio-fiscal.crear',
  'config.ejercicio-fiscal.editar',
  'config.ejercicio-fiscal.listar',
  'config.ejercicio-fiscal.reabrir',
  'config.empresa.editar',
  'config.empresa.ver',
  'config.facturacion.editar',
  'config.facturacion.ver',
  'config.farmacia.habilitar',
  'config.grupos-proveedores.crear',
  'config.grupos-proveedores.editar',
  'config.grupos-proveedores.eliminar',
  'config.grupos-proveedores.listar',
  'config.impuestos-compras.ver',
  'config.impuestos-ventas.ver',
  'config.item-tax-templates.ver',
  'config.listas-precio.crear',
  'config.listas-precio.editar',
  'config.listas-precio.eliminar',
  'config.listas-precio.listar',
  'config.metodos-pago.crear',
  'config.metodos-pago.editar',
  'config.metodos-pago.listar',
  'config.ncf.crear',
  'config.ncf.editar',
  'config.ncf.listar',
  'config.paises.ver',
  'config.pos.deshabilitar',
  'config.pos.habilitar',
  'config.retenciones.crear',
  'config.retenciones.editar',
  'config.retenciones.eliminar',
  'config.retenciones.listar',
  'config.seguridad.editar',
  'config.seguridad.ver',
  'config.selling-settings.editar',
  'config.selling-settings.ver',
  'config.stock-settings.editar',
  'config.stock-settings.ver',
  'config.tasas-impuesto.crear',
  'config.tasas-impuesto.editar',
  'config.tasas-impuesto.eliminar',
  'config.tasas-impuesto.listar',
  'config.uom.crear',
  'config.uom.editar',
  'config.uom.eliminar',
  'config.uom.listar',
  'contabilidad.asientos.anular',
  'contabilidad.asientos.crear',
  'contabilidad.asientos.listar',
  'contabilidad.asientos.someter',
  'contabilidad.centros-costo.crear',
  'contabilidad.centros-costo.editar',
  'contabilidad.centros-costo.eliminar',
  'contabilidad.centros-costo.listar',
  'contabilidad.cierre-periodo.confirmar',
  'contabilidad.cierre-periodo.crear',
  'contabilidad.cierre-periodo.listar',
  'contabilidad.cuentas.crear',
  'contabilidad.cuentas.editar',
  'contabilidad.cuentas.listar',
  'contabilidad.libros.imprimir',
  'contabilidad.libros.ver',
  'cotizaciones.anular',
  'cotizaciones.convertir-factura',
  'cotizaciones.convertir-pedido',
  'cotizaciones.crear',
  'cotizaciones.editar',
  'cotizaciones.eliminar',
  'cotizaciones.enmendar',
  'cotizaciones.imprimir',
  'cotizaciones.listar',
  'cotizaciones.someter',
  'dashboard.ver',
  'departamentos.crear',
  'departamentos.editar',
  'departamentos.eliminar',
  'departamentos.listar',
  'despachos.cancelar',
  'despachos.crear',
  'despachos.devolver',
  'despachos.editar',
  'despachos.facturar',
  'despachos.imprimir',
  'despachos.someter',
  'despachos.ver',
  'ecf.emitidos.imprimir',
  'ecf.emitidos.listar',
  'ecf.emitidos.refrescar',
  'ecf.emitidos.regenerar',
  'ecf.recibidos.aceptar-rechazar',
  'ecf.recibidos.cargar-xml',
  'ecf.recibidos.listar',
  'farmacia.lotes.crear',
  'farmacia.lotes.facturar',
  'farmacia.lotes.facturas-elegibles',
  'farmacia.lotes.imprimir',
  'farmacia.lotes.listar',
  'farmacia.lotes.marcar-en-revision',
  'farmacia.lotes.recalcular',
  'farmacia.lotes.vincular-facturas',
  'farmacia.reportes.facturas-ars.listar',
  'farmacia.reportes.lotes.listar',
  'gastos.anular',
  'gastos.aplicar-saldo',
  'gastos.crear',
  'gastos.editar',
  'gastos.enmendar',
  'gastos.listar',
  'gastos.someter',
  'gastos.ver-asientos',
  'impresoras.administrar',
  'impresoras.listar',
  'inventario.almacenes.crear',
  'inventario.almacenes.editar',
  'inventario.almacenes.eliminar',
  'inventario.almacenes.listar',
  'inventario.carga-inicial.anular',
  'inventario.carga-inicial.crear',
  'inventario.carga-inicial.listar',
  'inventario.conteos.crear',
  'inventario.conteos.listar',
  'inventario.conteos.someter',
  'inventario.historial.consultar',
  'inventario.lotes.consultar',
  'inventario.seriales.consultar',
  'inventario.stock.consultar',
  'inventario.transferencias.anular',
  'inventario.transferencias.crear',
  'inventario.transferencias.listar',
  'inventario.transferencias.someter',
  'inventario.ubicaciones.asignar',
  'inventario.ubicaciones.crear',
  'inventario.ubicaciones.distribuir',
  'inventario.ubicaciones.editar',
  'inventario.ubicaciones.editar-asignacion',
  'inventario.ubicaciones.eliminar',
  'inventario.ubicaciones.listar',
  'inventario.ubicaciones.mover',
  'inventario.ubicaciones.quitar-asignacion',
  'inventario.valuacion.consultar',
  'inventario.valuacion.recalcular',
  'inventario.zonas.crear',
  'inventario.zonas.editar',
  'inventario.zonas.eliminar',
  'inventario.zonas.listar',
  'monedas.habilitar',
  'monedas.preview.ver',
  'monedas.tasas.crear',
  'monedas.tasas.editar',
  'monedas.tasas.eliminar',
  'monedas.tasas.sincronizar',
  'monedas.tasas.ver',
  'monedas.ver',
  'notificaciones.canales-email.editar',
  'notificaciones.canales-email.ver',
  'notificaciones.logs.listar',
  'notificaciones.tipos.editar',
  'notificaciones.tipos.listar',
  'notificaciones.tipos.probar',
  'pedidos.anular',
  'pedidos.crear',
  'pedidos.editar',
  'pedidos.enmendar',
  'pedidos.facturar',
  'pedidos.imprimir',
  'pedidos.listar',
  'pedidos.someter',
  'plantillas.impresion.crear',
  'plantillas.impresion.editar',
  'plantillas.impresion.eliminar',
  'plantillas.impresion.listar',
  'pos.cajas.crear',
  'pos.cajas.editar',
  'pos.cajas.eliminar',
  'pos.cajas.listar',
  'pos.turno.abrir',
  'pos.turno.cerrar',
  'pos.turno.imprimir-cierre',
  'pos.turno.listar',
  'proveedores.crear',
  'proveedores.editar',
  'proveedores.listar',
  'reportes.caja.cuadre.imprimir',
  'reportes.caja.cuadre.ver',
  'reportes.compras.analitica.imprimir',
  'reportes.compras.analitica.ver',
  'reportes.compras.item-wise.imprimir',
  'reportes.compras.item-wise.ver',
  'reportes.compras.ordenes-analitica.imprimir',
  'reportes.compras.ordenes-analitica.ver',
  'reportes.compras.registro.imprimir',
  'reportes.compras.registro.ver',
  'reportes.contabilidad.balance-general.imprimir',
  'reportes.contabilidad.balance-general.ver',
  'reportes.contabilidad.flujo-efectivo.imprimir',
  'reportes.contabilidad.flujo-efectivo.ver',
  'reportes.contabilidad.ingresos-egresos.imprimir',
  'reportes.contabilidad.ingresos-egresos.ver',
  'reportes.despacho.faltantes.ver',
  'reportes.despacho.margen.ver',
  'reportes.despacho.pendientes-compra.ver',
  'reportes.despacho.reservas.ver',
  'reportes.dgii.facturacion-fiscal.imprimir',
  'reportes.dgii.facturacion-fiscal.ver',
  'reportes.dgii606.ver',
  'reportes.dgii607.ver',
  'reportes.dgii608.ver',
  'reportes.inventario.antiguedad.imprimir',
  'reportes.inventario.antiguedad.ver',
  'reportes.inventario.movimientos.imprimir',
  'reportes.inventario.movimientos.ver',
  'reportes.inventario.proyeccion.imprimir',
  'reportes.inventario.proyeccion.ver',
  'reportes.inventario.valoracion.imprimir',
  'reportes.inventario.valoracion.ver',
  'reportes.pedidos.analitica.imprimir',
  'reportes.pedidos.analitica.ver',
  'reportes.pos.corte-caja-dia.imprimir',
  'reportes.pos.corte-caja-dia.ver',
  'reportes.pos.cuadre-turno.imprimir',
  'reportes.pos.cuadre-turno.ver',
  'reportes.solicitudes.ver',
  'reportes.ventas.imprimir',
  'reportes.ventas.item-wise.imprimir',
  'reportes.ventas.item-wise.ver',
  'reportes.ventas.ver',
  'sucursales.crear',
  'sucursales.editar',
  'sucursales.eliminar',
  'sucursales.listar',
  'tesoreria.bancos.crear',
  'tesoreria.bancos.editar',
  'tesoreria.bancos.listar',
  'tesoreria.cheques.anular',
  'tesoreria.cheques.imprimir',
  'tesoreria.cheques.listar',
  'tesoreria.cuentas-bancarias.crear',
  'tesoreria.cuentas-bancarias.editar',
  'tesoreria.cuentas-bancarias.eliminar',
  'tesoreria.cuentas-bancarias.listar',
  'tesoreria.deposito.anular',
  'tesoreria.deposito.crear',
  'tesoreria.deposito.editar',
  'tesoreria.deposito.listar',
  'tesoreria.deposito.someter',
  'tesoreria.emision.anular',
  'tesoreria.emision.crear',
  'tesoreria.emision.editar',
  'tesoreria.emision.imprimir',
  'tesoreria.emision.listar',
  'tesoreria.emision.someter',
  'tesoreria.movimientos-banco.listar',
  'tesoreria.plantillas-cheque.crear',
  'tesoreria.plantillas-cheque.editar',
  'tesoreria.plantillas-cheque.listar',
  'tesoreria.tipos-documento.crear',
  'tesoreria.tipos-documento.editar',
  'tesoreria.tipos-documento.listar',
  'tesoreria.transferencia.anular',
  'tesoreria.transferencia.crear',
  'tesoreria.transferencia.editar',
  'tesoreria.transferencia.listar',
  'tesoreria.transferencia.someter',
  'usuarios.crear',
  'usuarios.editar',
  'usuarios.listar',
  'ventas.devolucion.anular',
  'ventas.devolucion.crear',
  'ventas.devolucion.imprimir',
  'ventas.devolucion.listar',
  'ventas.factura.anular',
  'ventas.factura.aplicar-saldo',
  'ventas.factura.crear',
  'ventas.factura.devolver',
  'ventas.factura.editar',
  'ventas.factura.enmendar',
  'ventas.factura.imprimir',
  'ventas.factura.imprimir-pos',
  'ventas.factura.listar',
  'ventas.factura.recalcular-cobertura',
  'ventas.factura.someter',
  'ventas.factura.ver-asientos',
  'ventas.nota-credito.aplicar',
  'ventas.nota-credito.crear',
  'ventas.nota-credito.imprimir',
  'ventas.nota-credito.listar',
  'ventas.nota-credito.reembolsar',
  'ventas.nota-credito.someter',
  'ventas.nota-debito.crear',
  'ventas.nota-debito.imprimir',
] as const
