import { create } from 'zustand'
import { getMePermissions } from '@/shared/api/me'
import type { MePermissions } from '@/shared/api/types'

type PermissionsStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PermissionsState {
  status: PermissionsStatus
  error: string | null
  email: string
  roles: string[]
  doctypes: MePermissions['doctypes']
  acciones: Record<string, boolean>
  vertical: 'general' | 'farmacia'
  /** Carga inicial: muestra el estado de carga hasta tener respuesta (docs/PROMPT_PERMISOS_FRONTEND.md §5.1). */
  fetch: () => Promise<void>
  /**
   * Refresco en segundo plano (§5.2 / §9): re-pide los permisos SIN tocar `status`, así la app no
   * se re-monta. Lo llama el interceptor de axios tras un 403. Deduplica llamadas concurrentes.
   */
  refreshSilencioso: () => Promise<void>
  clear: () => void
}

const INITIAL = {
  status: 'idle' as PermissionsStatus,
  error: null as string | null,
  email: '',
  roles: [] as string[],
  doctypes: {} as MePermissions['doctypes'],
  acciones: {} as Record<string, boolean>,
  vertical: 'general' as const,
}

// No persistir en localStorage a propósito (docs/PROMPT_PERMISOS_FRONTEND.md §5.2): es
// información derivada, barata de volver a pedir, y persistirla arriesga mostrar permisos
// viejos tras un cambio de rol o de tenant.
let refreshEnCurso: Promise<void> | null = null

function aplicar(set: (partial: Partial<PermissionsState>) => void, data: MePermissions) {
  set({
    email: data.email,
    roles: data.roles,
    doctypes: data.doctypes,
    acciones: data.acciones,
    vertical: data.vertical,
  })
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  ...INITIAL,

  fetch: async () => {
    // Solo el primer arranque bloquea la UI con el estado de carga. Un re-fetch cuando ya
    // estábamos 'ready' (ej. al salir del admin de permisos) no debe re-montar la app.
    if (get().status !== 'ready') set({ status: 'loading', error: null })
    try {
      const data = await getMePermissions()
      aplicar(set, data)
      set({ status: 'ready', error: null })
    } catch (err) {
      if (get().status === 'ready') return // ya teníamos permisos válidos: no romper la sesión
      const message = (err as { message?: string } | undefined)?.message ?? 'Error al cargar permisos'
      set({ status: 'error', error: message })
    }
  },

  refreshSilencioso: async () => {
    if (refreshEnCurso) return refreshEnCurso
    refreshEnCurso = (async () => {
      try {
        const data = await getMePermissions()
        aplicar(set, data)
        if (get().status !== 'ready') set({ status: 'ready', error: null })
      } catch {
        // Silencioso a propósito: si falla, se mantienen los permisos que ya había.
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
