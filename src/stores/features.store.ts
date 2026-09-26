import { create } from 'zustand'
import { getMeFeatures } from '@/shared/api/me'
import type { MeFeatures } from '@/shared/api/types'

type FeaturesStatus = 'idle' | 'loading' | 'ready' | 'error'

interface FeaturesState {
  status: FeaturesStatus
  error: string | null
  features: MeFeatures['features'] | null
  reportesHabilitados: string[]
  limites: MeFeatures['limites'] | null
  /**
   * Carga inicial (§3): UNA sola vez al iniciar sesión o al cambiar de tenant, junto con
   * `permissions`/`vertical` (ver ProtectedRoute). Muestra estado de carga hasta tener respuesta.
   */
  fetch: () => Promise<void>
  /**
   * Refresco en segundo plano (mismo patrón que permissions.refreshSilencioso): re-pide los
   * features SIN tocar `status`, así la app no se re-monta. Lo llama el interceptor de axios
   * tras un `FEATURE_NO_CONTRATADO`. Deduplica llamadas concurrentes.
   */
  refreshSilencioso: () => Promise<void>
  clear: () => void
}

const INITIAL = {
  status: 'idle' as FeaturesStatus,
  error: null as string | null,
  features: null as MeFeatures['features'] | null,
  reportesHabilitados: [] as string[],
  limites: null as MeFeatures['limites'] | null,
}

// No persistir en localStorage a propósito (mismo criterio que permissions.store §5.2): es
// información derivada, barata de volver a pedir, y persistirla arriesga mostrar módulos viejos
// tras un cambio de plan o de tenant.
let refreshEnCurso: Promise<void> | null = null

function aplicar(set: (partial: Partial<FeaturesState>) => void, data: MeFeatures) {
  set({
    features: data.features,
    reportesHabilitados: data.reportesHabilitados,
    limites: data.limites,
  })
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  ...INITIAL,

  fetch: async () => {
    // Solo el primer arranque bloquea la UI con el estado de carga. Un re-fetch cuando ya
    // estábamos 'ready' (ej. cambio de tenant con datos previos) no debe re-montar la app.
    if (get().status !== 'ready') set({ status: 'loading', error: null })
    try {
      const data = await getMeFeatures()
      aplicar(set, data)
      set({ status: 'ready', error: null })
    } catch (err) {
      if (get().status === 'ready') return // ya teníamos features válidos: no romper la sesión
      const message = (err as { message?: string } | undefined)?.message ?? 'Error al cargar los módulos contratados'
      set({ status: 'error', error: message })
    }
  },

  refreshSilencioso: async () => {
    if (refreshEnCurso) return refreshEnCurso
    refreshEnCurso = (async () => {
      try {
        const data = await getMeFeatures()
        aplicar(set, data)
        if (get().status !== 'ready') set({ status: 'ready', error: null })
      } catch {
        // Silencioso a propósito: si falla, se mantienen los features que ya había.
      } finally {
        refreshEnCurso = null
      }
    })()
    return refreshEnCurso
  },

  clear: () => {
    refreshEnCurso = null
    set({ ...INITIAL })
  },
}))
