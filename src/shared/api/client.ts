import axios from 'axios'
import * as Sentry from '@sentry/react'
import { toast } from 'sonner'
import { getAccessToken, getTenant, getRefreshToken, setAccessToken, setRefreshToken, setTenant, clearSession } from './storage'
import { ocultarErp } from '@/lib/ocultarErp'
import type { ApiError, ApiErrorResponse, ApiResponse, PaginatedResponse, RefreshTokenResult } from './types'

// Ruta relativa por defecto: el dev server hace de proxy hacia el backend
// (ver vite.config.ts). Evita el bloqueo por Mixed Content cuando el front
// se sirve por HTTPS y el backend es HTTP.
export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

/** Resuelve una URL de archivo devuelta por el backend (ej. `fileUrl` de un upload, "/files/x.png").
 * Se deja SIN resolver contra el origen del backend a propósito: el backend sirve esos archivos
 * con `Cross-Origin-Resource-Policy: same-origin`, así que un `<img src>` apuntando directo a su
 * IP/dominio es bloqueado por el navegador (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin) aunque el
 * archivo exista y responda 200 — el bloqueo es del navegador, no depende de si el recurso está
 * disponible. La ruta relativa se sirve detrás del propio origen del front, que la reenvía al
 * backend igual que ya hace con `/api` (ver `/files` en vite.config.ts y deploy/nginx.conf.example),
 * dejando la petición como same-origin desde el punto de vista del navegador. Si el backend algún
 * día devuelve una URL ya absoluta, se respeta tal cual. */
export function resolveFileUrl(url: string): string {
  return url
}

// Evita repetir el mismo toast de permiso dentro de una ventana corta (ráfagas de 403).
const toastPermisoReciente = new Map<string, number>()
function shouldToastPermiso(message: string): boolean {
  const ahora = Date.now()
  const previo = toastPermisoReciente.get(message) ?? 0
  if (ahora - previo < 4000) return false
  toastPermisoReciente.set(message, ahora)
  return true
}

function normalizeOrderBy(orderBy: string): string {
  if (orderBy.startsWith('-')) return `${orderBy.slice(1)} desc`
  if (!orderBy.includes(' ')) return `${orderBy} asc`
  return orderBy
}

client.interceptors.request.use((config) => {
  const token = getAccessToken()
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

// ─── Refresh single-flight — docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §4.1 ──────────────
// Instancia de axios SIN estos interceptores (evita recursión: refrescar no debe volver a pasar
// por "si 401, refrescar"). Una sola promesa "en vuelo" para que ráfagas de 401 simultáneas
// (varias queries fallando a la vez) disparen un único POST /auth/refresh, no uno por request.
const rawClient = axios.create({ baseURL: BASE_URL, headers: { 'Content-Type': 'application/json' } })
let refreshInFlight: Promise<string | null> | null = null

/** Devuelve el `access_token` fresco tras refrescar, o `null` si el backend no pudo resolver un
 *  tenant activo (§3.4/§3.5 — no es un error, el caller original queda sin poder reintentar y el
 *  resto de la app debe mostrar el selector de tenant). Lanza si el `refreshToken` en sí es
 *  inválido/fue reusado — ahí no hay reintento posible, hay que forzar logout completo. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    forceLogout()
    throw new Error('No hay sesión')
  }
  refreshInFlight = rawClient
    .post<{ success: true; data: RefreshTokenResult }>('/auth/refresh', { refreshToken })
    .then(({ data }) => {
      const result = data.data
      setRefreshToken(result.refresh_token)
      if (result.access_token) setAccessToken(result.access_token)
      if (result.tenant) setTenant(result.tenant)
      // Import dinámico a propósito (mismo patrón que el refresco de permisos más abajo): un
      // import estático de vuelta crearía un ciclo real (client.ts → auth.store.ts → client.ts).
      import('@/stores/auth.store').then((m) => m.useAuthStore.getState().applyRefreshResult(result))
      return result.access_token
    })
    .catch((err) => {
      // Reuso de un refresh_token ya consumido, o cualquier otro rechazo del propio refresh —
      // §4.1: "no reintentes, forzar login completo". No distinguimos el mensaje acá porque
      // cualquier fallo de ESTE endpoint puntual significa lo mismo: la sesión ya no sirve.
      forceLogout()
      throw err
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

function forceLogout() {
  clearSession()
  import('@/stores/auth.store').then((m) => m.useAuthStore.getState().clearLocal())
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login?sessionExpired=1'
  }
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
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

    // Ninguno de los endpoints de /auth/* lleva `access_token` de negocio — un 401 ahí es una
    // respuesta legítima de ESE endpoint (credenciales inválidas, refresh_token inválido, etc.),
    // nunca "mi sesión expiró, hay que refrescar". Se deja pasar tal cual para que cada pantalla
    // (login, mfa, forgot-password...) lo maneje con su propio mensaje.
    const isAuthEndpoint = error.config?.url?.includes('/auth/')

    if (status === 401 && !isAuthEndpoint) {
      const config = error.config as (typeof error.config & { _retried?: boolean }) | undefined
      if (config && !config._retried) {
        config._retried = true
        try {
          const newToken = await refreshAccessToken()
          if (newToken) {
            // Reintenta la request original UNA vez — el interceptor de request vuelve a leer el
            // access_token (ya actualizado en storage) solo.
            return client(config)
          }
          // access_token sigue null tras refrescar (tenant ambiguo) — no hay con qué reintentar;
          // el store ya quedó actualizado (applyRefreshResult) para que la UI muestre el selector.
        } catch {
          // refreshAccessToken ya forzó el logout completo — no hace falta nada más acá.
        }
      }
      Sentry.logger.warn('Sesión inválida (401) tras refrescar — redirigiendo a login', { url: requestUrl })
      return Promise.reject(error)
    }

    const data = error.response.data as ApiErrorResponse

    // El backend a veces redacta `error.message` pensando en quien integra el BFF, no en el
    // usuario final, y menciona "ERPNext" directamente — los clientes de este producto no deben
    // saber que ERPNext es el motor interno. Se sanea acá, centralizado, antes de que el mensaje
    // llegue a cualquier toast o pantalla (ver src/lib/ocultarErp.ts).
    if (data?.error?.message) {
      data.error.message = ocultarErp(data.error.message)
    }

    // ERPNEXT_AUTH_ERROR: el BFF no pudo autenticarse contra ERPNext con las
    // credenciales de la integración (no es la sesión del usuario) — tratamos esto
    // como sesión inválida: cerramos sesión y redirigimos a login con un aviso.
    if (!isAuthEndpoint && data?.error?.code === 'ERPNEXT_AUTH_ERROR') {
      Sentry.captureException(new Error('ERPNEXT_AUTH_ERROR'), { extra: { url: requestUrl, method: requestMethod } })
      Sentry.logger.error('ERPNEXT_AUTH_ERROR — el BFF no pudo autenticarse contra ERPNext', { url: requestUrl })
      clearSession()
      window.location.href = '/login?sessionExpired=1'
      return Promise.reject(data.error)
    }

    // Errores de permiso (docs/PROMPT_PERMISOS_FRONTEND.md §9). Ambos códigos muestran el
    // `message` del backend TAL CUAL (ya viene en español y nombra el botón y la pantalla; no se
    // reescribe). Solo `PERMISO_INSUFICIENTE` implica que la caché de permisos pudo quedar vieja
    // — se refresca en segundo plano para que la UI se corrija sola sin recargar. `FORBIDDEN`
    // viene de ERPNext más abajo y puede ser un permiso más fino: solo se informa.
    // Import dinámico a propósito: un import estático de vuelta crearía un ciclo real
    // (client.ts → permissions.store.ts → me.ts → client.ts).
    const permCode = data?.error?.code
    if (!isAuthEndpoint && (permCode === 'PERMISO_INSUFICIENTE' || permCode === 'FORBIDDEN')) {
      // Toast throttleado: un mismo mensaje puede llegar en ráfaga (react-query reintenta,
      // varias queries fallan a la vez) — no spamear al usuario con el mismo aviso.
      const msg = data?.error?.message
      if (msg && shouldToastPermiso(msg)) toast.error(msg)
      if (permCode === 'PERMISO_INSUFICIENTE') {
        // Refresco SILENCIOSO: no toca `status`, así ProtectedRoute no re-monta la app (evita el
        // loop de re-render → re-request → 403 → refresh → ...). Deduplicado en el store.
        import('@/stores/permissions.store').then((m) => m.usePermissionsStore.getState().refreshSilencioso())
      }
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
  // Apertura de Inventario (docs/tasks/PROMPT_APERTURA_INVENTARIO_FRONTEND.md §5) — un documento
  // no puede mezclar almacenes de sucursales distintas. Código DISTINTO a MIXED_BRANCH_COUNT.
  MIXED_BRANCH_APERTURA_INVENTARIO: 'MIXED_BRANCH_APERTURA_INVENTARIO',
  // Carga Inicial de Inventario (docs/tasks/PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md §4) —
  // código DISTINTO a los otros dos MIXED_BRANCH_* (cada pantalla tiene el suyo propio).
  MIXED_BRANCH_CARGA_INICIAL: 'MIXED_BRANCH_CARGA_INICIAL',
  // Multimoneda (docs/tasks/60_multimoneda_dop_usd_eur.md §5.2)
  CURRENCY_IS_BASE: 'CURRENCY_IS_BASE',
  CURRENCY_NOT_SUPPORTED: 'CURRENCY_NOT_SUPPORTED',
  CURRENCY_NOT_ENABLED: 'CURRENCY_NOT_ENABLED',
  PAYMENT_MIXED_CURRENCIES: 'PAYMENT_MIXED_CURRENCIES',
  PAYMENT_MIXED_RATES: 'PAYMENT_MIXED_RATES',
  BANK_ACCOUNT_CURRENCY_MISMATCH: 'BANK_ACCOUNT_CURRENCY_MISMATCH',
  // Código DISTINTO al de arriba — Cuentas Bancarias (docs/tasks/64_multimoneda_completo.md §5.6),
  // no lo trates igual.
  BANK_ACCOUNT_CURRENCY_MISMATCH_GL: 'BANK_ACCOUNT_CURRENCY_MISMATCH_GL',
  EXCHANGE_RATE_REQUIRED: 'EXCHANGE_RATE_REQUIRED',
  BANK_AMOUNT_OUT_OF_TOLERANCE: 'BANK_AMOUNT_OUT_OF_TOLERANCE',
  EXCHANGE_RATE_NOT_FOUND: 'EXCHANGE_RATE_NOT_FOUND',
  // Transferencias Internas (docs/tasks/64_multimoneda_completo.md §5.3)
  MONTO_DESTINO_REQUIRED: 'MONTO_DESTINO_REQUIRED',
  // Caja/POS (docs/tasks/70_caja_pos_sin_soporte_multimoneda.md) — a diferencia de /cobros y
  // /pagos, Caja nunca convierte: el método de pago debe operar en la MISMA moneda de la factura.
  POS_PAYMENT_CURRENCY_MISMATCH: 'POS_PAYMENT_CURRENCY_MISMATCH',
  // Alertas de stock disponible/reservado (docs/tasks/73_alertas_stock_disponible_reservado.md).
  // Devuelto por /transferencias, /despachos, y submits de Factura/Delivery Note con
  // update_stock=1 cuando la cantidad solicitada excede `disponible` (actualQty - reservedStock).
  // Trae `details` estructurado SOLO en los dos primeros casos — en el submit nativo de ERPNext
  // solo viene el `code`, sin `details` (el mensaje nativo es texto libre en inglés).
  STOCK_INSUFFICIENT_OR_RESERVED: 'STOCK_INSUFFICIENT_OR_RESERVED',
  // Almacén de venta por sucursal (docs/tasks/75_almacen_venta_confirmar_stock_uoms_permitidas.md
  // §1) — la sucursal tiene un almacén de venta configurado y la línea intenta vender desde otro.
  // Puede aparecer en Facturas (incl. Caja/POS), Pedidos, Cotizaciones y despacho mostrador.
  SALE_WAREHOUSE_MISMATCH: 'SALE_WAREHOUSE_MISMATCH',
  // UOMs de compra/venta permitidas por artículo (mismo doc, §3) — la UOM elegida en la línea no
  // está en la lista permitida del artículo para esa dirección (compra/venta). `details.permitidas`
  // trae las UOMs válidas.
  UOM_NOT_ALLOWED: 'UOM_NOT_ALLOWED',
} as const

// El predicado narrowa a `ApiError & { code: C }` (no solo `ApiError`) a propósito: cuando el
// `error` del caller ya está tipado como `ApiError` (ej. `onError: (err: ApiError) => ...`), un
// predicado idéntico al tipo declarado hace que TS derive el tipo del branch `else` como
// `Exclude<ApiError, ApiError>` = `never` — cualquier acceso a `err.algo` después del `if` no
// compila. Al narrowar a un subtipo estricto, el branch negativo conserva `ApiError`.
export function isApiErrorCode<C extends string>(error: unknown, code: C): error is ApiError & { code: C } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  )
}
