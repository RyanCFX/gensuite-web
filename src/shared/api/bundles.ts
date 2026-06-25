import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { Bundle, CreateBundleDto, PaginatedResponse, PaginationParams } from './types'

export interface ListBundlesParams extends PaginationParams {
  disabled?: string
}

export async function listBundles(params?: ListBundlesParams) {
  const res = await client.get<PaginatedResponse<Bundle>>(ENDPOINTS.catalog.bundles.list, { params })
  return unwrapPaginated(res)
}

export async function getBundle(id: string) {
  const res = await client.get<{ success: true; data: Bundle }>(ENDPOINTS.catalog.bundles.byId(id))
  return unwrap(res)
}

export async function createBundle(data: CreateBundleDto) {
  const res = await client.post<{ success: true; data: Bundle }>(ENDPOINTS.catalog.bundles.list, data)
  return unwrap(res)
}

export async function updateBundle(id: string, data: Partial<CreateBundleDto>) {
  const res = await client.put<{ success: true; data: Bundle }>(ENDPOINTS.catalog.bundles.byId(id), data)
  return unwrap(res)
}

export async function deleteBundle(id: string) {
  await client.delete(ENDPOINTS.catalog.bundles.byId(id))
}
