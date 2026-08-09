import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Compra,
  CreateCompraDto,
  PaginatedResponse,
  PaginationParams,
  Gasto,
  CreateGastoDto,
  FormatoImpresion,
} from './types'

// ---- Compras (update_stock=1) ----

export interface ListComprasParams extends PaginationParams {
  supplier?: string
  status?: string
  fromDate?: string
  toDate?: string
  branch?: string
  ncf?: string
  grandTotalMin?: number
  grandTotalMax?: number
}

export async function listCompras(params?: ListComprasParams) {
  const res = await client.get<PaginatedResponse<Compra>>(ENDPOINTS.compras.list, { params })
  return unwrapPaginated(res)
}

export async function getCompra(id: string) {
  const res = await client.get<{ success: true; data: Compra }>(ENDPOINTS.compras.byId(id))
  return unwrap(res)
}

export async function createCompra(data: CreateCompraDto) {
  const res = await client.post<{ success: true; data: Compra }>(ENDPOINTS.compras.list, data)
  return unwrap(res)
}

export async function updateCompra(id: string, data: Partial<CreateCompraDto>) {
  const res = await client.put<{ success: true; data: Compra }>(ENDPOINTS.compras.byId(id), data)
  return unwrap(res)
}

export async function submitCompra(id: string) {
  const res = await client.post<{ success: true; data: Compra }>(ENDPOINTS.compras.submit(id))
  return unwrap(res)
}

export async function cancelCompra(id: string) {
  const res = await client.post<{ success: true; data: Compra }>(ENDPOINTS.compras.cancel(id))
  return unwrap(res)
}

export async function getCompraPdfBlobUrl(id: string, formato?: FormatoImpresion): Promise<string> {
  const params = new URLSearchParams()
  if (formato) params.set('formato', formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.compras.pdf(id)}?${qs}` : ENDPOINTS.compras.pdf(id)
  const res = await client.get<Blob>(url, {
    responseType: 'blob',
  })
  return URL.createObjectURL(res.data)
}

export async function downloadCompraPdf(id: string, filename?: string, formato?: FormatoImpresion): Promise<void> {
  const params = new URLSearchParams()
  if (formato) params.set('formato', formato)
  const qs = params.toString()
  const url = qs ? `${ENDPOINTS.compras.pdf(id)}?${qs}` : ENDPOINTS.compras.pdf(id)
  const res = await client.get<Blob>(url, {
    responseType: 'blob',
  })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `compra-${id}.pdf`
  a.click()
  URL.revokeObjectURL(blobUrl)
}

export async function amendCompra(id: string) {
  const res = await client.post<{ success: true; data: Compra }>(ENDPOINTS.compras.amend(id))
  return unwrap(res)
}

export async function deleteCompra(id: string) {
  const res = await client.delete<{ success: true; data: Compra }>(ENDPOINTS.compras.delete(id))
  return unwrap(res)
}

export async function returnCompra(id: string, items: { itemCode: string; qty: number }[]) {
  const res = await client.post<{ success: true; data: Compra }>(ENDPOINTS.compras.return(id), { items })
  return unwrap(res)
}

// ---- Gastos (update_stock=0) ----

export interface ListGastosParams extends PaginationParams {
  supplier?: string
  status?: string
  fromDate?: string
  toDate?: string
  tipoComprobante?: string
  esDeducible?: boolean
  ncfProveedor?: string
  grandTotalMin?: number
  grandTotalMax?: number
}

export async function listGastos(params?: ListGastosParams) {
  const res = await client.get<PaginatedResponse<Gasto>>(ENDPOINTS.gastos.list, { params })
  return unwrapPaginated(res)
}

export async function getGastoResumen(month?: string) {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.gastos.resumen, {
    params: month ? { month } : undefined,
  })
  return unwrap(res)
}

export async function getGasto(id: string) {
  const res = await client.get<{ success: true; data: Gasto }>(ENDPOINTS.gastos.byId(id))
  return unwrap(res)
}

export async function createGasto(data: CreateGastoDto) {
  const res = await client.post<{ success: true; data: Gasto }>(ENDPOINTS.gastos.list, data)
  return unwrap(res)
}

export async function updateGasto(id: string, data: Partial<CreateGastoDto>) {
  const res = await client.put<{ success: true; data: Gasto }>(ENDPOINTS.gastos.byId(id), data)
  return unwrap(res)
}

export async function submitGasto(id: string) {
  const res = await client.post<{ success: true; data: Gasto }>(ENDPOINTS.gastos.submit(id))
  return unwrap(res)
}

export async function cancelGasto(id: string) {
  const res = await client.post<{ success: true; data: Gasto }>(ENDPOINTS.gastos.cancel(id))
  return unwrap(res)
}

export async function amendGasto(id: string) {
  const res = await client.post<{ success: true; data: Gasto }>(ENDPOINTS.gastos.amend(id))
  return unwrap(res)
}
