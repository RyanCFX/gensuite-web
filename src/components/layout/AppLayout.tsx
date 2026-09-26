import { useState, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation, useOutlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFacturacionConfig, getEcfConfig } from "@/shared/api/config";
import {
  LayoutDashboard,
  Users,
  Package,
  PackagePlus,
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
  ChevronsRight,
  LogOut,
  Menu,
  Building2,
  Check,
  Loader2,
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
  Pill,
  History,
  Handshake,
  ArrowLeftRight,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissionsStore } from "@/stores/permissions.store";
import { useIsSystemManager } from "@/shared/hooks/useIsSystemManager";
import { resolverRuta } from "@/shared/permissions/rutas";
import { switchTenant, isApiError } from "@/shared/api/auth";
import { CommandPalette } from "./CommandPalette";
import { Toaster, toast } from "sonner";
import { TabsProvider, useTabs } from "@/contexts/TabsContext";
import { KeepAlive } from "keepalive-for-react";
import { TurnoCajaIndicator } from "@/components/shared/TurnoCajaIndicator";

import logo from "@/assets/logo.png";
import logoIso from "@/assets/iso.png";

// ─── Nav definitions ─────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  /** Si es true, el ítem solo se marca activo en la ruta exacta (no en sub-rutas). Útil cuando
   *  un hermano usa una sub-ruta del mismo path (ej. /config/ecf y /config/ecf/admin). */
  exact?: boolean;
  /** Para ítems "aplanados" que representan varias pantallas relacionadas mostradas como tabs
   *  dentro de la pantalla (ver RouteTabs) en vez de submenú expandible: rutas hermanas que no
   *  comparten prefijo con `path` pero deben marcar este ítem como activo igual (ej. Plantillas:
   *  /config/plantillas-facturas, /config/plantillas-etiquetas, /config/tesoreria/plantillas-cheque). */
  activePrefixes?: string[];
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
    label: "Despachos",
    icon: <Truck size={16} aria-hidden="true" />,
    path: "/despachos",
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
        // Carga Inicial (Stock Entry / Material Receipt) — docs/tasks/
        // PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md. NO confundir con "Inventario" bajo
        // Migración de Saldos (Configuración): cuentas contables y semántica de qty distintas.
        label: "Carga Inicial",
        icon: <PackagePlus size={14} />,
        path: "/inventario/carga-inicial",
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
      {
        label: "Abastecimiento",
        icon: <Truck size={14} />,
        path: "/compras/ordenes/abastecimiento",
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
  {
    label: "Relaciones Comerciales",
    icon: <Handshake size={16} aria-hidden="true" />,
    prefix: "/relaciones-comerciales",
    children: [
      { label: "Socios y Solicitudes", icon: <Handshake size={14} />, path: "/relaciones-comerciales" },
      { label: "Transacciones B2B", icon: <ArrowLeftRight size={14} />, path: "/relaciones-comerciales/transacciones" },
    ],
  },
];

// Solo visible con tenant.vertical === "farmacia" (docs/PROMPT_FARMACIA_V2_FRONTEND.md §1).
// La v2 eliminó Preaprobaciones, Despachos y Cola de Cobro (§2.1): la cobertura de la ARS vive
// dentro de la factura de venta normal y la cajera cobra desde la pantalla de Caja de siempre.
const NAV_FARMACIA: NavGroup = {
  label: "Farmacia ARS",
  icon: <Pill size={16} aria-hidden="true" />,
  prefix: "/farmacia",
  children: [
    { label: "Aseguradoras", icon: <Shield size={14} />, path: "/farmacia/aseguradoras" },
    { label: "Lotes de Facturación", icon: <Receipt size={14} />, path: "/farmacia/lotes" },
    // Vive en la pantalla de Reportes (/reportes/:tipo), no bajo /farmacia — el permiso igual se
    // resuelve por ruta (`farmacia.reportes.lotes.listar`) como cualquier otra entrada del menú.
    { label: "Reportes", icon: <FileText size={14} />, path: "/reportes/farmacia-lotes" },
  ],
};

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
    { label: "Facturación Fiscal", icon: <FileText size={14} />, path: "/reportes/facturacion-fiscal" },
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
    {
      label: "Despacho",
      icon: <Truck size={14} />,
      prefix: "/reportes/despacho-margen|/reportes/despacho-reservas|/reportes/despacho-faltantes|/reportes/despacho-pendientes-compra",
      children: [
        { label: "Margen Real", icon: <BarChart3 size={12} />, path: "/reportes/despacho-margen" },
        { label: "Reservas de Stock", icon: <BarChart3 size={12} />, path: "/reportes/despacho-reservas" },
        { label: "Faltantes", icon: <BarChart3 size={12} />, path: "/reportes/despacho-faltantes" },
        { label: "Pendientes de Comprar", icon: <BarChart3 size={12} />, path: "/reportes/despacho-pendientes-compra" },
      ],
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
      label: "Monedas",
      icon: <DollarSign size={14} />,
      path: "/config/monedas",
    },
    // Facturación Electrónica y Plantillas son ítems "aplanados": en vez de submenú expandible,
    // el sidebar lleva directo a la primera pantalla y esta muestra las demás como tabs (RouteTabs)
    // dentro de la propia pantalla — mismo patrón que Físico/Electrónico en Secuencias NCF.
    {
      label: "Facturación Electrónica",
      icon: <ShieldCheck size={14} />,
      path: "/config/ecf",
    },
    {
      label: "Plantillas",
      icon: <LayoutTemplate size={14} />,
      path: "/config/plantillas-facturas",
      activePrefixes: [
        "/config/plantillas-facturas",
        "/config/plantillas-etiquetas",
        "/config/tesoreria/plantillas-cheque",
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
    // Ítem "aplanado" (ver nota arriba, junto a Facturación Electrónica) — las otras 3 pantallas
    // se muestran como tabs (RouteTabs) dentro de /config/tasas-impuesto y hermanas.
    {
      label: "Impuestos",
      icon: <Percent size={14} />,
      path: "/config/tasas-impuesto",
      activePrefixes: IMPUESTOS_GROUP_PREFIX.split("|"),
    },
    {
      label: "Ejercicio Fiscal",
      icon: <Calendar size={14} />,
      path: "/config/ejercicio-fiscal",
    },
    // Migración de Saldos (Facturas de Apertura) — docs/tasks/PROMPT_APERTURA_FRONTEND.md §2 y
    // docs/tasks/PROMPT_APERTURA_INVENTARIO_FRONTEND.md §2 (pestaña "Inventario").
    // Grupo anidado (soportado por NavGroupBtn/filtrarNavPorPermisos de forma recursiva) para que
    // sus 5 pantallas queden agrupadas; si el usuario no tiene ninguna acción "ver" de este
    // módulo, filtrarNavPorPermisos oculta cada hijo y el grupo entero desaparece del menú.
    // "Inventario" usa un permiso independiente (apertura.inventario.*, doctype Stock
    // Reconciliation) — un usuario puede ver Ventas/Compras y no ver Inventario, no es un bug.
    {
      label: "Migración de Saldos",
      icon: <History size={14} />,
      prefix: "/apertura",
      children: [
        { label: "Diagnóstico", icon: <Wrench size={14} />, path: "/apertura/diagnostico" },
        { label: "Ventas", icon: <Receipt size={14} />, path: "/apertura/ventas" },
        { label: "Compras", icon: <ShoppingCart size={14} />, path: "/apertura/compras" },
        { label: "Inventario", icon: <Package size={14} />, path: "/apertura/inventario" },
        { label: "Cuadre", icon: <BarChart3 size={14} />, path: "/apertura/resumen" },
      ],
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
    {
      label: "Farmacia ARS",
      icon: <Pill size={14} />,
      path: "/config/farmacia",
    },
    { label: "Usuarios", icon: <UserCog size={14} />, path: "/usuarios" },
    // Administrativos — requieren System Manager en ERPNext, filtrados en el render (ver AppLayoutInner)
    { label: "Permisos", icon: <Lock size={14} />, path: "/config/permisos" },
    { label: "Roles", icon: <ShieldCheck size={14} />, path: "/config/roles" },
    { label: "Auditoría de PIN", icon: <ScrollText size={14} />, path: "/config/auditoria-pin" },
    { label: "Mi Perfil", icon: <UserCog size={14} />, path: "/config/perfil" },
  ],
};

// ─── Panel categorizado de Configuración ───────────────────────────────────────
// Mismo criterio visual que el listado de Reportes (REPORT_NAV en ReportesPage.tsx: columna con
// encabezados de categoría), pero acá el panel vive en AppLayout — no dentro de una sola pantalla
// — porque Configuración son ~30 rutas distintas (no una sola pantalla con :tipo como parámetro),
// así que el panel no se desmonta al pasar de una sección de configuración a otra: se muestra
// mientras la ruta actual esté bajo /config, /apertura o /usuarios, sin importar cuál subsección.
//
// Se deriva de `configNavPermFiltered` (el árbol ya filtrado por rol/vertical/permisos) en vez de
// mantener una lista aparte — así no hay riesgo de que este panel muestre un ítem que el árbol
// normal del sidebar ya oculta para ese usuario.
const CONFIG_ITEM_GROUP: Record<string, string> = {
  "/config/empresa": "General",
  "/config/sucursales": "General",
  "/config/departamentos": "General",
  "/config/impresoras": "General",
  "/config/cajas": "Tesorería",
  "/config/bancos": "Tesorería",
  "/config/cuentas-bancarias": "Tesorería",
  "/config/tesoreria/tipos-documento": "Tesorería",
  "/config/cobros": "Tesorería",
  "/config/metodos-pago": "Tesorería",
  "/config/denominaciones": "Tesorería",
  "/config/centros-costo": "Contabilidad",
  "/config/ejercicio-fiscal": "Contabilidad",
  "/config/retenciones": "Contabilidad",
  "/config/facturacion": "Facturación",
  "/config/monedas": "Facturación",
  "/config/ecf": "Facturación",
  "/config/plantillas-facturas": "Facturación",
  "/config/ncf": "Facturación",
  "/config/tasas-impuesto": "Facturación",
  "/config/listas-precio": "Facturación",
  "/config/grupos-clientes": "Facturación",
  "/config/almacenes": "Inventario",
  "/config/uom": "Inventario",
  "/config/recalculo-valuacion": "Inventario",
  "/config/ajustes-avanzados": "Sistema",
  "/config/notificaciones": "Sistema",
  "/config/farmacia": "Sistema",
  "/usuarios": "Sistema",
  "/config/permisos": "Sistema",
  "/config/roles": "Sistema",
  "/config/auditoria-pin": "Sistema",
  "/config/perfil": "Sistema",
};

// Aplana el árbol (1 solo nivel de anidamiento hoy: "Migración de Saldos") en pares {group, item}
// — un subgrupo usa su propio label como categoría; un ítem suelto sin entrada en
// CONFIG_ITEM_GROUP cae en "General" en vez de desaparecer, para que un ítem nuevo que alguien
// olvide categorizar siga siendo visible.
function flattenConfigNav(root: NavGroup): { group: string; item: NavItem }[] {
  const out: { group: string; item: NavItem }[] = [];
  for (const child of root.children) {
    if (isGroup(child)) {
      for (const grandchild of child.children) {
        if (!isGroup(grandchild)) out.push({ group: child.label, item: grandchild });
      }
    } else {
      out.push({ group: CONFIG_ITEM_GROUP[child.path] ?? "General", item: child });
    }
  }
  return out;
}

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

// Quita (recursivamente, incluidos los sub-grupos) los ítems cuyo `path` está en `excluded`.
// Un grupo que se queda sin hijos se elimina por completo. Genérica para poder aplicarla tanto
// a ADMIN_ONLY_PATHS (rol System Manager) como a FARMACIA_ONLY_PATHS (tenant.vertical).
function stripPathsFromEntry(entry: NavEntry, excluded: Set<string>): NavEntry | null {
  if (isGroup(entry)) {
    // Un grupo entero también puede estar excluido por su `prefix` (ej. un subgrupo de reportes
    // gateado por un flag de negocio, no solo ítems sueltos) — se chequea antes de recursar.
    if (excluded.has(entry.prefix)) return null;
    const children = entry.children
      .map((c) => stripPathsFromEntry(c, excluded))
      .filter((c): c is NavEntry => c !== null);
    return children.length ? { ...entry, children } : null;
  }
  return excluded.has(entry.path) ? null : entry;
}

function stripAdminOnlyEntry(entry: NavEntry): NavEntry | null {
  return stripPathsFromEntry(entry, ADMIN_ONLY_PATHS);
}

// Filtra el menú por los permisos del usuario actual (docs/PROMPT_PERMISOS_FRONTEND.md §6).
// Fuente de verdad: el mismo mapa ruta→acción que usa el guard de router (`RUTAS_PERMISOS`).
// - Ítem sin entrada en el mapa → se deja pasar (fail-open); la seguridad real la aplica el backend.
// - `soloFarmacia` / `soloSystemManager` se evalúan antes que `acciones` (§6 / §15).
// - Un grupo cuyos hijos quedan todos ocultos no se renderiza (no dejar carpetas vacías).
function filtrarNavPorPermisos(
  entry: NavEntry,
  ctx: { acciones: Record<string, boolean>; esFarmacia: boolean; isSystemManager: boolean },
): NavEntry | null {
  if (isGroup(entry)) {
    const children = entry.children
      .map((c) => filtrarNavPorPermisos(c, ctx))
      .filter((c): c is NavEntry => c !== null);
    return children.length ? { ...entry, children } : null;
  }
  const ruta = resolverRuta(entry.path);
  if (!ruta) return entry;
  if (ruta.soloFarmacia && !ctx.esFarmacia) return null;
  if (ruta.soloSystemManager && !ctx.isSystemManager) return null;
  if (ruta.accion && ctx.acciones[ruta.accion] !== true) return null;
  return entry;
}

function filtrarNavList(
  entries: NavEntry[],
  ctx: { acciones: Record<string, boolean>; esFarmacia: boolean; isSystemManager: boolean },
): NavEntry[] {
  return entries
    .map((e) => filtrarNavPorPermisos(e, ctx))
    .filter((e): e is NavEntry => e !== null);
}

// Solo visible con tenant.vertical === "farmacia" (docs/PROMPT_FARMACIA_V2_FRONTEND.md §1).
const FARMACIA_ONLY_PATHS = new Set(["/config/farmacia"]);

// Grupos/ítems de NAV_FINANZAS que solo tienen sentido con el módulo POS habilitado
// (Facturacion Config.usaModuloPos) — identificados por su `prefix` (grupos) o `path` (ítems sueltos).
const POS_ONLY_NAV_KEYS = new Set([
  "/caja",
  "/turnos",
  "/reportes/cuadreTurno|/reportes/caja|/reportes/corteCajaDia",
]);

// Ítems de NAV_VENTAS / NAV_OPS que solo tienen sentido con la facturación electrónica
// habilitada (EcfConfig.habilitado) — identificados por su `path`.
const ECF_ONLY_NAV_KEYS = new Set(["/ecf-emitidos", "/ecf-recibidos"]);

// Ítems que solo tienen sentido con el despacho activo (FacturacionConfig.despachoHabilitado) —
// docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §1.2. El flag puede cambiar en
// caliente: no lo cacheamos más allá de la query de facturacion-config (staleTime 5min, se
// refresca explícitamente después de habilitar/deshabilitar desde Configuración).
const DESPACHO_ONLY_NAV_KEYS = new Set([
  "/despachos",
  "/compras/ordenes/abastecimiento",
  "/reportes/despacho-margen|/reportes/despacho-reservas|/reportes/despacho-faltantes|/reportes/despacho-pendientes-compra",
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
  const active = item.activePrefixes
    ? item.activePrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
    : pathname === item.path || pathname.startsWith(item.path + "/");
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
  const active = child.activePrefixes
    ? child.activePrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
    : child.exact
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

// Botón del panel categorizado de Configuración — variante clara (.report-nav-item, mismo estilo
// que ya usa el listado de Reportes), no la variante oscura de .nav-item/.nav-child del sidebar.
function ConfigNavLinkBtn({
  item,
  onNav,
  pathname,
}: {
  item: NavItem;
  onNav: (p: string) => void;
  pathname: string;
}) {
  const active = item.activePrefixes
    ? item.activePrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
    : item.exact
      ? pathname === item.path
      : pathname === item.path || pathname.startsWith(item.path + "/");
  return (
    <button
      className={`report-nav-item${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onNav(item.path)}
    >
      {item.icon}
      <span>{item.label}</span>
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
  active,
}: {
  label: string;
  onClose: () => void;
  active?: boolean;
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
        color: active ? "#ffffff" : "var(--text-tertiary)",
        padding: 0,
        flexShrink: 0,
        opacity: active ? 0.85 : 0.7,
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
  const { tabs, activeId, closeTab, reorderTabs } = useTabs();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  // Detecta si los tabs superan el ancho visible para mostrar el botón ">>"
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setHasOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [tabs.length]);

  // Lleva el tab activo a la vista
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeId) return;
    const activeEl = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    activeEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  // Cierra el desplegable con click fuera / Escape
  useEffect(() => {
    if (!overflowOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        dropdownRef.current?.contains(t) ||
        overflowBtnRef.current?.contains(t)
      )
        return;
      setOverflowOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverflowOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  if (tabs.length === 0) return null;

  const handleDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) reorderTabs(dragId, targetId);
    setDragId(null);
    setDropId(null);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid var(--border-default)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
        background: "var(--surface-app)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        flexShrink: 0,
      }}
    >
      <div
        ref={scrollRef}
        style={{
          display: "flex",
          alignItems: "stretch",
          overflowX: "auto",
          overflowY: "hidden",
          flex: 1,
          minWidth: 0,
          scrollbarWidth: "none",
        }}
      >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const isDropTarget = dropId === tab.id && dragId !== tab.id;
        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            draggable
            onDragStart={(e) => {
              setDragId(tab.id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", tab.id);
              } catch {}
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (tab.id !== dragId) setDropId(tab.id);
            }}
            onDragLeave={() => {
              setDropId((prev) => (prev === tab.id ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(tab.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropId(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 10px 0 14px",
              height: 36,
              minWidth: 80,
              maxWidth: 200,
              flexShrink: 0,
              cursor: "grab",
              borderRight: "1px solid var(--border-default)",
              borderTopRightRadius: 10,
              background: isActive ? "#208591" : "transparent",
              borderBottom: isActive
                ? "none"
                : "2px solid transparent",
              borderLeft: isDropTarget
                ? "2px solid var(--brand-primary)"
                : "2px solid transparent",
              opacity: dragId === tab.id ? 0.5 : 1,
              transition: "background 0.12s, opacity 0.12s",
              userSelect: "none",
            }}
            onClick={() => navigate(tab.path)}
            title={`${tab.title} — arrastra para reordenar`}
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
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive
                  ? "#ffffff"
                  : "#0E3D51",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {tab.title}
            </span>
            <TabCloseButton
              label={`Cerrar ${tab.title}`}
              active={isActive}
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
      {hasOverflow && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            ref={overflowBtnRef}
            type="button"
            aria-label="Ver pestañas abiertas"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              border: "none",
              borderLeft: "1px solid var(--border-default)",
              background: overflowOpen
                ? "var(--surface-hover)"
                : "var(--surface-app)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <ChevronsRight size={16} />
          </button>
          {overflowOpen && (
            <div
              ref={dropdownRef}
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 4,
                minWidth: 220,
                maxWidth: 320,
                maxHeight: 320,
                overflowY: "auto",
                background:
                  "var(--surface-raised, var(--bg-surface))",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                boxShadow: "var(--shadow-xl)",
                padding: 4,
                zIndex: 100,
              }}
            >
              {tabs.map((tab) => {
                const isActive = tab.id === activeId;
                const handleClose = () => {
                  if (tab.isDirty) {
                    if (
                      !window.confirm(
                        `"${tab.title}" tiene cambios sin guardar. ¿Cerrar de todas formas?`,
                      )
                    )
                      return;
                  }
                  closeTab(tab.id);
                };
                return (
                  <div
                    key={tab.id}
                    role="menuitem"
                    onClick={() => {
                      navigate(tab.path);
                      setOverflowOpen(false);
                    }}
                    title={tab.title}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 6px 8px 10px",
                      border: "none",
                      borderRadius: 6,
                      background: isActive
                        ? "var(--surface-hover)"
                        : "transparent",
                      color: isActive
                        ? "var(--text-primary)"
                        : "#0E3D51",
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      cursor: "pointer",
                      textAlign: "left",
                      boxSizing: "border-box",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background =
                          "var(--surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        flexShrink: 0,
                        display: "flex",
                        justifyContent: "center",
                        color: "var(--brand-primary)",
                      }}
                    >
                      {isActive && <Check size={14} />}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tab.title}
                    </span>
                    {tab.isDirty && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background:
                            "var(--color-primary, #4f46e5)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Cerrar ${tab.title}`}
                      title={`Cerrar ${tab.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClose();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 20,
                        height: 20,
                        border: "none",
                        borderRadius: 4,
                        background: "transparent",
                        color: "var(--text-tertiary)",
                        cursor: "pointer",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AppLayout inner (uses TabsContext) ───────────────────────────────────────

// Modo oscuro deshabilitado temporalmente hasta que se definan sus colores — la lógica queda
// intacta (localStorage, preferencia del sistema, botón) detrás de este flag para reactivarla
// después sin tener que reconstruirla.
const DARK_MODE_ENABLED = false;

function AppLayoutInner() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (!DARK_MODE_ENABLED) return "light";
    const saved = localStorage.getItem("gensuite-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [userOpen, setUserOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [switchingSlug, setSwitchingSlug] = useState<string | null>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const { user, logout, tenant, memberships, refreshToken, applySwitchTenantResult } = useAuthStore();
  const activeCompanies = memberships.filter((m) => m.status === "accepted");
  const canSwitchCompany = activeCompanies.length > 1;
  const isSystemManager = useIsSystemManager();
  const vertical = usePermissionsStore((s) => s.vertical);
  const esFarmacia = vertical === "farmacia";
  const acciones = usePermissionsStore((s) => s.acciones);
  const permCtx = { acciones, esFarmacia, isSystemManager };

  const { data: facturacionConfig } = useQuery({
    queryKey: ["facturacion-config"],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  });
  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false;
  const usaImpuestoDocumento = facturacionConfig?.usaImpuestoDocumento ?? true;

  const { data: ecfConfig } = useQuery({
    queryKey: ["ecf-config"],
    queryFn: getEcfConfig,
    staleTime: 5 * 60_000,
  });
  const ecfHabilitado = ecfConfig?.habilitado ?? false;
  const despachoHabilitado = facturacionConfig?.despachoHabilitado ?? false;

  const configNavRoleFiltered: NavEntry = isSystemManager
    ? NAV_CONFIG
    : (stripAdminOnlyEntry(NAV_CONFIG) as NavGroup);
  const configNavAdminFiltered: NavEntry = esFarmacia
    ? configNavRoleFiltered
    : (stripPathsFromEntry(configNavRoleFiltered, FARMACIA_ONLY_PATHS) as NavGroup);

  // Sin Impuesto de Documento, las plantillas de Ventas/Compras/Artículo dejan de tener sentido
  // en el menú — colapsa el grupo "Impuestos" a un único ítem plano que va directo al catálogo.
  const configNav: NavEntry = usaImpuestoDocumento
    ? configNavAdminFiltered
    : {
        ...(configNavAdminFiltered as NavGroup),
        children: (configNavAdminFiltered as NavGroup).children.map((item) =>
          !isGroup(item) && item.path === "/config/tasas-impuesto"
            ? { label: "Impuestos", icon: <Percent size={14} />, path: "/config/tasas-impuesto" }
            : item,
        ),
      };
  const financeNavPos: NavEntry[] = usaModuloPos
    ? NAV_FINANZAS
    : NAV_FINANZAS.filter(
        (entry) => !POS_ONLY_NAV_KEYS.has(isGroup(entry) ? entry.prefix : entry.path),
      );

  // Filtrado final por permisos del usuario (docs/PROMPT_PERMISOS_FRONTEND.md §6). Se aplica
  // después de los filtros de negocio (POS, Impuesto de Documento) y de rol/vertical.
  const navEcfFiltered = (entries: NavEntry[]): NavEntry[] =>
    ecfHabilitado
      ? entries
      : entries.filter(
          (entry) => !ECF_ONLY_NAV_KEYS.has(isGroup(entry) ? entry.prefix : entry.path),
        );

  // A diferencia de POS/ECF (siempre ítems de nivel superior), los ítems de despacho pueden estar
  // anidados dentro de otro grupo (Abastecimiento dentro de "Compras", el subgrupo "Despacho"
  // dentro de "Reportes") — stripPathsFromEntry recorre recursivamente, así que alcanza ambos casos.
  const navDespachoFiltered = (entries: NavEntry[]): NavEntry[] =>
    despachoHabilitado
      ? entries
      : entries
          .map((entry) => stripPathsFromEntry(entry, DESPACHO_ONLY_NAV_KEYS))
          .filter((e): e is NavEntry => e !== null);

  const mainNav = filtrarNavList(NAV_MAIN, permCtx);
  const ventasNav = filtrarNavList(navDespachoFiltered(navEcfFiltered(NAV_VENTAS)), permCtx);
  const opsNav = filtrarNavList(navDespachoFiltered(navEcfFiltered(NAV_OPS)), permCtx);
  const farmaciaNav = filtrarNavPorPermisos(NAV_FARMACIA, permCtx);
  const financeNav = filtrarNavList(financeNavPos, permCtx);
  const contabilidadNav = filtrarNavList(NAV_CONTABILIDAD, permCtx);
  const reportesNavDespachoFiltered: NavEntry = despachoHabilitado
    ? NAV_REPORTES
    : (stripPathsFromEntry(NAV_REPORTES, DESPACHO_ONLY_NAV_KEYS) as NavGroup);
  const reportesNav = filtrarNavPorPermisos(reportesNavDespachoFiltered, permCtx);
  const configNavPermFiltered = filtrarNavPorPermisos(configNav, permCtx);
  const { tabs, activeId, closeTab, multiTab, keepAliveRef } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const activeTabPath = location.pathname + (location.search || "");

  // Panel categorizado de Configuración (persistente mientras la ruta esté bajo /config,
  // /apertura o /usuarios) — reemplaza la lista de submenú anidada que se expandía/colapsaba
  // dentro del propio sidebar.
  const configNavFlat = configNavPermFiltered ? flattenConfigNav(configNavPermFiltered as NavGroup) : [];
  const configGroups = [...new Set(configNavFlat.map((x) => x.group))];
  const configPanelVisible =
    !!configNavPermFiltered &&
    (location.pathname.startsWith("/config") ||
      location.pathname.startsWith("/apertura") ||
      location.pathname === "/usuarios");
  const configEntryItem: NavItem = {
    label: "Configuración",
    icon: <Settings size={16} aria-hidden="true" />,
    path: "/config/empresa",
    activePrefixes: ["/config", "/apertura", "/usuarios"],
  };

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

  const displayName = user?.fullName ?? user?.email ?? "Usuario";
  const initials = displayName.slice(0, 2).toUpperCase();

  // Apply theme to root element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("gensuite-theme", theme);
  }, [theme]);

  // Close user dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false);
        setCompanyMenuOpen(false);
      }
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

  const handleSwitchCompany = async (slug: string) => {
    if (slug === tenant?.slug || !refreshToken || switchingSlug) return;
    setSwitchingSlug(slug);
    try {
      const result = await switchTenant({ refreshToken, tenant: slug });
      applySwitchTenantResult(result);
      setUserOpen(false);
      setCompanyMenuOpen(false);
      // Recarga completa: el resto de la app (queries de react-query, tabs abiertas, permisos)
      // no está escopeado por tenant, así que el cambio de empresa necesita un estado limpio. Si
      // por lo que sea la navegación no llega a completarse, igual liberamos el botón abajo.
      window.location.href = "/dashboard";
      setSwitchingSlug(null);
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "No se pudo cambiar de empresa.");
      setSwitchingSlug(null);
    }
  };

  const handleNav = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <>
      {/* Menú principal */}
      {mainNav.length > 0 && (
        <div className="sb-section">
          {mainNav.map((entry) => renderEntry(entry, handleNav, collapsed))}
        </div>
      )}

      {/* Ventas */}
      {ventasNav.length > 0 && (
        <div className="sb-section">
          {!collapsed && <div className="sb-label">Ventas</div>}
          {ventasNav.map((entry) => renderEntry(entry, handleNav, collapsed))}
        </div>
      )}

      {/* Operaciones */}
      {opsNav.length > 0 && (
        <div className="sb-section">
          {!collapsed && <div className="sb-label">Operaciones</div>}
          {opsNav.map((entry) => renderEntry(entry, handleNav, collapsed))}
        </div>
      )}

      {/* Farmacia ARS — solo tenants de este vertical */}
      {esFarmacia && farmaciaNav && (
        <div className="sb-section">
          {!collapsed && <div className="sb-label">Farmacia ARS</div>}
          {renderEntry(farmaciaNav, handleNav, collapsed)}
        </div>
      )}

      {/* Finanzas */}
      {financeNav.length > 0 && (
        <div className="sb-section">
          {!collapsed && <div className="sb-label">Finanzas</div>}
          {financeNav.map((entry) => renderEntry(entry, handleNav, collapsed))}
        </div>
      )}

      {/* Contabilidad */}
      {contabilidadNav.length > 0 && (
        <div className="sb-section">
          {!collapsed && <div className="sb-label">Contabilidad</div>}
          {contabilidadNav.map((entry) => renderEntry(entry, handleNav, collapsed))}
        </div>
      )}

      {/* Footer */}
      <div className="sb-footer">
        {reportesNav &&
          renderEntry(reportesNav, handleNav, collapsed, {
            floatWhenCollapsed: true,
          })}
        {configNavPermFiltered && (
          <NavItemBtn item={configEntryItem} onNav={handleNav} collapsed={collapsed} />
        )}
      </div>
    </>
  );

  return (
    <>
      <div
        className={`app-shell${collapsed ? " collapsed" : ""}${configPanelVisible ? " with-config-panel" : ""}`}
      >
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
              className="dd-logo dd-logo-full"
            />
            {/* En celular se usa el isotipo (más compacto) en vez del logo horizontal completo. */}
            <img
              src={logoIso}
              className="dd-logo dd-logo-iso"
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
            {/* En celular el turno de caja se muestra dentro del dropdown de usuario (ver más abajo) —
             * acá solo queda visible en desktop. */}
            <div className="topbar-turno-desktop">
              <TurnoCajaIndicator />
            </div>

            {/* Theme toggle — oculto mientras DARK_MODE_ENABLED sea false */}
            {DARK_MODE_ENABLED && (
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
            )}

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
                    {user?.fullName ?? displayName}
                  </div>
                  <div className="dd-email">{user?.email}</div>
                </div>
                {/* Solo celular — en desktop el turno de caja vive en el topbar (topbar-turno-desktop). */}
                <div className="dd-turno-mobile" style={{ padding: "10px 12px" }}>
                  <TurnoCajaIndicator />
                </div>
                <div className="dd-sep dd-turno-mobile" />
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
                      navigate("/mi-cuenta");
                    }}
                  >
                    <ShieldCheck size={14} aria-hidden="true" /> Mi cuenta y seguridad
                  </button>
                  {/*<button
                    className="dd-item"
                    role="menuitem"
                    onClick={() => {
                      setUserOpen(false);
                      navigate("/config/empresa");
                    }}
                  >
                    <Building2 size={14} aria-hidden="true" /> Empresa
                  </button>*/}
                  {canSwitchCompany && (
                    <>
                      <button
                        className="dd-item"
                        role="menuitem"
                        aria-haspopup="true"
                        aria-expanded={companyMenuOpen}
                        onClick={() => setCompanyMenuOpen((o) => !o)}
                      >
                        <Building2 size={14} aria-hidden="true" /> Cambiar empresa
                        <ChevronRight
                          size={12}
                          style={{
                            marginLeft: "auto",
                            transform: companyMenuOpen ? "rotate(90deg)" : undefined,
                            transition: "transform 0.15s",
                          }}
                          aria-hidden="true"
                        />
                      </button>
                      {companyMenuOpen && (
                        <div style={{ padding: "2px 0 2px 8px" }}>
                          {activeCompanies.map((m) => {
                            const isActive = m.slug === tenant?.slug;
                            const isSwitching = switchingSlug === m.slug;
                            return (
                              <button
                                key={m.slug}
                                className="dd-item"
                                role="menuitemradio"
                                aria-checked={isActive}
                                disabled={isActive || !!switchingSlug}
                                onClick={() => handleSwitchCompany(m.slug)}
                              >
                                {isSwitching ? (
                                  <Loader2 size={14} className="spin" aria-hidden="true" />
                                ) : isActive ? (
                                  <Check size={14} aria-hidden="true" />
                                ) : (
                                  <span style={{ width: 14 }} aria-hidden="true" />
                                )}
                                {m.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
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

        {/* ── Panel de Configuración — persistente, no se desmonta al navegar entre secciones ── */}
        {configPanelVisible && (
          <aside className="config-nav-panel" aria-label="Secciones de Configuración">
            {configGroups.map((group) => (
              <div key={group} className="config-nav-group">
                <div className="config-nav-group-label">{group}</div>
                {configNavFlat
                  .filter((x) => x.group === group)
                  .map(({ item }) => (
                    <ConfigNavLinkBtn
                      key={item.path}
                      item={item}
                      onNav={handleNav}
                      pathname={location.pathname}
                    />
                  ))}
              </div>
            ))}
          </aside>
        )}

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
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 300,
          flexDirection: "column",
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
            flexShrink: 0,
            borderBottom: "1px solid var(--sidebar-border)",
          }}
        >
          <span className="logo-text" style={{ color: "var(--sidebar-text-hover)" }}>GenSuite</span>
          <button
            className="icon-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            style={{ color: "var(--sidebar-text)" }}
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
