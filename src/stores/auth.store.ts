import { create } from 'zustand'
import { getToken, getTenant, getUser, clearSession } from '@/shared/api/storage'
import { login as apiLogin } from '@/shared/api/auth'
import type { AuthUser, AuthTenant } from '@/shared/api/types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  tenant: AuthTenant | null
  isAuthenticated: boolean
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  tenant: null,
  isAuthenticated: false,

  hydrate: () => {
    const token = getToken()
    const user = getUser()
    const tenant = getTenant()
    if (token && user) {
      set({ token, user, tenant, isAuthenticated: true })
    }
  },

  login: async (email, password, tenantSlug) => {
    const result = await apiLogin({ email, password, tenant: tenantSlug })
    set({
      token: result.token,
      user: result.user,
      tenant: result.tenant,
      isAuthenticated: true,
    })
  },

  logout: () => {
    clearSession()
    set({ token: null, user: null, tenant: null, isAuthenticated: false })
  },
}))
