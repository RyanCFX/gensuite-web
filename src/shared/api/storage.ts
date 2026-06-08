import type { AuthTenant, AuthUser } from './types'

const STORAGE_VERSION = 'v1'
const TOKEN_KEY = `gensuite:token:${STORAGE_VERSION}`
const TENANT_KEY = `gensuite:tenant:${STORAGE_VERSION}`
const USER_KEY = `gensuite:user:${STORAGE_VERSION}`

const cache = new Map<string, string | null>()

try {
  const oldToken = localStorage.getItem('gensuite_token')
  if (oldToken) {
    setToken(oldToken)
    localStorage.removeItem('gensuite_token')
  }
  const oldTenant = localStorage.getItem('gensuite_tenant')
  if (oldTenant) {
    localStorage.removeItem('gensuite_tenant')
  }
  const oldUser = localStorage.getItem('gensuite_user')
  if (oldUser) {
    localStorage.removeItem('gensuite_user')
  }
} catch {}

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

export function getToken(): string | null {
  return read(TOKEN_KEY)
}

export function setToken(token: string): void {
  write(TOKEN_KEY, token)
}

export function clearToken(): void {
  remove(TOKEN_KEY)
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

export function getUser(): AuthUser | null {
  const raw = read(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setUser(user: AuthUser): void {
  write(USER_KEY, JSON.stringify(user))
}

export function clearUser(): void {
  remove(USER_KEY)
}

export function clearSession(): void {
  clearToken()
  clearTenant()
  clearUser()
}

export function saveSession(token: string, tenant: AuthTenant, user: AuthUser): void {
  setToken(token)
  setTenant(tenant)
  setUser(user)
}
