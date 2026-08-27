import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { resetPassword, completeRegistration, isApiError } from '@/shared/api/auth'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z
  .object({
    tenant: z.string().min(1, 'El tenant es obligatorio'),
    newPassword: z.string().min(1, 'La contraseña es obligatoria'),
    confirmPassword: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

interface Props {
  mode: 'reset' | 'complete'
}

export default function ResetPasswordFormPage({ mode }: Props) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)

  const key = params.get('key') ?? ''
  const email = params.get('email') ?? ''

  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tenant: 'tenant1' },
  })

  const missingLinkData = !key || !email

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      const dto = { email, key, newPassword: values.newPassword }
      const result = mode === 'reset'
        ? await resetPassword(dto, values.tenant)
        : await completeRegistration(dto, values.tenant)
      setSession(result)
      navigate('/dashboard', { replace: true })
    } catch (error) {
      if (isApiError(error)) {
        setServerError(error.message)
      } else {
        setServerError('Error al conectar con el servidor. Intenta de nuevo.')
      }
    }
  }

  const title = mode === 'reset' ? 'Restablecer contraseña' : 'Completar registro'
  const sub = mode === 'reset'
    ? 'Elige una nueva contraseña para tu cuenta'
    : 'Bienvenido, elige tu contraseña para comenzar'

  return (
    <AuthLayout>
      <div className="auth-logo-wrap">
        <LogoMark size={38} />
      </div>

      <div className="auth-header">
        <h1 className="auth-title">{title}</h1>
        <p className="auth-sub">{sub}</p>
      </div>

      {missingLinkData ? (
        <div className="auth-server-error" role="alert">
          El enlace es inválido. Verifica que hayas copiado el enlace completo desde tu correo.
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="form-field">
            <Label>Correo electrónico</Label>
            <Input type="email" value={email} disabled readOnly />
          </div>

          <div className="form-field">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <div className="form-input-wrap">
              <Input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                autoFocus
                {...register('newPassword')}
                data-error={!!errors.newPassword}
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
            {errors.newPassword?.message && <span className="form-error">{errors.newPassword.message}</span>}
          </div>

          <div className="form-field">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
              data-error={!!errors.confirmPassword}
            />
            {errors.confirmPassword?.message && (
              <span className="form-error">{errors.confirmPassword.message}</span>
            )}
          </div>

          <div className="form-field">
            <Label htmlFor="tenant">Tenant</Label>
            <Input
              id="tenant"
              type="text"
              placeholder="tenant1"
              autoComplete="organization"
              {...register('tenant')}
              data-error={!!errors.tenant}
            />
            {errors.tenant?.message && <span className="form-error">{errors.tenant.message}</span>}
          </div>

          {serverError && (
            <div className="auth-server-error" role="alert">
              {serverError}
            </div>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="spinner" />
                Guardando…
              </>
            ) : (
              'Guardar contraseña'
            )}
          </button>
        </form>
      )}

      {(missingLinkData || serverError) && mode === 'reset' && (
        <p className="auth-footer-note">
          <Link to="/forgot-password" className="auth-link">Solicitar un nuevo enlace</Link>
        </p>
      )}
    </AuthLayout>
  )
}
