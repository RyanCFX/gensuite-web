import { useQuery } from '@tanstack/react-query'
import { useFeature } from '@/shared/features/can'
import { usePuede } from '@/shared/permissions/can'
import { getConfiguracionOperativa } from '@/shared/api/me'
import { listDeliveryCobros, listDeliveryPendientes } from '@/shared/api/delivery'

/**
 * Las dos puertas de delivery — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §1.
 *
 * Muestra una pantalla o botón solo si feature **y** habilitación local **y** permiso.
 * Cualquier clave que falte se trata como `false`.
 *
 * Modo drenaje: con la feature apagada pero pendientes existentes, las secciones de
 * solo-terminar siguen visibles con aviso fijo y sin botones de creación.
 */
export function useDeliveryPuerta() {
  const feature = useFeature('delivery')

  const { data: operativa, isLoading: operativaLoading } = useQuery({
    queryKey: ['configuracion-operativa'],
    queryFn: getConfiguracionOperativa,
    staleTime: 60_000,
    retry: false,
  })

  const habilitado = operativa?.deliveryHabilitado ?? false

  // Para el drenaje basta el permiso de listar pendientes o cobros (§1: "si el usuario
  // tiene el permiso" — cualquiera de los dos de solo-terminar).
  const puedePendientes = usePuede('delivery.pendientes.listar')
  const puedeCobros = usePuede('delivery.cobros.listar')
  const conPermisoDrenaje = puedePendientes || puedeCobros

  // Sonda única: con feature apagada pero permiso, ¿queda algo pendiente?
  const { data: sondaCobros } = useQuery({
    queryKey: ['delivery-drenaje', 'cobros'],
    queryFn: () => listDeliveryCobros({ estado: 'por_conciliar', limit: 1 }),
    enabled: !feature && conPermisoDrenaje,
    staleTime: 60_000,
    retry: false,
  })
  const { data: sondaPendientes } = useQuery({
    queryKey: ['delivery-drenaje', 'pendientes'],
    queryFn: () => listDeliveryPendientes({ limit: 1 }),
    enabled: !feature && conPermisoDrenaje,
    staleTime: 60_000,
    retry: false,
  })

  const drenaje =
    !feature &&
    conPermisoDrenaje &&
    ((sondaCobros?.meta.total ?? 0) > 0 || (sondaPendientes?.meta.total ?? 0) > 0)

  return {
    /** `features.delivery` del tenant. */
    feature,
    /** `deliveryHabilitado` (admin ya activó). */
    habilitado,
    /** Puerta operativa completa: feature + habilitación. Falta el permiso por acción. */
    operativo: feature && habilitado,
    /** Feature apagada pero con pendientes: solo terminar lo pendiente, sin crear. */
    drenaje,
    cargando: operativaLoading,
    operativa,
  }
}

/** Aviso fijo del modo drenaje (§1). */
export function DrenajeAviso() {
  return (
    <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16 }}>
      <span>
        Delivery está desactivado para tu empresa. Solo puedes terminar lo pendiente.
      </span>
    </div>
  )
}

/** Rutas que siguen disponibles en modo drenaje (§1): solo terminar lo pendiente. */
const RUTAS_DRENAJE = ['/delivery/pendientes', '/delivery/cobros', '/delivery/viajes']
const RUTAS_DRENAJE_BLOQUEADAS = ['/delivery/viajes/nuevo']

/**
 * ¿Puede abrirse esta ruta `/delivery/*` según las puertas de §1 (sin mirar el permiso)?
 * - feature + habilitación local → todo.
 * - feature apagada con pendientes (drenaje) → solo pendientes, cobros y viajes (listar/detalle/
 *   despachar), sin crear ni editar viajes, repartidores ni vehículos.
 * - cualquier otro caso → no.
 */
export function deliveryRutaPermitida(
  pathname: string,
  puerta: { operativo: boolean; drenaje: boolean },
): boolean {
  if (puerta.operativo) return true
  if (!puerta.drenaje) return false
  if (RUTAS_DRENAJE_BLOQUEADAS.includes(pathname) || /^\/delivery\/viajes\/[^/]+\/editar$/.test(pathname)) return false
  return RUTAS_DRENAJE.some((r) => pathname === r || pathname.startsWith(r + '/'))
}
