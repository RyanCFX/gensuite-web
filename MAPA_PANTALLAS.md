# Mapa de Pantallas, Modales y Relaciones — GenSuite Web

> Mapa completo de la aplicación para diseño UI/UX. Incluye todas las pantallas, modales, flujos de navegación y relaciones entre componentes.

---

## Arquitectura General

```
BrowserRouter (App.tsx)
│
├── Rutas Públicas (sin auth)
│   ├── /login                    → LoginPage
│   ├── /forgot-password          → ForgotPasswordPage
│   ├── /reset-password           → ResetPasswordPage
│   ├── /completar-registro       → CompletarRegistroPage
│   └── *                         → NotFoundPage
│
└── ProtectedRoute (requiere auth)
    └── AppLayout (shell: topbar + sidebar + tabs)
        ├── Topbar: logo, búsqueda (⌘K → CommandPalette), TurnoCajaIndicator, tema, usuario
        ├── Sidebar: 6 secciones de navegación
        ├── TabBar (pestañas tipo navegador)
        └── <main> → pantalla actual
```

---

## Pantallas por Módulo

### 1. Dashboard

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/dashboard` | DashboardPage | Panel principal con KPIs |
| `/inicio` | StartPage | Pantalla de bienvenida (pestaña vacía) |

### 2. Clientes

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/clientes` | CustomersPage | Lista de clientes |
| `/clientes/nuevo` | CustomerForm | Crear cliente |
| `/clientes/:id` | CustomerDetail | Detalle del cliente |
| `/clientes/:id/editar` | CustomerForm | Editar cliente |

### 3. Catálogo

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/catalogo/categorias` | CategoriesPage | Gestión de categorías |
| `/catalogo/marcas` | BrandsPage | Gestión de marcas |
| `/catalogo/atributos` | AttributesPage | Gestión de atributos |
| `/catalogo/descuentos` | PricingRulesPage | Reglas de precios/descuentos |
| `/catalogo/combos` | BundlesPage | Combos/paquetes |
| `/catalogo/cuentas-por-pagar` | CuentasPorPagarPage | Catálogo CxP |
| `/catalogo/servicios` | ItemsPage | Lista de servicios |
| `/catalogo/servicios/nuevo` | ItemForm | Crear servicio |
| `/catalogo/servicios/:id` | ItemDetail | Detalle del servicio |
| `/catalogo/servicios/:id/editar` | ItemForm | Editar servicio |

### 4. Cotizaciones

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/cotizaciones` | QuotationsPage | Lista de cotizaciones |
| `/cotizaciones/nueva` | QuotationForm | Crear cotización |
| `/cotizaciones/:id` | QuotationDetail | Detalle de cotización |
| `/cotizaciones/:id/editar` | QuotationForm | Editar cotización |

### 5. Pedidos de Venta

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/pedidos` | PedidosPage | Lista de pedidos |
| `/pedidos/nuevo` | PedidoForm | Crear pedido |
| `/pedidos/:id` | PedidoDetail | Detalle del pedido |
| `/pedidos/:id/editar` | PedidoForm | Editar pedido |

### 6. Facturación

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/facturas` | InvoicesPage | Lista de facturas |
| `/facturas/nueva` | InvoiceForm | Crear factura |
| `/facturas/:id` | InvoiceDetail | Detalle de factura |
| `/facturas/:id/editar` | InvoiceForm | Editar factura |
| `/notas-credito` | CreditNotesPage | Notas de crédito |
| `/notas-debito` | DebitNotesPage | Notas de débito |
| `/devoluciones` | DevolucionesPage | Devoluciones (ventas) |
| `/devoluciones/nueva` | DevolucionForm | Crear devolución |
| `/devoluciones/:id` | DevolucionDetail | Detalle de devolución |

### 7. Inventario

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/inventario/productos` | ItemsPage | Lista de productos |
| `/inventario/productos/nuevo` | ItemForm | Crear producto |
| `/inventario/productos/:id` | ItemDetail | Detalle del producto |
| `/inventario/productos/:id/editar` | ItemForm | Editar producto |
| `/inventario/stock` | StockPage | Stock actual |
| `/inventario/historial` | HistoryPage | Historial de movimientos |
| `/inventario/conteos` | CountsPage | Conteos de inventario |
| `/inventario/zonas` | ZonasPage | Zonas y ubicaciones |

### 8. Transferencias

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/transferencias` | TransferenciasPage | Lista de transferencias |
| `/transferencias/nueva` | TransferenciaForm | Crear transferencia |
| `/transferencias/:id` | TransferenciaDetail | Detalle de transferencia |

### 9. Compras

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/compras` | ComprasPage | Lista de compras |
| `/compras/nueva` | CompraForm | Crear compra |
| `/compras/:id` | CompraDetail | Detalle de compra |
| `/compras/:id/editar` | CompraForm | Editar compra |
| `/compras/recepciones` | RecepcionesPage | Recepción de mercancía |
| `/compras/recepciones/nueva` | RecepcionForm | Crear recepción |
| `/compras/recepciones/:id` | RecepcionDetail | Detalle de recepción |
| `/compras/recepciones/:id/editar` | RecepcionForm | Editar recepción |
| `/compras/costos-importacion` | CostosImportacionPage | Costos de importación |
| `/compras/costos-importacion/:id` | CostoImportacionDetail | Detalle costo importación |

### 10. Devoluciones de Compras

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/devoluciones-compras` | DevolucionesPage | Lista devoluciones compras |
| `/devoluciones-compras/nueva` | DevolucionCompraForm | Crear devolución compra |
| `/devoluciones-compras/:id` | DevolucionCompraDetail | Detalle devolución compra |
| `/devoluciones-compras/:id/editar` | DevolucionCompraForm | Editar devolución compra |

### 11. e-CF (Comprobantes Fiscales Electrónicos)

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/ecf-recibidos` | EcfRecibidosPage | e-CF recibidos |
| `/ecf-recibidos/:voucherId` | EcfRecibidoDetail | Detalle e-CF recibido |
| `/ecf-emitidos` | EcfEmitidosPage | e-CF emitidos |
| `/ecf-emitidos/:voucherId` | EcfEmitidoDetail | Detalle e-CF emitido |

### 12. Gastos

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/gastos` | GastosPage | Lista de gastos |
| `/gastos/nuevo` | GastoForm | Crear gasto |
| `/gastos/:id` | GastoDetail | Detalle de gasto |
| `/gastos/:id/editar` | GastoForm | Editar gasto |

### 13. Proveedores

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/proveedores` | SuppliersPage | Lista de proveedores |
| `/proveedores/nuevo` | SupplierForm | Crear proveedor |
| `/proveedores/:id` | SupplierDetail | Detalle de proveedor |
| `/proveedores/:id/editar` | SupplierForm | Editar proveedor |

### 14. Caja / Cobros

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/caja/pendientes` | CajaPage | Facturas pendientes de cobro |
| `/caja/por-cobrar` | PorCobrarPage | Cuentas por cobrar |
| `/turnos` | TurnosPage | Turnos de caja |
| `/turnos/:id` | TurnoDetailPage | Detalle de turno |
| `/cobros/lista` | CobrosPage | Lista de cobros |
| `/cobros/pago` | PagoPage | Registrar cobro |
| `/cobros/aging` | AgingPage | Antigüedad de saldos (CxC) |
| `/cobros/semaforo` | SemaforoPage | Semáforo de crédito |
| `/cobros/:id` | CobroDetail | Detalle de cobro |

### 15. Cuentas por Pagar

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/pagos/lista` | PagosPage | Lista de pagos |
| `/pagos/pendientes` | PendientesPagoPage | Pagos pendientes |
| `/pagos/nuevo` | RegistrarPagoPage | Registrar pago |
| `/pagos/aging` | AgingProveedoresPage | Antigüedad de saldos (CxP) |
| `/pagos/:id` | PagoDetail | Detalle de pago |

### 16. Tesorería

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/tesoreria/emisiones` | EmisionesPage | Emisiones (egresos) |
| `/tesoreria/emisiones/nueva` | EmisionForm | Crear emisión |
| `/tesoreria/emisiones/:id` | EmisionDetail | Detalle de emisión |
| `/tesoreria/depositos` | DepositosPage | Depósitos (ingresos) |
| `/tesoreria/depositos/nuevo` | DepositoForm | Crear depósito |
| `/tesoreria/depositos/:id` | DepositoDetail | Detalle de depósito |
| `/tesoreria/transferencias` | TransferenciasInternasPage | Transferencias internas |
| `/tesoreria/transferencias/nueva` | TransferenciaInternaForm | Crear transferencia interna |
| `/tesoreria/transferencias/:id` | TransferenciaInternaDetail | Detalle transferencia interna |
| `/tesoreria/movimientos` | MovimientosBancoPage | Movimientos de banco |
| `/tesoreria/cheques` | ChequesPage | Cheques |
| `/tesoreria/cheques/:id` | ChequeDetail | Detalle de cheque |

### 17. Contabilidad

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/cuentas` | CuentasPage | Plan de cuentas |
| `/cuentas/nueva` | CuentaForm | Crear cuenta contable |
| `/cuentas/:id` | CuentaDetail | Detalle de cuenta |
| `/cuentas/:id/editar` | CuentaForm | Editar cuenta |
| `/asientos` | JournalPage | Asientos contables |
| `/asientos/nuevo` | JournalForm | Crear asiento |
| `/asientos/:id` | JournalDetail | Detalle de asiento |
| `/contabilidad/cierre-periodo` | CierrePeriodoPage | Cierre de período |
| `/contabilidad/libro-diario` | LibroDiarioPage | Libro diario |
| `/contabilidad/libro-mayor` | LibroMayorPage | Libro mayor |

### 18. Usuarios

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/usuarios` | UsuariosPage | Gestión de usuarios |

### 19. Reportes

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/reportes/:tipo` | ReportesPage | Reportes (606, 607, 608, ventas, etc.) |

### 20. Configuración

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/config/empresa` | EmpresaConfig | Datos de la empresa |
| `/config/ncf` | NcfPage | Numeración fiscal (NCF) |
| `/config/ecf/admin` | EcfAdminPage | Administración e-CF |
| `/config/ecf/certificacion` | EcfCertificacionPage | Certificación e-CF |
| `/config/ecf/contingencia` | EcfContingenciaPage | Contingencia e-CF |
| `/config/sucursales` | SucursalesPage | Sucursales |
| `/config/plantillas-facturas` | InvoiceTemplateEditorPage | Editor plantillas facturas |
| `/config/plantillas-etiquetas` | InvoiceTemplateEditorPage | Editor plantillas etiquetas |
| `/config/cajas` | CajasPage | Cajas (POS) |
| `/config/centros-costo` | CentrosCostoPage | Centros de costo |
| `/config/bancos` | BancosPage | Bancos |
| `/config/cuentas-bancarias` | CuentasBancariasPage | Cuentas bancarias |
| `/config/tesoreria/tipos-documento` | TiposDocumentoPage | Tipos de documento |
| `/config/tesoreria/plantillas-cheque` | PlantillasChequePage | Plantillas de cheque |
| `/config/tesoreria/plantillas-cheque/nueva` | PlantillaChequeForm | Crear plantilla cheque |
| `/config/tesoreria/plantillas-cheque/:id` | PlantillaChequeForm | Editar plantilla cheque |
| `/config/departamentos` | DepartamentosPage | Departamentos |
| `/config/impresoras` | ImpresorasPage | Impresoras |
| `/config/retenciones` | RetencionesPage | Retenciones |
| `/config/ajustes-avanzados` | AjustesAvanzadosPage | Ajustes avanzados |
| `/config/recalculo-valuacion` | RepostValuacionPage | Recálculo de valuación |
| `/config/notificaciones` | NotificacionesPage | Notificaciones |
| `/config/permisos` | PermisosPage | Permisos |
| `/config/roles` | RolesPage | Roles |
| `/config/roles/:name` | RoleDetailPage | Detalle de rol |
| `/config/:seccion` | ConfigPage | Configuración genérica (catch-all) |

---

## Modales

### Modales Compartidos (`src/components/shared/`)

| Modal | Descripción | Se abre desde |
|-------|------------|---------------|
| **PrintLabelsModal** | Seleccionar producto e imprimir etiquetas/códigos de barras | RecepcionForm, ItemDetail |
| **VariantsModal** | Seleccionar/configurar variantes de un ítem | RecepcionForm, CompraForm, PedidoForm, QuotationForm, InvoiceForm |
| **PdfPreviewModal** | Vista previa de PDF generado | CompraDetail, CobroDetail, TurnoDetailPage, DevolucionDetail (compras), InvoiceDetail |
| **ComponentTrackingModal** | Editar info de tracking/serie del componente | CompraForm, InvoiceForm, InvoiceDetail |
| **PinModal** | Autorización PIN de administrador | PedidoForm, QuotationForm, InvoiceForm |
| **ItemDetailModal** | Ver detalle/stock/ubicaciones de un ítem | PedidoForm, QuotationForm, InvoiceForm |
| **AsientosPreviewModal** | Previsualizar asientos contables, redistribuir | CompraDetail, EmisionDetail, TransferenciaInternaDetail, DepositoDetail, GastoDetail |
| **CerrarTurnoModal** | Cerrar turno de caja (preview, cerrar, imprimir) | TurnosPage |
| **PagoContadoModal** | Registrar pago de contado (métodos, bancos, cheques) | CompraDetail, GastoDetail |
| **CorteCajaView** | Vista de corte de caja | CajaPage, TurnoDetailPage |

### Modales de Funcionalidad (`src/components/shared/`)

| Modal | Descripción | Se abre desde |
|-------|------------|---------------|
| **TurnoCajaIndicator** | Indicador de turno activo en topbar | AppLayout (topbar) |
| **DocumentHistoryCard** | Historial de cambios del documento | Detalles de documentos |
| **DocumentActions** | Acciones del documento (imprimir, enviar, etc.) | Detalles de documentos |
| **EcfStatusCard** | Estado del e-CF | Detalles de facturas/compras |
| **RelatedDocsCard** | Documentos relacionados | Detalles de documentos |
| **SemaforoIndicator** | Indicador de semáforo de crédito | Listas de documentos |

### Modales de Feature (`src/features/`)

| Modal | Descripción | Se abre desde |
|-------|------------|---------------|
| **CustomerQuickCreateModal** | Crear cliente rápido inline | PedidoForm, QuotationForm, InvoiceForm |
| **SupplierQuickCreateModal** | Crear proveedor rápido inline | CompraForm |
| **TableColumnsModal** | Configurar columnas de tabla (editor plantillas) | InvoiceTemplateEditorPage |
| **ConditionalRuleModal** | Editar regla condicional (editor plantillas) | InvoiceTemplateEditorPage |
| **FormulaBuilderModal** | Construir fórmulas (editor plantillas) | InvoiceTemplateEditorPage |
| **PreviewModal** | Vista previa de plantilla renderizada | InvoiceTemplateEditorPage |
| **QzCertificateModal** | Descargar/instalar certificado QZ-Tray | ImpresorasPage |
| **CargarXmlModal** | Cargar XML de e-CF manualmente | EcfRecibidosPage |
| **CuentaMovimientosModal** | Ver movimientos de cuenta contable por rango de fechas | MovimientosBancoPage, CuentasPage |
| **ApplyToCxpModal** | Aplicar crédito de devolución a CxP | DevolucionDetail (compras), DevolucionesPage |

### Modales Inline (CSS, sin componente dedicado)

La mayoría de páginas CRUD abren modales inline para:

- **ConfirmModal** — confirmaciones de eliminación/deshabilitar (~40 páginas)
- **Drawer de detalle** — NcfPage tiene un `DetailDrawer` para series NCF
- **Diálogos de confirmación** — al cerrar pestañas con cambios sin guardar

---

## Flujos de Navegación

### Flujo de Ventas (downstream)

```
Cotización ──→ Pedido ──→ Factura ──→ Cobro
   │              │           │          │
   │              │           │          ├──→ Nota de Crédito
   │              │           │          └──→ Aging (CxC)
   │              │           │
   │              │           ├──→ Devolución ──→ Nota de Crédito
   │              │           └──→ e-CF Emitido
   │              │
   │              └──→ duplicate (duplicar pedido)
   │
   └──→ duplicate (duplicar cotización)
```

### Flujo de Compras (upstream)

```
Compra ──→ Recepción ──→ Devolución Compra
   │            │
   │            └──→ Costo de Importación
   │
   ├──→ Pago (CxP)
   ├──→ Gasto
   ├──→ e-CF Recibido
   └──→ Asiento Contable
```

### Flujo de Tesorería

```
Emisión (egreso) ←── Compra/Gasto
Depósito (ingreso) ←── Cobro
Transferencia Interna ←── entre cuentas
Cheque ←── Emisión
```

### Flujo Contable

```
Operaciones → Asientos → Libro Diario → Libro Mayor → Cierre de Período
                     ↕
              Plan de Cuentas
```

---

## Relaciones Cruzadas Clave

| Pantalla Origen | Pantalla Destino | Relación |
|----------------|-----------------|----------|
| **Dashboard** | Productos, Clientes, Facturas | Links directos a KPIs |
| **QuotationDetail** | PedidoForm | "Convertir a Pedido" (`?quotation=`) |
| **PedidoDetail** | InvoiceForm | "Facturar" |
| **QuotationDetail** | InvoiceForm | "Facturar directo" |
| **InvoiceDetail** | CreditNotesPage | "Nota de crédito" (`?originalInvoice=`) |
| **InvoiceDetail** | DevolucionesPage | "Devolución" |
| **InvoiceDetail** | CajaPage / PorCobrarPage | "Cobrar" |
| **CompraDetail** | PagoDetail | Link a pago registrado |
| **CompraDetail** | DevolucionCompraForm | "Devolución" (`?originalInvoice=`) |
| **CompraDetail** | AsientosPreviewModal | Ver asientos contables |
| **GastoDetail** | PagoDetail | Link a pago registrado |
| **SupplierDetail** | PagosPage | "Ver pagos" (`?supplier=`) |
| **CustomerDetail** | CreditNotesPage | "Notas de crédito" (`?customer=`) |
| **CobroDetail** | InvoiceDetail | Link a factura original |
| **PagoDetail** | CompraDetail | Link a compra original |
| **EcfRecibidoDetail** | CompraDetail | Link a compra conciliada |
| **ChequeDetail** | CompraDetail | Link a compra asociada |
| **EcfAdminPage** | EcfCertificacion / EcfContingencia | Links de configuración e-CF |
| **ConfigPage** | EcfAdminPage | Link a certificación e-CF |

### Modales que Conectan Pantallas

| Modal | Origen | Destino |
|-------|--------|---------|
| **ItemDetailModal** | PedidoForm, QuotationForm, InvoiceForm | Muestra detalle sin navegar |
| **CustomerQuickCreateModal** | PedidoForm, QuotationForm, InvoiceForm | Crea cliente inline |
| **SupplierQuickCreateModal** | CompraForm | Crea proveedor inline |
| **AsientosPreviewModal** | CompraDetail, GastoDetail, EmisionDetail, etc. | Muestra/permite redistribuir asientos |
| **CuentaMovimientosModal** | MovimientosBancoPage, CuentasPage | Muestra movimientos de cuenta |
| **ApplyToCxpModal** | DevolucionDetail (compras) | Aplica crédito a CxP |
| **ComponentTrackingModal** | CompraForm, InvoiceForm | Edita tracking de componentes |
| **PinModal** | PedidoForm, QuotationForm, InvoiceForm | Autorización antes de acciones sensibles |
| **PdfPreviewModal** | Varios Detail | Vista previa de impresión |

---

## Navegación Principal (Sidebar)

```
Menú Principal
├── Dashboard
└── Clientes

Ventas
├── Cotizaciones
├── Pedidos
├── Facturas
├── Notas de Crédito
├── Notas de Débito
├── Devoluciones
├── e-CF Emitidos
└── Reportes
    └── Ventas

Operaciones
├── Inventario
│   ├── Productos
│   ├── Categorías
│   ├── Marcas
│   ├── Atributos
│   ├── Descuentos
│   ├── Combos
│   ├── Stock Actual
│   ├── Historial
│   ├── Conteos
│   ├── Zonas y Ubicaciones
│   └── Transferencias
├── Servicios
├── Compras
│   ├── Compras
│   ├── Recepción de Mercancía
│   ├── Costos de Importación
│   └── Devoluciones de Compras
├── Gastos
├── e-CF Recibidos
└── Proveedores

Finanzas
├── Caja
│   ├── Pendientes de Cobro
│   └── Por Cobrar
├── Turnos
├── Cuentas por Cobrar
│   ├── Lista de Cobros
│   ├── Registrar Cobro
│   ├── Antigüedad de Saldos
│   └── Semáforo de Crédito
├── Cuentas por Pagar
│   ├── Lista de Pagos
│   ├── Pagos Pendientes
│   ├── Registrar Pago
│   └── Antigüedad de Saldos
├── Reportes
│   ├── DGII 606
│   ├── DGII 607
│   └── Cuadre de Caja
└── Tesorería
    ├── Emisiones
    ├── Depósitos
    ├── Transferencias Internas
    ├── Movimientos de Banco
    └── Cheques

Contabilidad
├── Plan de Cuentas
├── Asientos
├── Libro Diario
├── Libro Mayor
└── Cierre de Período

Footer
├── Reportes
│   ├── DGII 606
│   ├── DGII 607
│   ├── DGII 608
│   ├── Ventas
│   ├── Balance General
│   ├── Estado de Resultados
│   ├── Stock
│   ├── Movimientos
│   ├── CxC Aging
│   └── Cuadre de Caja
└── Configuración
    ├── Empresa
    ├── Cuentas por Defecto
    ├── Cobranza
    ├── Almacenes
    ├── Métodos de Pago
    ├── UoM
    ├── Listas de Precio
    ├── NCF
    ├── e-CF (Administración / Certificación / Contingencia)
    ├── Tipos de Documento Bancario
    └── Plantillas de Cheque
```

---

## Command Palette (⌘K)

Accesible desde cualquier pantalla autenticada. Indexa todas las pantallas con búsqueda fuzzy. Respeta los mismos filtros de roles y módulos que el sidebar.

---

## Resumen de Totales

| Categoría | Cantidad |
|-----------|----------|
| **Pantallas/rutas** | ~95 rutas únicas |
| **Componentes de página** | ~75 archivos (*Page/*Form/*Detail) |
| **Modales compartidos** | 10 componentes dedicados |
| **Modales de feature** | 10 componentes dedicados |
| **Modales inline** | ~70 archivos con modales CSS inline |
| **Módulos/feature dirs** | 27 directorios |
| **Secciones del sidebar** | 6 secciones principales |
