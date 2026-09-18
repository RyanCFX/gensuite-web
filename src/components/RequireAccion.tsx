import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePermissionsStore } from '@/stores/permissions.store'
import { SYSTEM_MANAGER_ROLE } from '@/shared/hooks/useIsSystemManager'
import { resolverRuta } from '@/shared/permissions/rutas'
import SinAccesoPage from '@/features/_shared/SinAccesoPage'

/**
 * Guard de router (docs/PROMPT_PERMISOS_FRONTEND.md §6): no basta con esconder el ítem del menú,
 * alguien puede pegar la URL. Se monta como layout route dentro de `AppLayout`.
 *
 * - Vertical Farmacia: se evalúa antes que `acciones` (§6). Si el tenant no es farmacia → al dashboard.
 * - Meta-administración: se gatea por rol `System Manager`, no por acción (§15).
 * - Resto: si la acción de lectura mapeada es `false` → pantalla "sin acceso".
 * - Ruta sin entrada en el mapa: se deja pasar (fail-open) y se avisa en DEV — la seguridad real
 *   la aplica el backend; un hueco en el mapa no debe dejar al usuario sin app.
 */
export function RequireAccion() {
  const { pathname } = useLocation()
  const acciones = usePermissionsStore((s) => s.acciones)
  const vertical = usePermissionsStore((s) => s.vertical)
  const roles = usePermissionsStore((s) => s.roles)

  const ruta = resolverRuta(pathname)

  if (!ruta) {
    if (import.meta.env.DEV) {
      console.warn(`[permisos] ruta sin entrada en RUTAS_PERMISOS: "${pathname}" — agregala a src/shared/permissions/rutas.ts`)
    }
    return <Outlet />
  }

  if (ruta.soloFarmacia && vertical !== 'farmacia') {
    return <Navigate to="/dashboard" replace />
  }

  if (ruta.soloSystemManager && !roles.includes(SYSTEM_MANAGER_ROLE)) {
    return <Navigate to="/dashboard" replace />
  }

  if (ruta.accion && acciones[ruta.accion] !== true) {
    return <SinAccesoPage />
  }

  return <Outlet />
}
