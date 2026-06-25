import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Item,
  CreateItemDto,
  Category,
  CreateCategoryDto,
  Brand,
  CreateBrandDto,
  PaginatedResponse,
  PaginationParams,
  ItemAttribute,
  CreateAttributeDto,
  UpdateAttributeDto,
  GenerateVariantsResult,
  ItemStock,
} from './types'

// ---- Items ----

export interface ListItemsParams extends PaginationParams {
  category?: string
  brand?: string
  type?: 'product' | 'service'
  disabled?: string
  isTemplate?: boolean
  includeVariants?: boolean
  variantOf?: string
  barcode?: string
}

export async function listItems(params?: ListItemsParams) {
  const res = await client.get<PaginatedResponse<Item>>(ENDPOINTS.catalog.items.list, { params })
  return unwrapPaginated(res)
}

export async function getItem(id: string) {
  const res = await client.get<{ success: true; data: Item }>(ENDPOINTS.catalog.items.byId(id))
  return unwrap(res)
}

export async function createItem(data: CreateItemDto) {
  const res = await client.post<{ success: true; data: Item }>(ENDPOINTS.catalog.items.list, data)
  return unwrap(res)
}

export async function updateItem(id: string, data: Partial<CreateItemDto>) {
  const res = await client.put<{ success: true; data: Item }>(ENDPOINTS.catalog.items.byId(id), data)
  return unwrap(res)
}

export async function deleteItem(id: string) {
  await client.delete(ENDPOINTS.catalog.items.byId(id))
}

export async function getItemStock(id: string) {
  const res = await client.get<{ success: true; data: ItemStock }>(ENDPOINTS.catalog.items.stock(id))
  return unwrap(res)
}

export async function toggleItem(id: string) {
  const res = await client.post<{ success: true; data: Item }>(ENDPOINTS.catalog.items.toggle(id))
  return unwrap(res)
}

// ---- Categories ----

export interface ListCategoriesParams extends PaginationParams {
  tree?: boolean
}

export async function listCategories(params?: ListCategoriesParams) {
  const res = await client.get<PaginatedResponse<Category>>(ENDPOINTS.catalog.categories.list, { params })
  return unwrapPaginated(res)
}

export async function getCategory(id: string) {
  const res = await client.get<{ success: true; data: Category }>(ENDPOINTS.catalog.categories.byId(id))
  return unwrap(res)
}

export async function createCategory(data: CreateCategoryDto) {
  const res = await client.post<{ success: true; data: Category }>(ENDPOINTS.catalog.categories.list, data)
  return unwrap(res)
}

export async function updateCategory(id: string, data: Partial<CreateCategoryDto>) {
  const res = await client.put<{ success: true; data: Category }>(ENDPOINTS.catalog.categories.byId(id), data)
  return unwrap(res)
}

export async function deleteCategory(id: string) {
  await client.delete(ENDPOINTS.catalog.categories.byId(id))
}

// ---- Brands ----

export interface ListBrandsParams extends PaginationParams {
  category?: string
}

export async function listBrands(params?: ListBrandsParams) {
  const res = await client.get<PaginatedResponse<Brand>>(ENDPOINTS.catalog.brands.list, { params })
  return unwrapPaginated(res)
}

export async function getBrand(id: string) {
  const res = await client.get<{ success: true; data: Brand }>(ENDPOINTS.catalog.brands.byId(id))
  return unwrap(res)
}

export async function createBrand(data: CreateBrandDto) {
  const res = await client.post<{ success: true; data: Brand }>(ENDPOINTS.catalog.brands.list, data)
  return unwrap(res)
}

export async function updateBrand(id: string, data: Partial<CreateBrandDto>) {
  const res = await client.put<{ success: true; data: Brand }>(ENDPOINTS.catalog.brands.byId(id), data)
  return unwrap(res)
}

export async function deleteBrand(id: string) {
  await client.delete(ENDPOINTS.catalog.brands.byId(id))
}

// ─── Attributes ───────────────────────────────────────────────────────────────

export async function listAttributes(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<ItemAttribute>>('/catalog/attributes', { params })
  return unwrapPaginated(res)
}

export async function getAttribute(id: string) {
  const res = await client.get<{ success: true; data: ItemAttribute }>(`/catalog/attributes/${encodeURIComponent(id)}`)
  return unwrap(res)
}

export async function createAttribute(data: CreateAttributeDto) {
  const res = await client.post<{ success: true; data: ItemAttribute }>('/catalog/attributes', data)
  return unwrap(res)
}

export async function updateAttribute(id: string, data: UpdateAttributeDto) {
  const res = await client.put<{ success: true; data: ItemAttribute }>(`/catalog/attributes/${encodeURIComponent(id)}`, data)
  return unwrap(res)
}

// ─── Variants ─────────────────────────────────────────────────────────────────

export async function listItemVariants(itemId: string) {
  const res = await client.get<{ success: true; data: Item[] }>(`/catalog/items/${encodeURIComponent(itemId)}/variants`)
  return unwrap(res)
}

export async function generateVariants(itemId: string): Promise<GenerateVariantsResult> {
  // IMPORTANT: must NOT send Content-Type: application/json (BFF rejects empty JSON body)
  // Use raw axios with no data to avoid the header being set
  const res = await client.post(
    `/catalog/items/${encodeURIComponent(itemId)}/variants/generate`,
    undefined,
    { headers: { 'Content-Type': undefined } }
  )
  return (res.data as { success: true; data: GenerateVariantsResult }).data
}

export async function createVariant(itemId: string, data: {
  standardRate: number
  attributes: { attribute: string; attributeValue: string }[]
}) {
  const res = await client.post<{ success: true; data: Item }>(
    `/catalog/items/${encodeURIComponent(itemId)}/variants`,
    data,
  )
  return unwrap(res)
}
