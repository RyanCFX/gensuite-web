import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { usePermissionsStore } from '@/stores/permissions.store'
import { useFeaturesStore } from '@/stores/features.store'
import { useTenantStatusStore, type TenantBlockingCode } from '@/stores/tenantStatus.store'

// docs/PROMPT_ERRORES_COMERCIALES_FRONTEND.md §5.5 — "son pantallas, no toasts". Título +
// sugerencia por código; el texto principal siempre es el `message` real del backend (§2: nunca
// hardcodear el texto salvo este fallback de título/sugerencia, que es puramente informativo).
const TENANT_BLOCK_INFO: Record<TenantBlockingCode, { titulo: string; sugerencia: string }> = {
  TENANT_SUSPENDED: {
    titulo: 'Cuenta suspendida',
    sugerencia: 'Contacta a soporte o regulariza tu facturación para reactivar el acceso.',
  },
  TENANT_PROVISIONING: {
    titulo: 'Preparando tu cuenta',
    sugerencia: 'Esto puede tardar unos minutos — intenta de nuevo en breve.',
  },
  TENANT_CANCELLED: {
    titulo: 'Cuenta cancelada',
    sugerencia: 'Contacta a soporte si creés que esto es un error.',
  },
  TENANT_NOT_FOUND: {
    titulo: 'Empresa no encontrada',
    sugerencia: 'La empresa a la que intentás acceder ya no existe o cambió de dirección.',
  },
  // §3 fila 3 — a diferencia de los otros 4, esto no bloquea A LA EMPRESA: la SESIÓN ACTUAL quedó
  // apuntando a una empresa a la que el usuario ya no tiene acceso. El único camino es cerrar
  // sesión y volver a entrar — nunca automático, siempre con el usuario enterado de por qué.
  TENANT_MISMATCH: {
    titulo: 'Sesión de otra empresa',
    sugerencia: 'Cierra sesión y vuelve a entrar con la empresa correcta.',
  },
}

function TenantBlockedScreen({ code, message }: { code: TenantBlockingCode; message: string }) {
  const clear = useTenantStatusStore((s) => s.clear)
  const info = TENANT_BLOCK_INFO[code]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{info.titulo}</h1>
      <p style={{ maxWidth: 420, color: 'var(--text-secondary)', margin: 0 }}>{message}</p>
      <p style={{ maxWidth: 420, color: 'var(--text-tertiary)', fontSize: 13, margin: 0 }}>{info.sugerencia}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {code === 'TENANT_PROVISIONING' && (
          <button className="btn btn-secondary btn-size-sm" onClick={() => { clear(); window.location.reload() }}>
            Reintentar
          </button>
        )}
        <button className="btn btn-ghost btn-size-sm" onClick={() => { clear(); useAuthStore.getState().logout() }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export function ProtectedRoute() {
  const hydrating = useAuthStore((s) => s.hydrating)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const needsTenantSelection = useAuthStore((s) => s.needsTenantSelection)
  const permStatus = usePermissionsStore((s) => s.status)
  const permError = usePermissionsStore((s) => s.error)
  const fetchPermissions = usePermissionsStore((s) => s.fetch)
  const featStatus = useFeaturesStore((s) => s.status)
  const featError = useFeaturesStore((s) => s.error)
  const fetchFeatures = useFeaturesStore((s) => s.fetch)
  const tenantBlocked = useTenantStatusStore((s) => s.blocked)

  // Features y permisos se piden UNA sola vez al iniciar sesión (o al cambiar de tenant),
  // en paralelo — ver docs/tasks/80_features_tenant_discriminacion_ui.md §3.
  useEffect(() => {
    if (isAuthenticated && !needsTenantSelection && permStatus === 'idle') {
      fetchPermissions()
    }
  }, [isAuthenticated, needsTenantSelection, permStatus, fetchPermissions])

  useEffect(() => {
    if (isAuthenticated && !needsTenantSelection && featStatus === 'idle') {
      fetchFeatures()
    }
  }, [isAuthenticated, needsTenantSelection, featStatus, fetchFeatures])

  // Mientras se resuelve el hydrate inicial (F5) — POST /auth/refresh todavía en vuelo — no
  // redirigir a /login todavía, evita un flash de la pantalla de login para una sesión válida.
  if (hydrating) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />

  // Estado de tenant bloqueante (§3/§5.5) — pisa cualquier otra pantalla, incluida la de carga de
  // permisos/features: si el tenant está suspendido/cancelado/no existe, esos requests iban a
  // fallar con el mismo código de todos modos.
  if (tenantBlocked) return <TenantBlockedScreen code={tenantBlocked.code} message={tenantBlocked.message} />

  // El refresh_token es válido pero no hay `access_token` resuelto (§3.5) — hace falta elegir
  // tenant antes de poder pedir permisos/features/cualquier endpoint de negocio.
  if (needsTenantSelection) return <Navigate to="/login" replace />

  if (permStatus === 'idle' || permStatus === 'loading' || featStatus === 'idle' || featStatus === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (permStatus === 'error' || featStatus === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
        <p>{permError ?? featError ?? 'No se pudieron cargar los permisos.'}</p>
        <button
          className="btn btn-secondary btn-size-sm"
          onClick={() => {
            if (permStatus === 'error') fetchPermissions()
            if (featStatus === 'error') fetchFeatures()
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  return <Outlet />
}
