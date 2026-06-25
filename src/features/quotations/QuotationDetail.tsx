import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuotation, submitQuotation, deleteQuotation, convertQuotationToInvoice, amendQuotation } from '@/shared/api/quotations'
import type { Quotation, AmendmentEntry } from '@/shared/api/types'
import { ArrowLeft, FileText, Loader2, Send, Trash2, ClipboardList, GitBranch, History } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDOP } from '@/lib/formatters'
import { NCF_TYPES } from '@/lib/constants'

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Submitted: 'badge-submitted',
  Ordered: 'badge-info',
  Lost: 'badge-warning',
  Cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Ordered: 'Ordenado',
  Lost: 'Perdido',
  Cancelled: 'Cancelado',
}

export default function QuotationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedNcfType, setSelectedNcfType] = useState<string>('B02')

  const { data: quotation, isLoading } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => getQuotation(id!),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitQuotation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['quotation', id] })
      toast.success('Cotización sometida correctamente')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al someter la cotización')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuotation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast.success('Cotización eliminada')
      navigate('/cotizaciones')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al eliminar la cotización')
    },
  })

  const convertMutation = useMutation({
    mutationFn: () => convertQuotationToInvoice(id!, selectedNcfType),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Cotización convertida a factura')
      setConvertDialogOpen(false)
      const invoice = result as Quotation & { invoiceId?: string }
      if (invoice.invoiceId) {
        navigate(`/facturacion/facturas/${invoice.invoiceId}`)
      } else {
        navigate('/facturacion/facturas')
      }
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al convertir la cotización')
    },
  })

  const amendMutation = useMutation({
    mutationFn: () => amendQuotation(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast.success('Enmienda creada')
      navigate(`/cotizaciones/${result.newId}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al crear enmienda')
    },
  })

  const isActionsLoading = submitMutation.isPending || deleteMutation.isPending || convertMutation.isPending || amendMutation.isPending

  const versionNumber = quotation?.history ? quotation.history.length + 1 : 1

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 280, height: 28, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 128, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 256, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (!quotation) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-title">Cotización no encontrada</div>
          <button className="btn btn-ghost btn-size-sm" onClick={() => navigate('/cotizaciones')}>
            Volver a cotizaciones
          </button>
        </div>
      </div>
    )
  }

  const subtotal = quotation.items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = quotation.items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const itbis = Math.round(subtotal * 0.18 * 100) / 100
  const total = subtotal + itbis

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/cotizaciones')}>
            <ArrowLeft size={14} /> Cotizaciones
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Cotización {quotation.id}
            <span className={`badge ${STATUS_BADGE[quotation.status] ?? 'badge-neutral'}`}>
              {STATUS_LABEL[quotation.status] ?? quotation.status}
            </span>
            {quotation.amendedFrom && (
              <span className="badge badge-info">Versión {versionNumber}</span>
            )}
          </h1>
          <p className="page-sub">Cliente: {quotation.customerName}</p>
        </div>
      </div>

      <div className="doc-actions-bar">
        {quotation.status === 'draft' && (
          <>
            <button
              className="btn btn-primary btn-size-sm"
              onClick={() => submitMutation.mutate()}
              disabled={isActionsLoading}
            >
              <Send size={14} /> Someter
            </button>
            <button
              className="btn btn-danger btn-size-sm"
              onClick={() => deleteMutation.mutate()}
              disabled={isActionsLoading}
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </>
        )}
        {quotation.status === 'submitted' && (
          <>
            <button className="btn btn-secondary btn-size-sm" onClick={() => setConvertDialogOpen(true)} disabled={isActionsLoading}>
              <FileText size={14} /> Convertir a Factura
            </button>
            <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/pedidos/nuevo?quotation=${id}`)} disabled={isActionsLoading}>
              <ClipboardList size={14} /> Crear Pedido
            </button>
            <button className="btn btn-ghost btn-size-sm" onClick={() => amendMutation.mutate()} disabled={isActionsLoading}>
              <GitBranch size={14} /> Enmendar
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{quotation.customerName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(quotation.date)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Válida hasta</span>
              <span className="detail-value">{formatDate(quotation.validTill)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Estado</span>
              <span className="detail-value">
                <span className={`badge ${STATUS_BADGE[quotation.status] ?? 'badge-neutral'}`}>
                  {STATUS_LABEL[quotation.status] ?? quotation.status}
                </span>
              </span>
            </div>
          </div>
          {quotation.notes && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Notas</p>
              <p style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{quotation.notes}</p>
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
                <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>UDM</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right' }}>
                    {item.discountPct && item.discountPct > 0 ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)', marginRight: 4 }}>{formatDOP(item.rate)}</span>
                        {formatDOP(item.discountedRate ?? item.rate)}
                      </>
                    ) : formatDOP(item.rate)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{item.discountPct ? `${item.discountPct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                  <td>{item.uom || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="items-total-row">
            <div className="items-total-line">
              <span>Subtotal bruto</span>
              <span>{formatDOP(grossTotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="items-total-line" style={{ color: 'var(--text-danger)' }}>
                <span>Descuento total</span>
                <span>-{formatDOP(totalDiscount)}</span>
              </div>
            )}
            <div className="items-total-line">
              <span>Subtotal neto</span>
              <span>{formatDOP(subtotal)}</span>
            </div>
            <div className="items-total-line">
              <span>ITBIS (18%)</span>
              <span>{formatDOP(itbis)}</span>
            </div>
            <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
              <span>Total</span>
              <span>{formatDOP(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de versiones */}
      {quotation.history && quotation.history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <History size={15} /> Historial de versiones
            </h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[...quotation.history]
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((entry, idx) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 0', borderBottom: idx < quotation.history!.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: entry.status === 'Cancelled' ? 'var(--color-danger)' : 'var(--color-success)',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        Versión {idx + 1} — {entry.id}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {entry.status === 'Cancelled' ? 'Cancelada' : entry.status} · {formatDate(entry.date)} · {formatDOP(entry.total)}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/cotizaciones/${entry.id}`)}>
                      Ver
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {convertDialogOpen && (
        <div className="modal-overlay" onClick={() => setConvertDialogOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Convertir a Factura</h2>
              <button className="modal-close" onClick={() => setConvertDialogOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Selecciona el tipo de comprobante fiscal (NCF) para la nueva factura.
              </p>
              <div className="ff-wrap">
                <label className="ff-label">Tipo NCF</label>
                <select
                  className="ff-select"
                  value={selectedNcfType}
                  onChange={(e) => setSelectedNcfType(e.target.value)}
                >
                  {NCF_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConvertDialogOpen(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
              >
                {convertMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                Convertir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
