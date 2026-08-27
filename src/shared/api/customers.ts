import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Customer,
  CreateCustomerDto,
  GrupoCliente,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListCustomersParams extends PaginationParams {
  disabled?: boolean
  customerName?: string
  customerType?: 'Company' | 'Individual'
  tipoIdentificacion?: string
  identificacion?: string
  hasCredit?: boolean
  createdAtFrom?: string
  createdAtTo?: string
  creditLimitMin?: number
  creditLimitMax?: number
  creditDaysMin?: number
  creditDaysMax?: number
  /** Filtra por sucursal (custom_branch) */
  branch?: string
}

export async function listCustomers(params?: ListCustomersParams) {
  const res = await client.get<PaginatedResponse<Customer>>(ENDPOINTS.customers.list, { params })
  return unwrapPaginated(res)
}

export async function getCustomer(id: string) {
  const res = await client.get<{ success: true; data: Customer }>(ENDPOINTS.customers.byId(id))
  return unwrap(res)
}

export async function createCustomer(data: CreateCustomerDto) {
  const res = await client.post<{ success: true; data: Customer }>(ENDPOINTS.customers.list, data)
  return unwrap(res)
}

export async function updateCustomer(id: string, data: Partial<CreateCustomerDto>) {
  const res = await client.put<{ success: true; data: Customer }>(ENDPOINTS.customers.byId(id), data)
  return unwrap(res)
}

export async function deleteCustomer(id: string) {
  await client.delete(ENDPOINTS.customers.byId(id))
}

// ─── Customer Groups ────────────────────────────────────────────────────────

export async function listCustomerGroups() {
  const res = await client.get<{ success: true; data: GrupoCliente[] }>(ENDPOINTS.customers.groups.list)
  return unwrap(res)
}

export async function createCustomerGroup(data: { name: string; priceTier?: 'A' | 'B' | 'C'; parentGroup?: string }) {
  const res = await client.post<{ success: true; data: GrupoCliente }>(ENDPOINTS.customers.groups.create, data)
  return unwrap(res)
}

export async function deleteCustomerGroup(name: string) {
  await client.delete(ENDPOINTS.customers.groups.delete(name))
}
