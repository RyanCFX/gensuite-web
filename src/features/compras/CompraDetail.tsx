import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getCompra, submitCompra, cancelCompra, amendCompra, deleteCompra, downloadCompraPdf, getCompraPdfBlobUrl,
  previewAsientosCompra, updateCompra,
} from '@/shared/api/compras-gastos'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EcfStatusCard } from '@/components/shared/EcfStatusCard'
import { formatDate, formatDOP } from '@/lib/formatters'
import { getCatalogosFiscales, getFacturacionConfig } from '@/shared/api/config'
import { listRetenciones } from '@/shared/api/retenciones'
import { Send, X, RotateCcw, Undo2, Info, FileText, Trash2, Eye, BookOpen } from 'lucide-react'
import { PdfFormatButton } from '@/components/shared/PdfFormatButton'
import { PdfPreviewModal } from '@/components/shared/PdfPreviewModal'
import { SaldoFavorCxpSection } from '@/features/devoluciones-compras/SaldoFavorCxpSection'
import { AsientosPreviewModal } from '@/components/shared/AsientosPreviewModal'
import { PagoContadoModal } from '@/components/shared/PagoContadoModal'
import { ECF_SUBMIT_UNAVAILABLE_MSG } from '@/shared/api/ecf'
import { useAuthStore } from '@/stores/auth.store'
import type { FormatoImpresion, ImpuestoDistribucionDto, EcfSubmitResult, ApiError, PagoContadoDto } from '@/shared/api/types'

type ConfirmAction = 'submit' | 'cancel' | 'amend' | 'delete' | null

export default function CompraDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isSystemManager = useAuthStore((s) => s.user?.roles?.includes('System Manager') ?? false)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [showAsientosPreview, setShowAsientosPreview] = useState(false)
  const [showPagoContadoModal, setShowPagoContadoModal] = useState(false)
  // e-CF autogenerado al someter (proveedor ocasional sin NCF + e-CF habilitado). Raro hoy.
  const [ecfResult, setEcfResult] = useState<EcfSubmitResult | null>(null)

  const { data: compra, isLoading, isError } = useQuery({
    queryKey: ['compra', id],
    queryFn: () => getCompra(id!),
    enabled: !!id,
  })

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })

  const { data: retencionesData } = useQuery({
    queryKey: ['retenciones-all'],
    queryFn: () => listRetenciones({ limit: 100 }),
    staleTime: 60 * 60_000,
  })

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const formatoImpresionDefault = facturacionConfig?.formatoImpresionDefault ?? 'a4'
  const formatosPermitidos = facturacionConfig?.formatosPermitidos

  const downloadMutation = useMutation({
    mutationFn: (formato?: FormatoImpresion) => downloadCompraPdf(id!, `compra-${id}.pdf`, formato ?? formatoImpresionDefault),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo descargar el PDF'),
  })

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewMutation = useMutation({
    mutationFn: (formato?: FormatoImpresion) => getCompraPdfBlobUrl(id!, formato ?? formatoImpresionDefault),
    onSuccess: (url) => setPreviewUrl(url),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo generar la vista previa del PDF'),
  })

  const submitMutation = useMutation({
    mutationFn: (body?: PagoContadoDto) => submitCompra(id!, body),
    onSuccess: (result) => {
      toast.success('Compra sometida')
      queryClient.invalidateQueries({ queryKey: ['compra', id] })
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      setConfirmAction(null)
      setShowPagoContadoModal(false)
      if (result.data?.ecf) setEcfResult(result.data.ecf)
      const updatedPrices = (result.data as any)?.updatedPrices
      if (updatedPrices && updatedPrices > 0) {
        toast.info(`Se actualizaron los precios de ${updatedPrices} artículo(s) (modo sobre costo)`)
      }
      if (result.pago) {
        toast.success('Pago registrado', {
          action: { label: 'Ver pago', onClick: () => navigate(`/pagos/${result.pago!.id}`) },
        })
      }
    },
    onError: (err: ApiError, body) => {
      if (err?.statusCode === 503) {
        toast.error(ECF_SUBMIT_UNAVAILABLE_MSG, {
          duration: 8000,
          action: isSystemManager ? { label: 'Contingencia', onClick: () => navigate('/config/ecf/admin') } : undefined,
        })
        return
      }
      // La compra probablemente sí quedó sometida (el 500 ocurre al crear el Payment Entry, ya
      // con la compra confirmada) — refrescamos el detalle en vez de tratarlo como fallo total.
      if (body && err?.statusCode === 500) {
        toast.error(err?.message ?? 'La compra se sometió pero el pago no pudo registrarse — regístralo manualmente', { duration: 10000 })
        queryClient.invalidateQueries({ queryKey: ['compra', id] })
        queryClient.invalidateQueries({ queryKey: ['compras'] })
        setShowPagoContadoModal(false)
        return
      }
      toast.error(err?.message ?? 'Error al someter la compra')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelCompra(id!),
    onSuccess: () => { toast.success('Compra anulada'); queryClient.invalidateQueries({ queryKey: ['compra', id] }); queryClient.invalidateQueries({ queryKey: ['compras'] }); setConfirmAction(null) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al anular la compra'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendCompra(id!),
    onSuccess: (data) => { toast.success('Enmienda creada'); queryClient.invalidateQueries({ queryKey: ['compras'] }); navigate(`/compras/${data.id}`) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al enmendar la compra'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompra(id!),
    onSuccess: () => {
      toast.success('Compra eliminada')
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      setConfirmAction(null)
      navigate('/compras')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al eliminar la compra')
    },
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate(undefined)
    else if (confirmAction === 'cancel') cancelMutation.mutate()
    else if (confirmAction === 'amend') amendMutation.mutate()
    else if (confirmAction === 'delete') deleteMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending || deleteMutation.isPending

  function getTipoBienesLabel(value?: string) {
    return (catalogos?.tipoBienes606 ?? []).find((t) => t.value === value)?.label ?? value ?? '—'
  }
  function getFormaPagoLabel(value?: string) {
    return (catalogos?.formaPago606 ?? []).find((f) => f.value === value)?.label ?? value ?? '—'
  }
  function fmtMonto(m?: number) { return m != null ? formatDOP(m) : '—' }

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
    delete: { title: '¿Eliminar compra?', description: 'Esta acción eliminará permanentemente la compra. No se puede deshacer.', actionLabel: 'Eliminar' },
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Compras
      </button>

      <PageHeader
        title={`Compra ${compra.id}`}
        description={compra.esProveedorOcasional ? (compra.proveedorOcasionalNombre ?? compra.supplierName) : compra.supplierName}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {compra.status === 'draft' && (
              <>
                <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/compras/${id}/editar`)}>
                  <FileText size={14} />Editar
                </button>
                <button className="btn btn-secondary btn-size-sm" onClick={() => setShowAsientosPreview(true)}>
                  <BookOpen size={14} />Impacto contable
                </button>
                <button
                  className="btn btn-primary btn-size-sm"
                  onClick={() => (compra.tipoPago === 'Contado' ? setShowPagoContadoModal(true) : setConfirmAction('submit'))}
                >
                  <Send size={14} />Someter
                </button>
                <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAction('delete')}>
                  <Trash2 size={14} />Eliminar
                </button>
              </>
            )}
            {compra.status === 'submitted' && (
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
                <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/devoluciones-compras/nueva?originalInvoice=${encodeURIComponent(id!)}`)}>
                  <Undo2 size={14} />Devolución
                </button>
                <button
                  className="btn btn-secondary btn-size-sm"
                  onClick={() => {
                    const postingDate = compra.postingDate.split('T')[0]
                    navigate(
                      `/contabilidad/libro-diario?voucherNo=${encodeURIComponent(compra.id)}` +
                      `&voucherType=Purchase+Invoice&fromDate=${postingDate}&toDate=${postingDate}`,
                    )
                  }}
                >
                  <BookOpen size={14} />Ver asientos
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

        {(ecfResult ?? compra.ecf) && <EcfStatusCard ecf={ecfResult ?? compra.ecf!} />}

        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Proveedor</span>
              <span className="detail-value">
                {compra.esProveedorOcasional ? (
                  <span>
                    {compra.proveedorOcasionalNombre ?? compra.supplierName}
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>(ocasional)</span>
                  </span>
                ) : (
                  compra.supplierName
                )}
              </span>
            </div>
            {compra.esProveedorOcasional && compra.proveedorOcasionalRnc && (
              <div className="detail-field">
                <span className="detail-label">RNC/Cédula</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{compra.proveedorOcasionalRnc}</span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(compra.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Vencimiento</span>
              <span className="detail-value">{formatDate(compra.dueDate)}</span>
            </div>
            {((compra.impuestos?.length ?? 0) > 0 || !!compra.taxAmount) && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Impuestos</span>
                <span className="detail-value" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(compra.impuestos ?? []).map((imp, idx) => (
                    <span key={`${imp.id}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                      <span>{imp.id} ({imp.tasa}%)</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMonto(imp.monto)}</strong>
                    </span>
                  ))}
                  {compra.taxAmount != null && (
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--border-default)', paddingTop: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Total impuestos</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatDOP(compra.taxAmount)}</strong>
                    </span>
                  )}
                </span>
              </div>
            )}
            {(compra.retenciones?.length ?? 0) > 0 && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Retenciones</span>
                <span className="detail-value" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(compra.retenciones ?? []).map((r) => {
                    const opt = retencionesData?.items?.find((x) => x.id === r.id)
                    return (
                      <span key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                        <span>{opt?.categoryName ?? r.id} ({r.tasa}%)</span>
                        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMonto(r.monto)}</strong>
                      </span>
                    )
                  })}
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--border-default)', paddingTop: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total retenciones</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {formatDOP((compra.retenciones ?? []).reduce((s, r) => s + (r.monto ?? 0), 0))}
                    </strong>
                  </span>
                </span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Total</span>
              <span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(compra.grandTotal)}</span>
            </div>
            {compra.status === 'submitted' && (
              <div className="detail-field">
                <span className="detail-label">Pendiente</span>
                <span className="detail-value">{formatDOP(compra.outstandingAmount ?? 0)}</span>
              </div>
            )}
            {compra.cuentaCxpOverride && (
              <div className="detail-field">
                <span className="detail-label">Cuenta CxP (override)</span>
                <span className="detail-value">{compra.cuentaCxpOverride}</span>
              </div>
            )}
          </div>
        </div>

        {!compra.esProveedorOcasional && (
          <SaldoFavorCxpSection
            supplierId={compra.supplier}
            supplierName={compra.supplierName}
            invoiceId={compra.id}
            invoiceStatus={compra.status}
            invoiceGrandTotal={compra.grandTotal}
            outstandingAmount={compra.outstandingAmount}
            onChanged={() => queryClient.invalidateQueries({ queryKey: ['compra', id] })}
          />
        )}

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
                    <td>
                      {item.itemCode}
                      {item.cuentaContable && (
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Cuenta: {item.cuentaContable}
                        </span>
                      )}
                    </td>
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
              <span className="detail-label">N° Factura del Proveedor</span>
              <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{compra.billNo ?? '—'}</span>
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
              <span className="detail-label">Retención ISR</span>
              <span className="detail-value">{formatDOP(compra.retencionIsr)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Retención ITBIS</span>
              <span className="detail-value">{formatDOP(compra.retencionItbis)}</span>
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
      <PagoContadoModal
        open={showPagoContadoModal}
        onClose={() => setShowPagoContadoModal(false)}
        outstandingAmount={compra.outstandingAmount ?? compra.grandTotal}
        postingDate={compra.postingDate.split('T')[0]}
        loading={submitMutation.isPending}
        onConfirm={(body) => submitMutation.mutate(body)}
      />
      <PdfPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      <AsientosPreviewModal
        open={showAsientosPreview}
        onClose={() => setShowAsientosPreview(false)}
        queryKey={['compra-preview-asientos', id]}
        queryFn={() => previewAsientosCompra(id!)}
        onRedistribuir={(payload: ImpuestoDistribucionDto) =>
          updateCompra(id!, { impuestoDistribucion: [payload] }).then(() =>
            queryClient.invalidateQueries({ queryKey: ['compra', id] }))
        }
      />
    </div>
  )
}
