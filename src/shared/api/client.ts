import axios from 'axios'
import * as Sentry from '@sentry/react'
import { getToken, getTenant, clearSession } from './storage'
import type { ApiError, ApiErrorResponse, ApiResponse, PaginatedResponse } from './types'

// Ruta relativa por defecto: el dev server hace de proxy hacia el backend
// (ver vite.config.ts). Evita el bloqueo por Mixed Content cuando el front
// se sirve por HTTPS y el backend es HTTP.
export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

function normalizeOrderBy(orderBy: string): string {
  if (orderBy.startsWith('-')) return `${orderBy.slice(1)} desc`
  if (!orderBy.includes(' ')) return `${orderBy} asc`
  return orderBy
}

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  const tenant = getTenant()
  if (tenant) {
    config.headers['X-Tenant'] = tenant.slug
  }

  if (config.params?.orderBy) {
    config.params.orderBy = normalizeOrderBy(config.params.orderBy)
  }

  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = axios.isAxiosError(error) ? error.config?.url : undefined
    const requestMethod = axios.isAxiosError(error) ? error.config?.method : undefined

    if (!axios.isAxiosError(error) || !error.response) {
      // Sin respuesta del servidor (backend caído, CORS, timeout, sin conexión) — a diferencia de
      // un 4xx (error de validación esperado), esto siempre es una falla real que vale reportar.
      Sentry.captureException(error, { extra: { url: requestUrl, method: requestMethod } })
      Sentry.logger.error('Request sin respuesta del servidor', { url: requestUrl, method: requestMethod })
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Error de conexión con el servidor',
        statusCode: 0,
      })
    }

    const { status } = error.response

    // El intento de login fallido también responde 401 — no forzar el reload/redirect
    // en ese caso, para que LoginPage pueda mostrar el error sin perder lo que el usuario escribió.
    const isLoginRequest = error.config?.url?.includes('/auth/login')

    if (status === 401 && !isLoginRequest) {
      Sentry.logger.warn('Sesión inválida (401) — redirigiendo a login', { url: requestUrl })
      clearSession()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    const data = error.response.data as ApiErrorResponse

    // ERPNEXT_AUTH_ERROR: el BFF no pudo autenticarse contra ERPNext con las
    // credenciales de la integración (no es la sesión del usuario) — tratamos esto
    // como sesión inválida: cerramos sesión y redirigimos a login con un aviso.
    if (!isLoginRequest && data?.error?.code === 'ERPNEXT_AUTH_ERROR') {
      Sentry.captureException(new Error('ERPNEXT_AUTH_ERROR'), { extra: { url: requestUrl, method: requestMethod } })
      Sentry.logger.error('ERPNEXT_AUTH_ERROR — el BFF no pudo autenticarse contra ERPNext', { url: requestUrl })
      clearSession()
      window.location.href = '/login?sessionExpired=1'
      return Promise.reject(data.error)
    }

    // 5xx: falla real del backend (no un error de validación del usuario) — se reporta como
    // Issue y como log estructurado, con el tenant ya etiquetado en el scope global.
    if (status >= 500) {
      Sentry.captureException(error, {
        extra: { url: requestUrl, method: requestMethod, status, code: data?.error?.code },
      })
      Sentry.logger.error('Error 5xx del backend', {
        url: requestUrl,
        method: requestMethod,
        status,
        code: data?.error?.code,
      })
    }

    return Promise.reject(
      data?.error ?? {
        code: 'UNKNOWN_ERROR',
        message: error.message ?? 'Error desconocido',
        statusCode: status,
      },
    )
  },
)

// ---- Helper type extractors ----

export function unwrap<T>(response: { data: ApiResponse<T> }): T {
  return response.data.data
}

export function unwrapPaginated<T>(response: { data: PaginatedResponse<T> }) {
  return {
    items: response.data.data,
    meta: response.data.meta,
    note: response.data.note,
  }
}

export function unwrapRaw<T>(response: { data: T }): T {
  return response.data
}

// ---- Error code helpers ----
// Códigos de error que requieren un comportamiento de UI específico (no basta con
// mostrar el `message` genérico). Ver plan/IMPLEMENTACION.md sección 2.

export const ERROR_CODES = {
  BRANCH_REQUIRED: 'BRANCH_REQUIRED',
  MIXED_BRANCH_COUNT: 'MIXED_BRANCH_COUNT',
} as const

export function isApiErrorCode(error: unknown, code: string): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  )
}
