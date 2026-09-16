import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { usePermissionsStore } from '@/stores/permissions.store'

export function ProtectedRoute() {
  const hydrating = useAuthStore((s) => s.hydrating)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const needsTenantSelection = useAuthStore((s) => s.needsTenantSelection)
  const status = usePermissionsStore((s) => s.status)
  const error = usePermissionsStore((s) => s.error)
  const fetchPermissions = usePermissionsStore((s) => s.fetch)

  useEffect(() => {
    if (isAuthenticated && !needsTenantSelection && status === 'idle') {
      fetchPermissions()
    }
  }, [isAuthenticated, needsTenantSelection, status, fetchPermissions])

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

  // El refresh_token es válido pero no hay `access_token` resuelto (§3.5) — hace falta elegir
  // tenant antes de poder pedir permisos/cualquier endpoint de negocio.
  if (needsTenantSelection) return <Navigate to="/login" replace />

  if (status === 'idle' || status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
        <p>{error ?? 'No se pudieron cargar los permisos.'}</p>
        <button className="btn btn-secondary btn-size-sm" onClick={() => fetchPermissions()}>
          Reintentar
        </button>
      </div>
    )
  }

  return <Outlet />
}
