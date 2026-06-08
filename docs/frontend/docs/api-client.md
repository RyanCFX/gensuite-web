# API Client — Configuración con Axios

## Archivo: `src/api/client.ts`

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios'
import { useAuthStore } from '../stores/auth.store'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://gensapi.ryancfx.click/api/v1'

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Request interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const { token, tenantSlug } = useAuthStore.getState()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (tenantSlug) {
    config.headers['X-Tenant'] = tenantSlug
  }

  return config
})

// ─── Response interceptor ────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    // El BFF siempre envuelve en { success, data, meta }
    // Para listas paginadas: devolver el objeto completo { data, meta }
    // Para entidades únicas: devolver data directamente
    return response
  },
  (error: AxiosError<{ success: false; error: { code: string; message: string; statusCode: number } }>) => {
    const bffError = error.response?.data?.error

    if (error.response?.status === 401) {
      // Token expirado o inválido
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }

    // Crear error enriquecido con código BFF
    const enrichedError = new Error(bffError?.message ?? 'Error de conexión') as Error & {
      code: string
      statusCode: number
    }
    enrichedError.code = bffError?.code ?? 'UNKNOWN_ERROR'
    enrichedError.statusCode = bffError?.statusCode ?? error.response?.status ?? 0

    return Promise.reject(enrichedError)
  }
)
```

## Ejemplo de uso en TanStack Query

```typescript
// src/api/customers.ts
import { apiClient } from './client'

export interface Customer {
  id: string
  customerName: string
  customerType: 'Company' | 'Individual'
  rnc?: string
  cedula?: string
  hasCredit: boolean
  disabled: boolean
}

export interface ListCustomersParams {
  limit?: number
  offset?: number
  search?: string
  disabled?: boolean
}

export const customersApi = {
  list: async (params: ListCustomersParams = {}) => {
    const res = await apiClient.get('/customers', { params })
    return res.data as { success: true; data: Customer[]; meta: { total: number; limit: number; offset: number; hasMore: boolean } }
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/customers/${encodeURIComponent(id)}`)
    return res.data.data as Customer
  },

  create: async (body: Partial<Customer>) => {
    const res = await apiClient.post('/customers', body)
    return res.data.data as Customer
  },

  update: async (id: string, body: Partial<Customer>) => {
    const res = await apiClient.put(`/customers/${encodeURIComponent(id)}`, body)
    return res.data.data as Customer
  },

  remove: async (id: string) => {
    const res = await apiClient.delete(`/customers/${encodeURIComponent(id)}`)
    return res.data
  },
}

// src/features/customers/hooks/useCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customersApi } from '../../../api/customers'

export const useCustomers = (params = {}) =>
  useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.list(params),
  })

export const useCreateCustomer = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
```

## Auth Store (Zustand)

```typescript
// src/stores/auth.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '../api/client'

interface AuthState {
  token: string | null
  tenantSlug: string
  user: { email: string; fullName: string; roles: string[] } | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      tenantSlug: import.meta.env.VITE_TENANT_SLUG ?? 'tenant1',
      user: null,
      isAuthenticated: false,

      login: async (email, password) => {
        // Note: El BFF necesita X-Tenant pero la instancia aún no tiene token
        // Para login se hace request manual con el tenant hardcoded
        const tenantSlug = import.meta.env.VITE_TENANT_SLUG ?? 'tenant1'
        const res = await apiClient.post(
          '/auth/login',
          { email, password },
          { headers: { 'X-Tenant': tenantSlug } },
        )
        const { access_token, user } = res.data.data
        set({ token: access_token, user, isAuthenticated: true })
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false })
        localStorage.removeItem('auth-storage')
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user, tenantSlug: state.tenantSlug }),
    }
  )
)
```

## Rutas Protegidas

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'

export const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          {/* ... resto de rutas */}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  </BrowserRouter>
)
```
