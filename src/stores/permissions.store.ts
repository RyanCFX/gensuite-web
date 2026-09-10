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
  fetch: () => Promise<void>
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
export const usePermissionsStore = create<PermissionsState>((set) => ({
  ...INITIAL,

  fetch: async () => {
    set({ status: 'loading', error: null })
    try {
      const data = await getMePermissions()
      set({
        status: 'ready',
        error: null,
        email: data.email,
        roles: data.roles,
        doctypes: data.doctypes,
        acciones: data.acciones,
        vertical: data.vertical,
      })
    } catch (err) {
      const message = (err as { message?: string } | undefined)?.message ?? 'Error al cargar permisos'
      set({ status: 'error', error: message })
    }
  },

  clear: () => set({ ...INITIAL }),
}))
