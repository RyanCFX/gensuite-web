import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type { DevolucionDto, DevolucionResult } from './types'

// POST /devoluciones — orquesta la devolución completa: nota de crédito + reembolso opcional + stock
export async function createDevolucion(data: DevolucionDto) {
  const res = await client.post<{ success: true; data: DevolucionResult }>(
    ENDPOINTS.devoluciones.create,
    data,
  )
  return unwrap(res)
}
