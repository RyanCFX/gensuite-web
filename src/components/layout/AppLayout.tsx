import { useState, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation, useOutlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFacturacionConfig } from "@/shared/api/config";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Receipt,
  Warehouse,
  ShoppingCart,
  CreditCard,
  Truck,
  Wallet,
  BarChart3,
  Settings,
  ChevronRight,
  LogOut,
  Menu,
  Building2,
  UserCog,
  Sun,
  Moon,
  Shield,
  X,
  BookOpen,
  ClipboardList,
  Percent,
  Calendar,
  Lock,
  BookText,
  Tag,
  MapPin,
  Coins,
  Bell,
  DollarSign,
  Clock,
  ShieldCheck,
  LayoutTemplate,
  Landmark,
  ArrowRightLeft,
  Printer,
  Wrench,
  ScrollText,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "sonner";
import { TabsProvider, useTabs } from "@/contexts/TabsContext";
import { KeepAlive } from "keepalive-for-react";
import { TurnoCajaIndicator } from "@/components/shared/TurnoCajaIndicator";

import logo from "@/assets/logo.png";

// ─── Nav definitions ─────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  /** Si es true, el ítem solo se marca activo en la ruta exacta (no en sub-rutas). Útil cuando
   *  un hermano usa una sub-ruta del mismo path (ej. /config/ecf y /config/ecf/admin). */
  exact?: boolean;
}

interface NavGroup {
  label: string;
  icon: React.ReactNode;
  prefix: string;
  children: NavEntry[];
}

type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return "children" in e;
}

// Rutas de pantalla completa que colapsan el menú principal automáticamente al entrar.
function isAutoCollapseRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/reportes") ||
    pathname.startsWith("/config/plantillas-facturas") ||
    pathname.startsWith("/config/plantillas-etiquetas") ||
    // Editor visual de plantillas de cheque (nueva o edición) — full-bleed igual que el de facturas.
    /^\/config\/tesoreria\/plantillas-cheque\/[^/]+$/.test(pathname)
  );
}

const NAV_MAIN: NavItem[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={16} aria-hidden="true" />,
    path: "/dashboard",
  },
  {
    label: "Clientes",
    icon: <Users size={16} aria-hidden="true" />,
    path: "/clientes",
  },
];

const NAV_VENTAS: NavEntry[] = [
  {
    label: "Cotizaciones",
    icon: <FileText size={16} aria-hidden="true" />,
    path: "/cotizaciones",
  },
  {
    label: "Pedidos",
    icon: <ClipboardList size={16} aria-hidden="true" />,
    path: "/pedidos",
  },
  {
    label: "Facturas",
    icon: <Receipt size={16} aria-hidden="true" />,
    path: "/facturas",
  },
  {
    label: "Notas de Crédito",
    icon: <FileText size={16} aria-hidden="true" />,
    path: "/notas-credito",
  },
  {
    label: "Notas de Débito",
    icon: <FileText size={16} aria-hidden="true" />,
    path: "/notas-debito",
  },
  {
    label: "Devoluciones",
    icon: <FileText size={16} aria-hidden="true" />,
    path: "/devoluciones",
  },
  {
    label: "e-CF Emitidos",
    icon: <Receipt size={16} aria-hidden="true" />,
    path: "/ecf-emitidos",
  },
  {
    label: "Reportes",
    icon: <BarChart3 size={16} aria-hidden="true" />,
    prefix: "/reportes/ventas|/reportes/607",
    children: [
      { label: "Ventas", icon: <BarChart3 size={14} />, path: "/reportes/ventas" }
    ],
  },
];

const NAV_OPS: NavEntry[] = [
  {
    label: "Inventario",
    icon: <Warehouse size={16} aria-hidden="true" />,
    prefix:
      "/inventario|/transferencias|/catalogo/categorias|/catalogo/marcas|/catalogo/atributos|/catalogo/descuentos|/catalogo/combos",
    children: [
      {
        label: "Productos",
        icon: <Package size={14} />,
        path: "/inventario/productos",
      },
      {
        label: "Categorías",
        icon: <Package size={14} />,
        path: "/catalogo/categorias",
      },
      { label: "Marcas", icon: <Shield size={14} />, path: "/catalogo/marcas" },
      {
        label: "Atributos",
        icon: <Tag size={14} />,
        path: "/catalogo/atributos",
      },
      {
        label: "Descuentos",
        icon: <Percent size={14} />,
        path: "/catalogo/descuentos",
      },
      { label: "Combos", icon: <Package size={14} />, path: "/catalogo/combos" },
      {
        label: "Stock Actual",
        icon: <Warehouse size={14} />,
        path: "/inventario/stock",
      },
      {
        label: "Historial",
        icon: <BarChart3 size={14} />,
        path: "/inventario/historial",
      },
      {
        label: "Conteos",
        icon: <FileText size={14} />,
        path: "/inventario/conteos",
      },
      {
        label: "Zonas y Ubicaciones",
        icon: <MapPin size={14} />,
        path: "/inventario/zonas",
      },
      {
        label: "Transferencias",
        icon: <Truck size={14} />,
        path: "/transferencias",
      },
      {
        label: "Valoración de Stock",
        icon: <BarChart3 size={14} />,
        path: "/reportes/stock",
      },
      {
        label: "Movimientos de Stock",
        icon: <BarChart3 size={14} />,
        path: "/reportes/movimientos",
      },
    ],
  },
  {
    label: "Servicios",
    icon: <ClipboardList size={16} aria-hidden="true" />,
    path: "/catalogo/servicios",
  },
  {
    label: "Compras",
    icon: <ShoppingCart size={16} aria-hidden="true" />,
    prefix: "/compras",
    children: [
      { label: "Compras", icon: <ShoppingCart size={14} />, path: "/compras" },
      {
        label: "Solicitudes de Compra",
        icon: <ClipboardList size={14} />,
        path: "/compras/solicitudes",
      },
      {
        label: "Órdenes de Compra",
        icon: <ShoppingCart size={14} />,
        path: "/compras/ordenes",
      },
      { label: "Devoluciones de Compras", icon: <Receipt size={14} />, path: "/devoluciones-compras" },
      {
        label: "Recepción de Mercancía",
        icon: <Truck size={14} />,
        path: "/compras/recepciones",
      },
      {
        label: "Costos de Importación",
        icon: <Truck size={14} />,
        path: "/compras/costos-importacion",
      },
      {
        label: "Reportes",
        icon: <BarChart3 size={14} />,
        path: "/reportes/606",
      },
    ],
  },
  {
    label: "Gastos",
    icon: <CreditCard size={16} aria-hidden="true" />,
    path: "/gastos",
  },
  {
    label: "e-CF Recibidos",
    icon: <Receipt size={16} aria-hidden="true" />,
    path: "/ecf-recibidos",
  },
  {
    label: "Proveedores",
    icon: <Truck size={16} aria-hidden="true" />,
    path: "/proveedores",
  },
];

const NAV_FINANZAS: NavEntry[] = [
  {
    label: "Caja",
    icon: <DollarSign size={16} aria-hidden="true" />,
    prefix: "/caja",
    children: [
      { label: "Caja", icon: <Clock size={14} />, path: "/caja/por-cobrar" },
      { label: "Cobros Pendientes", icon: <DollarSign size={14} />, path: "/caja/pendientes" },
    ],
  },
  {
    label: "Turnos",
    icon: <Clock size={16} aria-hidden="true" />,
    path: "/turnos",
  },
  {
    label: "Cuentas por Cobrar",
    icon: <CreditCard size={16} aria-hidden="true" />,
    prefix: "/cobros",
    children: [
      { label: "Cobros", icon: <ClipboardList size={14} />, path: "/cobros/lista" },
      { label: "Registrar Cobro", icon: <Wallet size={14} />, path: "/cobros/pago" },
      { label: "Antiguedad de saldos CxC", icon: <BarChart3 size={14} />, path: "/cobros/aging" },
      { label: "Semáforo", icon: <Shield size={14} />, path: "/cobros/semaforo" },
    ],
  },
  {
    label: "Cuentas por Pagar",
    icon: <CreditCard size={16} aria-hidden="true" />,
    prefix: "/pagos|/catalogo/cuentas-por-pagar",
    children: [
      { label: "Pagos", icon: <ClipboardList size={14} />, path: "/pagos/lista" },
      { label: "Pendientes de Pago", icon: <Receipt size={14} />, path: "/pagos/pendientes" },
      { label: "Registrar Pago", icon: <Wallet size={14} />, path: "/pagos/nuevo" },
      { label: "Antiguedad de saldos CxP", icon: <BarChart3 size={14} />, path: "/pagos/aging" },
      { label: "Catálogo", icon: <FileText size={14} />, path: "/catalogo/cuentas-por-pagar" },
    ],
  },
  {
    label: "Reportes",
    icon: <BarChart3 size={16} aria-hidden="true" />,
    prefix: "/reportes/cuadreTurno|/reportes/caja|/reportes/corteCajaDia",
    children: [
      { label: "Cuadre por Turno", icon: <Clock size={14} />, path: "/reportes/cuadreTurno" },
      { label: "Cuadre por Caja", icon: <DollarSign size={14} />, path: "/reportes/caja" },
      { label: "Corte de Caja del Día", icon: <BarChart3 size={14} />, path: "/reportes/corteCajaDia" },
    ],
  },
  {
    label: "Tesorería",
    icon: <Landmark size={16} aria-hidden="true" />,
    prefix: "/tesoreria",
    children: [
      { label: "Emisiones", icon: <Receipt size={14} />, path: "/tesoreria/emisiones" },
      { label: "Depósitos", icon: <Wallet size={14} />, path: "/tesoreria/depositos" },
      { label: "Transferencias Internas", icon: <ArrowRightLeft size={14} />, path: "/tesoreria/transferencias" },
      { label: "Movimientos", icon: <BookOpen size={14} />, path: "/tesoreria/movimientos" },
      { label: "Cheques", icon: <Printer size={14} />, path: "/tesoreria/cheques" },
    ],
  },
];

const NAV_CONTABILIDAD: NavItem[] = [
  {
    label: "Plan de Cuentas",
    icon: <BookOpen size={16} aria-hidden="true" />,
    path: "/cuentas",
  },
  {
    label: "Asientos",
    icon: <ClipboardList size={16} aria-hidden="true" />,
    path: "/asientos",
  },
  {
    label: "Libro Diario",
    icon: <BookOpen size={16} aria-hidden="true" />,
    path: "/contabilidad/libro-diario",
  },
  {
    label: "Libro Mayor",
    icon: <BookText size={16} aria-hidden="true" />,
    path: "/contabilidad/libro-mayor",
  },
  {
    label: "Cierre de Período",
    icon: <Lock size={16} aria-hidden="true" />,
    path: "/contabilidad/cierre-periodo",
  },
];

const NAV_REPORTES: NavEntry = {
  label: "Reportes",
  icon: <BarChart3 size={16} aria-hidden="true" />,
  prefix: "/reportes",
  children: [
    { label: "DGII 606", icon: <FileText size={14} />, path: "/reportes/606" },
    { label: "DGII 607", icon: <FileText size={14} />, path: "/reportes/607" },
    { label: "DGII 608", icon: <FileText size={14} />, path: "/reportes/608" },
    {
      label: "Balance General",
      icon: <BarChart3 size={14} />,
      path: "/reportes/balance",
    },
    { label: "P&L", icon: <BarChart3 size={14} />, path: "/reportes/pl" },
    {
      label: "Stock Balance",
      icon: <BarChart3 size={14} />,
      path: "/reportes/stock",
    },
  ],
};

// Prefix del grupo anidado "Impuestos" dentro de NAV_CONFIG — se usa para colapsarlo a un ítem
// plano (solo "Tasas de Impuesto", renombrado a "Impuestos") cuando usaImpuestoDocumento está
// desactivado, ya que en ese caso las plantillas de documento dejan de tener sentido en el menú.
const IMPUESTOS_GROUP_PREFIX =
  "/config/tasas-impuesto|/config/impuestos-ventas|/config/impuestos-compras|/config/impuestos-articulo";

const NAV_CONFIG: NavEntry = {
  label: "Configuración",
  icon: <Settings size={16} aria-hidden="true" />,
  prefix: "/config",
  children: [
    {
      label: "Empresa",
      icon: <Building2 size={14} />,
      path: "/config/empresa",
    },
    {
      label: "Sucursales",
      icon: <MapPin size={14} />,
      path: "/config/sucursales",
    },
    {
      label: "Cajas",
      icon: <Wallet size={14} />,
      path: "/config/cajas",
    },
    {
      label: "Impresoras",
      icon: <Printer size={14} />,
      path: "/config/impresoras",
    },
    {
      label: "Centros de Costo",
      icon: <Building2 size={14} />,
      path: "/config/centros-costo",
    },
    {
      label: "Bancos",
      icon: <Building2 size={14} />,
      path: "/config/bancos",
    },
    {
      label: "Cuentas Bancarias",
      icon: <CreditCard size={14} />,
      path: "/config/cuentas-bancarias",
    },
    {
      label: "Tipos de Documento Bancario",
      icon: <Receipt size={14} />,
      path: "/config/tesoreria/tipos-documento",
    },
    {
      label: "Departamentos",
      icon: <Users size={14} />,
      path: "/config/departamentos",
    },
    { label: "Cobranza", icon: <Wallet size={14} />, path: "/config/cobros" },
    {
      label: "Facturación",
      icon: <FileText size={14} />,
      path: "/config/facturacion",
    },
    {
      label: "Facturación Electrónica",
      icon: <ShieldCheck size={14} />,
      prefix: "/config/ecf",
      children: [
        {
          label: "Administración",
          icon: <ShieldCheck size={14} />,
          path: "/config/ecf",
          exact: true,
        },
        {
          label: "Avanzado",
          icon: <Settings size={14} />,
          path: "/config/ecf/admin",
        },
        {
          label: "Certificación DGII",
          icon: <Shield size={14} />,
          path: "/config/ecf/certificacion",
        },
        {
          label: "Contingencia",
          icon: <Clock size={14} />,
          path: "/config/ecf/contingencia",
        },
      ],
    },
    {
      label: "Plantillas",
      icon: <LayoutTemplate size={14} />,
      prefix: "/config/plantillas-facturas|/config/plantillas-etiquetas|/config/tesoreria/plantillas-cheque",
      children: [
        {
          label: "Facturas",
          icon: <LayoutTemplate size={14} />,
          path: "/config/plantillas-facturas",
        },
        {
          label: "Etiquetas",
          icon: <Tag size={14} />,
          path: "/config/plantillas-etiquetas",
        },
        {
          label: "Cheques",
          icon: <Printer size={14} />,
          path: "/config/tesoreria/plantillas-cheque",
        },
      ],
    },
    {
      label: "Almacenes",
      icon: <Warehouse size={14} />,
      path: "/config/almacenes",
    },
    {
      label: "Métodos de Pago",
      icon: <CreditCard size={14} />,
      path: "/config/metodos-pago",
    },
    {
      label: "Denominaciones",
      icon: <Coins size={14} />,
      path: "/config/denominaciones",
    },
    {
      label: "Unidades de Medida",
      icon: <Settings size={14} />,
      path: "/config/uom",
    },
    {
      label: "Listas de Precio",
      icon: <FileText size={14} />,
      path: "/config/listas-precio",
    },
    {
      label: "Secuencias NCF",
      icon: <Shield size={14} />,
      path: "/config/ncf",
    },
    {
      label: "Impuestos",
      icon: <Percent size={14} />,
      prefix: IMPUESTOS_GROUP_PREFIX,
      children: [
        {
          label: "Tasas de Impuesto",
          icon: <Percent size={14} />,
          path: "/config/tasas-impuesto",
        },
        {
          label: "Impuestos Ventas",
          icon: <Percent size={14} />,
          path: "/config/impuestos-ventas",
        },
        {
          label: "Impuestos Compras",
          icon: <Percent size={14} />,
          path: "/config/impuestos-compras",
        },
        {
          label: "Impuestos Artículo",
          icon: <Percent size={14} />,
          path: "/config/impuestos-articulo",
        },
      ],
    },
    {
      label: "Ejercicio Fiscal",
      icon: <Calendar size={14} />,
      path: "/config/ejercicio-fiscal",
    },
    {
      label: "Retenciones",
      icon: <Percent size={14} />,
      path: "/config/retenciones",
    },
    {
      label: "Ajustes Avanzados",
      icon: <Settings size={14} />,
      path: "/config/ajustes-avanzados",
    },
    {
      label: "Recálculo de Valuación",
      icon: <Wrench size={14} />,
      path: "/config/recalculo-valuacion",
    },
    {
      label: "Notificaciones",
      icon: <Bell size={14} />,
      path: "/config/notificaciones",
    },
    {
      label: "Grupos de Clientes",
      icon: <Users size={14} />,
      path: "/config/grupos-clientes",
    },
    { label: "Usuarios", icon: <UserCog size={14} />, path: "/usuarios" },
    // Administrativos — requieren System Manager en ERPNext, filtrados en el render (ver AppLayoutInner)
    { label: "Permisos", icon: <Lock size={14} />, path: "/config/permisos" },
    { label: "Roles", icon: <ShieldCheck size={14} />, path: "/config/roles" },
    { label: "Auditoría de PIN", icon: <ScrollText size={14} />, path: "/config/auditoria-pin" },
    { label: "Mi Perfil", icon: <UserCog size={14} />, path: "/config/perfil" },
  ],
};

// Nota: esta pantalla también la puede ver el rol "Auditor" (así lo exige el backend), pero el
// filtro de menú de abajo solo distingue System Manager — el frontend no rastrea roles finos
// como Auditor todavía (ver plan/PERMISOS_POR_ROL.md). Un usuario Auditor sin System Manager no
// verá el ítem en el menú aunque sí pueda abrir la ruta directamente; la propia página valida el
// rol igual.
const ADMIN_ONLY_PATHS = new Set([
  "/config/permisos",
  "/config/roles",
  "/config/auditoria-pin",
  "/config/cajas",
  "/config/ecf/admin",
  "/config/ecf/certificacion",
  "/config/ecf/contingencia",
]);

// Quita (recursivamente, incluidos los sub-grupos) los ítems de ADMIN_ONLY_PATHS para usuarios
// sin el rol "System Manager". Un grupo que se queda sin hijos se elimina por completo.
function stripAdminOnlyEntry(entry: NavEntry): NavEntry | null {
  if (isGroup(entry)) {
    const children = entry.children
      .map(stripAdminOnlyEntry)
      .filter((c): c is NavEntry => c !== null);
    return children.length ? { ...entry, children } : null;
  }
  return ADMIN_ONLY_PATHS.has(entry.path) ? null : entry;
}

// Grupos/ítems de NAV_FINANZAS que solo tienen sentido con el módulo POS habilitado
// (Facturacion Config.usaModuloPos) — identificados por su `prefix` (grupos) o `path` (ítems sueltos).
const POS_ONLY_NAV_KEYS = new Set([
  "/caja",
  "/turnos",
  "/reportes/cuadreTurno|/reportes/caja|/reportes/corteCajaDia",
]);

// ─── NavItem component ────────────────────────────────────────────────────────

function NavItemBtn({
  item,
  onNav,
  collapsed,
}: {
  item: NavItem;
  onNav: (p: string) => void;
  collapsed: boolean;
}) {
  const { pathname } = useLocation();
  const active = pathname === item.path || pathname.startsWith(item.path + "/");
  return (
    <button
      className={`nav-item${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onNav(item.path)}
      title={collapsed ? item.label : undefined}
    >
      {item.icon}
      <span className="nav-label">{item.label}</span>
    </button>
  );
}

function NavChildBtn({
  child,
  onNav,
  pathname,
  style,
}: {
  child: NavItem;
  onNav: (p: string) => void;
  pathname: string;
  style?: React.CSSProperties;
}) {
  const active = child.exact
    ? pathname === child.path
    : pathname === child.path || pathname.startsWith(child.path + "/");
  return (
    <button
      className={`nav-item nav-child${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onNav(child.path)}
      style={style}
    >
      {child.icon}
      <span className="nav-label">{child.label}</span>
    </button>
  );
}

function NavGroupBtn({
  group,
  onNav,
  collapsed,
  onOpen,
  floatWhenCollapsed,
  nested,
}: {
  group: NavGroup;
  onNav: (p: string) => void;
  collapsed: boolean;
  onOpen?: () => void;
  floatWhenCollapsed?: boolean;
  /** true cuando este grupo aparece dentro de la lista de hijos de otro grupo — usa el mismo estilo que sus hermanos (nav-child) en vez del de un ítem de nivel superior. */
  nested?: boolean;
}) {
  const { pathname } = useLocation();
  const groupActive = group.prefix
    .split("|")
    .some((p) => pathname.startsWith(p));
  const [open, setOpen] = useState(groupActive);

  const handleClick = () => {
    const next = !open;
    setOpen(next);
    if (next && onOpen) onOpen();
  };

  const showInline = open && !collapsed;
  const showFloat = open && collapsed && floatWhenCollapsed;

  return (
    <div style={{ position: "relative" }}>
      <button
        className={`nav-item${nested ? " nav-child" : ""}${groupActive ? " active" : ""}`}
        aria-expanded={open}
        onClick={handleClick}
        title={collapsed ? group.label : undefined}
      >
        {group.icon}
        <span className="nav-label">{group.label}</span>
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={`nav-group-chevron${open ? " open" : ""}`}
        />
      </button>

      {/* Inline children (sidebar expanded) */}
      {showInline && (
        <div className="nav-children" role="group" aria-label={group.label}>
          {group.children.map((child) =>
            isGroup(child) ? (
              <NavGroupBtn key={child.prefix} group={child} onNav={onNav} collapsed={false} nested />
            ) : (
              <NavChildBtn key={child.path} child={child} onNav={onNav} pathname={pathname} />
            ),
          )}
        </div>
      )}

      {/* Floating children (sidebar collapsed) */}
      {showFloat && (
        <div
          className="nav-float-panel"
          role="group"
          aria-label={group.label}
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: 0,
            background: "var(--surface-overlay, var(--surface-app))",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "6px 4px",
            minWidth: 180,
            zIndex: 400,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div
            style={{
              padding: "4px 10px 6px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {group.label}
          </div>
          {group.children.map((child) =>
            isGroup(child) ? (
              <NavGroupBtn key={child.prefix} group={child} onNav={onNav} collapsed={false} nested />
            ) : (
              <NavChildBtn key={child.path} child={child} onNav={onNav} pathname={pathname} style={{ width: "100%" }} />
            ),
          )}
        </div>
      )}
    </div>
  );
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
    );
  return (
    <NavItemBtn
      key={entry.path}
      item={entry}
      onNav={onNav}
      collapsed={collapsed}
    />
  );
}

// ─── TabCloseButton ────────────────────────────────────────────────────────

function TabCloseButton({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void;
}) {
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  return (
    <button
      ref={btnRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: 4,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: "var(--text-tertiary)",
        padding: 0,
        flexShrink: 0,
        opacity: 0.7,
      }}
      onClick={(e) => {
        e.stopPropagation();
        clearTimer();
        setTooltipPos(null);
        onClose();
      }}
      onMouseEnter={() => {
        clearTimer();
        timerRef.current = setTimeout(() => {
          const rect = btnRef.current?.getBoundingClientRect();
          if (!rect) return;
          setTooltipPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
        }, 1000);
      }}
      onMouseLeave={() => {
        clearTimer();
        setTooltipPos(null);
      }}
      aria-label={label}
      title=""
    >
      <X size={11} />
      {tooltipPos &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: tooltipPos.top,
              left: tooltipPos.left,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 7px",
              borderRadius: 5,
              border: "1px solid var(--border-default)",
              background: "var(--surface-raised, var(--bg-surface))",
              color: "var(--text-primary)",
              fontSize: 11,
              fontWeight: 400,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              zIndex: 1000,
              pointerEvents: "none",
            }}
          >
            Cerrar pestaña
            <kbd
              style={{
                padding: "1px 4px",
                borderRadius: 3,
                border: "1px solid var(--border-default)",
                background: "var(--surface-app)",
                color: "var(--text-secondary)",
                fontSize: 10,
                fontFamily: "inherit",
                lineHeight: 1.4,
              }}
            >
              Shift+W
            </kbd>
          </span>,
          document.body,
        )}
    </button>
  );
}

// ─── TabBar ──────────────────────────────────────────────────────────────────

function TabBar() {
  const { tabs, activeId, closeTab } = useTabs();
  const navigate = useNavigate();

  if (tabs.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        overflowX: "auto",
        overflowY: "hidden",
        borderBottom: "1px solid var(--border-default)",
        background: "var(--surface-app)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        scrollbarWidth: "none",
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 10px 0 14px",
              height: 36,
              minWidth: 80,
              maxWidth: 200,
              flexShrink: 0,
              cursor: "pointer",
              borderRight: "1px solid var(--border-default)",
              background: isActive
                ? "var(--surface-raised, var(--bg-surface))"
                : "transparent",
              borderBottom: isActive
                ? "2px solid var(--color-primary, #4f46e5)"
                : "2px solid transparent",
              transition: "background 0.12s",
              userSelect: "none",
            }}
            onClick={() => navigate(tab.path)}
            title={tab.title}
          >
            {tab.isDirty && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--color-primary, #4f46e5)",
                  flexShrink: 0,
                }}
              />
            )}
            <span
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: isActive ? 500 : 400,
                color: isActive
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tab.title}
            </span>
            <TabCloseButton
              label={`Cerrar ${tab.title}`}
              onClose={() => {
                if (tab.isDirty) {
                  if (
                    !window.confirm(
                      `"${tab.title}" tiene cambios sin guardar. ¿Cerrar de todas formas?`,
                    )
                  )
                    return;
                }
                closeTab(tab.id);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── AppLayout inner (uses TabsContext) ───────────────────────────────────────

function AppLayoutInner() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("gensuite-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuthStore();
  const isSystemManager = user?.roles?.includes("System Manager") ?? false;

  const { data: facturacionConfig } = useQuery({
    queryKey: ["facturacion-config"],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  });
  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false;
  const usaImpuestoDocumento = facturacionConfig?.usaImpuestoDocumento ?? true;

  const configNavAdminFiltered: NavEntry = isSystemManager
    ? NAV_CONFIG
    : (stripAdminOnlyEntry(NAV_CONFIG) as NavGroup);

  // Sin Impuesto de Documento, las plantillas de Ventas/Compras/Artículo dejan de tener sentido
  // en el menú — colapsa el grupo "Impuestos" a un único ítem plano que va directo al catálogo.
  const configNav: NavEntry = usaImpuestoDocumento
    ? configNavAdminFiltered
    : {
        ...(configNavAdminFiltered as NavGroup),
        children: (configNavAdminFiltered as NavGroup).children.map((item) =>
          isGroup(item) && item.prefix === IMPUESTOS_GROUP_PREFIX
            ? { label: "Impuestos", icon: <Percent size={14} />, path: "/config/tasas-impuesto" }
            : item,
        ),
      };
  const financeNav: NavEntry[] = usaModuloPos
    ? NAV_FINANZAS
    : NAV_FINANZAS.filter(
        (entry) => !POS_ONLY_NAV_KEYS.has(isGroup(entry) ? entry.prefix : entry.path),
      );
  const { tabs, activeId, closeTab, multiTab, keepAliveRef } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const activeTabPath = location.pathname + (location.search || "");

  // Auto-collapse sidebar al ENTRAR a una vista de pantalla completa (Reportes, Editor de
  // Plantillas) — transición desde fuera de esas rutas — y auto-expand al SALIR, siempre que
  // el colapso actual siga siendo el automático (el usuario no lo tocó a mano). Si el usuario
  // expande manualmente mientras está en una de estas vistas, `autoCollapsedRef` se limpia (ver
  // toggle más abajo) y ya no se fuerza nada al salir. Si navega entre sub-rutas de la misma
  // vista, no se toca el estado.
  const prevPathRef = useRef(location.pathname);
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    const prevWasReportes = isAutoCollapseRoute(prevPathRef.current);
    const nowIsReportes = isAutoCollapseRoute(location.pathname);
    if (nowIsReportes && !prevWasReportes) {
      setCollapsed(true);
      autoCollapsedRef.current = true;
    } else if (!nowIsReportes && prevWasReportes && autoCollapsedRef.current) {
      setCollapsed(false);
      autoCollapsedRef.current = false;
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  const displayName = user?.full_name ?? user?.email ?? "Usuario";
  const initials = displayName.slice(0, 2).toUpperCase();

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("gensuite-theme", theme);
  }, [theme]);

  // Close user dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node))
        setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Global keyboard shortcut: ⌘K / Ctrl+K → open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Global keyboard shortcut: Shift+W → close current tab
  useEffect(() => {
    if (!multiTab) return;
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "w" || e.key === "W")) {
        if (!activeId) return;
        const tab = tabs.find((t) => t.id === activeId);
        if (!tab) return;
        if (tab.isDirty) {
          if (
            !window.confirm(
              `"${tab.title}" tiene cambios sin guardar. ¿Cerrar de todas formas?`,
            )
          )
            return;
        }
        e.preventDefault();
        closeTab(activeId);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [multiTab, activeId, tabs, closeTab]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleNav = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
      {/* Menú principal */}
      <div className="sb-section">
        {NAV_MAIN.map((item) => (
          <NavItemBtn
            key={item.path}
            item={item}
            onNav={handleNav}
            collapsed={collapsed}
          />
        ))}
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
        {financeNav.map((entry) => renderEntry(entry, handleNav, collapsed))}
      </div>

      {/* Contabilidad */}
      <div className="sb-section">
        {!collapsed && <div className="sb-label">Contabilidad</div>}
        {NAV_CONTABILIDAD.map((item) => (
          <NavItemBtn
            key={item.path}
            item={item}
            onNav={handleNav}
            collapsed={collapsed}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="sb-footer">
        {renderEntry(NAV_REPORTES, handleNav, collapsed, {
          floatWhenCollapsed: true,
        })}
        {renderEntry(configNav, handleNav, collapsed)}
      </div>
    </>
  );

  return (
    <>
      <div className={`app-shell${collapsed ? " collapsed" : ""}`}>
        {/* ── Topbar ── */}
        <header className="topbar">
          {/* Mobile menu / collapse toggle */}
          <button
            className="icon-btn"
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            onClick={() => {
              if (window.innerWidth < 768) setMobileOpen((o) => !o);
              else {
                autoCollapsedRef.current = false;
                setCollapsed((c) => !c);
              }
            }}
          >
            <Menu size={16} aria-hidden="true" />
          </button>

          {/* Logo */}
          <div
            className="logo"
            onClick={() => navigate("/dashboard")}
            style={{ cursor: "pointer" }}
          >
            {/*<span className="logo-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="logo-text">GenSuite</span>*/}
            <img
              src={logo}
              className="dd-logo"
            />
          </div>

          <span className="divider-v" aria-hidden="true" />

          {/* Search trigger */}
          <div className="search-wrap" style={{ flex: 1, maxWidth: 280 }}>
            <span className="search-icon" aria-hidden="true">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              placeholder="Buscar…"
              aria-label="Abrir búsqueda global"
              readOnly
              onClick={() => setCmdOpen(true)}
              style={{ cursor: "pointer" }}
            />
            <div className="search-shortcut" aria-hidden="true">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </div>
          </div>

          {/* Right actions */}
          <div className="topbar-right">
            <TurnoCajaIndicator />

            {/* Theme toggle */}
            <button
              className="icon-btn"
              aria-label="Cambiar tema"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? (
                <Sun size={16} aria-hidden="true" />
              ) : (
                <Moon size={16} aria-hidden="true" />
              )}
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
                <span className="avatar-sm" aria-hidden="true">
                  {initials}
                </span>
                <span>{displayName.split("@")[0]}</span>
                <ChevronRight
                  size={11}
                  style={{ transform: "rotate(90deg)" }}
                  aria-hidden="true"
                />
              </button>

              <div
                className={`dropdown-panel${userOpen ? " open" : ""}`}
                role="menu"
              >
                <div className="dd-header">
                  <div className="dd-name">
                    {user?.full_name ?? displayName}
                  </div>
                  <div className="dd-email">{user?.email}</div>
                </div>
                <div style={{ padding: "4px 0" }}>
                  <button
                    className="dd-item"
                    role="menuitem"
                    onClick={() => {
                      setUserOpen(false);
                      navigate("/config/perfil");
                    }}
                  >
                    <UserCog size={14} aria-hidden="true" /> Mi perfil
                  </button>
                  <button
                    className="dd-item"
                    role="menuitem"
                    onClick={() => {
                      setUserOpen(false);
                      navigate("/config/empresa");
                    }}
                  >
                    <Building2 size={14} aria-hidden="true" /> Empresa
                  </button>
                </div>
                <div className="dd-sep" />
                <div style={{ padding: "4px 0" }}>
                  <button
                    className="dd-item danger"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <LogOut size={14} aria-hidden="true" /> Cerrar sesión
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Desktop Sidebar ── */}
        <nav className="sidebar" aria-label="Navegación principal">
          <div style={{ flex: 1, overflowY: "auto" }}>{sidebarContent}</div>
        </nav>

        {/* ── Main ── */}
        <main
          className="main"
          style={{ display: "flex", flexDirection: "column" }}
        >
          {/*{!user?.defaultWarehouse && (
            <div
              style={{
                background: "var(--color-warning-bg, #fff3cd)",
                color: "var(--color-warning-text, #856404)",
                padding: "8px 16px",
                fontSize: 13,
                textAlign: "center",
                borderBottom: "1px solid var(--color-warning-border, #ffc107)",
              }}
            >
              ⚠️ No tienes un almacén por defecto asignado. Las operaciones de
              compra e inventario pueden fallar.{" "}
              <a
                href="/usuarios"
                style={{
                  textDecoration: "underline",
                  fontWeight: 500,
                  color: "inherit",
                }}
              >
                Contacta al administrador
              </a>
              .
            </div>
          )}*/}
          {multiTab && <TabBar />}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {multiTab ? (
              <KeepAlive
                activeCacheKey={activeTabPath}
                max={15}
                aliveRef={keepAliveRef}
              >
                {outlet}
              </KeepAlive>
            ) : (
              // Sin multipestañas, cada navegación debe partir de cero — se fuerza remount
              // con la key de la navegación para no arrastrar estado (filtros, formularios) de la vista anterior.
              <Fragment key={location.key}>{outlet}</Fragment>
            )}
          </div>
        </main>
      </div>

      {/* ── Mobile sidebar overlay ── */}
      {mobileOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 299,
          }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        className={`sidebar mobile-open`}
        style={{
          display: mobileOpen ? "flex" : "none",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "var(--sidebar-width)",
          zIndex: 300,
          flexDirection: "column",
          background: "var(--surface-app)",
        }}
        aria-label="Navegación móvil"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            height: "var(--navbar-height)",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <span className="logo-text">GenSuite</span>
          <button
            className="icon-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{sidebarContent}</div>
      </nav>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <Toaster richColors position="top-right" />
    </>
  );
}

export default function AppLayout() {
  return (
    <TabsProvider>
      <AppLayoutInner />
    </TabsProvider>
  );
}
