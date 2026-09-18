import { create } from 'zustand'
import {
  getRefreshToken, getAccessToken, getTenant, getCachedUser, getCachedMemberships,
  setRefreshToken, setAccessToken, setTenant, setCachedUser, setCachedMemberships, clearSession,
} from '@/shared/api/storage'
import { refresh as apiRefresh, logout as apiLogout } from '@/shared/api/auth'
import { getMeProfile } from '@/shared/api/me'
import type { AuthUser, AuthTenant, AuthMembership, AuthResult, RefreshTokenResult, SwitchTenantResult } from '@/shared/api/types'
import { usePermissionsStore } from '@/stores/permissions.store'
import { connectRealtimeSocket, disconnectRealtimeSocket } from '@/shared/socket/realtimeSocket'

/** `AuthUser` + un par de campos de conveniencia que el resto de la app ya lee en decenas de
 * pantallas (`roles`, `defaultWarehouse`, `warehouses`) — no vienen en el `AuthResult` de la API
 * nueva (docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md), se derivan acá: `roles` de la
 * membresía del tenant activo dentro de `tenants[]`, `defaultWarehouse`/`warehouses` de los
 * custom claims del `access_token` (JWT) — eso no cambió, sigue siendo "las credenciales de
 * ERPNext del usuario para ese tenant" (§0.3). */
export interface StoreUser extends AuthUser {
  roles: string[]
  defaultWarehouse?: string
  warehouses?: string[]
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}

function rolesFor(memberships: AuthMembership[], tenantSlug: string | undefined): string[] {
  if (!tenantSlug) return []
  return memberships.find((m) => m.slug === tenantSlug)?.roles ?? []
}

function buildStoreUser(user: AuthUser, memberships: AuthMembership[], tenant: AuthTenant | null, accessToken: string | null): StoreUser {
  const claims = accessToken ? decodeJwt(accessToken) : {}
  return {
    ...user,
    roles: rolesFor(memberships, tenant?.slug),
    defaultWarehouse: claims.defaultWarehouse as string | undefined,
    warehouses: claims.warehouses as string[] | undefined,
  }
}

interface AuthState {
  refreshToken: string | null
  accessToken: string | null
  tenant: AuthTenant | null
  user: StoreUser | null
  /** TODAS las membresías de la persona, sin filtrar (§3.3) — para selector de tenant/invitaciones pendientes. */
  memberships: AuthMembership[]
  /** `true` mientras se resuelve el hydrate inicial (F5) — evita parpadear a /login antes de
   *  intentar refrescar la sesión existente. */
  hydrating: boolean
  isAuthenticated: boolean
  /** El `refreshToken` es válido pero no hay `access_token` — hace falta elegir tenant (§3.5). */
  needsTenantSelection: boolean

  hydrate: () => Promise<void>
  applyAuthResult: (result: AuthResult) => void
  applyRefreshResult: (result: RefreshTokenResult) => void
  applySwitchTenantResult: (result: SwitchTenantResult) => void
  /** Limpia solo el estado en memoria — usado por el interceptor tras forzar logout, que ya
   *  limpió el storage por su cuenta (evita un ciclo de import estático con client.ts). */
  clearLocal: () => void
  logout: (all?: boolean) => Promise<void>
}

function deriveFlags(state: Pick<AuthState, 'refreshToken' | 'accessToken'>) {
  return {
    isAuthenticated: !!state.refreshToken,
    needsTenantSelection: !!state.refreshToken && !state.accessToken,
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  refreshToken: null,
  accessToken: null,
  tenant: null,
  user: null,
  memberships: [],
  hydrating: true,
  isAuthenticated: false,
  needsTenantSelection: false,

  hydrate: async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      set({ hydrating: false })
      return
    }
    // Estado optimista desde storage mientras se confirma contra el backend — evita un flash de
    // "selector de tenant" o de pantalla vacía si ya había una sesión resuelta.
    const cachedUser = getCachedUser()
    const cachedMemberships = getCachedMemberships()
    set({
      refreshToken,
      accessToken: getAccessToken(),
      tenant: getTenant(),
      memberships: cachedMemberships,
      user: cachedUser ? buildStoreUser(cachedUser, cachedMemberships, getTenant(), getAccessToken()) : null,
      ...deriveFlags({ refreshToken, accessToken: getAccessToken() }),
    })
    try {
      const result = await apiRefresh(refreshToken)
      get().applyRefreshResult(result)
    } catch {
      // apiRefresh/el interceptor ya limpiaron todo y redirigieron si el refresh_token no servía.
    } finally {
      set({ hydrating: false })
    }
  },

  applyAuthResult: (result) => {
    setRefreshToken(result.refresh_token)
    if (result.access_token) setAccessToken(result.access_token)
    if (result.tenant) setTenant(result.tenant)
    setCachedUser(result.user)
    setCachedMemberships(result.tenants)
    set({
      refreshToken: result.refresh_token,
      accessToken: result.access_token,
      tenant: result.tenant,
      memberships: result.tenants,
      user: buildStoreUser(result.user, result.tenants, result.tenant, result.access_token),
      ...deriveFlags({ refreshToken: result.refresh_token, accessToken: result.access_token }),
    })
    usePermissionsStore.getState().clear()
    if (result.access_token) connectRealtimeSocket(result.access_token)
  },

  applyRefreshResult: (result) => {
    setRefreshToken(result.refresh_token)
    if (result.access_token) setAccessToken(result.access_token)
    if (result.tenant) setTenant(result.tenant)
    const state = get()
    const tenantChanged = state.tenant?.slug !== result.tenant?.slug
    set({
      refreshToken: result.refresh_token,
      accessToken: result.access_token,
      tenant: result.tenant,
      user: state.user ? buildStoreUser(state.user, state.memberships, result.tenant, result.access_token) : state.user,
      ...deriveFlags({ refreshToken: result.refresh_token, accessToken: result.access_token }),
    })
    // Un refresh puede resolver el tenant activo a uno distinto del que tenía esta pestaña (o
    // pasar de null a resuelto) — refresca el catálogo de permisos para ese tenant.
    if (tenantChanged) usePermissionsStore.getState().clear()
    if (result.access_token) connectRealtimeSocket(result.access_token)
    // `GET /me/profile` no viene en la respuesta de refresh — si nunca tuvimos `user` en memoria
    // (ej. abrí la pestaña directo en un F5 sin caché previa útil) y ya hay tenant activo, lo
    // pedimos una vez para no quedarnos con nombre/membresías vacíos.
    if (result.access_token && !state.user) {
      getMeProfile().then((profile) => {
        const memberships = profile.tenants
        setCachedMemberships(memberships)
        const user: AuthUser = { id: profile.id, email: profile.email, firstName: profile.firstName, lastName: profile.lastName, fullName: `${profile.firstName} ${profile.lastName}`.trim() }
        setCachedUser(user)
        set({ memberships, user: buildStoreUser(user, memberships, result.tenant, result.access_token) })
      }).catch(() => {})
    }
  },

  applySwitchTenantResult: (result) => {
    setAccessToken(result.access_token)
    setTenant(result.tenant)
    const state = get()
    set({
      accessToken: result.access_token,
      tenant: result.tenant,
      user: state.user ? buildStoreUser(state.user, state.memberships, result.tenant, result.access_token) : state.user,
      ...deriveFlags({ refreshToken: state.refreshToken, accessToken: result.access_token }),
    })
    usePermissionsStore.getState().clear()
    // El tenant queda fijo en el JWT desde el momento de la conexión — hay que reconectar con
    // el token nuevo para que el socket empiece a recibir los eventos del tenant nuevo.
    connectRealtimeSocket(result.access_token)
  },

  clearLocal: () => {
    usePermissionsStore.getState().clear()
    disconnectRealtimeSocket()
    set({
      refreshToken: null, accessToken: null, tenant: null, user: null, memberships: [],
      isAuthenticated: false, needsTenantSelection: false,
    })
  },

  logout: async (all = false) => {
    const refreshToken = get().refreshToken
    if (refreshToken) {
      try {
        await apiLogout({ refreshToken, all })
      } catch {
        // Si la llamada falla (ej. ya estaba revocada), igual limpiamos el lado del cliente.
      }
    }
    clearSession()
    get().clearLocal()
  },
}))
