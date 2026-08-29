// Progreso de certificación DGII (F9) — pantalla de solo lectura. La certificación real se opera
// desde el panel de Aura/DGII; aquí solo se consulta el avance del trámite de 14 pasos.
//
// CONSTANCIA: construido contra la API; las pruebas end-to-end con un tenant en trámite de
// certificación siguen pendientes.

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Info, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getEcfConfig } from '@/shared/api/config'
import { getEcfCertificacion } from '@/shared/api/ecf'
import type { EcfMode } from '@/shared/api/types'
import { useAuthStore } from '@/stores/auth.store'

function CertificacionContent({ company, activeMode }: { company: string; activeMode: EcfMode | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ecf-certificacion', company],
    queryFn: () => getEcfCertificacion(company),
  })

  const certified = data?.certified ?? data?.stage === 'CERTIFIED'
  const hasProgreso = typeof data?.paso === 'number' && typeof data?.totalPasos === 'number' && data.totalPasos > 0
  const pct = hasProgreso ? Math.min(100, Math.round((data!.paso! / data!.totalPasos!) * 100)) : 0

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Estado de la certificación</span>
        {!isLoading && !isError && (
          certified
            ? <span className="badge badge-success">Certificado</span>
            : <span className="badge badge-warning">En trámite</span>
        )}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading ? (
          <span className="skeleton-box" style={{ height: 64, display: 'block' }} />
        ) : isError || !data ? (
          <p className="ff-hint" style={{ margin: 0 }}>No se pudo cargar el progreso de certificación.</p>
        ) : (
          <>
            {activeMode === 'live' && !certified && (
              <div className="inline-alert inline-alert-warn">
                <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span>
                  Este tenant está en modo Producción pero aún no está certificado — no podrá habilitar
                  facturación electrónica <code>live</code> hasta completar la certificación.
                </span>
              </div>
            )}
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Estado actual
              </p>
              <p style={{ fontSize: 15, fontWeight: 600 }}>{data.stageLabel}</p>
            </div>
            {hasProgreso && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 6, background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: certified ? 'var(--success-text)' : 'var(--brand-primary)', borderRadius: 'var(--radius-full)' }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  {data.paso}/{data.totalPasos}
                </span>
              </div>
            )}
            {certified ? (
              <p className="ff-hint" style={{ margin: 0, color: 'var(--success-text)' }}>
                Certificación completa — ya puedes emitir en modo Producción.
              </p>
            ) : (
              data.siguientePaso && (
                <div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Siguiente paso
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{data.siguientePaso}</p>
                </div>
              )
            )}
            <p className="ff-hint" style={{ margin: 0 }}>
              La certificación se completa desde el panel de Aura/DGII, no desde aquí. Esta pantalla es solo de consulta.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function EcfCertificacionPage() {
  const isSystemManager = useAuthStore((s) => s.user?.roles?.includes('System Manager') ?? false)
  const { data, isLoading } = useQuery({ queryKey: ['ecf-config'], queryFn: getEcfConfig })

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader overline="Facturación Electrónica" title="Certificación DGII" />
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <span className="empty-icon" aria-hidden="true" style={{ fontSize: 24 }}>🔒</span>
          <p className="empty-title">No tienes acceso a esta sección</p>
          <p className="empty-sub">Requiere el rol «System Manager» en este tenant.</p>
        </div>
      </div>
    )
  }

  const company = data?.company ?? ''
  const activeMode: EcfMode | null = data?.provisioning?.activeMode ?? null

  return (
    <div className="page-container">
      <PageHeader
        overline="Facturación Electrónica"
        title="Certificación DGII"
        description="Progreso del trámite de certificación (solo lectura)"
        action={<Link className="btn btn-ghost btn-size-sm" to="/config/ecf/admin"><ShieldCheck size={14} /> Provisioning</Link>}
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isLoading ? (
          <span className="skeleton-box" style={{ height: 200, display: 'block' }} />
        ) : !company ? (
          <div className="inline-alert inline-alert-info">
            <Info size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>
              Este tenant todavía no está conectado a Aura. Conéctalo desde{' '}
              <Link to="/config/ecf/admin">Provisioning</Link> para consultar la certificación.
            </span>
          </div>
        ) : (
          <CertificacionContent company={company} activeMode={activeMode} />
        )}
      </div>
    </div>
  )
}
