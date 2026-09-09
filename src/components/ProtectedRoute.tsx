import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { usePermissionsStore } from '@/stores/permissions.store'

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const status = usePermissionsStore((s) => s.status)
  const error = usePermissionsStore((s) => s.error)
  const fetchPermissions = usePermissionsStore((s) => s.fetch)

  useEffect(() => {
    if (isAuthenticated && status === 'idle') {
      fetchPermissions()
    }
  }, [isAuthenticated, status, fetchPermissions])

  if (!isAuthenticated) return <Navigate to="/login" replace />

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
