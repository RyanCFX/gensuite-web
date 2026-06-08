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
  total: number
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
}

// ─── Single fetch — all data in one call ──────────────────────────────────────

export async function getDashboardData(period: DashboardPeriod): Promise<DashboardData> {
  const res = await client.get<{ success: true; data: DashboardData }>('/dashboard/summary', {
    params: { period },
  })
  return res.data.data
}
