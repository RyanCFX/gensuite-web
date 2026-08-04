import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import NotFoundPage from '@/pages/NotFoundPage'

// Lazy-loaded pages
import { lazy, Suspense } from 'react'

const DashboardPage   = lazy(() => import('@/features/dashboard/DashboardPage'))
const CustomersPage   = lazy(() => import('@/features/customers/CustomersPage'))
const CustomerDetail  = lazy(() => import('@/features/customers/CustomerDetail'))
const CustomerForm    = lazy(() => import('@/features/customers/CustomerForm'))
const CategoriesPage  = lazy(() => import('@/features/catalog/CategoriesPage'))
const BrandsPage      = lazy(() => import('@/features/catalog/BrandsPage'))
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
const GastosPage      = lazy(() => import('@/features/gastos/GastosPage'))
const GastoDetail     = lazy(() => import('@/features/gastos/GastoDetail'))
const GastoForm       = lazy(() => import('@/features/gastos/GastoForm'))
const SuppliersPage   = lazy(() => import('@/features/suppliers/SuppliersPage'))
const SupplierDetail  = lazy(() => import('@/features/suppliers/SupplierDetail'))
const SupplierForm    = lazy(() => import('@/features/suppliers/SupplierForm'))
const AgingPage       = lazy(() => import('@/features/cobros/AgingPage'))
const SemaforoPage    = lazy(() => import('@/features/cobros/SemaforoPage'))
const PagoPage        = lazy(() => import('@/features/cobros/PagoPage'))
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
const PedidosPage       = lazy(() => import('@/features/pedidos/PedidosPage'))
const PedidoDetail      = lazy(() => import('@/features/pedidos/PedidoDetail'))
const PedidoForm        = lazy(() => import('@/features/pedidos/PedidoForm'))
const TransferenciasPage = lazy(() => import('@/features/transferencias/TransferenciasPage'))
const TransferenciaForm  = lazy(() => import('@/features/transferencias/TransferenciaForm'))
const TransferenciaDetail = lazy(() => import('@/features/transferencias/TransferenciaDetail'))
const CentrosCostoPage    = lazy(() => import('@/features/config/CentrosCostoPage'))
const DepartamentosPage   = lazy(() => import('@/features/config/DepartamentosPage'))
const RetencionesPage     = lazy(() => import('@/features/config/RetencionesPage'))
const AjustesAvanzadosPage = lazy(() => import('@/features/config/AjustesAvanzadosPage'))
const NotificacionesPage   = lazy(() => import('@/features/config/NotificacionesPage'))
const CostosImportacionPage = lazy(() => import('@/features/compras/CostosImportacionPage'))
const CostoImportacionDetail = lazy(() => import('@/features/compras/CostoImportacionDetail'))
const CajaPage = lazy(() => import('@/features/caja/CajaPage'))
const PorCobrarPage = lazy(() => import('@/features/caja/PorCobrarPage'))
const TurnosPage = lazy(() => import('@/features/pos/TurnosPage'))
const TurnoDetailPage = lazy(() => import('@/features/pos/TurnoDetailPage'))

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
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />

            {/* Clientes */}
            <Route path="/clientes" element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
            <Route path="/clientes/nuevo" element={<Suspense fallback={<PageLoader />}><CustomerForm /></Suspense>} />
            <Route path="/clientes/:id" element={<Suspense fallback={<PageLoader />}><CustomerDetail /></Suspense>} />
            <Route path="/clientes/:id/editar" element={<Suspense fallback={<PageLoader />}><CustomerForm /></Suspense>} />

            {/* Catálogo */}
            <Route path="/catalogo/categorias" element={<Suspense fallback={<PageLoader />}><CategoriesPage /></Suspense>} />
            <Route path="/catalogo/marcas" element={<Suspense fallback={<PageLoader />}><BrandsPage /></Suspense>} />
            <Route path="/catalogo/combos" element={<Suspense fallback={<PageLoader />}><BundlesPage /></Suspense>} />

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
             <Route path="/inventario/articulos" element={<Suspense fallback={<PageLoader />}><ItemsPage /></Suspense>} />
            <Route path="/inventario/articulos/nuevo" element={<Suspense fallback={<PageLoader />}><ItemForm /></Suspense>} />
            <Route path="/inventario/articulos/:id" element={<Suspense fallback={<PageLoader />}><ItemDetail /></Suspense>} />
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

            {/* Costos de Importación (Landed Cost) */}
            <Route path="/compras/costos-importacion" element={<Suspense fallback={<PageLoader />}><CostosImportacionPage /></Suspense>} />
            <Route path="/compras/costos-importacion/:id" element={<Suspense fallback={<PageLoader />}><CostoImportacionDetail /></Suspense>} />

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
            <Route path="/config/centros-costo" element={<Suspense fallback={<PageLoader />}><CentrosCostoPage /></Suspense>} />
            <Route path="/config/departamentos" element={<Suspense fallback={<PageLoader />}><DepartamentosPage /></Suspense>} />
            <Route path="/config/retenciones" element={<Suspense fallback={<PageLoader />}><RetencionesPage /></Suspense>} />
            <Route path="/config/ajustes-avanzados" element={<Suspense fallback={<PageLoader />}><AjustesAvanzadosPage /></Suspense>} />
            <Route path="/config/notificaciones" element={<Suspense fallback={<PageLoader />}><NotificacionesPage /></Suspense>} />
            <Route path="/config/:seccion" element={<Suspense fallback={<PageLoader />}><ConfigPage /></Suspense>} />
            <Route path="/config" element={<Navigate to="/config/empresa" replace />} />

          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
