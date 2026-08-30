// Integración con GlitchTip (self-hosted, protocolo compatible con el SDK de Sentry) —
// errores no capturados, performance (tracing de rutas/requests) y logs estructurados.
// El DSN se lee de VITE_GLITCHTIP_DSN (.env) — si falta, el tracking queda desactivado sin
// romper la app (útil para levantar el proyecto sin depender de GlitchTip).

import { useEffect } from 'react'
import * as Sentry from '@sentry/react'
import {
  Routes,
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import type { AuthTenant, AuthUser } from '@/shared/api/types'

/** `<Routes>` instrumentado — úsalo en vez del `Routes` de react-router-dom en App.tsx para que
 *  las transacciones de performance queden nombradas por ruta (ej. "/facturas/:id") en vez del
 *  pathname crudo. */
export const SentryRoutes = Sentry.wrapReactRouterRouting(Routes)

export function initSentry(): void {
  const dsn = import.meta.env.VITE_GLITCHTIP_DSN

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.warn(
        '[glitchtip] VITE_GLITCHTIP_DSN no está configurado — error tracking y performance desactivados.',
      )
    }
    return
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Logs estructurados (Sentry.logger.*) — feature de GlitchTip/Sentry además de Issues.
    enableLogs: true,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    // 100% en dev (poco tráfico, máxima visibilidad); una muestra en producción para no saturar
    // GlitchTip con transacciones de cada click.
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
  })

  // Multitenant: cada evento/log/transacción queda etiquetado con el tenant y el usuario activos,
  // para poder filtrar por cliente en GlitchTip — indispensable en un proyecto multitenant donde
  // un mismo error puede venir de tenants distintos. Se sincroniza solo, en cada login/logout/
  // hydrate, sin tener que tocar cada pantalla.
  const syncScope = (state: { tenant: AuthTenant | null; user: AuthUser | null }) => {
    Sentry.setTag('tenant', state.tenant?.slug ?? null)
    if (state.user) {
      Sentry.setUser({
        email: state.user.email,
        username: state.user.full_name,
        tenant: state.tenant?.slug,
      })
    } else {
      Sentry.setUser(null)
    }
  }
  syncScope(useAuthStore.getState())
  useAuthStore.subscribe(syncScope)
}
