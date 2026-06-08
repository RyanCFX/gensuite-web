import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Customer,
  CreateCustomerDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ListCustomersParams extends PaginationParams {
  disabled?: boolean
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
