import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getFacturacionConfig } from '@/shared/api/config'
import {
  LayoutDashboard, Users, Package, FileText, Receipt, Warehouse,
  ShoppingCart, CreditCard, Truck, Wallet, BarChart3, Settings,
  Shield, Building2, UserCog, BookOpen, ClipboardList, MapPin,
  Search, ArrowRight,
} from 'lucide-react'
import type { ReactNode } from 'react'

// ─── Searchable items registry ────────────────────────────────────────────────

interface SearchItem {
  id: string
  label: string
  path: string
  group: string
  icon: ReactNode
  keywords?: string   // extra search terms
}

const ALL_ITEMS: SearchItem[] = [
  // ── Principal ──────────────────────────────────────────────────────────────
  { id: 'dashboard',    label: 'Dashboard',           group: 'Principal',    path: '/dashboard',                      icon: <LayoutDashboard size={15} />, keywords: 'inicio home resumen kpi' },
  { id: 'clientes',     label: 'Clientes',             group: 'Principal',    path: '/clientes',                       icon: <Users size={15} />, keywords: 'customers' },
  { id: 'cliente-nuevo',label: 'Nuevo Cliente',        group: 'Principal',    path: '/clientes/nuevo',                 icon: <Users size={15} />, keywords: 'crear cliente customer' },

  // ── Catálogo ───────────────────────────────────────────────────────────────
  { id: 'categorias',   label: 'Categorías',           group: 'Catálogo',     path: '/catalogo/categorias',            icon: <Package size={15} />, keywords: 'catalog categories grupos' },
  { id: 'marcas',       label: 'Marcas',               group: 'Catálogo',     path: '/catalogo/marcas',                icon: <Package size={15} />, keywords: 'brands marca' },
  { id: 'productos',    label: 'Productos',            group: 'Catálogo',     path: '/inventario/productos',             icon: <Package size={15} />, keywords: 'items producto inventario catalog' },
  { id: 'producto-nuevo', label: 'Nuevo Producto',     group: 'Catálogo',     path: '/inventario/productos/nuevo',       icon: <Package size={15} />, keywords: 'crear item producto' },
  { id: 'servicios',    label: 'Servicios',            group: 'Catálogo',     path: '/catalogo/servicios',                icon: <Package size={15} />, keywords: 'items servicio catalog' },
  { id: 'servicio-nuevo', label: 'Nuevo Servicio',     group: 'Catálogo',     path: '/catalogo/servicios/nuevo',         icon: <Package size={15} />, keywords: 'crear item servicio' },
  { id: 'cuentas-por-pagar', label: 'Cuentas por Pagar', group: 'Catálogo',   path: '/catalogo/cuentas-por-pagar',        icon: <Package size={15} />, keywords: 'conceptos gasto cxp' },

  // ── Ventas ─────────────────────────────────────────────────────────────────
  { id: 'cotizaciones', label: 'Cotizaciones',         group: 'Ventas',       path: '/cotizaciones',                   icon: <FileText size={15} />, keywords: 'quotations cotizar presupuesto' },
  { id: 'cot-nueva',    label: 'Nueva Cotización',     group: 'Ventas',       path: '/cotizaciones/nueva',             icon: <FileText size={15} />, keywords: 'crear cotizacion' },
  { id: 'facturas',     label: 'Facturas',             group: 'Ventas',       path: '/facturas',           icon: <Receipt size={15} />, keywords: 'invoices facturacion ventas' },
  { id: 'fact-nueva',   label: 'Nueva Factura',        group: 'Ventas',       path: '/facturas/nueva',     icon: <Receipt size={15} />, keywords: 'crear factura invoice' },
  { id: 'notas-credito', label: 'Notas de Crédito',   group: 'Ventas',       path: '/notas-credito',      icon: <Receipt size={15} />, keywords: 'credit note devolucion ncf b04' },
  { id: 'notas-debito',  label: 'Notas de Débito',    group: 'Ventas',       path: '/notas-debito',       icon: <Receipt size={15} />, keywords: 'debit note cargo ncf b03' },
  { id: 'devoluciones',  label: 'Devoluciones',       group: 'Ventas',       path: '/devoluciones',       icon: <Receipt size={15} />, keywords: 'return devolucion nota credito' },

  // ── Inventario ─────────────────────────────────────────────────────────────
  { id: 'stock',        label: 'Stock Actual',         group: 'Inventario',   path: '/inventario/stock',               icon: <Warehouse size={15} />, keywords: 'inventory stock almacen warehouse' },
  { id: 'historial-inv', label: 'Historial de Stock',  group: 'Inventario',   path: '/inventario/historial',           icon: <Warehouse size={15} />, keywords: 'movimientos inventario history' },
  { id: 'conteos',      label: 'Conteos Físicos',      group: 'Inventario',   path: '/inventario/conteos',             icon: <Warehouse size={15} />, keywords: 'physical count conteo inventario' },
  { id: 'zonas',        label: 'Zonas y Ubicaciones',  group: 'Inventario',   path: '/inventario/zonas',               icon: <MapPin size={15} />, keywords: 'zonas ubicaciones racks almacen location warehouse' },

  // ── Compras & Gastos ───────────────────────────────────────────────────────
  { id: 'compras',      label: 'Compras',              group: 'Operaciones',  path: '/compras',                        icon: <ShoppingCart size={15} />, keywords: 'purchase compras proveedores 606' },
  { id: 'compra-nueva', label: 'Nueva Compra',         group: 'Operaciones',  path: '/compras/nueva',                  icon: <ShoppingCart size={15} />, keywords: 'crear compra purchase' },
  { id: 'dev-compras',  label: 'Devoluciones de Compras', group: 'Operaciones', path: '/devoluciones-compras',          icon: <Receipt size={15} />, keywords: 'devoluciones return compras proveedores credito' },
  { id: 'gastos',       label: 'Gastos',               group: 'Operaciones',  path: '/gastos',                         icon: <CreditCard size={15} />, keywords: 'expenses gastos operativos 606' },
  { id: 'gasto-nuevo',  label: 'Nuevo Gasto',          group: 'Operaciones',  path: '/gastos/nuevo',                   icon: <CreditCard size={15} />, keywords: 'crear gasto expense' },
  { id: 'proveedores',  label: 'Proveedores',          group: 'Operaciones',  path: '/proveedores',                    icon: <Truck size={15} />, keywords: 'suppliers vendor proveedor' },

  // ── Finanzas / CxC ─────────────────────────────────────────────────────────
  { id: 'caja',         label: 'Caja',                 group: 'Finanzas',     path: '/caja',                           icon: <Wallet size={15} />, keywords: 'cobrar pago vuelto contado caja factura pendiente' },
  { id: 'cobros',       label: 'Cobros',               group: 'Finanzas',     path: '/cobros',                         icon: <Wallet size={15} />, keywords: 'pagos cuentas cobrar aging' },
  { id: 'registrar-cobro', label: 'Registrar Cobro',   group: 'Finanzas',     path: '/cobros/pago',                    icon: <Wallet size={15} />, keywords: 'pago cobro payment' },
  { id: 'aging',        label: 'Antiguedad de saldos CxC', group: 'Finanzas', path: '/cobros/aging',                   icon: <Wallet size={15} />, keywords: 'antiguedad saldos cuentas cobrar vencidas' },
  { id: 'semaforo',     label: 'Semáforo de Crédito',  group: 'Finanzas',     path: '/cobros/semaforo',                icon: <Wallet size={15} />, keywords: 'credito limite semaforo verde rojo' },
  { id: 'tes-emisiones', label: 'Emisiones (Tesorería)', group: 'Finanzas',   path: '/tesoreria/emisiones',            icon: <CreditCard size={15} />, keywords: 'cheque egreso pago proveedor banco tesoreria' },
  { id: 'tes-depositos', label: 'Depósitos (Tesorería)', group: 'Finanzas',   path: '/tesoreria/depositos',            icon: <CreditCard size={15} />, keywords: 'ingreso cobro cardnet azul banco tesoreria' },
  { id: 'tes-transferencias', label: 'Transferencias Internas', group: 'Finanzas', path: '/tesoreria/transferencias', icon: <CreditCard size={15} />, keywords: 'traspaso entre cuentas bancarias tesoreria' },
  { id: 'tes-movimientos', label: 'Movimientos Bancarios', group: 'Finanzas', path: '/tesoreria/movimientos',         icon: <BarChart3 size={15} />, keywords: 'kardex banco estado de cuenta saldo corrido tesoreria' },
  { id: 'tes-cheques',   label: 'Cheques (Tesorería)',  group: 'Finanzas',     path: '/tesoreria/cheques',              icon: <CreditCard size={15} />, keywords: 'cheque historial anular imprimir numeracion tesoreria' },
  { id: 'usuarios',     label: 'Usuarios',             group: 'Finanzas',     path: '/usuarios',                       icon: <UserCog size={15} />, keywords: 'users roles acceso' },

  // ── Contabilidad ───────────────────────────────────────────────────────────
  { id: 'cuentas',      label: 'Plan de Cuentas',      group: 'Contabilidad', path: '/cuentas',                        icon: <BookOpen size={15} />, keywords: 'chart accounts cuentas contables GL' },
  { id: 'cuenta-nueva', label: 'Nueva Cuenta Contable', group: 'Contabilidad', path: '/cuentas/nueva',                 icon: <BookOpen size={15} />, keywords: 'crear cuenta GL account' },
  { id: 'asientos',     label: 'Asientos Contables',   group: 'Contabilidad', path: '/asientos',                       icon: <ClipboardList size={15} />, keywords: 'journal entry asiento contable GL' },
  { id: 'asiento-nuevo', label: 'Nuevo Asiento',       group: 'Contabilidad', path: '/asientos/nuevo',                 icon: <ClipboardList size={15} />, keywords: 'crear asiento journal entry debito credito' },

  // ── Reportes ───────────────────────────────────────────────────────────────
  { id: 'r606',         label: 'Reporte DGII 606',     group: 'Reportes',     path: '/reportes/606',                   icon: <BarChart3 size={15} />, keywords: 'dgii compras reporte fiscal 606' },
  { id: 'r607',         label: 'Reporte DGII 607',     group: 'Reportes',     path: '/reportes/607',                   icon: <BarChart3 size={15} />, keywords: 'dgii retenciones reporte fiscal 607' },
  { id: 'r608',         label: 'Reporte DGII 608',     group: 'Reportes',     path: '/reportes/608',                   icon: <BarChart3 size={15} />, keywords: 'dgii ventas reporte fiscal 608' },
  { id: 'r-ventas',     label: 'Reporte de Ventas',    group: 'Reportes',     path: '/reportes/ventas',                icon: <BarChart3 size={15} />, keywords: 'ventas sales reporte' },
  { id: 'r-balance',    label: 'Balance General',      group: 'Reportes',     path: '/reportes/balance',               icon: <BarChart3 size={15} />, keywords: 'balance general contabilidad financiero' },
  { id: 'r-pl',         label: 'Estado de Resultados', group: 'Reportes',     path: '/reportes/pl',                    icon: <BarChart3 size={15} />, keywords: 'pl ingresos egresos resultados' },
  { id: 'r-stock',      label: 'Valoración de Stock',  group: 'Reportes',     path: '/reportes/stock',                 icon: <BarChart3 size={15} />, keywords: 'stock inventario valoracion' },
  { id: 'r-movs',       label: 'Movimientos de Stock', group: 'Reportes',     path: '/reportes/movimientos',           icon: <BarChart3 size={15} />, keywords: 'movimientos inventario stock' },
  { id: 'r-cxc',        label: 'Antiguedad de saldos CxC (Reporte)', group: 'Reportes', path: '/reportes/cxcaging', icon: <BarChart3 size={15} />, keywords: 'antiguedad saldos cxc cuentas cobrar' },
  { id: 'r-caja',       label: 'Cuadre de Caja',       group: 'Reportes',     path: '/reportes/caja',                  icon: <BarChart3 size={15} />, keywords: 'caja cuadre efectivo' },

  // ── Configuración ──────────────────────────────────────────────────────────
  { id: 'cfg-empresa',  label: 'Empresa',              group: 'Configuración', path: '/config/empresa',               icon: <Building2 size={15} />, keywords: 'company empresa rnc regimen fiscal logo' },
  { id: 'cfg-cuentas-def', label: 'Cuentas por Defecto', group: 'Configuración', path: '/config/empresa',            icon: <Building2 size={15} />, keywords: 'cuentas default AR AP banco ingreso gasto' },
  { id: 'cfg-cobranza', label: 'Configuración Cobranza', group: 'Configuración', path: '/config/cobros',             icon: <Wallet size={15} />, keywords: 'cobranza limite credito aging semaforo' },
  { id: 'cfg-almacenes', label: 'Almacenes',           group: 'Configuración', path: '/config/almacenes',            icon: <Warehouse size={15} />, keywords: 'warehouse almacen bodega' },
  { id: 'cfg-metodos-pago', label: 'Métodos de Pago',  group: 'Configuración', path: '/config/metodos-pago',         icon: <CreditCard size={15} />, keywords: 'payment method pago efectivo cheque tarjeta' },
  { id: 'cfg-uom',      label: 'Unidades de Medida',   group: 'Configuración', path: '/config/uom',                  icon: <Settings size={15} />, keywords: 'uom units medida unidades' },
  { id: 'cfg-precios',  label: 'Listas de Precio',     group: 'Configuración', path: '/config/listas-precio',        icon: <Settings size={15} />, keywords: 'price list precios lista' },
  { id: 'cfg-ncf',      label: 'Secuencias NCF',       group: 'Configuración', path: '/config/ncf',                  icon: <Shield size={15} />, keywords: 'ncf comprobantes fiscales b01 b02 dgii secuencias' },
  { id: 'cfg-tes-tipos-doc', label: 'Tipos de Documento Bancario', group: 'Configuración', path: '/config/tesoreria/tipos-documento', icon: <CreditCard size={15} />, keywords: 'tesoreria cheque deposito transferencia catalogo bank document type' },
  { id: 'cfg-tes-plantillas', label: 'Plantillas de Cheque', group: 'Configuración', path: '/config/tesoreria/plantillas-cheque', icon: <CreditCard size={15} />, keywords: 'tesoreria cheque print template imprimir talonario' },
  { id: 'cfg-perfil',   label: 'Mi Perfil',            group: 'Configuración', path: '/config/perfil',               icon: <UserCog size={15} />, keywords: 'perfil usuario profile settings' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function score(item: SearchItem, q: string): number {
  const ql = q.toLowerCase()
  const label = item.label.toLowerCase()
  const keywords = (item.keywords ?? '').toLowerCase()
  const group = item.group.toLowerCase()

  if (label === ql) return 100
  if (label.startsWith(ql)) return 90
  if (label.includes(ql)) return 70
  if (keywords.includes(ql)) return 50
  if (group.includes(ql)) return 30
  return 0
}

// Entradas que solo tienen sentido con el módulo POS habilitado (Facturacion Config.usaModuloPos).
const POS_ONLY_IDS = new Set(['caja', 'r-caja'])

function filterItems(q: string, usaModuloPos: boolean): SearchItem[] {
  const base = usaModuloPos ? ALL_ITEMS : ALL_ITEMS.filter((item) => !POS_ONLY_IDS.has(item.id))
  if (!q.trim()) return base
  return base
    .map((item) => ({ item, s: score(item, q) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .map(({ item }) => item)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false

  const results = useMemo(() => filterItems(query, usaModuloPos), [query, usaModuloPos])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setFocusedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Reset focus when results change
  useEffect(() => { setFocusedIdx(0) }, [results])

  // Scroll focused item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelectorAll<HTMLElement>('.cmd-item')[focusedIdx]
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx])

  const handleSelect = useCallback((item: SearchItem) => {
    navigate(item.path)
    onClose()
  }, [navigate, onClose])

  function handleKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIdx((i) => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIdx((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[focusedIdx]) handleSelect(results[focusedIdx])
        break
      case 'Escape':
        onClose()
        break
    }
  }

  if (!open) return null

  // Group results for display
  const grouped: { group: string; items: SearchItem[] }[] = []
  const seen = new Set<string>()
  for (const item of results) {
    if (!seen.has(item.group)) {
      seen.add(item.group)
      grouped.push({ group: item.group, items: [] })
    }
    grouped.find((g) => g.group === item.group)!.items.push(item)
  }

  return (
    <div
      className="cmd-backdrop open"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda global"
    >
      <div className="cmd-box" onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div className="cmd-row">
          <Search size={15} style={{ color: 'var(--icon-muted)', flexShrink: 0 }} aria-hidden="true" />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Buscar en GenSuite…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--icon-muted)', padding: '0 4px', lineHeight: 0 }}
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>

        {/* Results */}
        <div className="cmd-body" ref={listRef}>
          {results.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Sin resultados para "<strong>{query}</strong>"
            </div>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group}>
                <div className="cmd-group-label">{group}</div>
                {items.map((item) => {
                  const globalIdx = results.indexOf(item)
                  const isActive = globalIdx === focusedIdx
                  return (
                    <button
                      key={item.id}
                      className={`cmd-item${isActive ? ' active' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setFocusedIdx(globalIdx)}
                    >
                      <span className="cmd-item-icon" style={{ color: 'var(--icon-muted)' }} aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="cmd-item-label">{item.label}</span>
                      <span className="cmd-item-hint" style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                        {item.group}
                      </span>
                      {isActive && (
                        <ArrowRight size={12} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="cmd-foot">
          <span className="cmd-hint">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            <span>navegar</span>
          </span>
          <span className="cmd-hint">
            <kbd className="kbd">↵</kbd>
            <span>ir</span>
          </span>
          <span className="cmd-hint">
            <kbd className="kbd">Esc</kbd>
            <span>cerrar</span>
          </span>
        </div>
      </div>
    </div>
  )
}
