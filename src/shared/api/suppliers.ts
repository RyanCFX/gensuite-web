import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Supplier,
  CreateProveedorDto,
  UpdateProveedorDto,
  PaginatedResponse,
  PaginationParams,
  Invoice,
  VerificarEmisorElectronicoResponse,
} from './types'

export interface ListSuppliersParams extends PaginationParams {
  disabled?: boolean
  esProveedorExterior?: boolean
  supplierGroup?: string
  rnc?: string
  supplierType?: 'Company' | 'Individual'
  diasCreditoMin?: number
  diasCreditoMax?: number
}

export async function listSuppliers(params?: ListSuppliersParams) {
  const res = await client.get<PaginatedResponse<Supplier>>(ENDPOINTS.suppliers.list, { params })
  return unwrapPaginated(res)
}

export async function getSupplier(id: string) {
  const res = await client.get<{ success: true; data: Supplier }>(ENDPOINTS.suppliers.byId(id))
  return unwrap(res)
}

export async function getSupplierPurchases(id: string, params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<Invoice>>(ENDPOINTS.suppliers.purchases(id), { params })
  return unwrapPaginated(res)
}

export async function createSupplier(data: CreateProveedorDto) {
  const res = await client.post<{ success: true; data: Supplier }>(ENDPOINTS.suppliers.list, data)
  return unwrap(res)
}

export async function updateSupplier(id: string, data: UpdateProveedorDto) {
  const res = await client.put<{ success: true; data: Supplier }>(ENDPOINTS.suppliers.byId(id), data)
  return unwrap(res)
}

export async function deleteSupplier(id: string) {
  await client.delete(ENDPOINTS.suppliers.byId(id))
}

/** Refresca si el proveedor es emisor electrónico (Norma 02-26) consultando Megaplus/DGII en
 *  vivo — el backend ya actualiza su caché al responder. Solo llamar cuando `esEmisorElectronico`
 *  del proveedor viene en `null`/`false`; puede rechazar con 400 si el proveedor no tiene RNC o
 *  el RNC no está inscrito en la DGII. */
export async function verificarEmisorElectronico(id: string) {
  const res = await client.get<{ success: true; data: VerificarEmisorElectronicoResponse }>(
    ENDPOINTS.suppliers.verificarEmisorElectronico(id),
  )
  return unwrap(res)
}
