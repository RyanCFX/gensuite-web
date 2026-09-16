import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  LoginRequest,
  LoginResult,
  MfaVerifyDto,
  RefreshTokenResult,
  LogoutDto,
  SwitchTenantDto,
  SwitchTenantResult,
  VerifyPinResponse,
  VerifyPinDto,
  AdminPinLogEntry,
  PaginatedResponse,
  ForgotPasswordDto,
  ForgotPasswordResult,
  ResetPasswordDto,
  AuthResult,
  InvitationDetail,
  AcceptInvitationDto,
  OauthExchangeDto,
} from './types'
import type { ApiError } from './types'

// ─── Login global (§3) ──────────────────────────────────────────────────────
export async function login(data: LoginRequest): Promise<LoginResult> {
  const res = await client.post<{ success: true; data: LoginResult }>(ENDPOINTS.auth.login, data)
  return unwrap(res)
}

// ─── 2FA — segundo paso del login (§5.1/§5.2) ───────────────────────────────
export async function mfaVerify(data: MfaVerifyDto): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: AuthResult }>(ENDPOINTS.auth.mfaVerify, data)
  return unwrap(res)
}

export async function mfaResend(mfaToken: string): Promise<{ message: string }> {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.auth.mfaResend, { mfaToken })
  return unwrap(res)
}

// ─── Refresh / logout / switch-tenant (§4) — usan `refreshToken`, no `access_token` ─────────
export async function refresh(refreshToken: string): Promise<RefreshTokenResult> {
  const res = await client.post<{ success: true; data: RefreshTokenResult }>(ENDPOINTS.auth.refresh, { refreshToken })
  return unwrap(res)
}

export async function logout(data: LogoutDto): Promise<{ message: string }> {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.auth.logout, data)
  return unwrap(res)
}

export async function switchTenant(data: SwitchTenantDto): Promise<SwitchTenantResult> {
  const res = await client.post<{ success: true; data: SwitchTenantResult }>(ENDPOINTS.auth.switchTenant, data)
  return unwrap(res)
}

// ─── Recuperar contraseña — global, sin sesión (§7.3) ───────────────────────
export async function forgotPassword(data: ForgotPasswordDto): Promise<ForgotPasswordResult> {
  const res = await client.post<{ success: true; data: ForgotPasswordResult }>(ENDPOINTS.auth.forgotPassword, data)
  return unwrap(res)
}

export async function resetPassword(data: ResetPasswordDto): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: AuthResult }>(ENDPOINTS.auth.resetPassword, data)
  return unwrap(res)
}

// ─── Invitaciones (§7.4) ─────────────────────────────────────────────────────
export async function getInvitation(token: string): Promise<InvitationDetail> {
  const res = await client.get<{ success: true; data: InvitationDetail }>(ENDPOINTS.auth.invitation(token))
  return unwrap(res)
}

export async function acceptInvitation(token: string, data: AcceptInvitationDto): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: AuthResult }>(ENDPOINTS.auth.invitationAccept(token), data)
  return unwrap(res)
}

export async function rejectInvitation(token: string): Promise<{ message: string }> {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.auth.invitationReject(token))
  return unwrap(res)
}

// ─── Login con Google (§8) ───────────────────────────────────────────────────
/** Navegación real de navegador — NUNCA llamar por fetch/axios (§8.1). Úsalo como `href` de un
 *  `<a>` o `window.location.href = googleOauthUrl()`. */
export function googleOauthUrl(): string {
  return `${client.defaults.baseURL}${ENDPOINTS.auth.oauthGoogle}`
}

export async function oauthExchange(data: OauthExchangeDto): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: AuthResult }>(ENDPOINTS.auth.oauthExchange, data)
  return unwrap(res)
}

// ─── PIN de administrador — sin cambios (§0.3) ───────────────────────────────
export async function verifyAdminPin(dto: VerifyPinDto) {
  const res = await client.post<{ success: true; data: VerifyPinResponse }>('/auth/verify-admin-pin', dto)
  return unwrap(res)
}

/** Bitácora de autorizaciones con PIN de administrador (éxitos y fallos). Requiere que el
 *  usuario logueado tenga rol System Manager o Auditor — 403 si no. */
export async function listAdminPinLog(params?: { limit?: number; offset?: number }) {
  const res = await client.get<PaginatedResponse<AdminPinLogEntry>>(ENDPOINTS.auth.adminPinLog, { params })
  return unwrapPaginated(res)
}

export function isApiError(error: unknown): error is ApiError {
  if (typeof error !== 'object' || error === null) return false
  if (!('code' in error) || !('message' in error) || !('statusCode' in error)) return false
  return true
}
