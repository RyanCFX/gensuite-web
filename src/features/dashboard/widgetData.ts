// Acceso defensivo al `data` de GET /dashboard/widgets/:key.
// Los nombres de campo son los mismos que GET /dashboard/summary (§6.3 del prompt
// de Permisos v2); todo es opcional porque un widget puede venir parcial.

export function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export function numOpt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export interface KpiTotal {
  total: number
  count: number
  deltaPct: number | null
  currency?: string
}

export function kpiVentasTotal(d: Record<string, unknown>): KpiTotal {
  const k = obj(d.kpis)
  return { total: num(k.totalVentas), count: num(k.numFacturas), deltaPct: numOpt(k.totalVentasDeltaPct) }
}

export function kpiComprasTotal(d: Record<string, unknown>): KpiTotal {
  const k = obj(d.kpis)
  return { total: num(k.totalCompras), count: num(k.numCompras), deltaPct: null }
}

export function kpiGastosTotal(d: Record<string, unknown>): KpiTotal {
  const k = obj(d.kpis)
  return { total: num(k.totalGastos), count: 0, deltaPct: numOpt(k.totalGastosDeltaPct) }
}

export function kpiCobrosTotal(d: Record<string, unknown>): KpiTotal {
  const k = obj(d.kpis)
  return { total: num(k.totalCobrado), count: 0, deltaPct: numOpt(k.totalIngresosDeltaPct) }
}

export function kpiUtilidad(d: Record<string, unknown>): KpiTotal {
  const k = obj(d.kpis)
  return { total: num(k.utilidad), count: 0, deltaPct: numOpt(k.utilidadDeltaPct) }
}

export function kpiCxcSaldo(d: Record<string, unknown>): { pendiente: number; num: number; deltaCount: number } {
  const k = obj(d.kpis)
  return {
    pendiente: num(k.totalPendiente ?? k.totalCuentasPorCobrar),
    num: num(k.numCuentasPorCobrar),
    deltaCount: num(k.cuentasPorCobrarDeltaCount),
  }
}

export interface ChartPunto {
  label: string
  sales: number
  credits: number
}

export function chartVentas(d: Record<string, unknown>): ChartPunto[] {
  const c = obj(d.chart)
  const labels = arr<string>(c.labels)
  const sales = arr<number>(c.sales)
  const credits = arr<number>(c.credits)
  return labels.map((label, i) => ({ label, sales: sales[i] ?? 0, credits: credits[i] ?? 0 }))
}

export interface TopProducto {
  itemCode: string
  itemName: string
  qty: number
  amount: number
  percentage: number
}

export function topProductos(d: Record<string, unknown>): TopProducto[] {
  return arr<Record<string, unknown>>(d.topProducts).map((r) => ({
    itemCode: str(r.itemCode),
    itemName: str(r.itemName, str(r.itemCode)),
    qty: num(r.qty),
    amount: num(r.amount),
    percentage: num(r.percentage),
  }))
}

export interface TopCliente {
  customer: string
  customerName: string
  total: number
  count: number
}

export function topClientes(d: Record<string, unknown>): TopCliente[] {
  return arr<Record<string, unknown>>(d.topCustomers).map((r) => ({
    customer: str(r.customer),
    customerName: str(r.customerName, str(r.customer)),
    total: num(r.total),
    count: num(r.count),
  }))
}

export interface GastoIngresoChart {
  labels: string[]
  ingresos: number[]
  gastos: number[]
}

export function ingresosGastos(d: Record<string, unknown>): { puntos: Array<{ label: string; ingresos: number; gastos: number }>; totalGanancias: number } {
  const c = obj(d.ingresosGastosChart)
  const labels = arr<string>(c.labels)
  const ingresos = arr<number>(c.ingresos)
  const gastos = arr<number>(c.gastos)
  return {
    puntos: labels.map((label, i) => ({ label, ingresos: ingresos[i] ?? 0, gastos: gastos[i] ?? 0 })),
    totalGanancias: num(d.totalGanancias),
  }
}

export interface ActividadItem {
  type: string
  id: string
  description: string
  amount: number
  currency?: string
  timestamp: string
}

export function actividadReciente(d: Record<string, unknown>): ActividadItem[] {
  return arr<Record<string, unknown>>(d.recentActivity).map((r) => ({
    type: str(r.type),
    id: str(r.id),
    description: str(r.description),
    amount: num(r.amount),
    currency: typeof r.currency === 'string' ? r.currency : undefined,
    timestamp: str(r.timestamp),
  }))
}

export interface PendienteItem {
  date: string
  type: string
  reference: string
  description: string
}

export function pendientes(d: Record<string, unknown>): PendienteItem[] {
  return arr<Record<string, unknown>>(d.pendingActions).map((r) => ({
    date: str(r.date),
    type: str(r.type),
    reference: str(r.reference),
    description: str(r.description),
  }))
}

export interface BajoMinimoItem {
  item_code: string
  item_name: string
}

export function bajoMinimo(d: Record<string, unknown>): BajoMinimoItem[] {
  return arr<Record<string, unknown>>(d.lowStockItems).map((r) => ({
    item_code: str(r.item_code),
    item_name: str(r.item_name, str(r.item_code)),
  }))
}

export interface PendienteVista {
  id: string
  date?: string
  tone: 'warning' | 'danger'
  label: string
  sublabel: string
  href: string
}

const PENDIENTE_RUTA: Record<string, string> = {
  invoice_due: '/facturas',
  invoice_pending_approval: '/facturas',
  payment_due: '/cobros/lista',
  low_stock: '/inventario/productos',
}

/** Widget `dashboard.actividad.pendientes` → filas (el backend ya filtra por permiso). */
export function pendientesDeWidget(items: PendienteItem[]): PendienteVista[] {
  return items.map((p, i) => ({
    id: `w-${p.type}-${p.reference || i}`,
    date: p.date || undefined,
    tone: p.type === 'low_stock' || p.type === 'invoice_due' ? 'danger' : 'warning',
    label: p.reference || p.description,
    sublabel: p.description,
    href: PENDIENTE_RUTA[p.type] ?? '/dashboard',
  }))
}
