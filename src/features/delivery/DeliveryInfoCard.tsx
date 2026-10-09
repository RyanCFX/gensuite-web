import { useNavigate } from 'react-router-dom'
import { Truck } from 'lucide-react'
import type { InvoiceDelivery } from '@/shared/api/types'
import { formatMoney } from '@/lib/formatters'
import { DeliveryEntregaBadge, DeliveryCobroBadge } from './DeliveryBadges'

/**
 * Bloque delivery de la ficha de la factura (§2.3): dirección/teléfono/referencia,
 * estado de entrega, viaje y cobro (previsto, por conciliar, conciliado por/en).
 * Sin bloque no renderiza nada.
 */
export function DeliveryInfoCard({ delivery, currency, columns = 2 }: { delivery?: InvoiceDelivery | null; currency?: string; /** En drawer angosto colapsa a 1 columna. */ columns?: 1 | 2 }) {
  const navigate = useNavigate()
  if (!delivery?.esDelivery) return null
  const cobro = delivery.cobro

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header navy-card-header">
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Truck size={15} /> Delivery
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <DeliveryEntregaBadge estado={delivery.estado} />
          {cobro && <DeliveryCobroBadge estado={cobro.estado} />}
        </div>
      </div>
      <div className="card-body">
        <div className="fields-grid" style={columns === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
          {delivery.direccion && (
            <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
              <span className="detail-label">Dirección de entrega</span>
              <span className="detail-value">{delivery.direccion}</span>
            </div>
          )}
          {delivery.telefono && (
            <div className="detail-field">
              <span className="detail-label">Teléfono</span>
              <span className="detail-value">{delivery.telefono}</span>
            </div>
          )}
          {delivery.referencia && (
            <div className="detail-field">
              <span className="detail-label">Referencia</span>
              <span className="detail-value">{delivery.referencia}</span>
            </div>
          )}
          {delivery.viaje && (
            <div className="detail-field">
              <span className="detail-label">Viaje</span>
              <span className="detail-value">
                <button
                  style={{ fontFamily: 'var(--font-body)', color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => navigate(`/delivery/viajes/${encodeURIComponent(delivery.viaje!)}`)}
                >
                  {delivery.viaje}
                </button>
              </span>
            </div>
          )}
          {cobro && (
            <>
              {(cobro.previsto ?? []).length > 0 && (
                <div className="detail-field">
                  <span className="detail-label">Previsto a cobrar</span>
                  <span className="detail-value">
                    {cobro.previsto.map((p, i) => (
                      <span key={i} style={{ display: 'block' }}>
                        {p.modeOfPayment} — {formatMoney(p.amount, currency)}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {cobro.estado === 'por_conciliar' && (
                <div className="detail-field">
                  <span className="detail-label">Por conciliar</span>
                  <span className="detail-value" style={{ fontWeight: 600 }}>
                    {formatMoney(cobro.montoPorConciliar, currency)}
                  </span>
                </div>
              )}
              {cobro.conciliadoPor && (
                <div className="detail-field">
                  <span className="detail-label">Conciliado por</span>
                  <span className="detail-value">
                    {cobro.conciliadoPor}
                    {cobro.conciliadoEn ? ` — ${cobro.conciliadoEn}` : ''}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
