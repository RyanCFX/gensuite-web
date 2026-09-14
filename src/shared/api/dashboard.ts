import { client } from './client'

export type DashboardPeriod = 'today' | '7d' | 'month' | 'year'

// ─── Shape returned by GET /dashboard/summary ─────────────────────────────────

export interface DashboardKpis {
  totalVentas: number
  numFacturas: number
  totalCompras: number
  numCompras: number
  totalGastos: number
  totalCobrado: number
  totalPendiente: number
  utilidad: number
  currency: string
}

export interface DashboardChart {
  labels: string[]
  sales: number[]
  credits: number[]
}

export interface TopProduct {
  itemCode: string
  itemName: string
  qty: number
  amount: number
  percentage: number
}

export interface TopCustomer {
  customer: string
  customerName: string
  total: number
  count: number
}

export interface RecentActivityItem {
  type: string
  id: string
  description: string
  amount: number
  timestamp: string
  /** Moneda de ESE documento puntual (no la base) — a propósito no se consolida a la moneda
   *  base porque es una ficha de "esto pasó", no un agregado. Formatear cada monto con su propia
   *  moneda, no asumir que todos son DOP. Ver docs/tasks/64_multimoneda_completo.md §6.2. */
  currency?: string
}

/** Ingresos vs. gastos de los últimos 7 días — fijo, independiente del `period` de la query. */
export interface IngresosGastosChart {
  labels: string[]
  ingresos: number[]
  gastos: number[]
}

export interface DashboardData {
  period: string
  periodLabel: string
  dateRange: { from: string; to: string }
  kpis: DashboardKpis
  chart: DashboardChart
  topProducts: TopProduct[]
  topCustomers: TopCustomer[]
  recentActivity: RecentActivityItem[]
  /** Puede faltar si el backend aún no lo expone — tratar como opcional. */
  ingresosGastosChart?: IngresosGastosChart
  totalGanancias?: number
  ingresosEsteMes?: number
  gastosEsteMes?: number
}

// ─── Single fetch — all data in one call ──────────────────────────────────────

export async function getDashboardData(period: DashboardPeriod): Promise<DashboardData> {
  const res = await client.get<{ success: true; data: DashboardData }>('/dashboard/summary', {
    params: { period },
  })
  return res.data.data
}
