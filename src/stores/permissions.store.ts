import { create } from 'zustand'
import { getMePermissions, normalizeMePermissions } from '@/shared/api/me'
import { cargarBootstrap } from '@/shared/api/bootstrap'
import { getMiAcceso, normalizeMeAcceso } from '@/shared/api/acceso'
import type { MeAcceso, MePermissions } from '@/shared/api/types'
import { ACCESO_VACIO, type Acceso } from '@/shared/permissions/acceso'

type PermissionsStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PermissionsState {
  status: PermissionsStatus
  error: string | null
  email: string
  roles: string[]
  doctypes: MePermissions['doctypes']
  acciones: Record<string, boolean>
  vertical: 'general' | 'farmacia'
  /** Permisos v2 (docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §2):
   *  pantallas, componentes (filtros/widgets), recursos y filtros bloqueados. */
  acceso: Acceso
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
  acceso: ACCESO_VACIO,
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

function aplicarAcceso(set: (partial: Partial<PermissionsState>) => void, n: MeAcceso) {
  set({
    acceso: {
      modo: n.modo,
      version: n.version,
      modulos: new Set(n.modulos),
      pantallas: new Set(n.pantallas),
      componentes: new Set(n.componentes),
      recursos: new Set(n.recursos),
      filtrosBloqueados: n.filtrosBloqueados,
    },
  })
  ultimoAccesoFetch = Date.now()
}

// /me/acceso puede no existir en un backend anterior a v2 (404): no debe romper el
// login — se queda en modo `off` (comportamiento viejo). Solo se pide una vez por
// sesión/tenant; los refrescos posteriores van por refreshSilencioso.
async function pedirAcceso(): Promise<MeAcceso | null> {
  try {
    return await getMiAcceso()
  } catch {
    return null
  }
}

// Throttle del refresco por foco (§2.1): la ventana recupera el foco y pasaron >60 s.
let ultimoAccesoFetch = 0
let focoSuscrito = false

/** Registra (una sola vez) el refresco de acceso al recuperar el foco. Llamar desde ProtectedRoute. */
export function sincronizarAccesoEnFoco() {
  if (focoSuscrito || typeof window === 'undefined') return
  focoSuscrito = true
  window.addEventListener('focus', () => {
    if (Date.now() - ultimoAccesoFetch < 60_000) return
    usePermissionsStore.getState().refreshSilencioso()
  })
}

let fetchEnCurso: Promise<void> | null = null

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  ...INITIAL,

  fetch: async () => {
    // Single-flight: StrictMode (dev) o re-montajes de ProtectedRoute no deben duplicar los GET /me/*.
    if (fetchEnCurso) return fetchEnCurso
    let liberar!: () => void
    fetchEnCurso = new Promise<void>((r) => { liberar = r })
    try {
      // Solo el primer arranque bloquea la UI con el estado de carga. Un re-fetch cuando ya
      // estábamos 'ready' (ej. al salir del admin de permisos) no debe re-montar la app.
      if (get().status !== 'ready') set({ status: 'loading', error: null })
      try {
        // Arranque: UNA llamada (/me/bootstrap) trae permisos + acceso (y siembra config/usuario en la caché);
        // si no está disponible se cae a los endpoints individuales.
        const boot = await cargarBootstrap()
        const [data, acceso] = boot?.permisos
          ? [normalizeMePermissions(boot.permisos), boot.acceso ? normalizeMeAcceso(boot.acceso) : null]
          : await Promise.all([getMePermissions(), pedirAcceso()])
        aplicar(set, data)
        if (acceso) aplicarAcceso(set, acceso)
        set({ status: 'ready', error: null })
      } catch (err) {
        if (get().status === 'ready') return // ya teníamos permisos válidos: no romper la sesión
        const message = (err as { message?: string } | undefined)?.message ?? 'Error al cargar permisos'
        set({ status: 'error', error: message })
      }
  
    } finally {
      fetchEnCurso = null
      liberar()
    }
  },

  refreshSilencioso: async () => {
    if (refreshEnCurso) return refreshEnCurso
    refreshEnCurso = (async () => {
      try {
        const [data, acceso] = await Promise.all([getMePermissions(), pedirAcceso()])
        aplicar(set, data)
        if (acceso) aplicarAcceso(set, acceso)
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
