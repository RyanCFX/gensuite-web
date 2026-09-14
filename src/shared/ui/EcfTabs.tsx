import { useAuthStore } from '@/stores/auth.store'
import { RouteTabs } from './RouteTabs'

// Avanzado / Certificación DGII / Contingencia son ADMIN_ONLY_PATHS en el sidebar (AppLayout) —
// se ocultan aquí también para un usuario sin rol System Manager.
export function EcfTabs() {
  const user = useAuthStore((s) => s.user)
  const isSystemManager = user?.roles?.includes('System Manager') ?? false

  return (
    <RouteTabs
      tabs={[
        { label: 'Administración', path: '/config/ecf' },
        ...(isSystemManager
          ? [
              { label: 'Avanzado', path: '/config/ecf/admin' },
              { label: 'Certificación DGII', path: '/config/ecf/certificacion' },
              { label: 'Contingencia', path: '/config/ecf/contingencia' },
            ]
          : []),
      ]}
    />
  )
}
