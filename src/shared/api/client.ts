import axios from 'axios'
import { getToken, getTenant, clearSession } from './storage'
import type { ApiErrorResponse, ApiResponse, PaginatedResponse } from './types'

export const BASE_URL = 'https://gensapi.ryancfx.click/api/v1'

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
    if (!axios.isAxiosError(error) || !error.response) {
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Error de conexión con el servidor',
        statusCode: 0,
      })
    }

    const { status } = error.response

    if (status === 401) {
      clearSession()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    const data = error.response.data as ApiErrorResponse

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
  }
}

export function unwrapRaw<T>(response: { data: T }): T {
  return response.data
}
