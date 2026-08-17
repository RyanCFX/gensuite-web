import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getDevolucionCompra,
  submitDevolucionCompra,
  cancelDevolucionCompra,
  amendDevolucionCompra,
  deleteDevolucionCompra,
  getDevolucionCompraPdfBlobUrl,
  downloadDevolucionCompraPdf,
  unapplyDevolucionFromCxp,
} from '@/shared/api/devoluciones-compras'
import { getFacturacionConfig } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Send, X, RotateCcw, Undo2, FileText, Eye, Trash2, Banknote } from 'lucide-react'
import { PdfFormatButton } from '@/components/shared/PdfFormatButton'
import { PdfPreviewModal } from '@/components/shared/PdfPreviewModal'
import { ApplyToCxpModal } from './ApplyToCxpModal'
import type { FormatoImpresion } from '@/shared/api/types'

type ConfirmAction = 'submit' | 'cancel' | 'amend' | 'delete' | null

export default function DevolucionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [applyTarget, setApplyTarget] = useState<{ invoiceId: string } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const { data: devolucion, isLoading, isError } = useQuery({
    queryKey: ['devolucion', id],
    queryFn: () => getDevolucionCompra(id!),
    enabled: !!id,
    staleTime: 60_000,
  })

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const formatoImpresionDefault = facturacionConfig?.formatoImpresionDefault ?? 'a4'
  const formatosPermitidos = facturacionConfig?.formatosPermitidos

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['devolucion', id] })
    queryClient.invalidateQueries({ queryKey: ['devoluciones-compras'] })
  }

  const downloadMutation = useMutation({
    mutationFn: (formato?: FormatoImpresion) => downloadDevolucionCompraPdf(id!, `devolucion-${id}.pdf`, formato ?? formatoImpresionDefault),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo descargar el PDF'),
  })
  const previewMutation = useMutation({
    mutationFn: (formato?: FormatoImpresion) => getDevolucionCompraPdfBlobUrl(id!, formato ?? formatoImpresionDefault),
    onSuccess: (url) => setPreviewUrl(url),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo generar la vista previa del PDF'),
  })
  const submitMutation = useMutation({
    mutationFn: () => submitDevolucionCompra(id!),
    onSuccess: () => { toast.success('Devolución sometida'); invalidate(); setConfirmAction(null) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al someter la devolución'),
  })
  const cancelMutation = useMutation({
    mutationFn: () => cancelDevolucionCompra(id!),
    onSuccess: () => { toast.success('Devolución anulada'); invalidate(); setConfirmAction(null) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al anular la devolución'),
  })
  const amendMutation = useMutation({
    mutationFn: () => amendDevolucionCompra(id!),
    onSuccess: (data) => { toast.success('Enmienda creada'); invalidate(); navigate(`/devoluciones-compras/${data.id}`) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al enmendar la devolución'),
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteDevolucionCompra(id!),
    onSuccess: () => { toast.success('Devolución eliminada'); queryClient.invalidateQueries({ queryKey: ['devoluciones-compras'] }); setConfirmAction(null); navigate('/devoluciones-compras') },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar la devolución'),
  })
  const unapplyMutation = useMutation({
    mutationFn: (invoiceId: string) => unapplyDevolucionFromCxp(id!, invoiceId),
    onSuccess: () => { toast.success('Aplicación revertida'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo revertir la aplicación'),
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate()
    else if (confirmAction === 'cancel') cancelMutation.mutate()
    else if (confirmAction === 'amend') amendMutation.mutate()
    else if (confirmAction === 'delete') deleteMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending || deleteMutation.isPending

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !devolucion) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>Error al cargar la devolución.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  const confirmMessages: Record<NonNullable<ConfirmAction>, { title: string; description: string; actionLabel: string }> = {
    submit: { title: '¿Someter devolución?', description: 'Contabilizará la devolución y revertirá el inventario. No se podrá editar.', actionLabel: 'Someter' },
    cancel: { title: '¿Anular devolución?', description: 'La devolución será anulada y se revertirá el asiento contable.', actionLabel: 'Anular' },
    amend: { title: '¿Enmendar devolución?', description: 'Se creará una nueva devolución basada en esta. La versión actual será anulada.', actionLabel: 'Enmendar' },
    delete: { title: '¿Eliminar devolución?', description: 'Esta acción eliminará permanentemente la devolución. Solo disponible en Borrador.', actionLabel: 'Eliminar' },
  }

  const isSubmitted = devolucion.status === 'submitted'
  const available = isSubmitted ? (devolucion.availableAmount ?? 0) : 0
  const appliedTo = devolucion.appliedTo ?? []

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate('/devoluciones-compras')}>← Devoluciones de Compras</button>

      <PageHeader
        title={`Devolución ${devolucion.id}`}
        description={devolucion.supplierName ?? devolucion.supplier}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {devolucion.status === 'draft' && (
              <>
                <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/devoluciones-compras/${id}/editar`)}>
                  <FileText size={14} />Editar
                </button>
                <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmAction('submit')}>
                  <Send size={14} />Someter
                </button>
                <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAction('delete')}>
                  <Trash2 size={14} />Eliminar
                </button>
              </>
            )}
            {devolucion.status === 'submitted' && (
              <>
                <PdfFormatButton
                  onSelect={(formato) => previewMutation.mutate(formato)}
                  loading={previewMutation.isPending}
                  label="Ver PDF"
                  loadingLabel="Generando…"
                  icon={<Eye size={14} />}
                  formatosPermitidos={formatosPermitidos}
                />
                <PdfFormatButton
                  onSelect={(formato) => downloadMutation.mutate(formato)}
                  loading={downloadMutation.isPending}
                  formatosPermitidos={formatosPermitidos}
                />
                <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAction('cancel')}>
                  <X size={14} />Anular
                </button>
                <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('amend')}>
                  <RotateCcw size={14} />Enmendar
                </button>
                {available > 0 && (
                  <button className="btn btn-secondary btn-size-sm" onClick={() => setApplyTarget({ invoiceId: '' })}>
                    <Banknote size={14} />Aplicar a CxP
                  </button>
                )}
              </>
            )}
            {devolucion.status === 'cancelled' && (
              <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('amend')}>
                <RotateCcw size={14} />Enmendar
              </button>
            )}
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={devolucion.status} />
          {devolucion.amendedFrom && <span className="badge badge-default">Enmendada de {devolucion.amendedFrom}</span>}
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Información General</span></div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field"><span className="detail-label">Proveedor</span><span className="detail-value">{devolucion.supplierName ?? devolucion.supplier}</span></div>
            <div className="detail-field"><span className="detail-label">Factura origen</span><span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{devolucion.originalInvoice}</span></div>
            <div className="detail-field"><span className="detail-label">Fecha</span><span className="detail-value">{formatDate(devolucion.postingDate)}</span></div>
            <div className="detail-field"><span className="detail-label">NCF</span><span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{devolucion.ncf ?? '—'}</span></div>
            <div className="detail-field"><span className="detail-label">Motivo</span><span className="detail-value">{devolucion.reason ?? '—'}</span></div>
            <div className="detail-field"><span className="detail-label">Total</span><span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(devolucion.grandTotal)}</span></div>
            {!!devolucion.taxAmount && (
              <div className="detail-field"><span className="detail-label">Impuestos</span><span className="detail-value">{formatDOP(devolucion.taxAmount)}</span></div>
            )}
            {isSubmitted && (
              <>
                <div className="detail-field"><span className="detail-label">Aplicado</span><span className="detail-value">{formatDOP(devolucion.appliedAmount ?? 0)}</span></div>
                <div className="detail-field"><span className="detail-label">Disponible</span><span className="detail-value" style={{ color: 'var(--success-text)' }}>{formatDOP(available)}</span></div>
                <div className="detail-field"><span className="detail-label">Pendiente</span><span className="detail-value">{formatDOP(devolucion.outstandingAmount ?? 0)}</span></div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Artículos devueltos</span></div>
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
                {devolucion.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.itemCode}</td>
                    <td>{item.description ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                  <td colSpan={4} style={{ textAlign: 'right' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(devolucion.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {appliedTo.length > 0 && (
          <div className="card">
            <div className="card-header"><span className="card-title">Aplicado a Cuentas por Pagar</span></div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Factura (CxP)</th>
                    <th>NCF/N° Factura Proveedor</th>
                    <th>Tipo Comprobante</th>
                    <th>Fecha</th>
                    <th>Estado Factura</th>
                    <th style={{ textAlign: 'right' }}>Total Factura</th>
                    <th style={{ textAlign: 'right' }}>Pendiente Factura</th>
                    <th style={{ textAlign: 'right' }}>Monto Aplicado</th>
                    <th>Estado</th>
                    <th>Asiento</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {appliedTo.map((a) => (
                    <tr key={a.invoiceId} style={{ fontSize: 13 }}>
                      <td>
                        <button
                          className="btn btn-link btn-size-sm"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
                          onClick={() => navigate(`/compras/${a.invoiceId}`)}
                          title="Ver factura de compra"
                        >
                          {a.invoiceId}
                        </button>
                      </td>
                      <td className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {a.ncfProveedor || a.billNo || '—'}
                      </td>
                      <td className="td-muted">{a.tipoComprobante || '—'}</td>
                      <td className="td-muted">{a.postingDate ? formatDate(a.postingDate) : '—'}</td>
                      <td>{a.invoiceStatus ? <StatusBadge status={a.invoiceStatus} /> : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {a.grandTotal != null ? formatDOP(a.grandTotal) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {a.outstandingAmount != null ? formatDOP(a.outstandingAmount) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDOP(a.amount)}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {a.status === 'reconciled' ? a.journalEntryId ?? '—' : '—'}
                      </td>
                      <td>
                        {a.status === 'pending' ? (
                          <button
                            className="btn btn-ghost btn-size-xs"
                            onClick={() => unapplyMutation.mutate(a.invoiceId)}
                            disabled={unapplyMutation.isPending}
                            title="Revertir aplicación (la CxP destino sigue en Borrador)"
                          >
                            <Undo2 size={12} />Revertir
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Conciliada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {appliedTo.some((a) => a.status === 'pending') && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '0 16px 12px' }}>
                Las aplicaciones en estado "pending" se consolidarán con un asiento contable cuando la factura destino se someta.
              </p>
            )}
          </div>
        )}
      </div>

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{confirmMessages[confirmAction].title}</h2>
              <button className="modal-close" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{confirmMessages[confirmAction].description}</p>
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

      {applyTarget !== null && (
        <ApplyToCxpModal
          devolucionId={id!}
          supplier={devolucion.supplier}
          supplierName={devolucion.supplierName}
          availableAmount={available}
          onClose={() => setApplyTarget(null)}
          onSuccess={() => { setApplyTarget(null); invalidate() }}
        />
      )}

      <PdfPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}
