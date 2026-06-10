import { useState, useRef, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, FileText, Receipt, Warehouse,
  ShoppingCart, CreditCard, Truck, Wallet, BarChart3, Settings,
  ChevronRight, LogOut, Menu, Building2, UserCog, Sun, Moon,
  Shield, X, BookOpen, ClipboardList, Percent, Calendar, Lock,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { CommandPalette } from './CommandPalette'
import { Toaster } from 'sonner'

// ─── Nav definitions ─────────────────────────────────────────────────────────

interface NavItem {
  label: string
  icon: React.ReactNode
  path: string
}

interface NavGroup {
  label: string
  icon: React.ReactNode
  prefix: string
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup {
  return 'children' in e
}

const NAV_MAIN: NavItem[] = [
  { label: 'Dashboard',    icon: <LayoutDashboard size={16} aria-hidden="true" />, path: '/dashboard' },
  { label: 'Clientes',     icon: <Users size={16} aria-hidden="true" />,           path: '/clientes'  },
]

const NAV_CATALOG: NavEntry = {
  label: 'Catálogo',
  icon: <Package size={16} aria-hidden="true" />,
  prefix: '/catalogo',
  children: [
    { label: 'Categorías', icon: <Package size={14} />, path: '/catalogo/categorias' },
    { label: 'Marcas',     icon: <Shield size={14} />,  path: '/catalogo/marcas'     },
    { label: 'Artículos',  icon: <Package size={14} />, path: '/catalogo/articulos'  },
  ],
}

const NAV_VENTAS: NavEntry[] = [
  { label: 'Cotizaciones', icon: <FileText size={16} aria-hidden="true" />, path: '/cotizaciones' },
  {
    label: 'Facturación',
    icon: <Receipt size={16} aria-hidden="true" />,
    prefix: '/facturacion',
    children: [
      { label: 'Facturas',         icon: <Receipt size={14} />, path: '/facturacion/facturas'      },
      { label: 'Notas de Crédito', icon: <FileText size={14} />, path: '/facturacion/notas-credito' },
      { label: 'Notas de Débito',  icon: <FileText size={14} />, path: '/facturacion/notas-debito'  },
    ],
  },
]

const NAV_OPS: NavEntry[] = [
  {
    label: 'Inventario',
    icon: <Warehouse size={16} aria-hidden="true" />,
    prefix: '/inventario',
    children: [
      { label: 'Stock Actual', icon: <Warehouse size={14} />, path: '/inventario/stock'    },
      { label: 'Historial',    icon: <BarChart3 size={14} />, path: '/inventario/historial' },
      { label: 'Conteos',      icon: <FileText size={14} />,  path: '/inventario/conteos'  },
    ],
  },
  { label: 'Compras',    icon: <ShoppingCart size={16} aria-hidden="true" />, path: '/compras'    },
  { label: 'Gastos',     icon: <CreditCard size={16} aria-hidden="true" />,   path: '/gastos'     },
  { label: 'Proveedores',icon: <Truck size={16} aria-hidden="true" />,        path: '/proveedores' },
]

const NAV_FINANZAS: NavEntry[] = [
  {
    label: 'Cuentas por Cobrar',
    icon: <Wallet size={16} aria-hidden="true" />,
    prefix: '/cobros',
    children: [
      { label: 'Cobros',          icon: <ClipboardList size={14} />, path: '/cobros/lista'          },
      { label: 'Registrar Cobro', icon: <Wallet size={14} />,    path: '/cobros/pago'     },
      { label: 'Aging',           icon: <BarChart3 size={14} />, path: '/cobros/aging'    },
      { label: 'Semáforo',        icon: <Shield size={14} />,    path: '/cobros/semaforo' },
    ],
  },
  { label: 'Usuarios', icon: <UserCog size={16} aria-hidden="true" />, path: '/usuarios' },
]

const NAV_REPORTES: NavEntry = {
  label: 'Reportes',
  icon: <BarChart3 size={16} aria-hidden="true" />,
  prefix: '/reportes',
  children: [
    { label: 'DGII 606',       icon: <FileText size={14} />, path: '/reportes/606'     },
    { label: 'DGII 607',       icon: <FileText size={14} />, path: '/reportes/607'     },
    { label: 'DGII 608',       icon: <FileText size={14} />, path: '/reportes/608'     },
    { label: 'Balance General',icon: <BarChart3 size={14} />, path: '/reportes/balance' },
    { label: 'P&L',            icon: <BarChart3 size={14} />, path: '/reportes/pl'      },
    { label: 'Stock Balance',  icon: <BarChart3 size={14} />, path: '/reportes/stock'   },
  ],
}

const NAV_CONFIG: NavEntry = {
  label: 'Configuración',
  icon: <Settings size={16} aria-hidden="true" />,
  prefix: '/config|/cuentas|/asientos|/contabilidad',
  children: [
    { label: 'Empresa',            icon: <Building2 size={14} />,    path: '/config/empresa'      },
    { label: 'Cobranza',           icon: <Wallet size={14} />,       path: '/config/cobros'       },
    { label: 'Almacenes',          icon: <Warehouse size={14} />,    path: '/config/almacenes'    },
    { label: 'Métodos de Pago',    icon: <CreditCard size={14} />,   path: '/config/metodos-pago' },
    { label: 'Unidades de Medida', icon: <Settings size={14} />,     path: '/config/uom'          },
    { label: 'Listas de Precio',   icon: <FileText size={14} />,     path: '/config/listas-precio'},
    { label: 'Secuencias NCF',     icon: <Shield size={14} />,       path: '/config/ncf'          },
    { label: 'Impuestos Ventas',   icon: <Percent size={14} />,      path: '/config/impuestos-ventas'  },
    { label: 'Impuestos Compras',  icon: <Percent size={14} />,      path: '/config/impuestos-compras' },
    { label: 'Ejercicio Fiscal',   icon: <Calendar size={14} />,     path: '/config/ejercicio-fiscal'  },
    { label: 'Cuentas Contables',  icon: <BookOpen size={14} />,     path: '/cuentas'             },
    { label: 'Asientos Contables', icon: <ClipboardList size={14} />, path: '/asientos'           },
    { label: 'Cierre de Período',  icon: <Lock size={14} />,         path: '/contabilidad/cierre-periodo' },
    { label: 'Mi Perfil',          icon: <UserCog size={14} />,      path: '/config/perfil'       },
  ],
}

// ─── NavItem component ────────────────────────────────────────────────────────

function NavItemBtn({ item, onNav, collapsed }: { item: NavItem; onNav: (p: string) => void; collapsed: boolean }) {
  const { pathname } = useLocation()
  const active = pathname === item.path || pathname.startsWith(item.path + '/')
  return (
    <button
      className={`nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNav(item.path)}
      title={collapsed ? item.label : undefined}
    >
      {item.icon}
      <span className="nav-label">{item.label}</span>
    </button>
  )
}

function NavGroupBtn({
  group, onNav, collapsed, onOpen, floatWhenCollapsed,
}: {
  group: NavGroup
  onNav: (p: string) => void
  collapsed: boolean
  onOpen?: () => void
  floatWhenCollapsed?: boolean
}) {
  const { pathname } = useLocation()
  const groupActive = group.prefix.split('|').some((p) => pathname.startsWith(p))
  const [open, setOpen] = useState(groupActive)

  const handleClick = () => {
    const next = !open
    setOpen(next)
    if (next && onOpen) onOpen()
  }

  const showInline = open && !collapsed
  const showFloat = open && collapsed && floatWhenCollapsed

  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`nav-item${groupActive ? ' active' : ''}`}
        aria-expanded={open}
        onClick={handleClick}
        title={collapsed ? group.label : undefined}
      >
        {group.icon}
        <span className="nav-label">{group.label}</span>
        <ChevronRight size={12} aria-hidden="true" className={`nav-group-chevron${open ? ' open' : ''}`} />
      </button>

      {/* Inline children (sidebar expanded) */}
      {showInline && (
        <div className="nav-children" role="group" aria-label={group.label}>
          {group.children.map((child) => {
            const active = pathname === child.path || pathname.startsWith(child.path + '/')
            return (
              <button
                key={child.path}
                className={`nav-item nav-child${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNav(child.path)}
              >
                {child.icon}
                <span className="nav-label">{child.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Floating children (sidebar collapsed) */}
      {showFloat && (
        <div
          className="nav-float-panel"
          role="group"
          aria-label={group.label}
          style={{
            position: 'absolute',
            left: 'calc(100% + 8px)',
            top: 0,
            background: 'var(--surface-overlay, var(--surface-app))',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: '6px 4px',
            minWidth: 180,
            zIndex: 400,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{ padding: '4px 10px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {group.label}
          </div>
          {group.children.map((child) => {
            const active = pathname === child.path || pathname.startsWith(child.path + '/')
            return (
              <button
                key={child.path}
                className={`nav-item nav-child${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNav(child.path)}
                style={{ width: '100%' }}
              >
                {child.icon}
                <span className="nav-label">{child.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function renderEntry(
  entry: NavEntry,
  onNav: (p: string) => void,
  collapsed: boolean,
  opts?: { onOpen?: () => void; floatWhenCollapsed?: boolean },
) {
  if (isGroup(entry))
    return (
      <NavGroupBtn
        key={entry.prefix}
        group={entry}
        onNav={onNav}
        collapsed={collapsed}
        onOpen={opts?.onOpen}
        floatWhenCollapsed={opts?.floatWhenCollapsed}
      />
    )
  return <NavItemBtn key={entry.path} item={entry} onNav={onNav} collapsed={collapsed} />
}

// ─── AppLayout ────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('gensuite-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [userOpen, setUserOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Auto-collapse sidebar when on any reportes page
  useEffect(() => {
    if (location.pathname.startsWith('/reportes')) {
      setCollapsed(true)
    }
  }, [location.pathname])

  const displayName = user?.full_name ?? user?.email ?? 'Usuario'
  const initials = displayName.slice(0, 2).toUpperCase()

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('gensuite-theme', theme)
  }, [theme])

  // Close user dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Global keyboard shortcut: ⌘K / Ctrl+K → open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleNav = (path: string) => {
    navigate(path)
    setMobileOpen(false)
  }

  const sidebarContent = (
    <>
      {/* Menú principal */}
      <div className="sb-section">
        {NAV_MAIN.map((item) => <NavItemBtn key={item.path} item={item} onNav={handleNav} collapsed={collapsed} />)}
        {renderEntry(NAV_CATALOG, handleNav, collapsed)}
      </div>

      {/* Ventas */}
      <div className="sb-section">
        {!collapsed && <div className="sb-label">Ventas</div>}
        {NAV_VENTAS.map((entry) => renderEntry(entry, handleNav, collapsed))}
      </div>

      {/* Operaciones */}
      <div className="sb-section">
        {!collapsed && <div className="sb-label">Operaciones</div>}
        {NAV_OPS.map((entry) => renderEntry(entry, handleNav, collapsed))}
      </div>

      {/* Finanzas */}
      <div className="sb-section">
        {!collapsed && <div className="sb-label">Finanzas</div>}
        {NAV_FINANZAS.map((entry) => renderEntry(entry, handleNav, collapsed))}
      </div>

      {/* Footer */}
      <div className="sb-footer">
        {renderEntry(NAV_REPORTES, handleNav, collapsed, { floatWhenCollapsed: true })}
        {renderEntry(NAV_CONFIG, handleNav, collapsed)}
      </div>
    </>
  )

  return (
    <>
      <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>

        {/* ── Topbar ── */}
        <header className="topbar">
          {/* Mobile menu / collapse toggle */}
          <button
            className="icon-btn"
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            onClick={() => {
              if (window.innerWidth < 768) setMobileOpen((o) => !o)
              else setCollapsed((c) => !c)
            }}
          >
            <Menu size={16} aria-hidden="true" />
          </button>

          {/* Logo */}
          <div className="logo" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <span className="logo-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="logo-text">GenSuite</span>
          </div>

          <span className="divider-v" aria-hidden="true" />

          {/* Search trigger */}
          <div className="search-wrap" style={{ flex: 1, maxWidth: 280 }}>
            <span className="search-icon" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              placeholder="Buscar…"
              aria-label="Abrir búsqueda global"
              readOnly
              onClick={() => setCmdOpen(true)}
              style={{ cursor: 'pointer' }}
            />
            <div className="search-shortcut" aria-hidden="true">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </div>
          </div>

          {/* Right actions */}
          <div className="topbar-right">
            {/* Theme toggle */}
            <button
              className="icon-btn"
              aria-label="Cambiar tema"
              onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark'
                ? <Sun size={16} aria-hidden="true" />
                : <Moon size={16} aria-hidden="true" />}
            </button>

            <span className="divider-v" aria-hidden="true" />

            {/* User dropdown */}
            <div className="dropdown" ref={userRef}>
              <button
                className="user-btn"
                aria-haspopup="true"
                aria-expanded={userOpen}
                onClick={() => setUserOpen((o) => !o)}
              >
                <span className="avatar-sm" aria-hidden="true">{initials}</span>
                <span>{displayName.split('@')[0]}</span>
                <ChevronRight size={11} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />
              </button>

              <div className={`dropdown-panel${userOpen ? ' open' : ''}`} role="menu">
                <div className="dd-header">
                  <div className="dd-name">{user?.full_name ?? displayName}</div>
                  <div className="dd-email">{user?.email}</div>
                </div>
                <div style={{ padding: '4px 0' }}>
                  <button className="dd-item" role="menuitem" onClick={() => { setUserOpen(false); navigate('/config/perfil') }}>
                    <UserCog size={14} aria-hidden="true" /> Mi perfil
                  </button>
                  <button className="dd-item" role="menuitem" onClick={() => { setUserOpen(false); navigate('/config/empresa') }}>
                    <Building2 size={14} aria-hidden="true" /> Empresa
                  </button>
                </div>
                <div className="dd-sep" />
                <div style={{ padding: '4px 0' }}>
                  <button className="dd-item danger" role="menuitem" onClick={handleLogout}>
                    <LogOut size={14} aria-hidden="true" /> Cerrar sesión
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Desktop Sidebar ── */}
        <nav className="sidebar" aria-label="Navegación principal">
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sidebarContent}
          </div>
        </nav>

        {/* ── Main ── */}
        <main className="main">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile sidebar overlay ── */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', zIndex: 299 }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        className={`sidebar mobile-open`}
        style={{
          display: mobileOpen ? 'flex' : 'none',
          position: 'fixed', left: 0, top: 0, bottom: 0,
          width: 'var(--sidebar-width)', zIndex: 300, flexDirection: 'column',
          background: 'var(--surface-app)',
        }}
        aria-label="Navegación móvil"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', height: 'var(--navbar-height)', borderBottom: '1px solid var(--border-default)' }}>
          <span className="logo-text">GenSuite</span>
          <button className="icon-btn" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>{sidebarContent}</div>
      </nav>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <Toaster richColors position="top-right" />
    </>
  )
}
