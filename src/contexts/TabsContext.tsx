import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useKeepAliveRef, type KeepAliveRef } from 'keepalive-for-react'

export interface Tab {
  id: string
  path: string
  title: string
  isDirty: boolean
}

interface CloseTabOptions {
  /** No navegar aunque la pestaña cerrada sea la activa (usar cuando ya se navegó a otra ruta). */
  skipNavigate?: boolean
}

interface TabsContextValue {
  tabs: Tab[]
  activeId: string | null
  closeTab: (id: string, options?: CloseTabOptions) => void
  setTabDirty: (pathname: string, dirty: boolean) => void
  updateTabTitle: (pathname: string, title: string) => void
  multiTab: boolean
  toggleMultiTab: () => void
  keepAliveRef: React.RefObject<KeepAliveRef | null>
}

const TabsContext = createContext<TabsContextValue | null>(null)

/** "impuestos-ventas" → "Impuestos Ventas" — fallback para secciones de /config/:seccion sin regla propia. */
function titleize(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getTitleForPath(pathname: string): string {
  const rules: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
    [/^\/dashboard$/, 'Dashboard'],
    [/^\/inicio$/, 'Inicio'],

    // Clientes
    [/^\/clientes\/nuevo$/, 'Nuevo Cliente'],
    [/^\/clientes\/(.+)\/editar$/, 'Editar Cliente'],
    [/^\/clientes\/(.+)$/, (m) => `Cliente: ${m[1]}`],
    [/^\/clientes$/, 'Clientes'],

    // Catálogo
    [/^\/catalogo\/categorias$/, 'Categorías'],
    [/^\/catalogo\/marcas$/, 'Marcas'],
    [/^\/catalogo\/combos$/, 'Combos'],
    [/^\/catalogo\/atributos$/, 'Atributos'],
    [/^\/catalogo\/cuentas-por-pagar$/, 'Cuentas por Pagar'],
    [/^\/catalogo\/descuentos$/, 'Descuentos por Producto'],
    [/^\/catalogo\/servicios\/nuevo$/, 'Nuevo Servicio'],
    [/^\/catalogo\/servicios\/(.+)\/editar$/, 'Editar Servicio'],
    [/^\/catalogo\/servicios\/(.+)$/, (m) => `Servicio: ${m[1]}`],
    [/^\/catalogo\/servicios$/, 'Servicios'],

    // Inventario / Productos
    [/^\/inventario\/productos\/nuevo$/, 'Nuevo Producto'],
    [/^\/inventario\/productos\/(.+)\/editar$/, 'Editar Producto'],
    [/^\/inventario\/productos\/(.+)$/, (m) => `Producto: ${m[1]}`],
    [/^\/inventario\/productos$/, 'Productos'],
    [/^\/inventario\/stock$/, 'Stock Actual'],
    [/^\/inventario\/historial$/, 'Historial'],
    [/^\/inventario\/conteos$/, 'Conteos'],
    [/^\/inventario\/zonas$/, 'Zonas y Ubicaciones'],

    // Cotizaciones / Pedidos / Transferencias / Facturas
    [/^\/cotizaciones\/nueva$/, 'Nueva Cotización'],
    [/^\/cotizaciones\/(.+)$/, (m) => `Cotización: ${m[1]}`],
    [/^\/cotizaciones$/, 'Cotizaciones'],
    [/^\/pedidos\/nuevo$/, 'Nuevo Pedido'],
    [/^\/pedidos\/(.+)\/editar$/, (m) => `Editar Pedido: ${m[1]}`],
    [/^\/pedidos\/(.+)$/, (m) => `Pedido: ${m[1]}`],
    [/^\/pedidos$/, 'Pedidos'],
    [/^\/transferencias\/nueva$/, 'Nueva Transferencia'],
    [/^\/transferencias\/(.+)$/, (m) => `Transferencia: ${m[1]}`],
    [/^\/transferencias$/, 'Transferencias'],
    [/^\/facturas\/nueva$/, 'Nueva Factura'],
    [/^\/facturas\/(.+)\/editar$/, 'Editar Factura'],
    [/^\/facturas\/(.+)$/, (m) => `Factura: ${m[1]}`],
    [/^\/facturas$/, 'Facturas'],
    [/^\/notas-credito$/, 'Notas de Crédito'],
    [/^\/notas-debito$/, 'Notas de Débito'],
    [/^\/devoluciones\/(.+)$/, (m) => `Devolución: ${m[1]}`],
    [/^\/devoluciones$/, 'Devoluciones'],

    // Compras
    [/^\/compras\/recepciones\/nueva$/, 'Nueva Recepción de Mercancía'],
    [/^\/compras\/recepciones\/(.+)\/editar$/, 'Editar Recepción'],
    [/^\/compras\/recepciones\/(.+)$/, (m) => `Recepción: ${m[1]}`],
    [/^\/compras\/recepciones$/, 'Recepción de Mercancía'],
    [/^\/compras\/costos-importacion\/(.+)$/, (m) => `Costo de Importación ${m[1]}`],
    [/^\/compras\/costos-importacion$/, 'Costos de Importación'],
    [/^\/compras\/nueva$/, 'Nueva Compra'],
    [/^\/compras\/(.+)\/editar$/, (m) => `Editar Compra: ${m[1]}`],
    [/^\/compras\/(.+)$/, (m) => `Compra: ${m[1]}`],
    [/^\/compras$/, 'Compras'],
    [/^\/devoluciones-compras\/nueva$/, 'Nueva Devolución'],
    [/^\/devoluciones-compras\/(.+)\/editar$/, 'Editar Devolución'],
    [/^\/devoluciones-compras\/(.+)$/, (m) => `Devolución: ${m[1]}`],
    [/^\/devoluciones-compras$/, 'Devoluciones de Compras'],

    // Gastos / Proveedores
    [/^\/gastos\/nuevo$/, 'Nuevo Gasto'],
    [/^\/gastos\/(.+)\/editar$/, (m) => `Editar Gasto: ${m[1]}`],
    [/^\/gastos\/(.+)$/, (m) => `Gasto: ${m[1]}`],
    [/^\/gastos$/, 'Gastos'],
    [/^\/proveedores\/nuevo$/, 'Nuevo Proveedor'],
    [/^\/proveedores\/(.+)\/editar$/, 'Editar Proveedor'],
    [/^\/proveedores\/(.+)$/, (m) => `Proveedor: ${m[1]}`],
    [/^\/proveedores$/, 'Proveedores'],

    // Cobros (a clientes)
    [/^\/cobros\/pago$/, 'Registrar Cobro'],
    [/^\/cobros\/aging$/, 'Antiguedad de saldos CxC'],
    [/^\/cobros\/semaforo$/, 'Semáforo'],
    [/^\/cobros\/lista$/, 'Cobros'],
    [/^\/cobros\/(.+)$/, (m) => `Cobro: ${m[1]}`],

    // Pagos (a proveedores)
    [/^\/pagos\/lista$/, 'Pagos'],
    [/^\/pagos\/pendientes$/, 'Facturas Pendientes de Pago'],
    [/^\/pagos\/nuevo$/, 'Registrar Pago'],
    [/^\/pagos\/aging$/, 'Antiguedad de saldos por Pagar'],
    [/^\/pagos\/(.+)$/, (m) => `Pago: ${m[1]}`],

    // Caja / Turnos
    [/^\/caja\/pendientes$/, 'Caja'],
    [/^\/caja\/por-cobrar$/, 'Cobros Pendientes'],
    [/^\/turnos\/(.+)$/, (m) => `Turno: ${m[1]}`],
    [/^\/turnos$/, 'Turnos de Caja'],

    [/^\/usuarios$/, 'Usuarios'],
    [/^\/reportes\/(.+)$/, (m) => `Reporte ${m[1].toUpperCase()}`],

    // Contabilidad
    [/^\/cuentas\/nueva$/, 'Nueva Cuenta'],
    [/^\/cuentas\/(.+)\/editar$/, 'Editar Cuenta'],
    [/^\/cuentas\/(.+)$/, (m) => `Cuenta: ${m[1]}`],
    [/^\/cuentas$/, 'Plan de Cuentas'],
    [/^\/asientos\/nuevo$/, 'Nuevo Asiento'],
    [/^\/asientos\/(.+)$/, (m) => `Asiento: ${m[1]}`],
    [/^\/asientos$/, 'Asientos'],
    [/^\/contabilidad\/cierre-periodo$/, 'Cierre de Período'],
    [/^\/contabilidad\/libro-diario$/, 'Libro Diario'],
    [/^\/contabilidad\/libro-mayor$/, 'Libro Mayor'],

    // Configuración
    [/^\/config\/empresa$/, 'Empresa'],
    [/^\/config\/ncf$/, 'Secuencias NCF'],
    [/^\/config\/sucursales$/, 'Sucursales'],
    [/^\/config\/plantillas-facturas$/, 'Plantillas de Facturas'],
    [/^\/config\/cajas$/, 'Cajas'],
    [/^\/config\/centros-costo$/, 'Centros de Costo'],
    [/^\/config\/bancos$/, 'Bancos'],
    [/^\/config\/cuentas-bancarias$/, 'Cuentas Bancarias'],
    [/^\/config\/departamentos$/, 'Departamentos'],
    [/^\/config\/retenciones$/, 'Retenciones'],
    [/^\/config\/ajustes-avanzados$/, 'Ajustes Avanzados'],
    [/^\/config\/notificaciones$/, 'Notificaciones'],
    [/^\/config\/permisos$/, 'Permisos'],
    [/^\/config\/roles\/(.+)$/, (m) => `Rol: ${m[1]}`],
    [/^\/config\/roles$/, 'Roles'],
    [/^\/config\/(.+)$/, (m) => titleize(m[1])],
    [/^\/config$/, 'Configuración'],
  ]

  for (const [pattern, title] of rules) {
    const m = pathname.match(pattern)
    if (m) {
      if (typeof title === 'string') return title
      // Los IDs de ERPNext suelen ser el "name" del registro (ej. "Juan Perez"),
      // que llega URL-encoded en el pathname (ej. "Juan%20Perez") — decodificar antes de mostrar.
      const decoded = m.map((seg, i) => {
        if (i === 0 || seg == null) return seg
        try { return decodeURIComponent(seg) } catch { return seg }
      }) as RegExpMatchArray
      return title(decoded)
    }
  }
  return pathname
}

const STORAGE_KEY = 'gensuite-tabs'
/** Destino al cerrar la última pestaña — pantalla de bienvenida, no una pestaña más. */
const EMPTY_STATE_PATH = '/inicio'

function loadTabs(): Tab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Tab[]
  } catch {}
  return []
}

function saveTabs(tabs: Tab[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  } catch {}
}

function makeId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
}

function TabsProviderInner({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const keepAliveRef = useKeepAliveRef()

  const [tabs, setTabsRaw] = useState<Tab[]>(() => loadTabs())
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = loadTabs()
    return saved.find((t) => t.path.split('?')[0] === location.pathname)?.id ?? null
  })
  const [multiTab, setMultiTab] = useState(() => localStorage.getItem('gensuite-multitab') !== 'false')
  const toggleMultiTab = () => {
    const next = !multiTab
    localStorage.setItem('gensuite-multitab', String(next))
    setMultiTab(next)
  }

  const setTabs = (updater: (prev: Tab[]) => Tab[]) => {
    setTabsRaw((prev) => {
      const next = updater(prev)
      saveTabs(next)
      return next
    })
  }

  // Sync tabs when location changes (handles all navigation sources)
  useEffect(() => {
    if (!multiTab) return
    const pathname = location.pathname
    if (pathname === EMPTY_STATE_PATH) {
      // Pantalla de "sin pestañas" — no es una pestaña en sí, solo el destino cuando se cierra
      // la última. Si se convirtiera en pestaña, el usuario nunca vería la barra vacía.
      setActiveId(null)
      return
    }
    const fullPath = pathname + (location.search || '')

    setTabs((prev) => {
      const existing = prev.find((t) => t.path.split('?')[0] === pathname)
      if (existing) {
        const next = prev.map((t) => t.id === existing.id ? { ...t, path: fullPath } : t)
        setActiveId(existing.id)
        return next
      }
      const newTab: Tab = { id: makeId(), path: fullPath, title: getTitleForPath(pathname), isDirty: false }
      setActiveId(newTab.id)
      return [...prev, newTab]
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, multiTab])

  const closeTab = (id: string, options?: CloseTabOptions) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      if (idx === -1) return prev
      const closed = prev[idx]
      const next = prev.filter((t) => t.id !== id)
      keepAliveRef.current?.destroy(closed.path)

      if (!options?.skipNavigate && id === activeId) {
        const target = next[idx] ?? next[idx - 1] ?? next[0]
        if (target) {
          navigate(target.path, { replace: true })
          setActiveId(target.id)
        } else {
          navigate(EMPTY_STATE_PATH, { replace: true })
          setActiveId(null)
        }
      }

      return next
    })
  }

  const setTabDirty = (pathname: string, dirty: boolean) => {
    setTabs((prev) => prev.map((t) => t.path.split('?')[0] === pathname ? { ...t, isDirty: dirty } : t))
  }

  const updateTabTitle = (pathname: string, title: string) => {
    setTabs((prev) => prev.map((t) => t.path.split('?')[0] === pathname ? { ...t, title } : t))
  }

  return (
    <TabsContext.Provider value={{ tabs, activeId, closeTab, setTabDirty, updateTabTitle, multiTab, toggleMultiTab, keepAliveRef }}>
      {children}
    </TabsContext.Provider>
  )
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  return <TabsProviderInner>{children}</TabsProviderInner>
}

export function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('useTabs must be used inside TabsProvider')
  return ctx
}
