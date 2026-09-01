import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  CampoDisponiblePlantilla,
  CreatePlantillaImpresionDto,
  LogoPlantillaUploadResult,
  PaginatedResponse,
  PaginationParams,
  PlantillaApiType,
  PlantillaImpresion,
  RenderDataLabels,
  RenderDataPosInvoice,
  UpdatePlantillaImpresionDto,
} from './types'

export interface ListPlantillasParams extends PaginationParams {
  type?: PlantillaApiType
}

export async function listPlantillas(params?: ListPlantillasParams) {
  const res = await client.get<PaginatedResponse<PlantillaImpresion>>(ENDPOINTS.plantillas.list, { params })
  return unwrapPaginated(res)
}

export async function getPlantilla(id: string) {
  const res = await client.get<{ success: true; data: PlantillaImpresion }>(ENDPOINTS.plantillas.byId(id))
  return unwrap(res)
}

// 404 "No hay plantilla default configurada para <type>" si el tenant no tiene ninguna default
// de ese tipo — el caller decide el fallback (ver §1.4/§5.2 del doc de la tarea), esta función
// no lo captura.
export async function getPlantillaDefault(type: PlantillaApiType) {
  const res = await client.get<{ success: true; data: PlantillaImpresion }>(ENDPOINTS.plantillas.default, {
    params: { type },
  })
  return unwrap(res)
}

export async function createPlantilla(data: CreatePlantillaImpresionDto) {
  const res = await client.post<{ success: true; data: PlantillaImpresion }>(ENDPOINTS.plantillas.list, data)
  return unwrap(res)
}

export async function updatePlantilla(id: string, data: UpdatePlantillaImpresionDto) {
  const res = await client.put<{ success: true; data: PlantillaImpresion }>(ENDPOINTS.plantillas.byId(id), data)
  return unwrap(res)
}

// El cliente axios pone `Content-Type: application/json` por default en toda request — con un
// body vacío, este BFF (Fastify) rechaza eso con 400 antes de llegar al controller ("Body
// cannot be empty when content-type is set to 'application/json'"). Aplica a cualquier
// POST/DELETE sin body de esta API, confirmado contra el servidor real — hay que quitar el
// header explícitamente en esos casos.
const NO_BODY_CONFIG = { headers: { 'Content-Type': undefined } }

export async function deletePlantilla(id: string) {
  await client.delete(ENDPOINTS.plantillas.byId(id), NO_BODY_CONFIG)
}

export async function marcarPlantillaDefault(id: string) {
  const res = await client.post<{ success: true; data: PlantillaImpresion }>(
    ENDPOINTS.plantillas.predeterminada(id),
    undefined,
    NO_BODY_CONFIG,
  )
  return unwrap(res)
}

export async function getCamposDisponibles(type: PlantillaApiType) {
  const res = await client.get<{ success: true; data: CampoDisponiblePlantilla[] }>(
    ENDPOINTS.plantillas.camposDisponibles,
    { params: { type } },
  )
  return unwrap(res)
}

export async function getRenderDataPosInvoice(params: { sourceId: string; templateId?: string }) {
  const res = await client.get<{ success: true; data: RenderDataPosInvoice }>(ENDPOINTS.plantillas.renderData, {
    params: { type: 'Pos Invoice' as PlantillaApiType, sourceId: params.sourceId, templateId: params.templateId },
  })
  return unwrap(res)
}

export async function getRenderDataLabels(params: { sourceIds: string[]; templateId?: string }) {
  const res = await client.get<{ success: true; data: RenderDataLabels }>(ENDPOINTS.plantillas.renderData, {
    params: {
      type: 'Label 5x2' as PlantillaApiType,
      sourceIds: params.sourceIds.join(','),
      templateId: params.templateId,
    },
  })
  return unwrap(res)
}

export async function uploadPlantillaLogo(file: File, termico: boolean) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await client.post<{ success: true; data: LogoPlantillaUploadResult }>(
    ENDPOINTS.plantillas.logo,
    formData,
    {
      params: termico ? { termico: true } : undefined,
      // El cliente fuerza `Content-Type: application/json` por default en toda request — hay
      // que quitarlo para que el navegador ponga el `multipart/form-data; boundary=...` real.
      headers: { 'Content-Type': undefined },
    },
  )
  return unwrap(res)
}
