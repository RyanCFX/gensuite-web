import type { ReactNode } from 'react'
import { IsRestoringProvider } from '@tanstack/react-query'
import { useTabActiva } from '@/shared/hooks/useTabActiva'

/**
 * Con multipestañas las pantallas viven en <KeepAlive>: al cambiar de pestaña la anterior queda
 * montada (oculta) y sus `useQuery` seguirían activos, así que "Recargar" o cualquier refetch
 * global volvía a pedir datos de pantallas que el usuario ni está viendo.
 *
 * Mientras la pantalla no es la visible se marca como "restaurando": sus observers dejan de
 * suscribirse (las queries pasan a inactivas, no se refrescan solas ni por invalidación). Al volver
 * a la pestaña se re-suscriben y React Query solo re-pide lo que ya venció (`staleTime`).
 */
export function ScreenQueryGate({ children }: { children: ReactNode }) {
  const activa = useTabActiva()
  return <IsRestoringProvider value={!activa}>{children}</IsRestoringProvider>
}
