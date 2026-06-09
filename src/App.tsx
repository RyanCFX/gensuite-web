import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'

// Lazy-loaded pages
import { lazy, Suspense } from 'react'

const DashboardPage   = lazy(() => import('@/features/dashboard/DashboardPage'))
const CustomersPage   = lazy(() => import('@/features/customers/CustomersPage'))
const CustomerDetail  = lazy(() => import('@/features/customers/CustomerDetail'))
const CustomerForm    = lazy(() => import('@/features/customers/CustomerForm'))
const CategoriesPage  = lazy(() => import('@/features/catalog/CategoriesPage'))
const BrandsPage      = lazy(() => import('@/features/catalog/BrandsPage'))
const ItemsPage       = lazy(() => import('@/features/catalog/ItemsPage'))
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
const StockPage       = lazy(() => import('@/features/inventory/StockPage'))
const HistoryPage     = lazy(() => import('@/features/inventory/HistoryPage'))
const CountsPage      = lazy(() => import('@/features/inventory/CountsPage'))
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
const UsuariosPage    = lazy(() => import('@/features/usuarios/UsuariosPage'))
const ReportesPage    = lazy(() => import('@/features/reportes/ReportesPage'))
const EmpresaConfig   = lazy(() => import('@/features/config/EmpresaConfig'))
const NcfPage         = lazy(() => import('@/features/config/NcfPage'))
const ConfigPage      = lazy(() => import('@/features/config/ConfigPage'))
const CuentasPage     = lazy(() => import('@/features/cuentas/CuentasPage'))
const CuentaDetail    = lazy(() => import('@/features/cuentas/CuentaDetail'))
const CuentaForm      = lazy(() => import('@/features/cuentas/CuentaForm'))
const JournalPage     = lazy(() => import('@/features/journal/JournalPage'))
const JournalForm     = lazy(() => import('@/features/journal/JournalForm'))
const JournalDetail   = lazy(() => import('@/features/journal/JournalDetail'))

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
            <Route path="/catalogo/articulos" element={<Suspense fallback={<PageLoader />}><ItemsPage /></Suspense>} />
            <Route path="/catalogo/articulos/nuevo" element={<Suspense fallback={<PageLoader />}><ItemForm /></Suspense>} />
            <Route path="/catalogo/articulos/:id" element={<Suspense fallback={<PageLoader />}><ItemDetail /></Suspense>} />

            {/* Cotizaciones */}
            <Route path="/cotizaciones" element={<Suspense fallback={<PageLoader />}><QuotationsPage /></Suspense>} />
            <Route path="/cotizaciones/nueva" element={<Suspense fallback={<PageLoader />}><QuotationForm /></Suspense>} />
            <Route path="/cotizaciones/:id" element={<Suspense fallback={<PageLoader />}><QuotationDetail /></Suspense>} />

            {/* Facturación */}
            <Route path="/facturacion/facturas" element={<Suspense fallback={<PageLoader />}><InvoicesPage /></Suspense>} />
            <Route path="/facturacion/facturas/nueva" element={<Suspense fallback={<PageLoader />}><InvoiceForm /></Suspense>} />
            <Route path="/facturacion/facturas/:id/editar" element={<Suspense fallback={<PageLoader />}><InvoiceForm /></Suspense>} />
            <Route path="/facturacion/facturas/:id" element={<Suspense fallback={<PageLoader />}><InvoiceDetail /></Suspense>} />
            <Route path="/facturacion/notas-credito" element={<Suspense fallback={<PageLoader />}><CreditNotesPage /></Suspense>} />
            <Route path="/facturacion/notas-debito" element={<Suspense fallback={<PageLoader />}><DebitNotesPage /></Suspense>} />

            {/* Inventario */}
            <Route path="/inventario/stock" element={<Suspense fallback={<PageLoader />}><StockPage /></Suspense>} />
            <Route path="/inventario/historial" element={<Suspense fallback={<PageLoader />}><HistoryPage /></Suspense>} />
            <Route path="/inventario/conteos" element={<Suspense fallback={<PageLoader />}><CountsPage /></Suspense>} />

            {/* Compras */}
            <Route path="/compras" element={<Suspense fallback={<PageLoader />}><ComprasPage /></Suspense>} />
            <Route path="/compras/nueva" element={<Suspense fallback={<PageLoader />}><CompraForm /></Suspense>} />
            <Route path="/compras/:id" element={<Suspense fallback={<PageLoader />}><CompraDetail /></Suspense>} />

            {/* Gastos */}
            <Route path="/gastos" element={<Suspense fallback={<PageLoader />}><GastosPage /></Suspense>} />
            <Route path="/gastos/nuevo" element={<Suspense fallback={<PageLoader />}><GastoForm /></Suspense>} />
            <Route path="/gastos/:id" element={<Suspense fallback={<PageLoader />}><GastoDetail /></Suspense>} />

            {/* Proveedores */}
            <Route path="/proveedores" element={<Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense>} />
            <Route path="/proveedores/nuevo" element={<Suspense fallback={<PageLoader />}><SupplierForm /></Suspense>} />
            <Route path="/proveedores/:id" element={<Suspense fallback={<PageLoader />}><SupplierDetail /></Suspense>} />
            <Route path="/proveedores/:id/editar" element={<Suspense fallback={<PageLoader />}><SupplierForm /></Suspense>} />

            {/* Cobros */}
            <Route path="/cobros" element={<Suspense fallback={<PageLoader />}><CobrosPage /></Suspense>} />
            <Route path="/cobros/pago" element={<Suspense fallback={<PageLoader />}><PagoPage /></Suspense>} />
            <Route path="/cobros/aging" element={<Suspense fallback={<PageLoader />}><AgingPage /></Suspense>} />
            <Route path="/cobros/semaforo" element={<Suspense fallback={<PageLoader />}><SemaforoPage /></Suspense>} />
            <Route path="/cobros/:id" element={<Suspense fallback={<PageLoader />}><CobroDetail /></Suspense>} />

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

            {/* Configuración */}
            <Route path="/config/empresa" element={<Suspense fallback={<PageLoader />}><EmpresaConfig /></Suspense>} />
            {/* /config/ncf must be before /config/:seccion to avoid being caught as seccion='ncf' */}
            <Route path="/config/ncf" element={<Suspense fallback={<PageLoader />}><NcfPage /></Suspense>} />
            <Route path="/config/:seccion" element={<Suspense fallback={<PageLoader />}><ConfigPage /></Suspense>} />
            <Route path="/config" element={<Navigate to="/config/empresa" replace />} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
