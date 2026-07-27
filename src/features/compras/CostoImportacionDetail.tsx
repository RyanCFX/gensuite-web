import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getCostoImportacion, submitCostoImportacion, cancelCostoImportacion } from '@/shared/api/costos-importacion'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Send, X } from 'lucide-react'

type ConfirmAction = 'submit' | 'cancel' | null

export default function CostoImportacionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const { data: costo, isLoading, isError } = useQuery({
    queryKey: ['costo-importacion', id],
    queryFn: () => getCostoImportacion(id!),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitCostoImportacion(id!),
    onSuccess: () => {
      toast.success('Costo de importación sometido')
      queryClient.invalidateQueries({ queryKey: ['costo-importacion', id] })
      queryClient.invalidateQueries({ queryKey: ['costos-importacion'] })
      setConfirmAction(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al someter el costo de importación'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelCostoImportacion(id!),
    onSuccess: () => {
      toast.success('Costo de importación anulado')
      queryClient.invalidateQueries({ queryKey: ['costo-importacion', id] })
      queryClient.invalidateQueries({ queryKey: ['costos-importacion'] })
      setConfirmAction(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al anular el costo de importación'),
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate()
    else if (confirmAction === 'cancel') cancelMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !costo) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>Error al cargar el costo de importación.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  const confirmMessages: Record<NonNullable<ConfirmAction>, { title: string; description: string; actionLabel: string }> = {
    submit: { title: '¿Someter costo de importación?', description: 'Esta acción prorrateará los cargos sobre los artículos recibidos y el documento no podrá editarse.', actionLabel: 'Someter' },
    cancel: { title: '¿Anular costo de importación?', description: 'El documento será anulado y se revertirá el prorrateo de cargos.', actionLabel: 'Anular' },
  }

  const totalTaxes = costo.taxes.reduce((sum, t) => sum + (t.amount || 0), 0)
  const totalApplicableCharges = (costo.items ?? []).reduce((sum, it) => sum + (it.applicableCharges || 0), 0)

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Costos de Importación
      </button>

      <PageHeader
        title={`Costo de Importación ${costo.id}`}
        description={formatDate(costo.postingDate)}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {costo.status === 'draft' && (
              <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmAction('submit')}>
                <Send size={14} />Someter
              </button>
            )}
            {costo.status === 'submitted' && (
              <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAction('cancel')}>
                <X size={14} />Anular
              </button>
            )}
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={costo.status} />
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(costo.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Distribuir Cargos Según</span>
              <span className="detail-value">{costo.distributeChargesBasedOn ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Total Impuestos/Cargos</span>
              <span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(totalTaxes)}</span>
            </div>
          </div>
        </div>

        {/* Purchase Receipts */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Documentos de Recepción</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo de Documento</th>
                  <th>ID del Documento</th>
                </tr>
              </thead>
              <tbody>
                {costo.purchaseReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="td-muted" style={{ textAlign: 'center', padding: '16px 0' }}>
                      Sin documentos de recepción
                    </td>
                  </tr>
                ) : (
                  costo.purchaseReceipts.map((r, i) => (
                    <tr key={i}>
                      <td>{r.receiptDocumentType}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.receiptDocument}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Taxes/Charges */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Impuestos y Cargos</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Cuenta de Gasto</th>
                </tr>
              </thead>
              <tbody>
                {costo.taxes.map((t, i) => (
                  <tr key={i}>
                    <td>{t.description}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(t.amount)}</td>
                    <td className="td-muted">{t.expenseAccount ?? '—'}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                  <td style={{ textAlign: 'right' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(totalTaxes)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Items (prorrateados) — se muestran apenas existan, incluso en borrador recién creado */}
        {costo.items && costo.items.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Artículos Prorrateados</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Documento de Recepción</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Precio</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th style={{ textAlign: 'right' }}>Cargos Aplicables</th>
                  </tr>
                </thead>
                <tbody>
                  {costo.items.map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.itemCode}</td>
                      <td>{item.description ?? item.itemCode}</td>
                      <td className="td-muted" style={{ fontSize: 12 }}>
                        {item.receiptDocumentType} · {item.receiptDocument}
                      </td>
                      <td style={{ textAlign: 'right' }}>{item.qty}</td>
                      <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                      <td style={{ textAlign: 'right' }}>{formatDOP(item.amount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.applicableCharges)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                    <td colSpan={6} style={{ textAlign: 'right' }}>Total Cargos Aplicables</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(totalApplicableCharges)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{confirmMessages[confirmAction].title}</h2>
              <button className="modal-close" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {confirmMessages[confirmAction].description}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" disabled={isPending} onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Procesando…' : confirmMessages[confirmAction].actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
