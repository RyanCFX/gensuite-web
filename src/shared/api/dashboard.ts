import { client, unwrapRaw } from './client'

export interface SalesChartPoint {
  date: string
  amount: number
}

export interface DashboardSummary {
  totalVentas: number
  totalCompras: number
  totalCobrado: number
  saldoPendiente: number
  salesChartData: SalesChartPoint[]
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
  invoiceCount: number
  total: number
}

export interface RecentActivityItem {
  type: string
  description: string
  amount: number
  date: string
}

export type DashboardPeriod = 'today' | '7d' | 'month' | 'year'

export async function getDashboardSummary(period: DashboardPeriod): Promise<DashboardSummary> {
  const res = await client.get<{ data: DashboardSummary }>('/dashboard/summary', {
    params: { period },
  })
  return unwrapRaw(res).data
}

export async function getTopProducts(
  period: DashboardPeriod,
  limit = 5,
): Promise<TopProduct[]> {
  const res = await client.get<{ data: TopProduct[] }>('/dashboard/top-products', {
    params: { period, limit },
  })
  return unwrapRaw(res).data
}

export async function getTopCustomers(
  period: DashboardPeriod,
  limit = 5,
): Promise<TopCustomer[]> {
  const res = await client.get<{ data: TopCustomer[] }>('/dashboard/top-customers', {
    params: { period, limit },
  })
  return unwrapRaw(res).data
}

export async function getRecentActivity(limit = 10): Promise<RecentActivityItem[]> {
  const res = await client.get<{ data: RecentActivityItem[] }>('/dashboard/recent-activity', {
    params: { limit },
  })
  return unwrapRaw(res).data
}
