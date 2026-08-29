import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  EcfSequence,
  CreateEcfSequenceDto,
  UpdateEcfSequenceDto,
  EcfTipoCatalogo,
  EcfConnectApiKeyDto,
  EcfConnectResult,
  CreateEcfClientDto,
  EcfClient,
  UploadEcfCertificateDto,
  UploadEcfCertificateResult,
  RegisterEcfWebhookDto,
  RegisterEcfWebhookResult,
  VoidEcfRangesDto,
  EcfCertificacion,
  EcfDiferidoItem,
  ActivarContingenciaDto,
  FlushContingenciaDto,
  FlushContingenciaResult,
} from './types'

/** Mensaje para el 503 al someter un documento cuando la DGII está caída y el tenant tiene
 *  `bloquearSubmitSiAuraCaido` activo (default). Ver F9 §3.2. */
export const ECF_SUBMIT_UNAVAILABLE_MSG =
  'El servicio de facturación electrónica no está disponible en este momento. Reintenta en unos ' +
  'minutos, o pide a un administrador que active contingencia manualmente.'

// ─── Secuencias e-NCF ─────────────────────────────────────────────────────────
// `company` es query param obligatorio (ver openapi.json). Se obtiene de GET /config/ecf.

export async function listEcfSequences(company: string) {
  const res = await client.get<{ success: true; data: EcfSequence[] }>(
    ENDPOINTS.config.ecfSecuencias,
    { params: { company } },
  )
  return unwrap(res)
}

export async function createEcfSequence(company: string, data: CreateEcfSequenceDto) {
  const res = await client.post<{ success: true; data: EcfSequence }>(
    ENDPOINTS.config.ecfSecuencias,
    data,
    { params: { company } },
  )
  return unwrap(res)
}

export async function updateEcfSequence(company: string, id: string, data: UpdateEcfSequenceDto) {
  const res = await client.patch<{ success: true; data: EcfSequence }>(
    ENDPOINTS.config.ecfSecuenciasById(id),
    data,
    { params: { company } },
  )
  return unwrap(res)
}

export async function deleteEcfSequence(company: string, id: string) {
  await client.delete(ENDPOINTS.config.ecfSecuenciasById(id), { params: { company } })
}

// Anula sub-rangos e-NCF nunca usados (cambio de rango autorizado, cierre de operación).
export async function voidEcfRanges(company: string, data: VoidEcfRangesDto) {
  const res = await client.post<{ success: true; data: unknown }>(
    ENDPOINTS.config.ecfSecuenciasAnularRangos,
    data,
    { params: { company } },
  )
  return unwrap(res)
}

export async function getEcfTipos() {
  const res = await client.get<{ success: true; data: EcfTipoCatalogo[] }>(ENDPOINTS.config.ecfTipos)
  return unwrap(res)
}

// ─── Administración / provisioning (rol System Manager, 403 si no lo tiene) ─────

export async function connectEcfApiKey(data: EcfConnectApiKeyDto) {
  const res = await client.post<{ success: true; data: EcfConnectResult }>(
    ENDPOINTS.config.ecfAdminConnect,
    data,
  )
  return unwrap(res)
}

export async function createEcfClient(data: CreateEcfClientDto) {
  const res = await client.post<{ success: true; data: EcfClient }>(
    ENDPOINTS.config.ecfAdminClients,
    data,
  )
  return unwrap(res)
}

export async function uploadEcfCertificate(data: UploadEcfCertificateDto, company?: string) {
  const res = await client.post<{ success: true; data: UploadEcfCertificateResult }>(
    ENDPOINTS.config.ecfAdminCertificate,
    data,
    company ? { params: { company } } : undefined,
  )
  return unwrap(res)
}

export async function registerEcfWebhook(data: RegisterEcfWebhookDto) {
  const res = await client.post<{ success: true; data: RegisterEcfWebhookResult }>(
    ENDPOINTS.config.ecfAdminWebhook,
    data,
  )
  return unwrap(res)
}

// ─── F9 — Certificación DGII (solo lectura) y contingencia (Decreto 587-24) ────
// Todos requieren `company` como query param obligatorio.

export async function getEcfCertificacion(company: string) {
  const res = await client.get<{ success: true; data: EcfCertificacion }>(
    ENDPOINTS.config.ecfCertificacion,
    { params: { company } },
  )
  return unwrap(res)
}

export async function getContingenciaPendientes(company: string) {
  const res = await client.get<{ success: true; data: EcfDiferidoItem[] }>(
    ENDPOINTS.config.ecfContingenciaPendientes,
    { params: { company } },
  )
  return unwrap(res)
}

export async function activarContingencia(company: string, data: ActivarContingenciaDto) {
  const res = await client.post<{ success: true; data: unknown }>(
    ENDPOINTS.config.ecfContingenciaActivar,
    data,
    { params: { company } },
  )
  return unwrap(res)
}

export async function desactivarContingencia(company: string) {
  const res = await client.post<{ success: true; data: unknown }>(
    ENDPOINTS.config.ecfContingenciaDesactivar,
    undefined,
    { params: { company } },
  )
  return unwrap(res)
}

export async function flushContingencia(company: string, data?: FlushContingenciaDto) {
  const res = await client.post<{ success: true; data: FlushContingenciaResult }>(
    ENDPOINTS.config.ecfContingenciaFlush,
    data ?? {},
    { params: { company } },
  )
  return unwrap(res)
}
