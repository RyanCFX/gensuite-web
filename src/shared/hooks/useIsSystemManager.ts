import { useAuthStore } from '@/stores/auth.store'

export const SYSTEM_MANAGER_ROLE = 'System Manager'

/**
 * Los endpoints de /permisos y /roles (admin) requieren el rol System Manager
 * en ERPNext — el backend devuelve 403 si no lo tiene. Lo chequeamos client-side
 * contra los roles ya presentes en el store de auth para ocultar/deshabilitar
 * la sección sin necesidad de un round-trip.
 */
export function useIsSystemManager(): boolean {
  return useAuthStore((s) => s.user?.roles?.includes(SYSTEM_MANAGER_ROLE) ?? false)
}
