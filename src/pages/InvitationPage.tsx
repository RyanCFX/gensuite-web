import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { getInvitation, acceptInvitation, rejectInvitation, isApiError } from '@/shared/api/auth'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InvitationDetail } from '@/shared/api/types'

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §7.4 — TU_FRONTEND/invitacion?token=...
type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'detail'; detail: InvitationDetail }
  | { kind: 'rejected' }

export default function InvitationPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const applyAuthResult = useAuthStore((s) => s.applyAuthResult)
  const token = params.get('token') ?? ''

  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const [showForm, setShowForm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', message: 'El enlace es inválido. Verifica que hayas copiado el enlace completo desde tu correo.' })
      return
    }
    getInvitation(token)
      .then((detail) => setState({ kind: 'detail', detail }))
      .catch((err) => {
        if (isApiError(err) && err.statusCode === 410) {
          setState({ kind: 'error', message: 'Este enlace ya se usó o expiró. Pídele a un administrador de la empresa que te reenvíe la invitación.' })
          return
        }
        if (isApiError(err) && err.statusCode === 404) {
          setState({ kind: 'error', message: 'Este enlace de invitación no existe.' })
          return
        }
        setState({ kind: 'error', message: isApiError(err) ? err.message : 'Error al conectar con el servidor.' })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleAccept(detail: InvitationDetail) {
    setFormError(null)
    if (detail.requiresPassword && !showForm) {
      setShowForm(true)
      return
    }
    if (detail.requiresPassword && password !== confirmPassword) {
      setFormError('Las contraseñas no coinciden')
      return
    }
    if (detail.requiresPassword && password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setSubmitting(true)
    try {
      const result = await acceptInvitation(token, detail.requiresPassword ? { password } : {})
      applyAuthResult(result)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Error al conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    setSubmitting(true)
    setFormError(null)
    try {
      await rejectInvitation(token)
      setState({ kind: 'rejected' })
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Error al conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-logo-wrap">
        <LogoMark size={38} />
      </div>

      {state.kind === 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <span className="spinner" />
        </div>
      )}

      {state.kind === 'error' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">Invitación no disponible</h1>
          </div>
          <div className="auth-server-error" role="alert">{state.message}</div>
          <p className="auth-footer-note"><Link to="/login" className="auth-link">Ir a iniciar sesión</Link></p>
        </>
      )}

      {state.kind === 'rejected' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">Invitación rechazada</h1>
            <p className="auth-sub">Rechazaste la invitación a {/* tenantName ya no disponible en este estado, es intencional — la pantalla es de confirmación simple */} esta empresa.</p>
          </div>
          <p className="auth-footer-note"><Link to="/login" className="auth-link">Ir a iniciar sesión</Link></p>
        </>
      )}

      {state.kind === 'detail' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">Invitación a {state.detail.tenantName}</h1>
            <p className="auth-sub">
              Te invitaron a unirte como <strong>{state.detail.email}</strong>. ¿Aceptas?
            </p>
          </div>

          {formError && <div className="auth-server-error" role="alert">{formError}</div>}

          {showForm && state.detail.requiresPassword ? (
            <div className="auth-form">
              <div className="form-field">
                <Label htmlFor="password">Elige tu contraseña</Label>
                <div className="form-input-wrap">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="form-input-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-field">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary auth-submit"
                disabled={submitting || !password || !confirmPassword}
                onClick={() => handleAccept(state.detail)}
              >
                {submitting ? <><span className="spinner" /> Aceptando…</> : 'Aceptar y crear mi cuenta'}
              </button>
              <button type="button" className="btn btn-ghost auth-submit" onClick={() => setShowForm(false)} disabled={submitting}>
                Volver
              </button>
            </div>
          ) : (
            <div className="auth-form">
              <button
                type="button"
                className="btn btn-primary auth-submit"
                disabled={submitting}
                onClick={() => handleAccept(state.detail)}
              >
                {submitting && !state.detail.requiresPassword ? <><span className="spinner" /> Aceptando…</> : 'Aceptar'}
              </button>
              <button type="button" className="btn btn-danger auth-submit" disabled={submitting} onClick={handleReject}>
                Rechazar
              </button>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  )
}
