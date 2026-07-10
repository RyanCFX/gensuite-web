import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getInvoice, submitInvoice, cancelInvoice, amendInvoice, downloadInvoicePdf, aplicarSaldoFavor } from '@/shared/api/invoices'
import { getCustomer } from '@/shared/api/customers'
import { getSaldoFavor } from '@/shared/api/cobros'
import { listMetodosPago } from '@/shared/api/config'
import { createDevolucion } from '@/shared/api/devoluciones'
import type { ApiError, SubmitInvoiceDto } from '@/shared/api/types'
import { ArrowLeft, Send, XCircle, FileEdit, Download, AlertTriangle, Ban, Wallet, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateTime, formatDOP, displayId } from '@/lib/formatters'
import { NCF_TYPES } from '@/lib/constants'
import { DocumentHistoryCard } from '@/components/shared/DocumentHistoryCard'

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

  const [payCash, setPayCash] = useState(false)
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [creditErrorOpen, setCreditErrorOpen] = useState(false)
  const [creditErrorMsg, setCreditErrorMsg] = useState('')
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelForbiddenMsg, setCancelForbiddenMsg] = useState('')
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [returnFullInvoice, setReturnFullInvoice] = useState(true)
  const [returnRows, setReturnRows] = useState<{ itemCode: string; description: string; qtyPurchased: number; qty: number; checked: boolean }[]>([])
  const [returnResolution, setReturnResolution] = useState<'refund' | 'credit_note_only'>('credit_note_only')
  const [returnModeOfPayment, setReturnModeOfPayment] = useState('')
  const [returnReason, setReturnReason] = useState('')

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  })

  const { data: customer } = useQuery({
    queryKey: ['customer', invoice?.customer],
    queryFn: () => getCustomer(invoice!.customer),
    enabled: !!invoice?.customer && invoice.status === 'draft',
  })

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: invoice?.status === 'draft' || invoice?.status === 'submitted',
    staleTime: 5 * 60_000,
  })

  const { data: saldoFavor } = useQuery({
    queryKey: ['saldo-favor', invoice?.customer],
    queryFn: () => getSaldoFavor(invoice!.customer),
    enabled: !!invoice?.customer && invoice.status === 'draft',
  })

  const [saldoAmounts, setSaldoAmounts] = useState<Record<string, number>>({})

  const applySaldoMutation = useMutation({
    mutationFn: ({ paymentEntryId, amount }: { paymentEntryId: string; amount: number }) =>
      aplicarSaldoFavor(id!, { paymentEntryId, amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['saldo-favor', invoice?.customer] })
      toast.success('Saldo a favor aplicado')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al aplicar el saldo a favor')
    },
  })

  const noCredit = invoice?.status === 'draft' && customer?.hasCredit === false
  const showCashSelector = noCredit || payCash

  const submitMutation = useMutation({
    mutationFn: (body?: SubmitInvoiceDto) => submitInvoice(id!, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      setCreditErrorOpen(false)
      setPayCash(false)
      setModeOfPayment('')
      toast.success(
        updated.paymentStatus === 'paid'
          ? 'Factura sometida y cobrada al contado'
          : 'Factura sometida — NCF asignado',
      )
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? ''
      if (/excede\s+el\s+cr[eé]dito\s+disponible/i.test(msg)) {
        setCreditErrorMsg(msg)
        setCreditErrorOpen(true)
        return
      }
      toast.error(msg || 'Error al someter la factura')
    },
  })

  function handleSubmitClick() {
    if (showCashSelector) {
      if (!modeOfPayment) { toast.error('Selecciona un método de pago'); return }
      submitMutation.mutate({ payCash: true, modeOfPayment })
    } else {
      submitMutation.mutate(undefined)
    }
  }

  function handleCashRetry() {
    if (!modeOfPayment) { toast.error('Selecciona un método de pago'); return }
    submitMutation.mutate({ payCash: true, modeOfPayment })
  }

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelInvoice(id!, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      toast.success('Factura cancelada')
      setCancelModalOpen(false)
      setCancelReason('')
      setCancelForbiddenMsg('')
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error('La factura ya está cancelada.')
        queryClient.invalidateQueries({ queryKey: ['invoice', id] })
        setCancelModalOpen(false)
        return
      }
      if (err?.statusCode === 403) {
        setCancelForbiddenMsg(err.message || 'No tienes permiso para cancelar esta factura.')
        return
      }
      toast.error(err?.message ?? 'Error al cancelar la factura')
    },
  })

  function openCancelModal() {
    setCancelReason('')
    setCancelForbiddenMsg('')
    setCancelModalOpen(true)
  }

  const cancelReasonValid = cancelReason.trim().length >= 10 && cancelReason.trim().length <= 500

  function openReturnModal() {
    setReturnFullInvoice(true)
    setReturnRows((invoice?.items ?? []).map((i) => ({
      itemCode: i.itemCode,
      description: i.description || i.itemCode,
      qtyPurchased: i.qty,
      qty: i.qty,
      checked: false,
    })))
    setReturnResolution('credit_note_only')
    setReturnModeOfPayment('')
    setReturnReason('')
    setReturnModalOpen(true)
  }

  function toggleReturnRow(itemCode: string) {
    setReturnRows((prev) => prev.map((r) => (r.itemCode === itemCode ? { ...r, checked: !r.checked } : r)))
  }

  function setReturnRowQty(itemCode: string, qty: number) {
    setReturnRows((prev) => prev.map((r) => (r.itemCode === itemCode ? { ...r, qty } : r)))
  }

  const returnCheckedRows = returnRows.filter((r) => r.checked)
  const returnReasonValid = returnReason.trim().length >= 10 && returnReason.trim().length <= 500
  const returnModeValid = returnResolution !== 'refund' || !!returnModeOfPayment
  const returnItemsValid = returnFullInvoice || (
    returnCheckedRows.length > 0 && returnCheckedRows.every((r) => r.qty > 0 && r.qty <= r.qtyPurchased)
  )
  const canConfirmReturn = returnReasonValid && returnModeValid && returnItemsValid

  const devolucionMutation = useMutation({
    mutationFn: () => createDevolucion({
      invoiceId: id!,
      items: returnFullInvoice ? undefined : returnCheckedRows.map((r) => ({ itemCode: r.itemCode, qty: r.qty })),
      resolution: returnResolution,
      refundModeOfPayment: returnResolution === 'refund' ? returnModeOfPayment : undefined,
      reason: returnReason.trim(),
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      toast.success(result.message ?? 'Devolución procesada correctamente')
      setReturnModalOpen(false)
      navigate('/facturacion/notas-credito')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al procesar la devolución')
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

  const downloadMutation = useMutation({
    mutationFn: () => downloadInvoicePdf(id!, `factura-${id}.pdf`),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

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
            Factura {displayId(invoice.id, invoice.sequence)}
            <span className={`badge ${STATUS_BADGE[invoice.status] ?? 'badge-neutral'}`}>
              {STATUS_LABEL[invoice.status] ?? invoice.status}
            </span>
            {invoice.sequence > 0 && (
              <span className="badge badge-info" title="Veces que se ha editado en borrador">
                Versión {invoice.sequence}
              </span>
            )}
          </h1>
          <p className="page-sub">
            {invoice.ncf ? `NCF: ${invoice.ncf}` : 'Borrador — NCF pendiente de asignación'}
          </p>
        </div>
      </div>

      {invoice.status === 'cancelled' && invoice.cancellationReason && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <XCircle size={16} />
          <span>
            Cancelada por <strong>{invoice.cancelledBy ?? 'usuario desconocido'}</strong>
            {invoice.cancelledAt ? ` el ${formatDateTime(invoice.cancelledAt)}` : ''}: {invoice.cancellationReason}
          </span>
        </div>
      )}

      <div className="doc-actions-bar">
        {invoice.status === 'draft' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-danger btn-size-sm" onClick={openCancelModal} disabled={isActionsLoading}>
                <Ban size={14} /> Cancelar
              </button>

              {!noCredit && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={payCash} onChange={(e) => setPayCash(e.target.checked)} />
                  Cobrar al contado
                </label>
              )}

              {showCashSelector && (
                <select
                  className="ff-select"
                  style={{ width: 200, height: 32 }}
                  value={modeOfPayment}
                  onChange={(e) => setModeOfPayment(e.target.value)}
                >
                  <option value="">Método de pago…</option>
                  {metodos?.filter((m) => !m.disabled).map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              )}

              <button className="btn btn-primary btn-size-sm" onClick={handleSubmitClick} disabled={isActionsLoading}>
                <Send size={14} /> Someter
              </button>
            </div>
            {noCredit && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                <AlertTriangle size={12} /> Este cliente no tiene crédito habilitado — se cobrará al contado.
              </p>
            )}
          </div>
        )}
        {invoice.status === 'submitted' && (
          <>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending
                ? <><span className="spinner" /> Descargando…</>
                : <><Download size={14} /> Descargar PDF</>}
            </button>
            <button className="btn btn-secondary btn-size-sm" onClick={openReturnModal} disabled={isActionsLoading}>
              <RotateCcw size={14} /> Devolver producto(s)
            </button>
            <button className="btn btn-danger btn-size-sm" onClick={openCancelModal} disabled={isActionsLoading}>
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

      {invoice.status === 'draft' && saldoFavor && saldoFavor.balance > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wallet size={16} /> Aplicar saldo a favor disponible
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Total disponible: {formatDOP(saldoFavor.balance)}
            </span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th style={{ textAlign: 'right' }}>Disponible</th>
                  <th style={{ textAlign: 'right', width: 140 }}>Monto a aplicar</th>
                  <th style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {saldoFavor.entries.map((entry) => (
                  <tr key={entry.paymentEntryId}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{entry.paymentEntryId}</td>
                    <td>{formatDate(entry.postingDate)}</td>
                    <td>{entry.modeOfPayment}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(entry.unallocatedAmount)}</td>
                    <td>
                      <input
                        className="items-input"
                        type="number"
                        min="0.01"
                        max={entry.unallocatedAmount}
                        step="0.01"
                        style={{ textAlign: 'right' }}
                        value={saldoAmounts[entry.paymentEntryId] ?? entry.unallocatedAmount}
                        onChange={(e) => setSaldoAmounts((prev) => ({ ...prev, [entry.paymentEntryId]: parseFloat(e.target.value) || 0 }))}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-size-sm"
                        disabled={applySaldoMutation.isPending}
                        onClick={() => {
                          const amount = saldoAmounts[entry.paymentEntryId] ?? entry.unallocatedAmount
                          if (!amount || amount <= 0 || amount > entry.unallocatedAmount) {
                            toast.error('El monto debe ser mayor a 0 y no exceder el saldo disponible')
                            return
                          }
                          applySaldoMutation.mutate({ paymentEntryId: entry.paymentEntryId, amount })
                        }}
                      >
                        Aplicar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                <th>Notas</th>
                <th style={{ textAlign: 'right' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>UDM</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.notes ?? ''}>{item.notes ?? '—'}</td>
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
            {(() => {
              const gross = invoice.items.reduce((s, i) => s + i.qty * i.rate, 0)
              const discount = gross - invoice.subtotal
              return (
                <>
                  <div className="items-total-line"><span>Subtotal bruto</span><span>{formatDOP(gross)}</span></div>
                  {discount > 0 && <div className="items-total-line" style={{ color: 'var(--text-danger)' }}><span>Descuento total</span><span>-{formatDOP(discount)}</span></div>}
                  <div className="items-total-line"><span>Subtotal neto</span><span>{formatDOP(invoice.subtotal)}</span></div>
                </>
              )
            })()}
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

      {/* Historial */}
      <DocumentHistoryCard history={invoice.history} basePath="/facturacion/facturas" currentDocId={invoice.id} />

      {/* Modal: crédito excedido al someter */}
      {creditErrorOpen && (
        <div className="modal-overlay" onClick={() => setCreditErrorOpen(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} style={{ color: 'var(--error-text)' }} /> Crédito excedido
              </h2>
              <button className="modal-close" onClick={() => setCreditErrorOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{creditErrorMsg}</p>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="modeOfPaymentRetry">Método de pago <span className="ff-required">*</span></label>
                <select
                  id="modeOfPaymentRetry"
                  className="ff-select"
                  value={modeOfPayment}
                  onChange={(e) => setModeOfPayment(e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {metodos?.filter((m) => !m.disabled).map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setCreditErrorOpen(false)}>Volver</button>
              <button
                className="btn btn-primary"
                onClick={handleCashRetry}
                disabled={submitMutation.isPending}
              >
                <Send size={14} /> Cobrar al contado y someter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cancelar factura con motivo obligatorio */}
      {cancelModalOpen && (
        <div className="modal-overlay" onClick={() => setCancelModalOpen(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ban size={16} style={{ color: 'var(--error-text)' }} /> Cancelar factura
              </h2>
              <button className="modal-close" onClick={() => setCancelModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {cancelForbiddenMsg && (
                <div className="inline-alert inline-alert-warn">
                  <AlertTriangle size={16} />
                  <span>{cancelForbiddenMsg}</span>
                </div>
              )}
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="cancelReason">Motivo de cancelación</label>
                <textarea
                  id="cancelReason"
                  className="ff-textarea"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Describe el motivo de la cancelación (mínimo 10 caracteres)"
                  maxLength={500}
                />
                <p className="ff-hint">{cancelReason.trim().length}/500 caracteres (mínimo 10)</p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setCancelModalOpen(false)}>Volver</button>
              <button
                className="btn btn-danger"
                onClick={() => cancelMutation.mutate(cancelReason.trim())}
                disabled={!cancelReasonValid || cancelMutation.isPending}
              >
                <Ban size={14} /> Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: devolver producto(s) */}
      {returnModalOpen && (
        <div className="modal-overlay" onClick={() => setReturnModalOpen(false)}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={16} /> Devolver producto(s)
              </h2>
              <button className="modal-close" onClick={() => setReturnModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={returnFullInvoice}
                  onChange={(e) => setReturnFullInvoice(e.target.checked)}
                />
                Devolver la factura completa
              </label>

              {!returnFullInvoice && (
                <div className="items-table-wrap">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Artículo</th>
                        <th style={{ textAlign: 'right', width: 100 }}>Comprado</th>
                        <th style={{ textAlign: 'right', width: 120 }}>Cant. a devolver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnRows.map((row) => (
                        <tr key={row.itemCode} style={{ opacity: row.checked ? 1 : 0.6 }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={() => toggleReturnRow(row.itemCode)}
                              style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                            />
                          </td>
                          <td>
                            <span style={{ fontWeight: 500 }}>{row.description}</span>
                            <br />
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{row.itemCode}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{row.qtyPurchased}</td>
                          <td>
                            <input
                              className={`items-input${row.checked && (row.qty <= 0 || row.qty > row.qtyPurchased) ? ' items-input-error' : ''}`}
                              type="number"
                              min="0"
                              max={row.qtyPurchased}
                              step="1"
                              style={{ textAlign: 'right' }}
                              value={row.qty}
                              disabled={!row.checked}
                              onChange={(e) => setReturnRowQty(row.itemCode, parseFloat(e.target.value) || 0)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label ff-required">¿Qué hacer con el monto?</label>
                <select
                  className="ff-select"
                  value={returnResolution}
                  onChange={(e) => setReturnResolution(e.target.value as 'refund' | 'credit_note_only')}
                >
                  <option value="credit_note_only">Saldo a favor</option>
                  <option value="refund">Reembolsar ahora</option>
                </select>
              </div>

              {returnResolution === 'refund' && (
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="returnModeOfPayment">Método de pago del reembolso</label>
                  <select
                    id="returnModeOfPayment"
                    className="ff-select"
                    value={returnModeOfPayment}
                    onChange={(e) => setReturnModeOfPayment(e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {metodos?.filter((m) => !m.disabled).map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="returnReason">Motivo de la devolución</label>
                <textarea
                  id="returnReason"
                  className="ff-textarea"
                  rows={3}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Describe el motivo de la devolución (mínimo 10 caracteres)"
                  maxLength={500}
                />
                <p className="ff-hint">{returnReason.trim().length}/500 caracteres (mínimo 10)</p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setReturnModalOpen(false)}>Volver</button>
              <button
                className="btn btn-primary"
                onClick={() => devolucionMutation.mutate()}
                disabled={!canConfirmReturn || devolucionMutation.isPending}
              >
                {devolucionMutation.isPending && <span className="spinner" />}
                <RotateCcw size={14} /> Confirmar devolución
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
