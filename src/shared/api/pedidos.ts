import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { Pedido, DraftVersion, CreatePedidoDto, DuplicatePedidoSource, PaginatedResponse, PaginationParams } from './types'

export interface ListPedidosParams extends PaginationParams {
  customer?: string
  status?: 'draft' | 'submitted' | 'cancelled' | 'all'
  fromDate?: string
  toDate?: string
}

export async function listPedidos(params?: ListPedidosParams) {
  const res = await client.get<PaginatedResponse<Pedido>>(ENDPOINTS.pedidos.list, { params })
  return unwrapPaginated(res)
}

export async function getPedido(id: string) {
  const res = await client.get<{ success: true; data: Pedido }>(ENDPOINTS.pedidos.byId(id))
  return unwrap(res)
}

export async function createPedido(data: CreatePedidoDto) {
  const res = await client.post<{ success: true; data: Pedido }>(ENDPOINTS.pedidos.list, data)
  return unwrap(res)
}

export async function updatePedido(id: string, data: Partial<CreatePedidoDto>) {
  const res = await client.put<{ success: true; data: Pedido }>(ENDPOINTS.pedidos.byId(id), data)
  return unwrap(res)
}

export async function submitPedido(id: string) {
  const res = await client.post<{ success: true; data: { facturaId: string } }>(ENDPOINTS.pedidos.submit(id))
  return unwrap(res)
}

export async function cancelPedido(id: string) {
  const res = await client.post<{ success: true; data: Pedido }>(ENDPOINTS.pedidos.cancel(id))
  return unwrap(res)
}

export async function amendPedido(id: string) {
  const res = await client.post<{ success: true; data: { newId: string; amendedFrom: string } }>(ENDPOINTS.pedidos.amend(id))
  return unwrap(res)
}

export async function getPedidoVersion(id: string, sequence: number) {
  const res = await client.get<{ success: true; data: DraftVersion }>(ENDPOINTS.pedidos.version(id, sequence))
  return unwrap(res)
}

// GET /pedidos/:id/duplicate-source — read-only, no side effects
export async function getPedidoDuplicateSource(id: string) {
  const res = await client.get<{ success: true; data: DuplicatePedidoSource }>(
    ENDPOINTS.pedidos.duplicateSource(id),
  )
  return unwrap(res)
}

export async function downloadPedidoPdf(id: string, filename?: string): Promise<void> {
  const res = await client.get<Blob>(ENDPOINTS.pedidos.pdf(id), {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `pedido-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
