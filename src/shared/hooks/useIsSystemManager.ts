import { usePermissionsStore } from '@/stores/permissions.store'

export const SYSTEM_MANAGER_ROLE = 'System Manager'

/**
 * Los endpoints de /permisos y /roles (admin) requieren el rol System Manager
 * en ERPNext — el backend devuelve 403 si no lo tiene. Chequeamos contra los roles
 * nativos de ERPNext que trae `GET /me/permissions` (usePermissionsStore), NO contra
 * `useAuthStore().user.roles` — ese último es la lista de "Perfiles de rol" (Role
 * Profiles) de la membresía del tenant, un catálogo distinto que puede no incluir
 * "System Manager" aunque el usuario sí lo tenga como rol nativo de ERPNext.
 */
export function useIsSystemManager(): boolean {
  return usePermissionsStore((s) => s.roles.includes(SYSTEM_MANAGER_ROLE))
}
