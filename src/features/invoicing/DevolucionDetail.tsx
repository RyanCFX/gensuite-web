import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getDevolucion } from '@/shared/api/devoluciones'
import { ArrowLeft, Receipt, Wallet } from 'lucide-react'
import { formatDate, formatDOP } from '@/lib/formatters'
import { NCF_TYPES } from '@/lib/constants'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

const USAGE_LABEL: Record<string, string> = {
  available: 'Disponible',
  partially_used: 'Parcialmente usada',
  fully_used: 'Agotada',
}
const USAGE_BADGE: Record<string, string> = {
  available: 'badge-success',
  partially_used: 'badge-warning',
  fully_used: 'badge-neutral',
}

export default function DevolucionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: devolucion, isLoading } = useQuery({
    queryKey: ['devolucion', id],
    queryFn: () => getDevolucion(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 280, height: 28, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 128, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 256, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (!devolucion) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-title">Devolución no encontrada</div>
          <button className="btn btn-ghost btn-size-sm" onClick={() => navigate('/devoluciones')}>
            Volver a devoluciones
          </button>
        </div>
      </div>
    )
  }

  const ncfLabel = NCF_TYPES.find((t) => t.value === devolucion.ncfType)?.label
  const usageStatus = devolucion.usageStatus

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/devoluciones')}>
            <ArrowLeft size={14} /> Devoluciones
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Devolución {devolucion.ncf ?? devolucion.creditNoteId}
            <span className={`badge ${STATUS_BADGE[devolucion.documentStatus] ?? 'badge-neutral'}`}>
              {STATUS_LABEL[devolucion.documentStatus] ?? devolucion.documentStatus}
            </span>
          </h1>
          <p className="page-sub">Cliente: {devolucion.customerName}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">NCF</span>
              <span className="detail-value" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {devolucion.ncf ?? <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--text-secondary)' }}>Pendiente</em>}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo NCF</span>
              <span className="detail-value">
                {ncfLabel ? <span className="badge badge-neutral">{ncfLabel}</span> : '—'}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(devolucion.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{devolucion.customerName}</span>
            </div>
          </div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Motivo</p>
            <p style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{devolucion.reason || '—'}</p>
          </div>
        </div>
      </div>

      {devolucion.originalInvoice && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={16} /> Factura original
            </h2>
            <button
              className="btn btn-ghost btn-size-sm"
              onClick={() => navigate(`/facturas/${devolucion.originalInvoice!.id}`)}
            >
              Ver factura
            </button>
          </div>
          <div className="card-body">
            <div className="fields-grid">
              <div className="detail-field">
                <span className="detail-label">NCF</span>
                <span className="detail-value" style={{ fontFamily: 'monospace' }}>
                  {devolucion.originalInvoice.ncf ?? devolucion.originalInvoice.id}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Fecha</span>
                <span className="detail-value">{formatDate(devolucion.originalInvoice.postingDate)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Total</span>
                <span className="detail-value">{formatDOP(devolucion.originalInvoice.grandTotal)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Pendiente de cobro</span>
                <span className="detail-value">
                  {devolucion.originalInvoice.outstandingAmount === 0 ? (
                    <span className="badge badge-success">Saldada</span>
                  ) : (
                    <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>
                      {formatDOP(devolucion.originalInvoice.outstandingAmount)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Artículos devueltos</h2>
        </div>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>UDM</th>
              </tr>
            </thead>
            <tbody>
              {devolucion.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(Math.abs(item.amount))}</td>
                  <td>{item.uom || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="items-total-row">
            <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
              <span>Total</span>
              <span>{formatDOP(Math.abs(devolucion.grandTotal))}</span>
            </div>
          </div>
        </div>
      </div>

      {usageStatus && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wallet size={16} /> Estado de uso
            </h2>
            <span className={`badge ${USAGE_BADGE[usageStatus] ?? 'badge-neutral'}`}>
              {USAGE_LABEL[usageStatus] ?? usageStatus}
            </span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="fields-grid">
              {devolucion.refunded && (
                <div className="detail-field">
                  <span className="detail-label">Reembolsado en efectivo</span>
                  <span className="detail-value">{formatDOP(devolucion.refundedAmount)}</span>
                </div>
              )}
              {usageStatus !== 'available' && (
                <div className="detail-field">
                  <span className="detail-label">Aplicado a factura(s)</span>
                  <span className="detail-value">{formatDOP(devolucion.appliedAmount)}</span>
                </div>
              )}
              <div className="detail-field">
                <span className="detail-label">Disponible</span>
                <span className="detail-value" style={{ fontWeight: 600 }}>{formatDOP(devolucion.availableAmount)}</span>
              </div>
            </div>

            {devolucion.appliedTo.length > 0 && (
              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Aplicada a</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {devolucion.appliedTo.map((a) => (
                    <div key={a.invoiceId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <button
                        style={{ fontFamily: 'monospace', color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => navigate(`/facturas/${a.invoiceId}`)}
                      >
                        {a.invoiceId}
                      </button>
                      <span>— {formatDOP(a.amount)}</span>
                      <span className={`badge ${a.status === 'reconciled' ? 'badge-success' : 'badge-warning'}`}>
                        {a.status === 'reconciled' ? 'Reconciliada' : 'Pendiente'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
