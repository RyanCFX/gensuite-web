import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { isApiError } from '@/shared/api/auth'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z
    .string()
    .min(1, 'El correo es obligatorio')
    .email('Correo inválido'),
  password: z
    .string()
    .min(1, 'La contraseña es obligatoria'),
  tenant: z
    .string()
    .min(1, 'El tenant es obligatorio'),
})

type FormValues = z.infer<typeof schema>

const TENANT_ERROR_MESSAGES: Record<string, string> = {
  TENANT_NOT_FOUND: 'El tenant no existe. Verifica el slug e intenta de nuevo.',
  TENANT_INACTIVE: 'Esta organización se encuentra desactivada.',
  TENANT_DISABLED: 'Esta organización se encuentra desactivada.',
  TENANT_SUSPENDED: 'Esta organización está suspendida. Contacta a soporte.',
}

export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next') ?? '/dashboard'

  const [serverError, setServerError] = useState<string | null>(null)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const authLogin = useAuthStore((s) => s.login)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tenant: 'tenant1' },
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)

    try {
      await authLogin(values.email, values.password, values.tenant)
      navigate(next, { replace: true })
    } catch (error) {
      if (isApiError(error)) {
        if (error.statusCode === 429) {
          setIsRateLimited(true)
          return
        }
        setServerError(TENANT_ERROR_MESSAGES[error.code] ?? error.message)
      } else {
        setServerError('Error al conectar con el servidor. Intenta de nuevo.')
      }
    }
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
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            {...register('password')}
            data-error={!!errors.password}
          />
          {errors.password?.message && (
            <span className="form-error">{errors.password.message}</span>
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
          {errors.tenant?.message && (
            <span className="form-error">{errors.tenant.message}</span>
          )}
        </div>

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
