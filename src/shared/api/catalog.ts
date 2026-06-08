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
} from './types'

// ---- Items ----

export interface ListItemsParams extends PaginationParams {
  category?: string
  brand?: string
  type?: 'product' | 'service'
  disabled?: string
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
