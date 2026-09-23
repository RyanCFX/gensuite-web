# Estructura de Pantallas — Diseño Navy

Este documento lleva el registro de qué pantallas ya fueron migradas al nuevo diseño de
listados (header de tabla navy, tarjeta de filtros `filter-card-navy`, botón primario
`btn-navy`, dot de acento en el título, y drawer "Más filtros" donde aplica).

Por ahora solo incluye la categoría **pantallas_tablas**: pantallas cuyo contenido principal
es un listado (`<table>`) y que ya recibieron el rediseño. Se irán agregando otras categorías
más adelante.

## pantallas_tablas

### Ventas
- Clientes — `/clientes`
- Cotizaciones — `/cotizaciones`
- Pedidos de Venta — `/pedidos`
- Facturas — `/facturas`
- Notas de Crédito — `/notas-credito`
- Notas de Débito — `/notas-debito`
- Devoluciones — `/devoluciones`
- Servicios — `/catalogo/servicios` (comparte componente con Productos)

### Inventario / Catálogo
- Productos — `/inventario/productos`
- Stock Actual — `/inventario/stock`
- Historial de Movimientos — `/inventario/historial`
- Conteos de Inventario — `/inventario/conteos`
- Zonas y Ubicaciones — `/inventario/zonas` (Zonas, Ubicaciones, Pendientes de ubicar, Historial de movimientos)
- Categorías — `/catalogo/categorias`
- Marcas — `/catalogo/marcas`
- Atributos — `/catalogo/atributos`
- Combos / Paquetes — `/catalogo/combos`
- Descuentos por Producto — `/catalogo/descuentos`

### Facturación Electrónica
- e-CF Emitidos — `/ecf-emitidos`
- e-CF Recibidos — `/ecf-recibidos`

### Compras
- Compras — `/compras`
- Solicitudes de Compra — `/compras/solicitudes`
- Órdenes de Compra — `/compras/ordenes`
- Recepción de Mercancía — `/compras/recepciones`
- Devoluciones de Compras — `/devoluciones-compras`
- Costos de Importación — `/compras/costos-importacion`
- Gastos — `/gastos`
- Proveedores — `/proveedores`

### Punto de Venta
- Turnos de Caja — `/turnos`

### Cuentas por Cobrar
- Cobros — `/cobros/lista`
- Antigüedad de saldos CxC — `/cobros/aging`

### Cuentas por Pagar
- Pagos a Proveedores — `/pagos/lista`
- Facturas Pendientes de Pago — `/pagos/pendientes`
- Antigüedad de saldos CxP — `/pagos/aging`
- Catálogo de Cuentas por Pagar — `/catalogo/cuentas-por-pagar`

### Tesorería
- Emisiones — `/tesoreria/emisiones`
- Depósitos — `/tesoreria/depositos`
- Transferencias Internas — `/tesoreria/transferencias`
- Movimientos Bancarios — `/tesoreria/movimientos`
- Cheques — `/tesoreria/cheques`
- Tipos de Documento Bancario — `/config/tesoreria/tipos-documento` (header navy + KPI strip clicable + drawer "Más filtros" + modal con header navy y preview en vivo)

### Contabilidad
- Plan de Cuentas — `/cuentas`
- Asientos Contables — `/asientos`
- Libro Diario — `/contabilidad/libro-diario`
- Libro Mayor — `/contabilidad/libro-mayor`
- Cierre de Período — `/contabilidad/cierre-periodo`

### Configuración
- Sucursales — `/config/sucursales`
- Cajas — `/config/cajas`
- Impresoras — `/config/impresoras`
- Centros de Costo — `/config/centros-costo`
- Bancos — `/config/bancos`
- Cuentas Bancarias — `/config/cuentas-bancarias`
- Departamentos — `/config/departamentos`
- Facturación Electrónica → Contingencia — `/config/ecf/contingencia`
- Secuencias NCF — `/config/ncf` (tabs Físico y Electrónico)
- Retenciones — `/config/retenciones`
- Notificaciones — `/config/notificaciones` (tabs Catálogo e Historial)
- Permisos — `/config/permisos`
- Auditoría de PIN — `/config/auditoria-pin`
- Roles — `/config/roles`

## Notas

- `Configuración de Cobranza` (`/config/cobros`) y `Empresa` (`/config/empresa`) recibieron
  rediseño propio bajo la misma línea (header navy con dot + overline, KPI strip estilo
  dashboard, cards con `navy-card-header`, footbar sticky): no son listados, así que no entran
  en `pantallas_tablas` pero comparten el lenguaje.
- No se tocó `EjercicioFiscalSection` ni las secciones internas restantes de `ConfigPage.tsx`
  (Almacenes, Métodos de Pago, UOM, Listas de Precio, etc.): son widgets angostos embebidos
  en un contenedor de 760px, un patrón de configuración deliberadamente distinto al de los
  listados de página completa.
- No se tocaron pantallas de detalle (`*Detail.tsx`, `RoleDetailPage`) ni el Semáforo de
  Crédito (`/cobros/semaforo`), que es una grilla de tarjetas y no una tabla.
