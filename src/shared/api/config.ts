import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  Empresa,
  CobrosConfig,
  MetodoPago,
  ListaPrecio,
  UOM,
  Grupo,
  NcfSerie,
} from './types'

export async function getEmpresa() {
  const res = await client.get<{ success: true; data: Empresa }>(ENDPOINTS.config.empresa)
  return unwrap(res)
}

export async function updateEmpresa(data: Partial<Empresa>) {
  const res = await client.put<{ success: true; data: Empresa }>(ENDPOINTS.config.empresa, data)
  return unwrap(res)
}

export async function getCobrosConfig() {
  const res = await client.get<{ success: true; data: CobrosConfig }>(ENDPOINTS.config.cobros)
  return unwrap(res)
}

export async function updateCobrosConfig(data: Partial<CobrosConfig>) {
  const res = await client.put<{ success: true; data: CobrosConfig }>(ENDPOINTS.config.cobros, data)
  return unwrap(res)
}

export async function listMetodosPago() {
  const res = await client.get<{ success: true; data: MetodoPago[] }>(ENDPOINTS.config.metodosPago)
  return unwrap(res)
}

export async function createMetodoPago(data: Omit<MetodoPago, 'disabled'>) {
  const res = await client.post<{ success: true; data: MetodoPago }>(ENDPOINTS.config.metodosPago, data)
  return unwrap(res)
}

export async function updateMetodoPago(id: string, data: Partial<MetodoPago>) {
  const res = await client.put<{ success: true; data: MetodoPago }>(`${ENDPOINTS.config.metodosPago}/${id}`, data)
  return unwrap(res)
}

export async function listAlmacenes() {
  const res = await client.get<{ success: true; data: { name: string; warehouseName: string; disabled: boolean }[] }>(
    ENDPOINTS.config.almacenes,
  )
  return unwrap(res)
}

export async function createAlmacen(data: { warehouseName: string }) {
  const res = await client.post<{ success: true; data: unknown }>(ENDPOINTS.config.almacenes, data)
  return unwrap(res)
}

export async function updateAlmacen(id: string, data: Partial<{ warehouseName: string }>) {
  const res = await client.put<{ success: true; data: unknown }>(`${ENDPOINTS.config.almacenes}/${id}`, data)
  return unwrap(res)
}

export async function deleteAlmacen(id: string) {
  await client.delete(`${ENDPOINTS.config.almacenes}/${id}`)
}

export async function listUOMs() {
  const res = await client.get<{ success: true; data: UOM[] }>(ENDPOINTS.config.uom)
  return unwrap(res)
}

export async function createUOM(data: Omit<UOM, 'name'> & { uomName: string }) {
  const res = await client.post<{ success: true; data: UOM }>(ENDPOINTS.config.uom, data)
  return unwrap(res)
}

export async function listListasPrecio() {
  const res = await client.get<{ success: true; data: ListaPrecio[] }>(ENDPOINTS.config.listasPrecio)
  return unwrap(res)
}

export async function createListaPrecio(data: Pick<ListaPrecio, 'priceListName' | 'currency' | 'buying' | 'selling'>) {
  const res = await client.post<{ success: true; data: ListaPrecio }>(ENDPOINTS.config.listasPrecio, data)
  return unwrap(res)
}

export async function listGruposClientes() {
  const res = await client.get<{ success: true; data: Grupo[] }>(ENDPOINTS.config.gruposClientes)
  return unwrap(res)
}

export async function createGrupoCliente(data: Grupo) {
  const res = await client.post<{ success: true; data: Grupo }>(ENDPOINTS.config.gruposClientes, data)
  return unwrap(res)
}

export async function listGruposProveedores() {
  const res = await client.get<{ success: true; data: Grupo[] }>(ENDPOINTS.config.gruposProveedores)
  return unwrap(res)
}

export async function createGrupoProveedor(data: Grupo) {
  const res = await client.post<{ success: true; data: Grupo }>(ENDPOINTS.config.gruposProveedores, data)
  return unwrap(res)
}

export async function getNcfSeries() {
  const res = await client.get<{ success: true; data: NcfSerie[] }>(ENDPOINTS.config.ncf)
  return unwrap(res)
}

export async function getPerfil() {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.config.perfil)
  return unwrap(res)
}

export async function updatePerfil(data: Record<string, unknown>) {
  const res = await client.put<{ success: true; data: unknown }>(ENDPOINTS.config.perfil, data)
  return unwrap(res)
}
