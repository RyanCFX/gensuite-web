import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  LandedCostVoucher,
  LandedCostVoucherListItem,
  CreateLandedCostVoucherDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

export interface ReceiptDocumentTypeOption {
  value: string
  label: string
}

export async function listTiposDocumentoCostoImportacion() {
  const res = await client.get<{ success: true; data: ReceiptDocumentTypeOption[] }>(ENDPOINTS.costosImportacion.tiposDocumento)
  return unwrap(res)
}

export async function listCostosImportacion(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<LandedCostVoucherListItem>>(ENDPOINTS.costosImportacion.list, { params })
  return unwrapPaginated(res)
}

export async function getCostoImportacion(id: string) {
  const res = await client.get<{ success: true; data: LandedCostVoucher }>(ENDPOINTS.costosImportacion.byId(id))
  return unwrap(res)
}

export async function createCostoImportacion(data: CreateLandedCostVoucherDto) {
  const res = await client.post<{ success: true; data: LandedCostVoucher }>(ENDPOINTS.costosImportacion.list, data)
  return unwrap(res)
}

export async function submitCostoImportacion(id: string) {
  const res = await client.post<{ success: true; data: LandedCostVoucher }>(ENDPOINTS.costosImportacion.submit(id))
  return unwrap(res)
}

export async function cancelCostoImportacion(id: string) {
  const res = await client.post<{ success: true; data: LandedCostVoucher }>(ENDPOINTS.costosImportacion.cancel(id))
  return unwrap(res)
}
