import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { oauthExchange, isApiError } from '@/shared/api/auth'
import { useAuthStore } from '@/stores/auth.store'

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §8.1/§8.3 — el backend redirige acá con
// ?ticket=... (éxito) o ?error=... (falla), nunca los dos.
const ERROR_MESSAGES: Record<string, string> = {
  OAUTH_NO_ACCOUNT:
    'No hay ninguna cuenta registrada con ese correo de Google. Si tu empresa ya te invitó, revisá tu bandeja de entrada; si no, pedile a un administrador que te invite primero.',
  OAUTH_ERROR: 'No se pudo completar el inicio de sesión con Google. Intentá de nuevo.',
}

export default function OauthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const applyAuthResult = useAuthStore((s) => s.applyAuthResult)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ticket = params.get('ticket')
    const errorParam = params.get('error')

    if (errorParam) {
      setError(ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.OAUTH_ERROR)
      return
    }
    if (!ticket) {
      setError(ERROR_MESSAGES.OAUTH_ERROR)
      return
    }
    oauthExchange({ ticket })
      .then((result) => {
        applyAuthResult(result)
        navigate(result.access_token ? '/dashboard' : '/login', { replace: true })
      })
      .catch((err) => {
        setError(isApiError(err) ? err.message : ERROR_MESSAGES.OAUTH_ERROR)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthLayout>
      <div className="auth-logo-wrap">
        <LogoMark size={38} />
      </div>
      {error ? (
        <>
          <div className="auth-header">
            <h1 className="auth-title">No se pudo iniciar sesión</h1>
          </div>
          <div className="auth-server-error" role="alert">{error}</div>
          <p className="auth-footer-note"><Link to="/login" className="auth-link">Volver a iniciar sesión</Link></p>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
          <span className="spinner" />
          <p className="auth-sub">Completando inicio de sesión con Google…</p>
        </div>
      )}
    </AuthLayout>
  )
}
