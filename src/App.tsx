import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import NotFoundPage from '@/pages/NotFoundPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import CompletarRegistroPage from '@/pages/CompletarRegistroPage'
import StartPage from '@/pages/StartPage'

// Lazy-loaded pages
import { lazy, Suspense } from 'react'

const DashboardPage   = lazy(() => import('@/features/dashboard/DashboardPage'))
const CustomersPage   = lazy(() => import('@/features/customers/CustomersPage'))
const CustomerDetail  = lazy(() => import('@/features/customers/CustomerDetail'))
const CustomerForm    = lazy(() => import('@/features/customers/CustomerForm'))
const CategoriesPage  = lazy(() => import('@/features/catalog/CategoriesPage'))
const BrandsPage      = lazy(() => import('@/features/catalog/BrandsPage'))
const CuentasPorPagarPage = lazy(() => import('@/features/catalog/CuentasPorPagarPage'))
const ItemsPage       = lazy(() => import('@/features/catalog/ItemsPage'))
const AttributesPage  = lazy(() => import('@/features/catalog/AttributesPage'))
const ItemDetail      = lazy(() => import('@/features/catalog/ItemDetail'))
const ItemForm         = lazy(() => import('@/features/catalog/ItemForm'))
const QuotationsPage  = lazy(() => import('@/features/quotations/QuotationsPage'))
const QuotationDetail = lazy(() => import('@/features/quotations/QuotationDetail'))
const QuotationForm   = lazy(() => import('@/features/quotations/QuotationForm'))
const InvoicesPage    = lazy(() => import('@/features/invoicing/InvoicesPage'))
const InvoiceDetail   = lazy(() => import('@/features/invoicing/InvoiceDetail'))
const InvoiceForm     = lazy(() => import('@/features/invoicing/InvoiceForm'))
const CreditNotesPage = lazy(() => import('@/features/invoicing/CreditNotesPage'))
const DebitNotesPage  = lazy(() => import('@/features/invoicing/DebitNotesPage'))
const DevolucionesPage = lazy(() => import('@/features/invoicing/DevolucionesPage'))
const DevolucionDetail = lazy(() => import('@/features/invoicing/DevolucionDetail'))
const StockPage       = lazy(() => import('@/features/inventory/StockPage'))
const HistoryPage     = lazy(() => import('@/features/inventory/HistoryPage'))
const CountsPage      = lazy(() => import('@/features/inventory/CountsPage'))
const ZonasPage       = lazy(() => import('@/features/inventory/ZonasPage'))
const ComprasPage     = lazy(() => import('@/features/compras/ComprasPage'))
const CompraDetail    = lazy(() => import('@/features/compras/CompraDetail'))
const CompraForm      = lazy(() => import('@/features/compras/CompraForm'))
const RecepcionesPage = lazy(() => import('@/features/compras/RecepcionesPage'))
const RecepcionDetail = lazy(() => import('@/features/compras/RecepcionDetail'))
const RecepcionForm   = lazy(() => import('@/features/compras/RecepcionForm'))
const GastosPage      = lazy(() => import('@/features/gastos/GastosPage'))
const GastoDetail     = lazy(() => import('@/features/gastos/GastoDetail'))
const GastoForm       = lazy(() => import('@/features/gastos/GastoForm'))
const DevolucionesComprasPage = lazy(() => import('@/features/devoluciones-compras/DevolucionesPage'))
const DevolucionCompraDetail  = lazy(() => import('@/features/devoluciones-compras/DevolucionDetail'))
const DevolucionCompraForm    = lazy(() => import('@/features/devoluciones-compras/DevolucionForm'))
const SuppliersPage   = lazy(() => import('@/features/suppliers/SuppliersPage'))
const SupplierDetail  = lazy(() => import('@/features/suppliers/SupplierDetail'))
const SupplierForm    = lazy(() => import('@/features/suppliers/SupplierForm'))
const AgingPage       = lazy(() => import('@/features/cobros/AgingPage'))
const SemaforoPage    = lazy(() => import('@/features/cobros/SemaforoPage'))
const PagoPage        = lazy(() => import('@/features/cobros/PagoPage'))
const CajaPage        = lazy(() => import('@/features/caja/CajaPage'))
const CobrosPage      = lazy(() => import('@/features/cobros/CobrosPage'))
const CobroDetail     = lazy(() => import('@/features/cobros/CobroDetail'))
const AgingProveedoresPage = lazy(() => import('@/features/pagos/AgingProveedoresPage'))
const RegistrarPagoPage   = lazy(() => import('@/features/pagos/RegistrarPagoPage'))
const PendientesPagoPage  = lazy(() => import('@/features/pagos/PendientesPagoPage'))
const PagosPage           = lazy(() => import('@/features/pagos/PagosPage'))
const PagoDetail          = lazy(() => import('@/features/pagos/PagoDetail'))
const UsuariosPage    = lazy(() => import('@/features/usuarios/UsuariosPage'))
const ReportesPage    = lazy(() => import('@/features/reportes/ReportesPage'))
const EmpresaConfig   = lazy(() => import('@/features/config/EmpresaConfig'))
const NcfPage         = lazy(() => import('@/features/config/NcfPage'))
const SucursalesPage  = lazy(() => import('@/features/config/SucursalesPage'))
const CajasPage       = lazy(() => import('@/features/config/CajasPage'))
const ConfigPage      = lazy(() => import('@/features/config/ConfigPage'))
const CuentasPage     = lazy(() => import('@/features/cuentas/CuentasPage'))
const CuentaDetail    = lazy(() => import('@/features/cuentas/CuentaDetail'))
const CuentaForm      = lazy(() => import('@/features/cuentas/CuentaForm'))
const JournalPage     = lazy(() => import('@/features/journal/JournalPage'))
const JournalForm     = lazy(() => import('@/features/journal/JournalForm'))
const JournalDetail   = lazy(() => import('@/features/journal/JournalDetail'))
const CierrePeriodoPage = lazy(() => import('@/features/contabilidad/CierrePeriodoPage'))
const LibroDiarioPage   = lazy(() => import('@/features/contabilidad/LibroDiarioPage'))
const LibroMayorPage    = lazy(() => import('@/features/contabilidad/LibroMayorPage'))
const BundlesPage       = lazy(() => import('@/features/bundles/BundlesPage'))
const PricingRulesPage  = lazy(() => import('@/features/catalog/PricingRulesPage'))
const PedidosPage       = lazy(() => import('@/features/pedidos/PedidosPage'))
const PedidoDetail      = lazy(() => import('@/features/pedidos/PedidoDetail'))
const PedidoForm        = lazy(() => import('@/features/pedidos/PedidoForm'))
const TransferenciasPage = lazy(() => import('@/features/transferencias/TransferenciasPage'))
const TransferenciaForm  = lazy(() => import('@/features/transferencias/TransferenciaForm'))
const TransferenciaDetail = lazy(() => import('@/features/transferencias/TransferenciaDetail'))
const CentrosCostoPage    = lazy(() => import('@/features/config/CentrosCostoPage'))
const BancosPage          = lazy(() => import('@/features/config/BancosPage'))
const CuentasBancariasPage = lazy(() => import('@/features/config/CuentasBancariasPage'))
const DepartamentosPage   = lazy(() => import('@/features/config/DepartamentosPage'))
const RetencionesPage     = lazy(() => import('@/features/config/RetencionesPage'))
const AjustesAvanzadosPage = lazy(() => import('@/features/config/AjustesAvanzadosPage'))
const NotificacionesPage   = lazy(() => import('@/features/config/NotificacionesPage'))
const PermisosPage         = lazy(() => import('@/features/config/PermisosPage'))
const RolesPage            = lazy(() => import('@/features/config/RolesPage'))
const RoleDetailPage       = lazy(() => import('@/features/config/RoleDetailPage'))
const InvoiceTemplateEditorPage = lazy(() => import('@/features/invoice-template-editor/InvoiceTemplateEditorPage'))
const CostosImportacionPage = lazy(() => import('@/features/compras/CostosImportacionPage'))
const CostoImportacionDetail = lazy(() => import('@/features/compras/CostoImportacionDetail'))
const PorCobrarPage = lazy(() => import('@/features/caja/PorCobrarPage'))
const TurnosPage = lazy(() => import('@/features/pos/TurnosPage'))
const TurnoDetailPage = lazy(() => import('@/features/pos/TurnoDetailPage'))

// Tesorería
const TiposDocumentoPage = lazy(() => import('@/features/tesoreria/TiposDocumentoPage'))
const EmisionesPage = lazy(() => import('@/features/tesoreria/EmisionesPage'))
const EmisionForm = lazy(() => import('@/features/tesoreria/EmisionForm'))
const EmisionDetail = lazy(() => import('@/features/tesoreria/EmisionDetail'))
const DepositosPage = lazy(() => import('@/features/tesoreria/DepositosPage'))
const DepositoForm = lazy(() => import('@/features/tesoreria/DepositoForm'))
const DepositoDetail = lazy(() => import('@/features/tesoreria/DepositoDetail'))
const TransferenciasInternasPage = lazy(() => import('@/features/tesoreria/TransferenciasInternasPage'))
const TransferenciaInternaForm = lazy(() => import('@/features/tesoreria/TransferenciaInternaForm'))
const TransferenciaInternaDetail = lazy(() => import('@/features/tesoreria/TransferenciaInternaDetail'))
const MovimientosBancoPage = lazy(() => import('@/features/tesoreria/MovimientosBancoPage'))
const PlantillasChequePage = lazy(() => import('@/features/tesoreria/PlantillasChequePage'))
const PlantillaChequeForm = lazy(() => import('@/features/tesoreria/PlantillaChequeForm'))

function PageLoader() {
  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span className="skeleton-box" style={{ width: 240, height: 24 }} />
      <span className="skeleton-box" style={{ width: 360, height: 14 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="skeleton-box" style={{ height: 96, borderRadius: 8 }} />
        ))}
      </div>
      <span className="skeleton-box" style={{ height: 240, borderRadius: 8, marginTop: 4 }} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/completar-registro" element={<CompletarRegistroPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
            <Route path="/inicio" element={<StartPage />} />

            {/* Clientes */}
            <Route path="/clientes" element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
            <Route path="/clientes/nuevo" element={<Suspense fallback={<PageLoader />}><CustomerForm /></Suspense>} />
            <Route path="/clientes/:id" element={<Suspense fallback={<PageLoader />}><CustomerDetail /></Suspense>} />
            <Route path="/clientes/:id/editar" element={<Suspense fallback={<PageLoader />}><CustomerForm /></Suspense>} />

            {/* Catálogo */}
            <Route path="/catalogo/categorias" element={<Suspense fallback={<PageLoader />}><CategoriesPage /></Suspense>} />
            <Route path="/catalogo/marcas" element={<Suspense fallback={<PageLoader />}><BrandsPage /></Suspense>} />
            <Route path="/catalogo/cuentas-por-pagar" element={<Suspense fallback={<PageLoader />}><CuentasPorPagarPage /></Suspense>} />
            <Route path="/catalogo/combos" element={<Suspense fallback={<PageLoader />}><BundlesPage /></Suspense>} />
            <Route path="/catalogo/descuentos" element={<Suspense fallback={<PageLoader />}><PricingRulesPage /></Suspense>} />

            {/* Cotizaciones */}
            <Route path="/cotizaciones" element={<Suspense fallback={<PageLoader />}><QuotationsPage /></Suspense>} />
            <Route path="/cotizaciones/nueva" element={<Suspense fallback={<PageLoader />}><QuotationForm /></Suspense>} />
            <Route path="/cotizaciones/:id/editar" element={<Suspense fallback={<PageLoader />}><QuotationForm /></Suspense>} />
            <Route path="/cotizaciones/:id" element={<Suspense fallback={<PageLoader />}><QuotationDetail /></Suspense>} />

            {/* Pedidos de Venta */}
            <Route path="/pedidos" element={<Suspense fallback={<PageLoader />}><PedidosPage /></Suspense>} />
            <Route path="/pedidos/nuevo" element={<Suspense fallback={<PageLoader />}><PedidoForm /></Suspense>} />
            <Route path="/pedidos/:id" element={<Suspense fallback={<PageLoader />}><PedidoDetail /></Suspense>} />
            <Route path="/pedidos/:id/editar" element={<Suspense fallback={<PageLoader />}><PedidoForm /></Suspense>} />

            {/* Transferencias entre almacenes */}
            <Route path="/transferencias" element={<Suspense fallback={<PageLoader />}><TransferenciasPage /></Suspense>} />
            <Route path="/transferencias/nueva" element={<Suspense fallback={<PageLoader />}><TransferenciaForm /></Suspense>} />
            <Route path="/transferencias/:id" element={<Suspense fallback={<PageLoader />}><TransferenciaDetail /></Suspense>} />

            {/* Facturación */}
            <Route path="/facturas" element={<Suspense fallback={<PageLoader />}><InvoicesPage /></Suspense>} />
            <Route path="/facturas/nueva" element={<Suspense fallback={<PageLoader />}><InvoiceForm /></Suspense>} />
            <Route path="/facturas/:id" element={<Suspense fallback={<PageLoader />}><InvoiceDetail /></Suspense>} />
            <Route path="/notas-credito" element={<Suspense fallback={<PageLoader />}><CreditNotesPage /></Suspense>} />
            <Route path="/notas-debito" element={<Suspense fallback={<PageLoader />}><DebitNotesPage /></Suspense>} />
            <Route path="/devoluciones" element={<Suspense fallback={<PageLoader />}><DevolucionesPage /></Suspense>} />
            <Route path="/devoluciones/:id" element={<Suspense fallback={<PageLoader />}><DevolucionDetail /></Suspense>} />

            {/* Inventario */}
             <Route path="/inventario/productos" element={<Suspense fallback={<PageLoader />}><ItemsPage /></Suspense>} />
            <Route path="/inventario/productos/nuevo" element={<Suspense fallback={<PageLoader />}><ItemForm /></Suspense>} />
            <Route path="/inventario/productos/:id/editar" element={<Suspense fallback={<PageLoader />}><ItemForm /></Suspense>} />
            <Route path="/inventario/productos/:id" element={<Suspense fallback={<PageLoader />}><ItemDetail /></Suspense>} />
            <Route path="/catalogo/servicios" element={<Suspense fallback={<PageLoader />}><ItemsPage /></Suspense>} />
            <Route path="/catalogo/servicios/nuevo" element={<Suspense fallback={<PageLoader />}><ItemForm /></Suspense>} />
            <Route path="/catalogo/servicios/:id/editar" element={<Suspense fallback={<PageLoader />}><ItemForm /></Suspense>} />
            <Route path="/catalogo/servicios/:id" element={<Suspense fallback={<PageLoader />}><ItemDetail /></Suspense>} />
            <Route path="/catalogo/atributos" element={<Suspense fallback={<PageLoader />}><AttributesPage /></Suspense>} />
            <Route path="/inventario/stock" element={<Suspense fallback={<PageLoader />}><StockPage /></Suspense>} />
            <Route path="/inventario/historial" element={<Suspense fallback={<PageLoader />}><HistoryPage /></Suspense>} />
            <Route path="/inventario/conteos" element={<Suspense fallback={<PageLoader />}><CountsPage /></Suspense>} />
            <Route path="/inventario/zonas" element={<Suspense fallback={<PageLoader />}><ZonasPage /></Suspense>} />

            {/* Compras */}
            <Route path="/compras" element={<Suspense fallback={<PageLoader />}><ComprasPage /></Suspense>} />
            <Route path="/compras/nueva" element={<Suspense fallback={<PageLoader />}><CompraForm /></Suspense>} />
            <Route path="/compras/:id/editar" element={<Suspense fallback={<PageLoader />}><CompraForm /></Suspense>} />
            <Route path="/compras/:id" element={<Suspense fallback={<PageLoader />}><CompraDetail /></Suspense>} />

            {/* Recepción de Mercancía (Purchase Receipt — flujo de 2 pasos) */}
            <Route path="/compras/recepciones" element={<Suspense fallback={<PageLoader />}><RecepcionesPage /></Suspense>} />
            <Route path="/compras/recepciones/nueva" element={<Suspense fallback={<PageLoader />}><RecepcionForm /></Suspense>} />
            <Route path="/compras/recepciones/:id/editar" element={<Suspense fallback={<PageLoader />}><RecepcionForm /></Suspense>} />
            <Route path="/compras/recepciones/:id" element={<Suspense fallback={<PageLoader />}><RecepcionDetail /></Suspense>} />

            {/* Costos de Importación (Landed Cost) */}
            <Route path="/compras/costos-importacion" element={<Suspense fallback={<PageLoader />}><CostosImportacionPage /></Suspense>} />
            <Route path="/compras/costos-importacion/:id" element={<Suspense fallback={<PageLoader />}><CostoImportacionDetail /></Suspense>} />

            {/* Devoluciones de Compras */}
            <Route path="/devoluciones-compras" element={<Suspense fallback={<PageLoader />}><DevolucionesComprasPage /></Suspense>} />
            <Route path="/devoluciones-compras/nueva" element={<Suspense fallback={<PageLoader />}><DevolucionCompraForm /></Suspense>} />
            <Route path="/devoluciones-compras/:id/editar" element={<Suspense fallback={<PageLoader />}><DevolucionCompraForm /></Suspense>} />
            <Route path="/devoluciones-compras/:id" element={<Suspense fallback={<PageLoader />}><DevolucionCompraDetail /></Suspense>} />

            {/* Gastos */}
            <Route path="/gastos" element={<Suspense fallback={<PageLoader />}><GastosPage /></Suspense>} />
            <Route path="/gastos/nuevo" element={<Suspense fallback={<PageLoader />}><GastoForm /></Suspense>} />
            <Route path="/gastos/:id/editar" element={<Suspense fallback={<PageLoader />}><GastoForm /></Suspense>} />
            <Route path="/gastos/:id" element={<Suspense fallback={<PageLoader />}><GastoDetail /></Suspense>} />

            {/* Proveedores */}
            <Route path="/proveedores" element={<Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense>} />
            <Route path="/proveedores/nuevo" element={<Suspense fallback={<PageLoader />}><SupplierForm /></Suspense>} />
            <Route path="/proveedores/:id" element={<Suspense fallback={<PageLoader />}><SupplierDetail /></Suspense>} />
            <Route path="/proveedores/:id/editar" element={<Suspense fallback={<PageLoader />}><SupplierForm /></Suspense>} />

            {/* Caja / Cobros */}
            <Route path="/caja/pendientes" element={<Suspense fallback={<PageLoader />}><CajaPage /></Suspense>} />
            <Route path="/caja/por-cobrar" element={<Suspense fallback={<PageLoader />}><PorCobrarPage /></Suspense>} />
            <Route path="/turnos" element={<Suspense fallback={<PageLoader />}><TurnosPage /></Suspense>} />
            <Route path="/turnos/:id" element={<Suspense fallback={<PageLoader />}><TurnoDetailPage /></Suspense>} />
            <Route path="/cobros/lista" element={<Suspense fallback={<PageLoader />}><CobrosPage /></Suspense>} />
            <Route path="/cobros/pago" element={<Suspense fallback={<PageLoader />}><PagoPage /></Suspense>} />
            <Route path="/cobros/aging" element={<Suspense fallback={<PageLoader />}><AgingPage /></Suspense>} />
            <Route path="/cobros/semaforo" element={<Suspense fallback={<PageLoader />}><SemaforoPage /></Suspense>} />
            <Route path="/cobros/:id" element={<Suspense fallback={<PageLoader />}><CobroDetail /></Suspense>} />

            {/* Cuentas por Pagar */}
            <Route path="/pagos/lista" element={<Suspense fallback={<PageLoader />}><PagosPage /></Suspense>} />
            <Route path="/pagos/pendientes" element={<Suspense fallback={<PageLoader />}><PendientesPagoPage /></Suspense>} />
            <Route path="/pagos/nuevo" element={<Suspense fallback={<PageLoader />}><RegistrarPagoPage /></Suspense>} />
            <Route path="/pagos/aging" element={<Suspense fallback={<PageLoader />}><AgingProveedoresPage /></Suspense>} />
            <Route path="/pagos/:id" element={<Suspense fallback={<PageLoader />}><PagoDetail /></Suspense>} />

            {/* Tesorería — Emisiones (egresos) */}
            <Route path="/tesoreria/emisiones" element={<Suspense fallback={<PageLoader />}><EmisionesPage /></Suspense>} />
            <Route path="/tesoreria/emisiones/nueva" element={<Suspense fallback={<PageLoader />}><EmisionForm /></Suspense>} />
            <Route path="/tesoreria/emisiones/:id" element={<Suspense fallback={<PageLoader />}><EmisionDetail /></Suspense>} />

            {/* Tesorería — Depósitos (ingresos) */}
            <Route path="/tesoreria/depositos" element={<Suspense fallback={<PageLoader />}><DepositosPage /></Suspense>} />
            <Route path="/tesoreria/depositos/nuevo" element={<Suspense fallback={<PageLoader />}><DepositoForm /></Suspense>} />
            <Route path="/tesoreria/depositos/:id" element={<Suspense fallback={<PageLoader />}><DepositoDetail /></Suspense>} />

            {/* Tesorería — Transferencias Internas */}
            <Route path="/tesoreria/transferencias" element={<Suspense fallback={<PageLoader />}><TransferenciasInternasPage /></Suspense>} />
            <Route path="/tesoreria/transferencias/nueva" element={<Suspense fallback={<PageLoader />}><TransferenciaInternaForm /></Suspense>} />
            <Route path="/tesoreria/transferencias/:id" element={<Suspense fallback={<PageLoader />}><TransferenciaInternaDetail /></Suspense>} />

            {/* Tesorería — Movimientos (libro de banco, solo lectura) */}
            <Route path="/tesoreria/movimientos" element={<Suspense fallback={<PageLoader />}><MovimientosBancoPage /></Suspense>} />

            {/* Usuarios */}
            <Route path="/usuarios" element={<Suspense fallback={<PageLoader />}><UsuariosPage /></Suspense>} />

            {/* Reportes */}
            <Route path="/reportes/:tipo" element={<Suspense fallback={<PageLoader />}><ReportesPage /></Suspense>} />
            <Route path="/reportes" element={<Navigate to="/reportes/606" replace />} />

            {/* Contabilidad — Plan de Cuentas */}
            <Route path="/cuentas" element={<Suspense fallback={<PageLoader />}><CuentasPage /></Suspense>} />
            <Route path="/cuentas/nueva" element={<Suspense fallback={<PageLoader />}><CuentaForm /></Suspense>} />
            <Route path="/cuentas/:id/editar" element={<Suspense fallback={<PageLoader />}><CuentaForm /></Suspense>} />
            <Route path="/cuentas/:id" element={<Suspense fallback={<PageLoader />}><CuentaDetail /></Suspense>} />

            {/* Contabilidad — Asientos */}
            <Route path="/asientos" element={<Suspense fallback={<PageLoader />}><JournalPage /></Suspense>} />
            <Route path="/asientos/nuevo" element={<Suspense fallback={<PageLoader />}><JournalForm /></Suspense>} />
            <Route path="/asientos/:id" element={<Suspense fallback={<PageLoader />}><JournalDetail /></Suspense>} />

            {/* Contabilidad — Cierre de Período */}
            <Route path="/contabilidad/cierre-periodo" element={<Suspense fallback={<PageLoader />}><CierrePeriodoPage /></Suspense>} />

            {/* Contabilidad — Libro Diario */}
            <Route path="/contabilidad/libro-diario" element={<Suspense fallback={<PageLoader />}><LibroDiarioPage /></Suspense>} />

            {/* Contabilidad — Libro Mayor */}
            <Route path="/contabilidad/libro-mayor" element={<Suspense fallback={<PageLoader />}><LibroMayorPage /></Suspense>} />

            {/* Configuración */}
            <Route path="/config/empresa" element={<Suspense fallback={<PageLoader />}><EmpresaConfig /></Suspense>} />
            {/* /config/ncf and /config/sucursales must be before /config/:seccion to avoid being caught as seccion */}
            <Route path="/config/ncf" element={<Suspense fallback={<PageLoader />}><NcfPage /></Suspense>} />
            <Route path="/config/sucursales" element={<Suspense fallback={<PageLoader />}><SucursalesPage /></Suspense>} />
            <Route path="/config/plantillas-facturas" element={<Suspense fallback={<PageLoader />}><InvoiceTemplateEditorPage /></Suspense>} />
            <Route path="/config/cajas" element={<Suspense fallback={<PageLoader />}><CajasPage /></Suspense>} />
            <Route path="/config/centros-costo" element={<Suspense fallback={<PageLoader />}><CentrosCostoPage /></Suspense>} />
            <Route path="/config/bancos" element={<Suspense fallback={<PageLoader />}><BancosPage /></Suspense>} />
            <Route path="/config/cuentas-bancarias" element={<Suspense fallback={<PageLoader />}><CuentasBancariasPage /></Suspense>} />
            <Route path="/config/tesoreria/tipos-documento" element={<Suspense fallback={<PageLoader />}><TiposDocumentoPage /></Suspense>} />
            <Route path="/config/tesoreria/plantillas-cheque" element={<Suspense fallback={<PageLoader />}><PlantillasChequePage /></Suspense>} />
            <Route path="/config/tesoreria/plantillas-cheque/nueva" element={<Suspense fallback={<PageLoader />}><PlantillaChequeForm /></Suspense>} />
            <Route path="/config/tesoreria/plantillas-cheque/:id" element={<Suspense fallback={<PageLoader />}><PlantillaChequeForm /></Suspense>} />
            <Route path="/config/departamentos" element={<Suspense fallback={<PageLoader />}><DepartamentosPage /></Suspense>} />
            <Route path="/config/retenciones" element={<Suspense fallback={<PageLoader />}><RetencionesPage /></Suspense>} />
            <Route path="/config/ajustes-avanzados" element={<Suspense fallback={<PageLoader />}><AjustesAvanzadosPage /></Suspense>} />
            <Route path="/config/notificaciones" element={<Suspense fallback={<PageLoader />}><NotificacionesPage /></Suspense>} />
            <Route path="/config/permisos" element={<Suspense fallback={<PageLoader />}><PermisosPage /></Suspense>} />
            <Route path="/config/roles" element={<Suspense fallback={<PageLoader />}><RolesPage /></Suspense>} />
            <Route path="/config/roles/:name" element={<Suspense fallback={<PageLoader />}><RoleDetailPage /></Suspense>} />
            <Route path="/config/:seccion" element={<Suspense fallback={<PageLoader />}><ConfigPage /></Suspense>} />
            <Route path="/config" element={<Navigate to="/config/empresa" replace />} />

          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
