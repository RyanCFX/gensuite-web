import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import LogoMark from '@/components/LogoMark'
import { forgotPassword, isApiError } from '@/shared/api/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  tenant: z.string().min(1, 'El tenant es obligatorio'),
})

type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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
      const result = await forgotPassword({ email: values.email }, values.tenant)
      setSuccessMessage(result.message)
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
        <h1 className="auth-title">Recuperar contraseña</h1>
        <p className="auth-sub">Ingresa tu correo y te enviaremos instrucciones para restablecerla</p>
      </div>

      {successMessage ? (
        <>
          <div className="auth-server-error" role="status" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', borderColor: 'var(--success-border)' }}>
            {successMessage}
          </div>
          <p className="auth-footer-note">
            <Link to="/login" className="auth-link">Volver a iniciar sesión</Link>
          </p>
        </>
      ) : (
        <>
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
              {errors.email?.message && <span className="form-error">{errors.email.message}</span>}
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
                  Enviando…
                </>
              ) : (
                'Enviar instrucciones'
              )}
            </button>
          </form>

          <p className="auth-footer-note">
            <Link to="/login" className="auth-link">Volver a iniciar sesión</Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}
