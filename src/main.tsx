import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import { useAuthStore } from '@/stores/auth.store'
import { initSentry } from '@/lib/sentry'
import { queryClient } from '@/shared/api/queryClient'

initSentry()

useAuthStore.getState().hydrate()

// Solo Windows: marca la raíz para mostrar scrollbar inferior en tablas con desborde
// horizontal (en macOS los scrollbars son overlay y se ocultan por CSS global).
if (
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform === 'Windows' ||
  navigator.platform.indexOf('Win') === 0
) {
  document.documentElement.classList.add('os-windows')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div className="empty-state" style={{ minHeight: '100vh', justifyContent: 'center' }}>
          <div className="empty-title">Algo salió mal</div>
          <p className="empty-sub">
            Ocurrió un error inesperado. Ya quedó reportado — puedes intentar recargar la página.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => {
              resetError()
              window.location.reload()
            }}
          >
            Recargar
          </button>
        </div>
      )}
    >
      <QueryClientProvider client={queryClient}>
        <App />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
