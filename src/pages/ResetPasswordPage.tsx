import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { resetPassword, isApiError } from '@/shared/api/auth'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §7.3 — un solo `token` en la URL, global, sin
// email/key/tenant. El link del correo apunta a TU_FRONTEND/reset-password?token=...
const schema = z
  .object({
    newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma la contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const applyAuthResult = useAuthStore((s) => s.applyAuthResult)

  const token = params.get('token') ?? ''

  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      const result = await resetPassword({ token, newPassword: values.newPassword })
      applyAuthResult(result)
      navigate(result.access_token ? '/dashboard' : '/login', { replace: true })
    } catch (error) {
      if (isApiError(error)) {
        setServerError(error.message)
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
        <h1 className="auth-title">Restablecer contraseña</h1>
        <p className="auth-sub">Elige una nueva contraseña para tu cuenta</p>
      </div>

      {!token ? (
        <div className="auth-server-error" role="alert">
          El enlace es inválido. Verifica que hayas copiado el enlace completo desde tu correo.
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
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
            {errors.confirmPassword?.message && <span className="form-error">{errors.confirmPassword.message}</span>}
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
              'Restablecer contraseña'
            )}
          </button>
        </form>
      )}

      <p className="auth-footer-note">
        <Link to="/login" className="auth-link">Volver a iniciar sesión</Link>
      </p>
    </AuthLayout>
  )
}
