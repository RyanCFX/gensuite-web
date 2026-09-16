import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, ShieldCheck, Building2 } from 'lucide-react'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { login, mfaVerify, mfaResend, switchTenant, googleOauthUrl, isApiError } from '@/shared/api/auth'
import { isMfaRequired } from '@/shared/api/types'
import type { MfaRequiredResult, AuthResult } from '@/shared/api/types'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §3.1/§3.5 — el login es global, no hace falta
// pedir tenant acá: se manda siempre `tenant: null` y, si la persona pertenece a más de una
// empresa, el paso de "elegí una empresa" (§3.5) resuelve cuál activar después del login.
const schema = z.object({
  email: z
    .string()
    .min(1, 'El correo es obligatorio')
    .email('Correo inválido'),
  password: z
    .string()
    .min(1, 'La contraseña es obligatoria'),
})

type FormValues = z.infer<typeof schema>

type Step = { kind: 'credentials' } | { kind: 'mfa'; mfa: MfaRequiredResult; tenant?: string | null } | { kind: 'select-tenant' }

export default function LoginPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next') ?? '/dashboard'

  const applyAuthResult = useAuthStore((s) => s.applyAuthResult)
  const applySwitchTenantResult = useAuthStore((s) => s.applySwitchTenantResult)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const memberships = useAuthStore((s) => s.memberships)
  const needsTenantSelection = useAuthStore((s) => s.needsTenantSelection)

  // Si ya había una sesión válida sin tenant resuelto (§3.5) — ej. la persona recargó la página
  // parada en el selector — saltamos directo a ese paso en vez de pedir credenciales de nuevo.
  const [step, setStep] = useState<Step>(() => (needsTenantSelection ? { kind: 'select-tenant' } : { kind: 'credentials' }))

  // El interceptor de axios redirige acá con ?sessionExpired=1 tras forzar un logout completo
  // (refresh_token inválido/reusado, ERPNEXT_AUTH_ERROR) — se trata como sesión inválida del
  // lado del usuario, un solo mensaje genérico.
  const [serverError, setServerError] = useState<string | null>(() =>
    params.get('sessionExpired') ? 'La sesión ha expirado, por favor vuelva a iniciar sesión.' : null,
  )
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (params.get('sessionExpired')) {
      const cleaned = new URLSearchParams(params)
      cleaned.delete('sessionExpired')
      setParams(cleaned, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  function finishWithMembershipCheck() {
    navigate(next, { replace: true })
  }

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const tenant = null
    try {
      const result = await login({ email: values.email, password: values.password, tenant })
      if (isMfaRequired(result)) {
        setStep({ kind: 'mfa', mfa: result, tenant })
        return
      }
      applyAuthResult(result)
      if (!result.access_token) {
        setStep({ kind: 'select-tenant' })
        return
      }
      finishWithMembershipCheck()
    } catch (error) {
      if (isApiError(error)) {
        if (error.statusCode === 429) {
          setIsRateLimited(true)
          return
        }
        setServerError(error.code === 'ACCOUNT_LOCKED' ? error.message : error.message)
      } else {
        setServerError('Error al conectar con el servidor. Intenta de nuevo.')
      }
    }
  }

  async function handlePickTenant(slug: string) {
    if (!refreshToken) return
    setServerError(null)
    try {
      const result = await switchTenant({ refreshToken, tenant: slug })
      applySwitchTenantResult(result)
      finishWithMembershipCheck()
    } catch (error) {
      setServerError(isApiError(error) ? error.message : 'Error al conectar con el servidor.')
    }
  }

  if (step.kind === 'mfa') {
    return (
      <MfaStep
        mfa={step.mfa}
        tenant={step.tenant}
        onBack={() => setStep({ kind: 'credentials' })}
        onSuccess={(result) => {
          applyAuthResult(result)
          if (!result.access_token) {
            setStep({ kind: 'select-tenant' })
            return
          }
          finishWithMembershipCheck()
        }}
      />
    )
  }

  if (step.kind === 'select-tenant') {
    const accepted = memberships.filter((m) => m.status === 'accepted')
    const pending = memberships.filter((m) => m.status === 'invited')
    return (
      <AuthLayout>
        <div className="auth-logo-wrap">
          <LogoMark size={38} />
        </div>
        <div className="auth-header">
          <h1 className="auth-title">Elige una empresa</h1>
          <p className="auth-sub">Perteneces a más de una empresa — elige con cuál quieres trabajar</p>
        </div>
        {serverError && <div className="auth-server-error" role="alert">{serverError}</div>}
        {accepted.length === 0 ? (
          <div className="auth-server-error" role="status">
            No tienes ninguna membresía activa todavía.
            {pending.length > 0 && ' Revisa tu correo para aceptar la invitación pendiente.'}
          </div>
        ) : (
          <div className="auth-form">
            {accepted.map((m) => (
              <button
                key={m.slug}
                type="button"
                className="btn btn-secondary auth-submit"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => handlePickTenant(m.slug)}
              >
                <Building2 size={16} />
                {m.name}
                {m.isDefault && <span className="badge badge-info" style={{ marginLeft: 'auto' }}>Por defecto</span>}
              </button>
            ))}
          </div>
        )}
        {pending.length > 0 && accepted.length > 0 && (
          <p className="auth-footer-note">
            Tienes {pending.length} invitación(es) pendiente(s) — revísalas en tu correo.
          </p>
        )}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="auth-logo-wrap">
        <LogoMark size={38} />
      </div>

      <div className="auth-header">
        <h1 className="auth-title">Iniciar sesión</h1>
        <p className="auth-sub">Ingresa tus credenciales para acceder al sistema</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError && (
          <div className="auth-server-error" role="alert">
            {serverError}
          </div>
        )}

        {isRateLimited && (
          <div className="auth-server-error" role="alert" aria-live="polite">
            Demasiados intentos. Espera unos segundos e intenta de nuevo.
          </div>
        )}
        <div className="form-field">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            type="email"
            placeholder="admin@empresa.com"
            autoComplete="email"
            autoFocus
            {...register('email')}
            data-error={!!errors.email}
          />
          {errors.email?.message && (
            <span className="form-error">{errors.email.message}</span>
          )}
        </div>

        <div className="form-field">
          <Label htmlFor="password">Contraseña</Label>
          <div className="form-input-wrap">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('password')}
              data-error={!!errors.password}
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
          {errors.password?.message && (
            <span className="form-error">{errors.password.message}</span>
          )}
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <Link to="/forgot-password" className="auth-link" style={{ fontSize: 13 }}>
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary auth-submit"
          disabled={isSubmitting || isRateLimited}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" />
              Iniciando sesión…
            </>
          ) : (
            'Iniciar sesión'
          )}
        </button>

        <a
          href={googleOauthUrl()}
          className="btn btn-secondary auth-submit"
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <GoogleLogo size={16} />
          Continuar con Google
        </a>
      </form>

      <p className="auth-footer-note">
        Al iniciar sesión, aceptas los{' '}
        <a href="#" className="auth-link">
          Términos de servicio
        </a>{' '}
        y la{' '}
        <a href="#" className="auth-link">
          Política de privacidad
        </a>
        .
      </p>
    </AuthLayout>
  )
}

// ─── Segundo paso: 2FA (§5.1) ────────────────────────────────────────────────
function MfaStep({ mfa, tenant, onBack, onSuccess }: {
  mfa: MfaRequiredResult
  tenant?: string | null
  onBack: () => void
  onSuccess: (result: AuthResult) => void
}) {
  const [factorId, setFactorId] = useState(mfa.factors[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const emailFactor = mfa.factors.find((f) => f.type === 'email')

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await mfaVerify({
        mfaToken: mfa.mfaToken,
        factorId: mfa.factors.length > 1 ? factorId : undefined,
        code: code.trim(),
        tenant,
      })
      onSuccess(result)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Error al conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setResending(true)
    try {
      await mfaResend(mfa.mfaToken)
      setResendCooldown(30)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'No se pudo reenviar el código.')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout>
      <div className="auth-logo-wrap">
        <LogoMark size={38} />
      </div>
      <div className="auth-header">
        <h1 className="auth-title" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <ShieldCheck size={22} /> Verificación en dos pasos
        </h1>
        <p className="auth-sub">
          {mfa.factors.length > 1
            ? 'Elige un factor e ingresa el código'
            : `Ingresa el código de ${mfa.factors[0]?.label ?? mfa.factors[0]?.type ?? 'tu segundo factor'}`}
        </p>
      </div>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {error && <div className="auth-server-error" role="alert">{error}</div>}

        {mfa.factors.length > 1 && (
          <div className="form-field">
            <Label htmlFor="factor">Factor</Label>
            <select id="factor" className="ff-input" value={factorId} onChange={(e) => setFactorId(e.target.value)}>
              {mfa.factors.map((f) => (
                <option key={f.id} value={f.id}>{f.label ?? f.type}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-field">
          <Label htmlFor="code">Código</Label>
          <Input
            id="code"
            type="text"
            placeholder="123456"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="ff-hint" style={{ margin: '4px 0 0' }}>
            Código de tu app de autenticación, de correo, o uno de tus códigos de recuperación (XXXXX-XXXXX).
          </p>
        </div>

        <button type="submit" className="btn btn-primary auth-submit" disabled={submitting || !code.trim()}>
          {submitting ? <><span className="spinner" /> Verificando…</> : 'Verificar'}
        </button>

        {emailFactor && (
          <button
            type="button"
            className="btn btn-ghost auth-submit"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : 'Reenviar código'}
          </button>
        )}

        <button type="button" className="btn btn-ghost auth-submit" onClick={onBack}>
          Volver
        </button>
      </form>
    </AuthLayout>
  )
}

// Logo oficial de Google ("G" de 4 colores) — inline a propósito, no depende de cargar un asset
// externo (y el botón de "Continuar con Google" es un <a> de navegación real, no puede fallar
// por una imagen que no cargó a tiempo).
function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.2-5.6l-6.6-5.6C29.6 34.7 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C39.9 37.1 44 31.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  )
}
