import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePermissionsStore } from '@/stores/permissions.store'
import { useFeaturesStore } from '@/stores/features.store'
import { SYSTEM_MANAGER_ROLE } from '@/shared/hooks/useIsSystemManager'
import { resolverRuta } from '@/shared/permissions/rutas'
import { resolverFeature, REPORTE_KEY_POR_TIPO } from '@/shared/features/catalog'
import { useDeliveryPuerta, deliveryRutaPermitida } from '@/shared/hooks/useDelivery'
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
 *
 * IMPORTANTE: nunca uses <Navigate> directo acá — este guard vive dentro del <KeepAlive> de
 * AppLayout, que no desmonta de verdad las pantallas ya visitadas (solo las esconde). Un
 * <Navigate> montado ahí queda "fantasma" vivo para siempre: `useLocation()` es contexto, así
 * que sigue propagando incluso a un árbol "congelado", y el efecto interno de <Navigate>
 * depende de la referencia de `useNavigate()` — que cambia en cada navegación futura a
 * cualquier otra pantalla — así que se re-dispara el mismo redirect y secuestra la navegación
 * hasta recargar la página. Usá `RedirectOnDenial` en su lugar: su efecto depende de `pathname`
 * (que para un fantasma congelado nunca vuelve a cambiar), no de `navigate`. Los redirects de
 * una sola vez para rutas fijas (/, /reportes, /config) viven en App.tsx fuera de AppLayout.
 */
function RedirectOnDenial({ to }: { to: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    navigate(to, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a propósito: no depender de
    // `navigate` (cambia de referencia en cada navegación futura, en cualquier pantalla, y
    // volvería a disparar este efecto en un ghost congelado por KeepAlive — ver comentario arriba).
  }, [pathname, to])
  return null
}

export function RequireAccion() {
  const { pathname } = useLocation()
  const acciones = usePermissionsStore((s) => s.acciones)
  const vertical = usePermissionsStore((s) => s.vertical)
  const roles = usePermissionsStore((s) => s.roles)
  const features = useFeaturesStore((s) => s.features)
  const reportesHabilitados = useFeaturesStore((s) => s.reportesHabilitados)
  const featuresReady = useFeaturesStore((s) => s.status === 'ready')

  const ruta = resolverRuta(pathname)
  const deliveryPuerta = useDeliveryPuerta()
  const esRutaDelivery = pathname === '/delivery' || pathname.startsWith('/delivery/')

  if (!ruta) {
    if (import.meta.env.DEV) {
      console.warn(`[permisos] ruta sin entrada en RUTAS_PERMISOS: "${pathname}" — agregala a src/shared/permissions/rutas.ts`)
    }
    return <Outlet />
  }

  if (ruta.soloFarmacia && vertical !== 'farmacia') {
    return <RedirectOnDenial to="/dashboard" />
  }

  // Features (§5) — solo cuando ya resolvieron; mientras cargan, fail-open (ProtectedRoute de
  // todos modos bloquea la app hasta tener features, así que esto casi nunca se ve).
  if (featuresReady) {
    const feat = resolverFeature(pathname)?.feature ?? null
    if (esRutaDelivery) {
      // Delivery: feature + habilitación local, o modo drenaje (§1). Mientras carga la
      // habilitación no se decide (fail-open; el backend responde 403 de todos modos).
      if (!deliveryPuerta.cargando && !deliveryRutaPermitida(pathname, deliveryPuerta)) {
        // Feature contratada pero sin habilitar: no es un tema de plan — el mensaje lo dice.
        return deliveryPuerta.feature && !deliveryPuerta.habilitado ? (
          <ModuloNoContratadoPage detalle="Delivery está contratado pero aún no está habilitado. Pida a un administrador activarlo en Configuración → Facturación → Despacho → Delivery." />
        ) : (
          <ModuloNoContratadoPage />
        )
      }
    } else if (feat !== null && features?.[feat] !== true) {
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
    return <RedirectOnDenial to="/dashboard" />
  }

  if (ruta.accion && acciones[ruta.accion] !== true) {
    return <SinAccesoPage />
  }

  return <Outlet />
}
