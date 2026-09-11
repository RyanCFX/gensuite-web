import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Aseguradora,
  CreateAseguradoraDto,
  UpdateAseguradoraDto,
  PaginatedResponse,
  PaginationParams,
} from './types'

// CRUD de Aseguradoras (ARS) — vertical Farmacia. Calcado de `./customers.ts`; ver
// docs/PROMPT_ASEGURADORAS.md. El BFF ya no expone las ARS por `/customers` en tenants de este
// vertical, y valida (400) que el campo `aseguradora` de una Preaprobación/Lote sea realmente
// una aseguradora.

export interface ListAseguradorasParams extends PaginationParams {
  disabled?: boolean
  /** Búsqueda aproximada por nombre. */
  nombre?: string
  hasCredit?: boolean
}

export async function listAseguradoras(params?: ListAseguradorasParams) {
  const res = await client.get<PaginatedResponse<Aseguradora>>(ENDPOINTS.aseguradoras.list, { params })
  return unwrapPaginated(res)
}

export async function getAseguradora(id: string) {
  const res = await client.get<{ success: true; data: Aseguradora }>(ENDPOINTS.aseguradoras.byId(id))
  return unwrap(res)
}

export async function createAseguradora(data: CreateAseguradoraDto) {
  const res = await client.post<{ success: true; data: Aseguradora }>(ENDPOINTS.aseguradoras.list, data)
  return unwrap(res)
}

export async function updateAseguradora(id: string, data: UpdateAseguradoraDto) {
  const res = await client.put<{ success: true; data: Aseguradora }>(ENDPOINTS.aseguradoras.byId(id), data)
  return unwrap(res)
}

export async function deleteAseguradora(id: string) {
  await client.delete(ENDPOINTS.aseguradoras.byId(id))
}

/** Nombre a mostrar tolerante: el backend puede devolver `nombre` o `customerName`. */
export function nombreAseguradora(a: Pick<Aseguradora, 'nombre' | 'customerName'>): string {
  return a.nombre || a.customerName || ''
}
