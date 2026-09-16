import type { AuthTenant, AuthUser, AuthMembership } from './types'

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §1.4 — el `refresh_token` es la sesión (30
// días, sobrevive F5 y cierre del navegador) y vive en localStorage como fuente de verdad. El
// `access_token`/`tenant` activos se guardan también acá por conveniencia (para no perder la
// sesión visual en un F5), pero NUNCA son la fuente de verdad — auth.store.ts siempre los
// revalida/reconsigue con POST /auth/refresh al arrancar la app.
const STORAGE_VERSION = 'v2'
const REFRESH_TOKEN_KEY = `gensuite:refreshToken:${STORAGE_VERSION}`
const ACCESS_TOKEN_KEY = `gensuite:accessToken:${STORAGE_VERSION}`
const TENANT_KEY = `gensuite:tenant:${STORAGE_VERSION}`

const cache = new Map<string, string | null>()

function read(key: string): string | null {
  if (cache.has(key)) return cache.get(key)!
  try {
    const value = localStorage.getItem(key)
    cache.set(key, value)
    return value
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
    cache.set(key, value)
  } catch {}
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
    cache.set(key, null)
  } catch {}
}

try {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('gensuite:')) {
      cache.set(e.key, e.newValue)
    }
  })
} catch {}

export function getRefreshToken(): string | null {
  return read(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string): void {
  write(REFRESH_TOKEN_KEY, token)
}

export function clearRefreshToken(): void {
  remove(REFRESH_TOKEN_KEY)
}

export function getAccessToken(): string | null {
  return read(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string): void {
  write(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  remove(ACCESS_TOKEN_KEY)
}

export function getTenant(): AuthTenant | null {
  const raw = read(TENANT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthTenant
  } catch {
    return null
  }
}

export function setTenant(tenant: AuthTenant): void {
  write(TENANT_KEY, JSON.stringify(tenant))
}

export function clearTenant(): void {
  remove(TENANT_KEY)
}

// ─── Caché de perfil/membresías (solo para mostrar y para el selector de tenant en un F5 con
// `access_token: null`) — NUNCA la fuente de verdad para autenticación, eso son los tokens de
// arriba. Se actualiza con cada login/mfa-verify/switch-tenant/GET /me/profile. ────────────────
const USER_KEY = `gensuite:user:${STORAGE_VERSION}`
const MEMBERSHIPS_KEY = `gensuite:memberships:${STORAGE_VERSION}`

export function getCachedUser(): AuthUser | null {
  const raw = read(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setCachedUser(user: AuthUser): void {
  write(USER_KEY, JSON.stringify(user))
}

export function getCachedMemberships(): AuthMembership[] {
  const raw = read(MEMBERSHIPS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as AuthMembership[]
  } catch {
    return []
  }
}

export function setCachedMemberships(memberships: AuthMembership[]): void {
  write(MEMBERSHIPS_KEY, JSON.stringify(memberships))
}

/** Limpia TODO el estado de sesión — logout completo o sesión inválida detectada. */
export function clearSession(): void {
  clearRefreshToken()
  clearAccessToken()
  clearTenant()
  remove(USER_KEY)
  remove(MEMBERSHIPS_KEY)
}
