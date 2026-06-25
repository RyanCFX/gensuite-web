import { client, unwrap } from './client'
import type { LoginRequest, LoginResponse, VerifyPinResponse } from './types'
import { saveSession } from './storage'
import type { ApiError } from './types'

export interface AuthResult {
  token: string
  user: LoginResponse['user']
  tenant: LoginResponse['tenant']
}

export async function login(data: LoginRequest): Promise<AuthResult> {
  const res = await client.post<{ success: true; data: LoginResponse }>('/auth/login', data)
  const payload = unwrap(res)

  saveSession(payload.access_token, payload.tenant, payload.user)

  return {
    token: payload.access_token,
    user: payload.user,
    tenant: payload.tenant,
  }
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
