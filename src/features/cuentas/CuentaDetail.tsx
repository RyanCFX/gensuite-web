import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCuenta } from '@/shared/api/cuentas'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Pencil, Info } from 'lucide-react'

function rootTypeBadgeStyle(rootType: string): React.CSSProperties {
  switch (rootType) {
    case 'Asset':
      return { background: 'var(--info-bg)', color: 'var(--info-text)' }
    case 'Liability':
      return { background: 'var(--warning-bg)', color: 'var(--warning-text)' }
    case 'Equity':
      return { background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }
    case 'Income':
      return { background: 'var(--success-bg)', color: 'var(--success-text)' }
    case 'Expense':
      return { background: 'var(--error-bg)', color: 'var(--error-text)' }
    default:
      return {}
  }
}

function reportTypeLabel(reportType: string): string {
  return reportType === 'Profit and Loss' ? 'Estado de Resultados' : 'Balance General'
}

function rootTypeLabel(rootType: string): string {
  const map: Record<string, string> = {
    Asset: 'Activo',
    Liability: 'Pasivo',
    Equity: 'Patrimonio',
    Income: 'Ingreso',
    Expense: 'Gasto',
  }
  return map[rootType] ?? rootType
}

export default function CuentaDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: cuenta, isLoading, isError } = useQuery({
    queryKey: ['cuenta', id],
    queryFn: () => getCuenta(decodeURIComponent(id!)),
    enabled: Boolean(id),
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 160, height: 16, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: 300, height: 28, marginBottom: 20 }} />
        <div className="stats-row" style={{ marginBottom: 20 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton-box" style={{ height: 16, width: 80, marginBottom: 8 }} />
              <div className="skeleton-box" style={{ height: 24, width: 120 }} />
            </div>
          ))}
        </div>
        <div className="skeleton-box" style={{ width: '100%', height: 200, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (isError || !cuenta) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--color-error)' }}>Error al cargar la cuenta</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/cuentas')}>
          Volver
        </button>
      </div>
    )
  }

  const hasMovements = (cuenta.debit + cuenta.credit) > 0

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="page-back-link" onClick={() => navigate('/cuentas')}>
            <ArrowLeft size={14} /> Plan de Cuentas
          </button>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {cuenta.accountName}
            <span
              className="badge"
              style={{ ...rootTypeBadgeStyle(cuenta.rootType), fontSize: 12 }}
            >
              {rootTypeLabel(cuenta.rootType)}
            </span>
            {cuenta.disabled && (
              <span className="badge badge-error" style={{ fontSize: 12 }}>Deshabilitada</span>
            )}
          </h1>
          {cuenta.accountNumber && (
            <p className="page-sub" style={{ fontFamily: 'monospace' }}>{cuenta.accountNumber}</p>
          )}
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => navigate(`/cuentas/${encodeURIComponent(cuenta.id)}/editar`)}
        >
          <Pencil size={14} />
          Editar
        </button>
      </div>

      {/* KPI stat-cards */}
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Débitos Totales</span>
          </div>
          <span className="stat-value">{formatDOP(cuenta.debit)}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Créditos Totales</span>
          </div>
          <span className="stat-value">{formatDOP(cuenta.credit)}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Saldo</span>
          </div>
          <span className="stat-value">{formatDOP(cuenta.balance)}</span>
        </div>
      </div>

      {/* Alerts */}
      {!hasMovements && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          Esta cuenta no tiene movimientos contables.
        </div>
      )}
      {cuenta.isGroup && (
        <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16 }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          Esta es una cuenta grupo y no acepta transacciones directas.
        </div>
      )}

      {/* Fields card */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Detalles</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Tipo de Cuenta</span>
              <span className="detail-value">{cuenta.accountType ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Raíz</span>
              <span className="detail-value">
                <span
                  className="badge"
                  style={{ ...rootTypeBadgeStyle(cuenta.rootType), fontSize: 11 }}
                >
                  {rootTypeLabel(cuenta.rootType)}
                </span>
              </span>
            </div>
            {cuenta.reportType && (
              <div className="detail-field">
                <span className="detail-label">Tipo de Reporte</span>
                <span className="detail-value">
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                    {reportTypeLabel(cuenta.reportType)}
                  </span>
                </span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Moneda</span>
              <span className="detail-value">{cuenta.currency}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cuenta Padre</span>
              <span className="detail-value">{cuenta.parentAccount ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Código</span>
              <span className="detail-value" style={{ fontFamily: 'monospace' }}>
                {cuenta.accountNumber ?? '—'}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Es Grupo</span>
              <span className="detail-value">
                {cuenta.isGroup
                  ? <span className="badge badge-submitted">Sí</span>
                  : <span className="badge badge-draft">No</span>}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
