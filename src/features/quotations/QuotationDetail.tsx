import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuotation, submitQuotation, deleteQuotation, convertQuotationToInvoice, cancelQuotation, downloadQuotationPdf } from '@/shared/api/quotations'
import type { Quotation } from '@/shared/api/types'
import { ArrowLeft, Download, FileText, Loader2, Send, Trash2, ClipboardList, XCircle, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDOP, displayId } from '@/lib/formatters'
import { getCatalogosFiscales } from '@/shared/api/config'
import { DocumentHistoryCard } from '@/components/shared/DocumentHistoryCard'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

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

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [ncfTypeSearch, setNcfTypeSearch] = useState('')
  const ncfTypeOptions: SearchSelectOption[] = (catalogos?.ncfTypes ?? [])
    .filter((t) => !ncfTypeSearch || t.label.toLowerCase().includes(ncfTypeSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

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
        navigate(`/facturas/${invoice.invoiceId}`)
      } else {
        navigate('/facturas')
      }
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al convertir la cotización')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelQuotation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['quotation', id] })
      toast.success('Cotización cancelada')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al cancelar la cotización')
    },
  })

  const downloadMutation = useMutation({
    mutationFn: () => downloadQuotationPdf(id!, `cotizacion-${id}.pdf`),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const isActionsLoading = submitMutation.isPending || deleteMutation.isPending || convertMutation.isPending || cancelMutation.isPending || downloadMutation.isPending

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
  const taxAmount = quotation.taxAmount ?? 0
  const total = quotation.grandTotal ?? subtotal + taxAmount

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/cotizaciones')}>
            <ArrowLeft size={14} /> Cotizaciones
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Cotización {displayId(quotation.id, quotation.sequence)}
            <span className={`badge ${STATUS_BADGE[quotation.status] ?? 'badge-neutral'}`}>
              {STATUS_LABEL[quotation.status] ?? quotation.status}
            </span>
            {quotation.sequence > 0 && (
              <span className="badge badge-info" title="Veces que se ha editado en borrador">
                Versión {quotation.sequence}
              </span>
            )}
          </h1>
          <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Cliente: {quotation.customerName}
            {quotation.amendedFrom && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                · Basada en {quotation.amendedFrom}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="doc-actions-bar">
        <button
          className="btn btn-secondary btn-size-sm"
          onClick={() => navigate(`/cotizaciones/nueva?duplicate=${id}`)}
          disabled={isActionsLoading}
        >
          <Copy size={14} /> Duplicar
        </button>
        {quotation.status === 'draft' && (
          <>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => navigate(`/cotizaciones/${id}/editar`)}
              disabled={isActionsLoading}
            >
              <FileText size={14} /> Editar
            </button>
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
            <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/cotizaciones/${id}/editar`)} disabled={isActionsLoading}>
              <FileText size={14} /> Editar
            </button>
            <button className="btn btn-danger btn-size-sm" onClick={() => cancelMutation.mutate()} disabled={isActionsLoading}>
              <XCircle size={14} /> Cancelar
            </button>
            <button className="btn btn-secondary btn-size-sm" onClick={() => setConvertDialogOpen(true)} disabled={isActionsLoading}>
              <FileText size={14} /> Convertir a Factura
            </button>
            <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/pedidos/nuevo?quotation=${id}`)} disabled={isActionsLoading}>
              <ClipboardList size={14} /> Crear Pedido
            </button>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending
                ? <><span className="spinner" /> Descargando…</>
                : <><Download size={14} /> Descargar PDF</>}
            </button>
          </>
        )}
        {quotation.status !== 'draft' && quotation.status !== 'submitted' && (
          <p className="page-sub" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            {quotation.status === 'cancelled' ? 'Cotización cancelada' : quotation.status === 'ordered' ? 'Cotización ordenada' : 'Cotización perdida'}
          </p>
        )}
        {quotation.status === 'ordered' && (
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
              <span className="detail-value">
                {quotation.esClienteOcasional ? (
                  <span>
                    {quotation.clienteOcasionalNombre ?? quotation.customerName}
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>(ocasional)</span>
                  </span>
                ) : (
                  quotation.customerName
                )}
              </span>
            </div>
            {quotation.esClienteOcasional && quotation.clienteOcasionalDireccion && (
              <div className="detail-field">
                <span className="detail-label">Dirección</span>
                <span className="detail-value">{quotation.clienteOcasionalDireccion}</span>
              </div>
            )}
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
                <th>Notas</th>
                <th style={{ textAlign: 'right' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th style={{ textAlign: 'right' }}>Impuesto</th>
                <th>UDM</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item, i) => (
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
                  <td style={{ textAlign: 'right' }} title={`${item.taxRate}%`}>{formatDOP(item.taxAmount)}</td>
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
            {/*<div className="items-total-line">
              <span>Subtotal neto</span>
              <span>{formatDOP(subtotal)}</span>
            </div>*/}
            <div className="items-total-line">
              <span>Impuesto</span>
              <span>{formatDOP(taxAmount)}</span>
            </div>
            <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
              <span>Total</span>
              <span>{formatDOP(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Historial */}
      <DocumentHistoryCard history={quotation.history} basePath="/cotizaciones" currentDocId={quotation.id} />

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
                <SearchSelect
                  value={selectedNcfType}
                  onChange={setSelectedNcfType}
                  options={ncfTypeOptions}
                  onSearch={setNcfTypeSearch}
                  selectedLabel={catalogos?.ncfTypes?.find((t) => t.value === selectedNcfType)?.label ?? ''}
                  placeholder="Seleccionar tipo"
                />
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
