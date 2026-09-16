import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  DocumentPermissions, MePermissions, MeProfile, PatchMeProfileDto, ChangeMyPasswordDto,
  MfaFactor, TotpEnrollResult, TotpConfirmDto, TotpConfirmResult, LinkedIdentity,
} from './types'

/**
 * `GET /me/permissions` no tiene JSON Schema documentado en openapi.json (solo se menciona
 * `acciones`/`doctypes`/`roles` en prosa) y `vertical` no aparece en absoluto en el schema de
 * esta ruta — normalizamos defensivamente en vez de asumir la forma, igual que ya hace
 * `getPermisosCatalogo()` en `./permisos.ts`. Cualquier valor de `vertical` que no sea
 * literalmente "farmacia" (incluido ausente) se trata como "general".
 */
function normalizeMePermissions(raw: unknown): MePermissions {
  const d = (raw ?? {}) as Record<string, unknown>
  return {
    email: typeof d.email === 'string' ? d.email : '',
    roles: Array.isArray(d.roles) ? d.roles.filter((r): r is string => typeof r === 'string') : [],
    doctypes: d.doctypes && typeof d.doctypes === 'object' ? (d.doctypes as MePermissions['doctypes']) : {},
    acciones: d.acciones && typeof d.acciones === 'object' ? (d.acciones as Record<string, boolean>) : {},
    vertical: d.vertical === 'farmacia' ? 'farmacia' : 'general',
  }
}

export async function getMePermissions(): Promise<MePermissions> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.permissions)
  return normalizeMePermissions(res.data.data)
}

export async function getMePermissionsForDoc(doctype: string, name: string): Promise<DocumentPermissions> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.permissionsByDoc(doctype, name))
  const d = (res.data.data ?? {}) as Record<string, unknown>
  return {
    doctype: typeof d.doctype === 'string' ? d.doctype : doctype,
    name: typeof d.name === 'string' ? d.name : name,
    permisos: d.permisos && typeof d.permisos === 'object' ? (d.permisos as DocumentPermissions['permisos']) : {},
  }
}

// ─── Perfil propio — docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §7.1 ────────────────────

export async function getMeProfile(): Promise<MeProfile> {
  const res = await client.get<{ success: true; data: MeProfile }>(ENDPOINTS.me.profile)
  return unwrap(res)
}

export async function patchMeProfile(data: PatchMeProfileDto): Promise<Partial<MeProfile>> {
  const res = await client.patch<{ success: true; data: Partial<MeProfile> }>(ENDPOINTS.me.profile, data)
  return unwrap(res)
}

/** Revoca TODAS las demás sesiones (incluida la actual) — el caller debe forzar logout completo
 *  del lado del cliente después de esto, no solo confiar en que el `access_token` expire (§7.2). */
export async function changeMyPassword(data: ChangeMyPasswordDto): Promise<{ message: string }> {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.me.password, data)
  return unwrap(res)
}

// ─── 2FA — mi perfil de seguridad (§5.3) ─────────────────────────────────────────────────────

export async function listMyMfaFactors(): Promise<MfaFactor[]> {
  const res = await client.get<{ success: true; data: MfaFactor[] }>(ENDPOINTS.me.mfaFactors)
  return unwrap(res)
}

export async function enrollTotp(label?: string): Promise<TotpEnrollResult> {
  const res = await client.post<{ success: true; data: TotpEnrollResult }>(ENDPOINTS.me.mfaTotp, label ? { label } : undefined)
  return unwrap(res)
}

export async function confirmTotp(data: TotpConfirmDto): Promise<TotpConfirmResult> {
  const res = await client.post<{ success: true; data: TotpConfirmResult }>(ENDPOINTS.me.mfaTotpConfirm, data)
  return unwrap(res)
}

export async function enableEmailMfa(): Promise<{ message: string }> {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.me.mfaEmail)
  return unwrap(res)
}

export async function deleteMfaFactor(factorId: string): Promise<{ message: string }> {
  const res = await client.delete<{ success: true; data: { message: string } }>(ENDPOINTS.me.mfaFactor(factorId))
  return unwrap(res)
}

// ─── Cuentas vinculadas (Google) — §8.4 ──────────────────────────────────────────────────────

export async function listMyIdentities(): Promise<LinkedIdentity[]> {
  const res = await client.get<{ success: true; data: LinkedIdentity[] }>(ENDPOINTS.me.identities)
  return unwrap(res)
}

export async function unlinkIdentity(identityId: string): Promise<{ message: string }> {
  const res = await client.delete<{ success: true; data: { message: string } }>(ENDPOINTS.me.identity(identityId))
  return unwrap(res)
}
