import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePermissionsStore } from '@/stores/permissions.store'
import { useFeaturesStore } from '@/stores/features.store'
import { SYSTEM_MANAGER_ROLE } from '@/shared/hooks/useIsSystemManager'
import { resolverRuta } from '@/shared/permissions/rutas'
import { resolverFeature, REPORTE_KEY_POR_TIPO } from '@/shared/features/catalog'
import SinAccesoPage from '@/features/_shared/SinAccesoPage'
import ModuloNoContratadoPage from '@/features/_shared/ModuloNoContratadoPage'

/**
 * Guard de router (docs/PROMPT_PERMISOS_FRONTEND.md §6 + docs/tasks/80_features_tenant_discriminacion_ui.md §5):
 * no basta con esconder el ítem del menú, alguien puede pegar la URL. Se monta como layout route
 * dentro de `AppLayout`.
 *
 * La condición de feature vive en ESTE mismo guard — no en un guard separado y paralelo que se
 * pueda desincronizar del de permisos (§5). El orden de evaluación:
 *
 * 1. Vertical Farmacia: antes que `acciones` (§6 permisos). Si el tenant no es farmacia → al dashboard.
 * 2. Features del tenant (§5 features): si la ruta tiene featureKey y está apagado → pantalla
 *    "módulo no disponible en tu plan" (§9 FEATURE_NO_CONTRATADO). Incluye el caso /reportes/:tipo
 *    por `reportesHabilitados`.
 * 3. Meta-administración: por rol `System Manager`, no por acción (§15 permisos).
 * 4. Resto: si la acción de lectura mapeada es `false` → pantalla "sin acceso".
 * 5. Ruta sin entrada en ningún mapa: se deja pasar (fail-open) y se avisa en DEV.
 */
export function RequireAccion() {
  const { pathname } = useLocation()
  const acciones = usePermissionsStore((s) => s.acciones)
  const vertical = usePermissionsStore((s) => s.vertical)
  const roles = usePermissionsStore((s) => s.roles)
  const features = useFeaturesStore((s) => s.features)
  const reportesHabilitados = useFeaturesStore((s) => s.reportesHabilitados)
  const featuresReady = useFeaturesStore((s) => s.status === 'ready')

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

  // Features (§5) — solo cuando ya resolvieron; mientras cargan, fail-open (ProtectedRoute de
  // todos modos bloquea la app hasta tener features, así que esto casi nunca se ve).
  if (featuresReady) {
    const feat = resolverFeature(pathname)?.feature ?? null
    if (feat !== null && features?.[feat] !== true) {
      return <ModuloNoContratadoPage />
    }
    // Reportes: la pantalla contenedora es núcleo, pero cada reporte individual se filtra por
    // `reportesHabilitados` (§6). El :tipo viene como segundo segmento de /reportes/:tipo.
    if (pathname.startsWith('/reportes/')) {
      const tipo = pathname.split('/')[2] ?? ''
      const key = REPORTE_KEY_POR_TIPO[tipo]
      if (key && !reportesHabilitados.includes(key)) {
        return <ModuloNoContratadoPage />
      }
    }
  }

  if (ruta.soloSystemManager && !roles.includes(SYSTEM_MANAGER_ROLE)) {
    return <Navigate to="/dashboard" replace />
  }

  if (ruta.accion && acciones[ruta.accion] !== true) {
    return <SinAccesoPage />
  }

  return <Outlet />
}
