import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getCobro, submitCobro } from '@/shared/api/cobros'
import { formatDate, formatDOP } from '@/lib/formatters'
import { ArrowLeft, Send } from 'lucide-react'

// ─── Status helpers ───────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

export default function CobroDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmSubmit, setConfirmSubmit] = useState(false)

  const { data: cobro, isLoading, isError } = useQuery({
    queryKey: ['cobro', id],
    queryFn: () => getCobro(id!),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitCobro(id!),
    onSuccess: () => {
      toast.success('Cobro sometido correctamente')
      queryClient.invalidateQueries({ queryKey: ['cobro', id] })
      queryClient.invalidateQueries({ queryKey: ['cobros'] })
      queryClient.invalidateQueries({ queryKey: ['aging'] })
      setConfirmSubmit(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al someter el cobro')
      setConfirmSubmit(false)
    },
  })

  // ── Redirect POS sales to invoice detail ───────────────────────────────

  useEffect(() => {
    if (cobro?.isPosSale) {
      navigate(`/facturas/${id}`, { replace: true })
    }
  }, [cobro, id, navigate])

  // ── Loading / error states ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 8 }} />
        <span className="skeleton-box" style={{ height: 16, width: 160, display: 'block', marginBottom: 24 }} />
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="skeleton-box" style={{ height: 18, width: `${60 + (i % 3) * 15}%`, display: 'block' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError || !cobro) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/cobros/lista')}>
          <ArrowLeft size={14} /> Cobros
        </a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          No se encontró el cobro
        </div>
      </div>
    )
  }

  const isDraft = cobro.status === 'draft'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">

      {/* Back */}
      <a className="page-back-link" onClick={() => navigate('/cobros/lista')}>
        <ArrowLeft size={14} /> Cobros
      </a>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {cobro.id}
            <span className={`badge ${STATUS_BADGE[cobro.status] ?? 'badge-draft'}`}>
              {STATUS_LABEL[cobro.status] ?? cobro.status}
            </span>
          </h1>
          <p className="page-sub">
            {cobro.customerName} · {formatDate(cobro.postingDate)}
          </p>
        </div>
      </div>

      {/* Actions bar */}
      {isDraft && (
        <div className="doc-actions-bar">
          <button
            className="btn btn-primary btn-size-sm"
            onClick={() => setConfirmSubmit(true)}
            disabled={submitMutation.isPending}
          >
            <Send size={14} /> Someter
          </button>
        </div>
      )}

      {/* ── Info General ──────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Información del Cobro</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">

            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <button
                style={{ fontSize: 13, color: 'var(--color-brand)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500, textAlign: 'left' }}
                onClick={() => navigate(`/clientes/${cobro.customer}`)}
              >
                {cobro.customerName}
              </button>
            </div>

            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(cobro.postingDate)}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Método de Pago</span>
              <span className="detail-value">{cobro.modeOfPayment}</span>
            </div>

            {cobro.referenceNo && (
              <div className="detail-field">
                <span className="detail-label">No. de Referencia</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{cobro.referenceNo}</span>
              </div>
            )}

            {cobro.referenceDate && (
              <div className="detail-field">
                <span className="detail-label">Fecha de Referencia</span>
                <span className="detail-value">{formatDate(cobro.referenceDate)}</span>
              </div>
            )}

            <div className="detail-field">
              <span className="detail-label">Creado</span>
              <span className="detail-value">{formatDate(cobro.createdAt)}</span>
            </div>

          </div>

          {/* Monto destacado */}
          <div style={{
            paddingTop: 16,
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
          }}>
            <div className="detail-field">
              <span className="detail-label">Monto Cobrado</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--success-text)' }}>
                {formatDOP(cobro.paidAmount)}
              </span>
            </div>
          </div>

          {cobro.remarks && (
            <div className="detail-field">
              <span className="detail-label">Notas</span>
              <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{cobro.remarks}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Facturas Aplicadas ────────────────────────────────────────── */}
      {cobro.referencias && cobro.referencias.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Facturas Aplicadas</h2>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th style={{ textAlign: 'right' }}>Monto Aplicado</th>
                </tr>
              </thead>
              <tbody>
                {cobro.referencias.map((ref) => (
                  <tr
                    key={ref.invoiceId}
                    className="data-table-row-link"
                    onClick={() => navigate(`/facturas/${ref.invoiceId}`)}
                  >
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                        {ref.invoiceName ?? ref.invoiceId}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatDOP(ref.allocatedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, paddingRight: 8 }}>
                    Total aplicado
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {formatDOP(cobro.referencias.reduce((s, r) => s + r.allocatedAmount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Confirm Submit modal ────────────────────────────────────────── */}
      {confirmSubmit && (
        <div className="modal-overlay" onClick={() => setConfirmSubmit(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Someter Cobro</h2>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas someter el cobro <strong>{cobro.id}</strong> por{' '}
                <strong>{formatDOP(cobro.paidAmount)}</strong>?
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Esta acción aplicará el pago a las facturas vinculadas y no podrá revertirse.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending
                  ? <><span className="spinner" /> Sometiendo…</>
                  : <><Send size={14} /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
