import { useKeepAliveContext } from 'keepalive-for-react'

/**
 * `true` cuando esta pantalla es la pestaña visible (o cuando no hay multipestañas).
 *
 * Con multipestañas, `AppLayout` envuelve las rutas en `<KeepAlive>`: al navegar a otra sección
 * la pantalla anterior queda montada en caché, no desmontada. Un `useQuery` con `refetchInterval`
 * fijo seguiría disparando llamadas para siempre en segundo plano. Usá este hook para pausar el
 * polling mientras la pestaña no está en primer plano:
 *
 *   const tabActiva = useTabActiva()
 *   useQuery({ ..., refetchInterval: tabActiva ? 30_000 : false })
 *
 * Fuera de un `<KeepAlive>` el contexto trae `_cacheKey === ''` y devolvemos `true` (la pantalla
 * se monta y desmonta con la navegación, el polling es correcto).
 */
export function useTabActiva(): boolean {
  const ctx = useKeepAliveContext()
  if (!ctx._cacheKey) return true
  return ctx.active
}
