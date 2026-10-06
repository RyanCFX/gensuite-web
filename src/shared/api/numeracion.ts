import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  ContadorNumeracion,
  NumeracionEstado,
  NumeracionTipo,
  UpdateNumeracion,
} from './types'

// ─── Numeración de documentos — docs/tasks/PROMPT_NUMERACION_DOCUMENTOS_FRONTEND.md §4 ───
// Todo bajo `/api/v1/config/numeracion`. Respuestas con sobre `{ success: true, data: … }`.
// Verificado contra openapi.json (tag "Numeración de documentos"); nombres exactos de campo
// según `NumeracionTipoDto` / `NumeracionEstadoDto` / `UpdateNumeracionDto` /
// `ContadorNumeracionDto` / `PreviewNumeracionDto`.

/** Extrae el último segmento de `ruta` (§4.1: ya incluye `/api/v1`). */
export function segmentoRutaNumeracion(ruta: string): string {
  const limpio = ruta.split('?')[0] ?? ruta
  const partes = limpio.split('/').filter(Boolean)
  return partes[partes.length - 1] ?? ruta
}

/** Índice — §4.1. Ya filtra por feature ∩ permiso. `data: []` = sin tipos (no es error). */
export async function getNumeracionIndice(): Promise<NumeracionTipo[]> {
  const res = await client.get<{ success: true; data: NumeracionTipo[] }>(
    ENDPOINTS.config.numeracionIndice,
  )
  return unwrap(res)
}

/** Estado de un tipo — §4.2. Puede tardar 1-2 s (varias consultas a ERPNext): usar skeleton. */
export async function getNumeracionEstado(ruta: string): Promise<NumeracionEstado> {
  const res = await client.get<{ success: true; data: NumeracionEstado }>(
    ENDPOINTS.config.numeracionEstado(segmentoRutaNumeracion(ruta)),
  )
  return unwrap(res)
}

/** Guardar — §4.3. Mandar solo lo que cambió/aplica al modo. Devuelve el estado actualizado. */
export async function updateNumeracion(
  ruta: string,
  body: UpdateNumeracion,
): Promise<NumeracionEstado> {
  const res = await client.put<{ success: true; data: NumeracionEstado }>(
    ENDPOINTS.config.numeracionEstado(segmentoRutaNumeracion(ruta)),
    body,
  )
  return unwrap(res)
}

/** Fijar contador — §4.4. `valor` = ÚLTIMO número emitido (el próximo será valor + 1). */
export async function fijarContadorNumeracion(
  ruta: string,
  body: ContadorNumeracion,
): Promise<NumeracionEstado> {
  const res = await client.put<{ success: true; data: NumeracionEstado }>(
    ENDPOINTS.config.numeracionContador(segmentoRutaNumeracion(ruta)),
    body,
  )
  return unwrap(res)
}

/** Vista previa — §4.5. 3 nombres de ejemplo siempre desde 00001; `[]` = plantilla inválida. */
export async function previewNumeracion(ruta: string, plantilla: string): Promise<string[]> {
  const res = await client.post<{ success: true; data: string[] }>(
    ENDPOINTS.config.numeracionPreview(segmentoRutaNumeracion(ruta)),
    { plantilla },
  )
  return unwrap(res)
}
