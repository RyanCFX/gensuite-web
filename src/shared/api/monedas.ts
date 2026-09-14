import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Moneda,
  HabilitarMonedaDto,
  HabilitarMonedaResult,
  TasaCambio,
  ListTasasCambioParams,
  CreateTasaCambioDto,
  UpdateTasaCambioDto,
  TasaCambioActionResult,
  TasaVigente,
  SincronizarTasasResult,
  ConvertirMonedaResult,
  MonedaCode,
  PreviewConversionBancoDto,
  PreviewConversionBancoResult,
} from './types'

export async function listMonedas() {
  const res = await client.get<{ success: true; data: Moneda[] }>(ENDPOINTS.monedas.list)
  return unwrap(res)
}

export async function habilitarMoneda(code: MonedaCode, data: HabilitarMonedaDto) {
  const res = await client.patch<{ success: true; data: HabilitarMonedaResult }>(ENDPOINTS.monedas.byCode(code), data)
  return unwrap(res)
}

export async function listTasasCambio(params?: ListTasasCambioParams) {
  const res = await client.get<{ success: true; data: TasaCambio[]; pagination: { limit: number; offset: number } }>(
    ENDPOINTS.monedas.tasas,
    { params },
  )
  return { items: res.data.data, pagination: res.data.pagination }
}

export async function createTasaCambio(data: CreateTasaCambioDto) {
  const res = await client.post<{ success: true; data: TasaCambioActionResult }>(ENDPOINTS.monedas.tasas, data)
  return unwrap(res)
}

export async function updateTasaCambio(id: string, data: UpdateTasaCambioDto) {
  const res = await client.put<{ success: true; data: { message: string } }>(ENDPOINTS.monedas.tasasById(id), data)
  return unwrap(res)
}

export async function deleteTasaCambio(id: string) {
  const res = await client.delete<{ success: true; data: { message: string } }>(ENDPOINTS.monedas.tasasById(id))
  return unwrap(res)
}

export async function getTasaVigente(params: { from: MonedaCode; to: MonedaCode; tipo?: 'compra' | 'venta' }) {
  const res = await client.get<{ success: true; data: TasaVigente }>(ENDPOINTS.monedas.tasasVigente, { params })
  return unwrap(res)
}

export async function sincronizarTasas(fecha?: string) {
  const res = await client.post<{ success: true; data: SincronizarTasasResult }>(
    ENDPOINTS.monedas.tasasSincronizar,
    fecha ? { fecha } : undefined,
  )
  return unwrap(res)
}

export async function convertirMoneda(params: { monto: number; from: MonedaCode; to: MonedaCode }) {
  const res = await client.get<{ success: true; data: ConvertirMonedaResult }>(ENDPOINTS.monedas.convertir, { params })
  return unwrap(res)
}

// Simula si un monto se puede depositar/cobrar en una cuenta bancaria de otra moneda — nunca
// lanza 400, cualquier problema viaja en `advertencia` con 200. Útil como paso previo opcional
// antes de confirmar un Cobro/Pago/Emisión de Tesorería (esos sí lanzan 400 duro).
export async function previewConversionBanco(data: PreviewConversionBancoDto) {
  const res = await client.post<{ success: true; data: PreviewConversionBancoResult }>(
    ENDPOINTS.monedas.previewConversionBanco,
    data,
  )
  return unwrap(res)
}
