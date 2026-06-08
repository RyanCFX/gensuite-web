import { useQuery } from '@tanstack/react-query'
import { getSemaforo } from '@/shared/api/cobros'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDOP, formatPct } from '@/lib/formatters'

export default function SemaforoPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['semaforo'],
    queryFn: getSemaforo,
  })

  return (
    <div className="page-container">
      <PageHeader
        title="Semáforo de Crédito"
        description="Estado de crédito por cliente"
      />

      <div>
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card">
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span className="skeleton-box" style={{ height: 20, width: 160, display: 'block' }} />
                  <span className="skeleton-box" style={{ height: 16, width: 96, display: 'block' }} />
                  <span className="skeleton-box" style={{ height: 8, width: '100%', display: 'block' }} />
                  <span className="skeleton-box" style={{ height: 16, width: 128, display: 'block' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div style={{ textAlign: 'center', color: 'var(--error-text)', padding: '32px 0' }}>
            Error al cargar el semáforo de crédito
          </div>
        )}

        {!isLoading && !isError && (!data || data.clientes.length === 0) && (
          <div className="empty-state">
            <p className="empty-title">Sin datos</p>
            <p className="empty-sub">No hay clientes con crédito activo.</p>
          </div>
        )}

        {data && data.clientes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {data.clientes.map((entry) => {
              const semaforoClass = entry.semaforo === 'verde'
                ? 'semaforo-verde'
                : entry.semaforo === 'amarillo'
                  ? 'semaforo-amarillo'
                  : 'semaforo-rojo'
              const semaforoLabel = entry.semaforo === 'verde' ? 'Normal' : entry.semaforo === 'amarillo' ? 'Alerta' : 'Crítico'
              const barColor = entry.semaforo === 'verde'
                ? 'var(--success-text)'
                : entry.semaforo === 'amarillo'
                  ? 'var(--warning-text)'
                  : 'var(--error-text)'

              const borderColor = entry.semaforo === 'verde'
                ? 'var(--success-text)'
                : entry.semaforo === 'amarillo'
                  ? 'var(--warning-text)'
                  : 'var(--error-text)'

              const pct = Math.min(entry.pctUsado ?? 0, 100)

              return (
                <div
                  key={entry.customer}
                  className="card"
                  style={{ borderLeft: `4px solid ${borderColor}` }}
                >
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{entry.customerName}</span>
                      <span className={`semaforo ${semaforoClass}`} style={{ flexShrink: 0 }}>
                        <span className="semaforo-dot" />
                        {semaforoLabel}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <span>Uso del crédito</span>
                        <span style={{ fontWeight: 500 }}>{formatPct(pct)}</span>
                      </div>
                      <div style={{ height: 6, width: '100%', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 'var(--radius-full)', transition: 'width 0.3s' }} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Balance actual</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{formatDOP(entry.balance)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Límite de crédito</p>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{formatDOP(entry.creditLimit)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
