import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getGasto, submitGasto, cancelGasto, amendGasto } from '@/shared/api/compras-gastos'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { TIPO_BIENES_606, FORMA_PAGO_606 } from '@/lib/constants'
import { Send, X, RotateCcw, Info } from 'lucide-react'

type ConfirmAction = 'submit' | 'cancel' | 'amend' | null

export default function GastoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const { data: gasto, isLoading, isError } = useQuery({
    queryKey: ['gasto', id],
    queryFn: () => getGasto(id!),
    enabled: !!id,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gasto', id] })
    queryClient.invalidateQueries({ queryKey: ['gastos'] })
    setConfirmAction(null)
  }

  const submitMutation = useMutation({
    mutationFn: () => submitGasto(id!),
    onSuccess: () => { toast.success('Gasto sometido'); invalidate() },
    onError: () => toast.error('Error al someter el gasto'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelGasto(id!),
    onSuccess: () => { toast.success('Gasto anulado'); invalidate() },
    onError: () => toast.error('Error al anular el gasto'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendGasto(id!),
    onSuccess: (data) => { toast.success('Enmienda creada'); queryClient.invalidateQueries({ queryKey: ['gastos'] }); navigate(`/gastos/${data.id}`) },
    onError: () => toast.error('Error al enmendar el gasto'),
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate()
    else if (confirmAction === 'cancel') cancelMutation.mutate()
    else if (confirmAction === 'amend') amendMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending

  function getTipoBienesLabel(v?: string) { return TIPO_BIENES_606.find((t) => t.value === v)?.label ?? v ?? '—' }
  function getFormaPagoLabel(v?: string) { return FORMA_PAGO_606.find((f) => f.value === v)?.label ?? v ?? '—' }

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !gasto) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>Error al cargar el gasto.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  const messages: Record<NonNullable<ConfirmAction>, { title: string; description: string; actionLabel: string }> = {
    submit: { title: '¿Someter gasto?', description: 'El gasto será registrado oficialmente.', actionLabel: 'Someter' },
    cancel: { title: '¿Anular gasto?', description: 'El gasto será anulado permanentemente.', actionLabel: 'Anular' },
    amend: { title: '¿Enmendar gasto?', description: 'Se creará una nueva versión del gasto.', actionLabel: 'Enmendar' },
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Gastos
      </button>

      <PageHeader
        title={`Gasto ${gasto.id}`}
        description={gasto.supplierName}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {gasto.status === 'Draft' && (
              <>
                <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmAction('submit')}>
                  <Send size={14} />Someter
                </button>
                <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAction('cancel')}>
                  <X size={14} />Anular
                </button>
              </>
            )}
            {gasto.status === 'Submitted' && (
              <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('amend')}>
                <RotateCcw size={14} />Enmendar
              </button>
            )}
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={gasto.status} />
          {gasto.esDeducible
            ? <span className="badge badge-success">Deducible</span>
            : <span className="badge badge-default">No deducible</span>}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Proveedor</span>
              <span className="detail-value">{gasto.supplierName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(gasto.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Categoría</span>
              <span className="detail-value">{gasto.categoriaGasto ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Total</span>
              <span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(gasto.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Conceptos</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {gasto.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.itemCode}</td>
                    <td>{item.description}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                  <td colSpan={4} style={{ textAlign: 'right' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(gasto.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 606 Info */}
        <div className="dgii-section">
          <div className="dgii-section-title">
            <Info size={14} />
            Información DGII (606)
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">NCF Proveedor</span>
              <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{gasto.ncfProveedor ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo Comprobante</span>
              <span className="detail-value">{gasto.tipoComprobante ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de Bienes</span>
              <span className="detail-value">{getTipoBienesLabel(gasto.tipoBienes606)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Forma de Pago</span>
              <span className="detail-value">{getFormaPagoLabel(gasto.formaPago606)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Retención ISR</span>
              <span className="detail-value">{formatDOP(gasto.retencionIsr)}</span>
            </div>
          </div>
        </div>
      </div>

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{messages[confirmAction].title}</h2>
              <button className="modal-close" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{messages[confirmAction].description}</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" disabled={isPending} onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Procesando…' : messages[confirmAction].actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
