import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getPago, submitPago, cancelPago, getPagoPdfBlobUrl } from '@/shared/api/pagos'
import { formatDate, formatDOP } from '@/lib/formatters'
import { ArrowLeft, Send, Ban, Printer } from 'lucide-react'

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

export default function PagoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  const { data: pago, isLoading, isError } = useQuery({
    queryKey: ['pago', id],
    queryFn: () => getPago(id!),
    enabled: !!id,
  })

  function invalidateRelated() {
    queryClient.invalidateQueries({ queryKey: ['pago', id] })
    queryClient.invalidateQueries({ queryKey: ['pagos'] })
    queryClient.invalidateQueries({ queryKey: ['aging-proveedores'] })
    queryClient.invalidateQueries({ queryKey: ['pagos-pendientes'] })
  }

  const submitMutation = useMutation({
    mutationFn: () => submitPago(id!),
    onSuccess: () => {
      toast.success('Pago sometido correctamente')
      invalidateRelated()
      setConfirmSubmit(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al someter el pago')
      setConfirmSubmit(false)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPago(id!),
    onSuccess: () => {
      toast.success('Pago cancelado')
      invalidateRelated()
      setConfirmCancel(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al cancelar el pago')
      setConfirmCancel(false)
    },
  })

  const printMutation = useMutation({
    mutationFn: () => getPagoPdfBlobUrl(id!),
    onSuccess: (url) => {
      setPrintError(null)
      window.open(url, '_blank')
    },
    onError: (err: { message?: string }) => {
      setPrintError(err?.message ?? 'No se pudo generar el PDF')
    },
  })

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

  if (isError || !pago) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/pagos/lista')}>
          <ArrowLeft size={14} /> Pagos
        </a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          No se encontró el pago
        </div>
      </div>
    )
  }

  const isDraft = pago.status === 'draft'
  const isSubmitted = pago.status === 'submitted'
  const referencias = pago.referencias ?? []

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/pagos/lista')}>
        <ArrowLeft size={14} /> Pagos
      </a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {pago.id}
            <span className={`badge ${STATUS_BADGE[pago.status] ?? 'badge-draft'}`}>
              {STATUS_LABEL[pago.status] ?? pago.status}
            </span>
          </h1>
          <p className="page-sub">
            {pago.supplierName} · {formatDate(pago.postingDate)}
          </p>
        </div>
      </div>

      {(isDraft || isSubmitted) && (
        <div className="doc-actions-bar">
          {isDraft && (
            <button
              className="btn btn-primary btn-size-sm"
              onClick={() => setConfirmSubmit(true)}
              disabled={submitMutation.isPending}
            >
              <Send size={14} /> Someter
            </button>
          )}
          {isSubmitted && (
            <>
              {pago.esCheque && (
                <button
                  className="btn btn-ghost btn-size-sm"
                  onClick={() => printMutation.mutate()}
                  disabled={printMutation.isPending}
                >
                  <Printer size={14} /> {printMutation.isPending ? 'Generando…' : 'Imprimir'}
                </button>
              )}
              <button
                className="btn btn-danger btn-size-sm"
                onClick={() => setConfirmCancel(true)}
                disabled={cancelMutation.isPending}
              >
                <Ban size={14} /> Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {printError && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{printError}</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Información del Pago</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">

            <div className="detail-field">
              <span className="detail-label">Proveedor</span>
              <button
                style={{ fontSize: 13, color: 'var(--color-brand)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500, textAlign: 'left' }}
                onClick={() => navigate(`/proveedores/${pago.supplier}`)}
              >
                {pago.supplierName}
              </button>
            </div>

            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(pago.postingDate)}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Método de Pago</span>
              <span className="detail-value">{pago.modeOfPayment}</span>
            </div>

            {pago.referenceNo && (
              <div className="detail-field">
                <span className="detail-label">{pago.esCheque ? 'Número de Cheque' : 'No. de Referencia'}</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>
                  {pago.referenceNo}
                  {pago.esCheque && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Cheque</span>}
                </span>
              </div>
            )}

            {pago.referenceDate && (
              <div className="detail-field">
                <span className="detail-label">Fecha de Referencia</span>
                <span className="detail-value">{formatDate(pago.referenceDate)}</span>
              </div>
            )}

            <div className="detail-field">
              <span className="detail-label">Creado</span>
              <span className="detail-value">{formatDate(pago.createdAt)}</span>
            </div>

          </div>

          <div style={{
            paddingTop: 16,
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            gap: 32,
            flexWrap: 'wrap',
          }}>
            <div className="detail-field">
              <span className="detail-label">Monto Pagado</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--success-text)' }}>
                {formatDOP(pago.paidAmount)}
              </span>
            </div>
          </div>

          {pago.remarks && (
            <div className="detail-field">
              <span className="detail-label">Notas</span>
              <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{pago.remarks}</span>
            </div>
          )}
        </div>
      </div>

      {referencias.length > 0 && (
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
                {referencias.map((ref) => (
                  <tr
                    key={ref.invoiceId}
                    className="data-table-row-link"
                    onClick={() => navigate(`/compras/${ref.invoiceId}`)}
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
                    {formatDOP(referencias.reduce((s, r) => s + r.allocatedAmount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <div className="modal-overlay" onClick={() => setConfirmSubmit(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Someter Pago</h2>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas someter el pago <strong>{pago.id}</strong> por{' '}
                <strong>{formatDOP(pago.paidAmount)}</strong>?
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Esta acción aplicará el pago a las facturas vinculadas.
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

      {confirmCancel && (
        <div className="modal-overlay" onClick={() => setConfirmCancel(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Cancelar Pago</h2>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas cancelar el pago <strong>{pago.id}</strong>? Esto revertirá su aplicación a las facturas.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>
                Volver
              </button>
              <button
                className="btn btn-danger"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending
                  ? <><span className="spinner" /> Cancelando…</>
                  : <><Ban size={14} /> Confirmar cancelación</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
