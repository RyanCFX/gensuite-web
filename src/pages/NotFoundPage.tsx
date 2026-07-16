import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/shared/layout/AuthLayout'
import { ArrowRight } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <AuthLayout maxWidth={340}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text-primary)' }}>
          404
        </div>
        <div className="auth-header" style={{ marginTop: 16 }}>
          <h1 className="auth-title">¡Ups! Página no encontrada.</h1>
          <p className="auth-sub">La página que buscas no existe o fue movida.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Ir al Dashboard <ArrowRight size={16} />
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Volver atrás
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}
