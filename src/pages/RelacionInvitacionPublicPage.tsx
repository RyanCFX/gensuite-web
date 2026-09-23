import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { isApiError } from '@/shared/api/auth'
import {
  getInvitacionRelacionPorToken,
  aceptarInvitacionRelacionPorToken,
  rechazarInvitacionRelacionPorToken,
} from '@/shared/api/relaciones'
import { formatDateTime } from '@/lib/formatters'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import type { InvitacionPublicaEstado, InvitacionPublicaResumen } from '@/shared/api/types'

// Pantalla pública (sin login) que abre el link de correo de una invitación de Relación
// Comercial — ruta `/relaciones/invitacion?token=...`. Clona el patrón de src/pages/
// InvitationPage.tsx (AuthLayout + clases auth-*), pero NUNCA usa el store de auth: esta pantalla
// jamás inicia sesión, solo confirma la respuesta a la invitación. `email` es puramente
// informativo (nunca se trata como autenticación — el backend tampoco lo valida).

type ViewState =
  | { kind: 'loading' }
  // Solo el GET inicial devuelve este 404 "amable" — distinto del 404 de un POST tardío (ver abajo).
  | { kind: 'get-not-found' }
  // Mismo mensaje para: estado 'expirada' del GET, un 410 de un POST tardío, Y un 404 de un POST
  // tardío — nunca se revela al usuario si el token nunca existió o si venció entretanto.
  | { kind: 'expired' }
  | { kind: 'network-error' }
  | { kind: 'pendiente'; resumen: InvitacionPublicaResumen }
  | { kind: 'resultado'; estado: InvitacionPublicaEstado; resultado?: { respondidoEl: string; motivo: string | null } }

type Accion = 'ninguna' | 'aceptar' | 'rechazar'

function getStatusCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('statusCode' in err)) return undefined
  return (err as { statusCode?: number }).statusCode
}

/** Un 409 de aceptar/rechazar trae, en el body del error, un `resultado` con el mismo shape que
 *  el GET "ya respondida" (Fase 04 §4) — se usa para mostrar esa pantalla final directamente en
 *  vez de un toast genérico. Se lee de forma defensiva: si el shape no calza, no se bloquea la
 *  pantalla, solo se cae al mensaje genérico. */
function extractResumenFrom409(err: unknown): InvitacionPublicaResumen | null {
  if (typeof err !== 'object' || err === null) return null
  const details = (err as { details?: unknown }).details
  if (typeof details !== 'object' || details === null) return null
  const resultado = (details as { resultado?: unknown }).resultado
  if (typeof resultado !== 'object' || resultado === null || !('estado' in resultado)) return null
  return resultado as InvitacionPublicaResumen
}

const RESULTADO_TITULO: Record<string, string> = {
  aceptada: 'Invitación aceptada',
  rechazada: 'Invitación rechazada',
  cancelada: 'Invitación cancelada',
}

export default function RelacionInvitacionPublicPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const [accion, setAccion] = useState<Accion>('ninguna')
  const [email, setEmail] = useState('')
  const [motivo, setMotivo] = useState('')
  const [bloquear, setBloquear] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la pantalla pública a partir del ?token= de la URL
      setState({ kind: 'get-not-found' })
      return
    }
    getInvitacionRelacionPorToken(token)
      .then((resumen) => {
        if (resumen.estado === 'pendiente') setState({ kind: 'pendiente', resumen })
        else if (resumen.estado === 'expirada') setState({ kind: 'expired' })
        else setState({ kind: 'resultado', estado: resumen.estado, resultado: resumen.resultado })
      })
      .catch((err) => {
        if (getStatusCode(err) === 404) {
          setState({ kind: 'get-not-found' })
          return
        }
        setState({ kind: 'network-error' })
      })
  }, [token])

  function handlePostError(err: unknown) {
    const statusCode = getStatusCode(err)
    if (statusCode === 410 || statusCode === 404) {
      setState({ kind: 'expired' })
      return
    }
    if (statusCode === 409) {
      const resumen = extractResumenFrom409(err)
      if (resumen) {
        setState({ kind: 'resultado', estado: resumen.estado, resultado: resumen.resultado })
        return
      }
    }
    setFormError(isApiError(err) ? err.message : 'Error al conectar con el servidor.')
  }

  async function handleAceptar() {
    setSubmitting(true)
    setFormError(null)
    try {
      const resumen = await aceptarInvitacionRelacionPorToken(token, { email: email.trim() || undefined })
      setState({ kind: 'resultado', estado: resumen.estado, resultado: resumen.resultado })
    } catch (err) {
      handlePostError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRechazar() {
    setSubmitting(true)
    setFormError(null)
    try {
      const resumen = await rechazarInvitacionRelacionPorToken(token, {
        motivo: motivo.trim() || undefined,
        bloquear,
        email: email.trim() || undefined,
      })
      setState({ kind: 'resultado', estado: resumen.estado, resultado: resumen.resultado })
    } catch (err) {
      handlePostError(err)
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

      {state.kind === 'get-not-found' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">Invitación no disponible</h1>
          </div>
          <div className="auth-server-error" role="alert">Esta invitación no existe o ya no está disponible.</div>
        </>
      )}

      {state.kind === 'network-error' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">Invitación no disponible</h1>
          </div>
          <div className="auth-server-error" role="alert">Error al conectar con el servidor.</div>
        </>
      )}

      {state.kind === 'expired' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">Invitación vencida</h1>
            <p className="auth-sub">Esta invitación venció. Pida que se la reenvíen.</p>
          </div>
        </>
      )}

      {state.kind === 'resultado' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">{RESULTADO_TITULO[state.estado] ?? 'Invitación respondida'}</h1>
            {state.resultado?.respondidoEl && (
              <p className="auth-sub">Respondida el {formatDateTime(state.resultado.respondidoEl)}</p>
            )}
            {state.resultado?.motivo && (
              <p className="auth-sub">Motivo: {state.resultado.motivo}</p>
            )}
          </div>
        </>
      )}

      {state.kind === 'pendiente' && (
        <>
          <div className="auth-header">
            <h1 className="auth-title">Invitación de {state.resumen.empresaOrigen.nombre}</h1>
            <p className="auth-sub">
              {state.resumen.empresaOrigen.rnc && <>RNC {state.resumen.empresaOrigen.rnc} · </>}
              te invita a formalizar una relación comercial con {state.resumen.empresaDestino.nombre}.
            </p>
          </div>

          {state.resumen.mensaje && (
            <div className="inline-alert inline-alert-info" style={{ marginBottom: 12 }}>
              {state.resumen.mensaje}
            </div>
          )}

          {state.resumen.terminosPropuestos && (
            <p className="auth-footer-note" style={{ marginBottom: 12 }}>
              Términos propuestos: {state.resumen.terminosPropuestos.tieneCredito
                ? `crédito de ${state.resumen.terminosPropuestos.diasCredito ?? '—'} días`
                : 'sin crédito'}
            </p>
          )}

          {formError && <div className="auth-server-error" role="alert">{formError}</div>}

          {accion === 'ninguna' && (
            <div className="auth-form">
              <button type="button" className="btn btn-primary auth-submit" onClick={() => setAccion('aceptar')}>
                Aceptar
              </button>
              <button type="button" className="btn btn-danger auth-submit" onClick={() => setAccion('rechazar')}>
                Rechazar
              </button>
            </div>
          )}

          {accion === 'aceptar' && (
            <div className="auth-form">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="email-aceptar">
                  Tu correo (opcional)
                  <FieldTooltip>Solo para que sepamos quién confirmó — no crea ninguna cuenta ni inicia sesión.</FieldTooltip>
                </label>
                <input
                  id="email-aceptar"
                  type="email"
                  className="ff-input"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <button type="button" className="btn btn-primary auth-submit" disabled={submitting} onClick={handleAceptar}>
                {submitting ? <><span className="spinner" /> Aceptando…</> : 'Confirmar aceptación'}
              </button>
              <button type="button" className="btn btn-ghost auth-submit" disabled={submitting} onClick={() => setAccion('ninguna')}>
                Volver
              </button>
            </div>
          )}

          {accion === 'rechazar' && (
            <div className="auth-form">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="motivo-rechazar">Motivo (opcional)</label>
                <textarea
                  id="motivo-rechazar"
                  className="ff-textarea"
                  rows={3}
                  maxLength={500}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="email-rechazar">Tu correo (opcional)</label>
                <input
                  id="email-rechazar"
                  type="email"
                  className="ff-input"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={bloquear}
                  disabled={submitting}
                  onChange={(e) => setBloquear(e.target.checked)}
                />
                Bloquear esta empresa
              </label>
              <button type="button" className="btn btn-danger auth-submit" disabled={submitting} onClick={handleRechazar}>
                {submitting ? <><span className="spinner" /> Rechazando…</> : 'Confirmar rechazo'}
              </button>
              <button type="button" className="btn btn-ghost auth-submit" disabled={submitting} onClick={() => setAccion('ninguna')}>
                Volver
              </button>
            </div>
          )}
        </>
      )}

      <p className="auth-footer-note">
        <Link to="/login" className="auth-link">Ir a iniciar sesión</Link>
      </p>
    </AuthLayout>
  )
}
