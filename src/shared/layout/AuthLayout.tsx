import { type ReactNode } from 'react'
import { Shield, Lock, Fingerprint } from 'lucide-react'
import bgImage from '@/assets/login_background.jpg'

interface AuthLayoutProps {
  children: ReactNode
  maxWidth?: number
}

export function AuthLayout({ children, maxWidth = 400 }: AuthLayoutProps) {
  return (
    <div className="auth-shell">
      <div className="auth-panel-left" aria-hidden="true">
        <img src={bgImage} alt="" className="auth-panel-img" />
        <div className="auth-panel-overlay" />
        <div className="auth-panel-content">
          <div className="auth-panel-tagline">
            <h2>
              Acceso seguro.
              <br />
              Control total.
            </h2>
            <p>Gestiona tu negocio con GenSuite — la plataforma ERP que cumple con la normativa DGII.</p>
          </div>
          <div className="auth-panel-badges">
            <span className="auth-panel-badge">
              <Shield size={12} />
              SSO + MFA
            </span>
            <span className="auth-panel-badge">
              <Lock size={12} />
              Cumplimiento DGII
            </span>
            <span className="auth-panel-badge">
              <Fingerprint size={12} />
              Zero Trust
            </span>
          </div>
        </div>
      </div>

      <div className="auth-panel-right">
        <div className="auth-panel-right-inner" style={{ maxWidth }}>
          {children}
        </div>
      </div>
    </div>
  )
}
