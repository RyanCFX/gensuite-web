import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getCompra, submitCompra, cancelCompra, amendCompra, returnCompra,
} from '@/shared/api/compras-gastos'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { TIPO_BIENES_606, FORMA_PAGO_606 } from '@/lib/constants'
import { Send, X, RotateCcw, Undo2, Info } from 'lucide-react'

type ConfirmAction = 'submit' | 'cancel' | 'amend' | null

export default function CompraDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [showReturn, setShowReturn] = useState(false)
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({})

  const { data: compra, isLoading, isError } = useQuery({
    queryKey: ['compra', id],
    queryFn: () => getCompra(id!),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitCompra(id!),
    onSuccess: () => { toast.success('Compra sometida'); queryClient.invalidateQueries({ queryKey: ['compra', id] }); queryClient.invalidateQueries({ queryKey: ['compras'] }); setConfirmAction(null) },
    onError: () => toast.error('Error al someter la compra'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelCompra(id!),
    onSuccess: () => { toast.success('Compra anulada'); queryClient.invalidateQueries({ queryKey: ['compra', id] }); queryClient.invalidateQueries({ queryKey: ['compras'] }); setConfirmAction(null) },
    onError: () => toast.error('Error al anular la compra'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendCompra(id!),
    onSuccess: (data) => { toast.success('Enmienda creada'); queryClient.invalidateQueries({ queryKey: ['compras'] }); navigate(`/compras/${data.id}`) },
    onError: () => toast.error('Error al enmendar la compra'),
  })

  const returnMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(returnQtys)
        .filter(([, qty]) => qty > 0)
        .map(([itemCode, qty]) => ({ itemCode, qty }))
      return returnCompra(id!, items)
    },
    onSuccess: () => { toast.success('Devolución registrada'); queryClient.invalidateQueries({ queryKey: ['compra', id] }); queryClient.invalidateQueries({ queryKey: ['compras'] }); setShowReturn(false) },
    onError: () => toast.error('Error al registrar la devolución'),
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate()
    else if (confirmAction === 'cancel') cancelMutation.mutate()
    else if (confirmAction === 'amend') amendMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending

  function getTipoBienesLabel(value?: string) {
    return TIPO_BIENES_606.find((t) => t.value === value)?.label ?? value ?? '—'
  }
  function getFormaPagoLabel(value?: string) {
    return FORMA_PAGO_606.find((f) => f.value === value)?.label ?? value ?? '—'
  }

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !compra) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>Error al cargar la compra.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  const confirmMessages: Record<NonNullable<ConfirmAction>, { title: string; description: string; actionLabel: string }> = {
    submit: { title: '¿Someter compra?', description: 'Esta acción actualizará el inventario y la compra no podrá editarse.', actionLabel: 'Someter' },
    cancel: { title: '¿Anular compra?', description: 'La compra será anulada y se revertirá el movimiento de inventario.', actionLabel: 'Anular' },
    amend: { title: '¿Enmendar compra?', description: 'Se creará una nueva compra basada en esta. La versión actual será cancelada.', actionLabel: 'Enmendar' },
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Compras
      </button>

      <PageHeader
        title={`Compra ${compra.id}`}
        description={compra.supplierName}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {compra.status === 'draft' && (
              <>
                <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmAction('submit')}>
                  <Send size={14} />Someter
                </button>
                <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAction('cancel')}>
                  <X size={14} />Anular
                </button>
              </>
            )}
            {compra.status === 'submitted' && (
              <>
                <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('amend')}>
                  <RotateCcw size={14} />Enmendar
                </button>
                <button className="btn btn-secondary btn-size-sm" onClick={() => { setReturnQtys({}); setShowReturn(true) }}>
                  <Undo2 size={14} />Devolución
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={compra.status} />
          {compra.amendedFrom && (
            <span className="badge badge-default">Enmendada de {compra.amendedFrom}</span>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Proveedor</span>
              <span className="detail-value">{compra.supplierName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(compra.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Vencimiento</span>
              <span className="detail-value">{formatDate(compra.dueDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Total</span>
              <span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(compra.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Artículos</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Almacén</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {compra.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.itemCode}</td>
                    <td>{item.itemCode}</td>
                    <td className="td-muted">{item.warehouse ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                  <td colSpan={5} style={{ textAlign: 'right' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(compra.grandTotal)}</td>
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
              <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{compra.ncfProveedor ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de Bienes</span>
              <span className="detail-value">{getTipoBienesLabel(compra.tipoBienes606)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Forma de Pago</span>
              <span className="detail-value">{getFormaPagoLabel(compra.formaPago606)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de Pago</span>
              <span className="detail-value">{compra.tipoPago ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Retención ITBIS</span>
              <span className="detail-value">{formatDOP(compra.retencionItbis)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Retención ISR</span>
              <span className="detail-value">{formatDOP(compra.retencionIsr)}</span>
            </div>
          </div>
        </div>
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

      {/* Return Modal */}
      {showReturn && (
        <div className="modal-overlay" onClick={() => setShowReturn(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Registrar Devolución</h2>
              <button className="modal-close" onClick={() => setShowReturn(false)}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 320 }}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Selecciona los artículos y cantidades a devolver.</p>
              {compra.items.map((item) => (
                <div key={item.itemCode} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{item.itemCode}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{item.itemCode} — Qty: {item.qty}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={item.qty}
                    step="1"
                    className="ff-input"
                    style={{ width: 96, textAlign: 'right' }}
                    value={returnQtys[item.itemCode] ?? 0}
                    onChange={(e) => setReturnQtys((prev) => ({ ...prev, [item.itemCode]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowReturn(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => returnMutation.mutate()} disabled={returnMutation.isPending}>
                {returnMutation.isPending ? 'Procesando…' : 'Registrar Devolución'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
