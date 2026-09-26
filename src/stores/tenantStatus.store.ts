import { create } from 'zustand'

/** Estados de tenant bloqueantes — docs/PROMPT_ERRORES_COMERCIALES_FRONTEND.md §3/§5.5: "son
 *  pantallas, no toasts". Se setean centralmente desde el interceptor de `client.ts` apenas
 *  cualquier request devuelve uno de estos códigos — no hace falta que ninguna pantalla los
 *  chequee por su cuenta. `ProtectedRoute` renderiza la pantalla completa mientras este estado
 *  no sea `null`, tapando el resto de la app (incluida la navegación). */
export type TenantBlockingCode =
  | 'TENANT_SUSPENDED'
  | 'TENANT_PROVISIONING'
  | 'TENANT_CANCELLED'
  | 'TENANT_NOT_FOUND'
  // A diferencia de los otros 4, este NO es un fallo del lado del tenant — es la sesión actual
  // apuntando a una empresa a la que el usuario ya no tiene acceso. El logout acá es MANUAL
  // (§3 fila 3: "acá sí hay logout, pero manual y explicado, no automático") — nunca redirigir
  // solo con esto.
  | 'TENANT_MISMATCH'

interface TenantStatusState {
  blocked: { code: TenantBlockingCode; message: string } | null
  setBlocked: (code: TenantBlockingCode, message: string) => void
  clear: () => void
}

export const useTenantStatusStore = create<TenantStatusState>((set) => ({
  blocked: null,
  setBlocked: (code, message) => set({ blocked: { code, message } }),
  clear: () => set({ blocked: null }),
}))
