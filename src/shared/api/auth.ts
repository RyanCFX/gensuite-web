import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  LoginRequest,
  LoginResponse,
  VerifyPinResponse,
  AuthUser,
  ForgotPasswordDto,
  ForgotPasswordResult,
  ResetPasswordDto,
} from './types'
import { saveSession } from './storage'
import type { ApiError } from './types'

export interface AuthResult {
  token: string
  user: AuthUser
  tenant: LoginResponse['tenant']
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}

function handleLoginPayload(payload: LoginResponse): AuthResult {
  const jwtPayload = decodeJwt(payload.access_token)
  const user: AuthUser = {
    ...payload.user,
    defaultWarehouse: (jwtPayload.defaultWarehouse as string) || undefined,
    warehouses: jwtPayload.warehouses as string[] | undefined,
  }

  saveSession(payload.access_token, payload.tenant, user)

  return {
    token: payload.access_token,
    user,
    tenant: payload.tenant,
  }
}

export async function login(data: LoginRequest): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: LoginResponse }>('/auth/login', data)
  return handleLoginPayload(unwrap(res))
}

export async function forgotPassword(data: ForgotPasswordDto, tenant: string): Promise<ForgotPasswordResult> {
  const res = await client.post<{ success: true; data: ForgotPasswordResult }>(
    ENDPOINTS.auth.forgotPassword,
    data,
    { headers: { 'X-Tenant': tenant } },
  )
  return unwrap(res)
}

export async function resetPassword(data: ResetPasswordDto, tenant: string): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: LoginResponse }>(
    ENDPOINTS.auth.resetPassword,
    data,
    { headers: { 'X-Tenant': tenant } },
  )
  return handleLoginPayload(unwrap(res))
}

export async function completeRegistration(data: ResetPasswordDto, tenant: string): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: LoginResponse }>(
    ENDPOINTS.auth.completeRegistration,
    data,
    { headers: { 'X-Tenant': tenant } },
  )
  return handleLoginPayload(unwrap(res))
}

export async function verifyAdminPin(pin: string) {
  const res = await client.post<{ success: true; data: VerifyPinResponse }>('/auth/verify-admin-pin', { pin })
  return unwrap(res)
}

export function isApiError(error: unknown): error is ApiError {
  if (typeof error !== 'object' || error === null) return false
  if (!('code' in error) || !('message' in error) || !('statusCode' in error)) return false
  return true
}
