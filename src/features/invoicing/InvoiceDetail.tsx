import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getInvoice, submitInvoice, cancelInvoice, amendInvoice, getInvoicePdfUrl } from '@/shared/api/invoices'
import { ArrowLeft, Send, XCircle, FileEdit, Download, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDOP } from '@/lib/formatters'
import { NCF_TYPES } from '@/lib/constants'

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Submitted: 'badge-submitted',
  Cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Cancelled: 'Cancelado',
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitInvoice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      toast.success('Factura sometida — NCF asignado')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al someter la factura')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelInvoice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      toast.success('Factura cancelada')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al cancelar la factura')
    },
  })

  const amendMutation = useMutation({
    mutationFn: () => amendInvoice(id!),
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Enmienda creada como borrador')
      navigate(`/facturacion/facturas/${newInvoice.id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al enmendar la factura')
    },
  })

  const isActionsLoading = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending

  function handleDownloadPdf() {
    if (!id) return
    const url = getInvoicePdfUrl(id)
    window.open(url, '_blank')
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 280, height: 28, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 160, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 256, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-title">Factura no encontrada</div>
          <button className="btn btn-ghost btn-size-sm" onClick={() => navigate('/facturacion/facturas')}>
            Volver a facturas
          </button>
        </div>
      </div>
    )
  }

  const ncfLabel = NCF_TYPES.find((t) => t.value === invoice.ncfType)?.label
  const ps = invoice.paymentStatus

  const outstandingColor = ps === 'paid'
    ? 'var(--color-success)'
    : ps === 'partly_paid'
    ? 'var(--color-brand)'
    : 'var(--color-error)'

  const PAYMENT_BADGE: Record<string, string> = {
    unpaid: 'badge-warning',
    partly_paid: 'badge-info',
    paid: 'badge-success',
  }
  const PAYMENT_LABEL: Record<string, string> = {
    unpaid: 'Pendiente',
    partly_paid: 'Parcial',
    paid: 'Pagado',
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/facturacion/facturas')}>
            <ArrowLeft size={14} /> Facturas
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Factura {invoice.id}
            <span className={`badge ${STATUS_BADGE[invoice.status] ?? 'badge-neutral'}`}>
              {STATUS_LABEL[invoice.status] ?? invoice.status}
            </span>
          </h1>
          <p className="page-sub">
            {invoice.ncf ? `NCF: ${invoice.ncf}` : 'Borrador — NCF pendiente de asignación'}
          </p>
        </div>
      </div>

      <div className="doc-actions-bar">
        {invoice.status === 'draft' && (
          <>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => navigate(`/facturacion/facturas/${id}/editar`)}
              disabled={isActionsLoading}
            >
              <Pencil size={14} /> Editar
            </button>
            <button className="btn btn-primary btn-size-sm" onClick={() => submitMutation.mutate()} disabled={isActionsLoading}>
              <Send size={14} /> Someter
            </button>
          </>
        )}
        {invoice.status === 'submitted' && (
          <>
            <button className="btn btn-secondary btn-size-sm" onClick={handleDownloadPdf}>
              <Download size={14} /> Descargar PDF
            </button>
            <button className="btn btn-danger btn-size-sm" onClick={() => cancelMutation.mutate()} disabled={isActionsLoading}>
              <XCircle size={14} /> Cancelar
            </button>
          </>
        )}
        {invoice.status === 'cancelled' && (
          <button className="btn btn-secondary btn-size-sm" onClick={() => amendMutation.mutate()} disabled={isActionsLoading}>
            <FileEdit size={14} /> Enmendar
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Información de la Factura</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{invoice.customerName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(invoice.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Vencimiento</span>
              <span className="detail-value">{formatDate(invoice.dueDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">NCF</span>
              <span className="detail-value" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {invoice.ncf ?? <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--text-secondary)' }}>Pendiente</em>}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo NCF</span>
              <span className="detail-value">
                {ncfLabel ? <span className="badge badge-neutral">{ncfLabel}</span> : '—'}
              </span>
            </div>
            {invoice.amendedFrom && (
              <div className="detail-field">
                <span className="detail-label">Enmienda de</span>
                <button
                  style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--color-brand)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => navigate(`/facturacion/facturas/${invoice.amendedFrom}`)}
                >
                  {invoice.amendedFrom}
                </button>
              </div>
            )}
          </div>

          {invoice.status === 'submitted' && (
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <div className="detail-field">
                <span className="detail-label">Subtotal</span>
                <span className="detail-value">{formatDOP(invoice.subtotal)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">ITBIS (18%)</span>
                <span className="detail-value">{formatDOP(invoice.taxAmount)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Total</span>
                <span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(invoice.grandTotal)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Pendiente</span>
                <span className="detail-value" style={{ fontWeight: 700, color: outstandingColor }}>{formatDOP(invoice.outstandingAmount)}</span>
              </div>
              {ps && (
                <div className="detail-field">
                  <span className="detail-label">Estado de Pago</span>
                  <span className="detail-value">
                    <span className={`badge ${PAYMENT_BADGE[ps] ?? 'badge-neutral'}`}>
                      {PAYMENT_LABEL[ps] ?? ps}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {invoice.notes && (
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Notas</p>
              <p style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Artículos</h2>
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
              {invoice.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                  <td>{item.uom || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="items-total-row">
            <div className="items-total-line">
              <span>Subtotal</span>
              <span>{formatDOP(invoice.subtotal)}</span>
            </div>
            <div className="items-total-line">
              <span>ITBIS (18%)</span>
              <span>{formatDOP(invoice.taxAmount)}</span>
            </div>
            <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
              <span>Total</span>
              <span>{formatDOP(invoice.grandTotal)}</span>
            </div>
            {invoice.status === 'submitted' && (
              <div className="items-total-line" style={{ color: outstandingColor, fontWeight: 600 }}>
                <span>Pendiente</span>
                <span>{formatDOP(invoice.outstandingAmount)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
