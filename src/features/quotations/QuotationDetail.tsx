import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuotation, getQuotationVersion, submitQuotation, deleteQuotation, convertQuotationToInvoice, cancelQuotation, downloadQuotationPdf } from '@/shared/api/quotations'
import type { Quotation } from '@/shared/api/types'
import { ArrowLeft, Download, FileText, Loader2, Send, Trash2, ClipboardList, XCircle, Copy, Link2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatMoney, displayId } from '@/lib/formatters'
import { getCatalogosFiscales, getFacturacionConfig } from '@/shared/api/config'
import { DocumentHistoryCard } from '@/components/shared/DocumentHistoryCard'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

const ITEMS_COLUMNS = [
  { key: 'codigo', width: 100 },
  { key: 'descripcion', width: 220 },
  { key: 'notas', width: 160 },
  { key: 'cantidad', width: 90 },
  { key: 'precio', width: 110 },
  { key: 'descuento', width: 72 },
  { key: 'importe', width: 110 },
  { key: 'impuesto', width: 100 },
  { key: 'udm', width: 90 },
]

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  ordered: 'badge-info',
  lost: 'badge-warning',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  ordered: 'Cotización ordenada',
  lost: 'Perdido',
  cancelled: 'Cancelado',
}

export default function QuotationDetail() {
  const { id, version } = useParams<{ id: string; version?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedNcfType, setSelectedNcfType] = useState<string>('B02')
  const [relatedOpen, setRelatedOpen] = useState(false)
  const relatedRef = useRef<HTMLDivElement>(null)
  const { widths: itemsColWidths, startResize: startItemsResize } = useResizableColumns(ITEMS_COLUMNS)

  // Una entrada del historial con el mismo id que el documento actual es una revisión de borrador
  // anterior (no un documento amendado aparte) — GET /quotations/:id/versions/:sequence devuelve
  // un snapshot liviano (DraftVersion: id/sequence/savedAt/status/items/grandTotal), no la
  // cotización completa. Viéndola aquí es de solo lectura: no hay acciones ni mutaciones.
  const isHistoricalVersion = !!version

  const { data: versionData, isLoading: loadingVersion } = useQuery({
    queryKey: ['quotation-version', id, version],
    queryFn: () => getQuotationVersion(id!, Number(version)),
    enabled: isHistoricalVersion && !!id,
  })

  const { data: quotation, isLoading } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => getQuotation(id!),
    enabled: !isHistoricalVersion && !!id,
  })

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'

  useEffect(() => {
    if (!relatedOpen) return
    const onDown = (e: PointerEvent) => {
      if (relatedRef.current && !relatedRef.current.contains(e.target as Node)) setRelatedOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRelatedOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [relatedOpen])

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
        const needsRnc = selectedNcfType === 'B01' && !quotation?.clienteOcasionalRnc
        navigate(needsRnc ? `/facturas/${invoice.invoiceId}/editar` : `/facturas/${invoice.invoiceId}`)
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

  if (isHistoricalVersion) {
    if (loadingVersion) {
      return (
        <div className="page-container">
          <div className="skeleton-box" style={{ width: 280, height: 28, marginBottom: 8 }} />
          <div className="skeleton-box" style={{ width: '100%', height: 256, borderRadius: 'var(--radius-lg)' }} />
        </div>
      )
    }
    if (!versionData) {
      return (
        <div className="page-container">
          <div className="empty-state">
            <div className="empty-title">Versión no encontrada</div>
            <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/cotizaciones/${id}`)}>
              Ver versión actual
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <a className="page-back-link" onClick={() => navigate(`/cotizaciones/${id}`)}>
              <ArrowLeft size={14} /> Cotización {id}
            </a>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="page-title-dot" />
              Cotización {displayId(versionData.id, versionData.sequence)}
              <span className={`badge ${STATUS_BADGE[versionData.status] ?? 'badge-neutral'}`}>
                {STATUS_LABEL[versionData.status] ?? versionData.status}
              </span>
              <span className="badge badge-neutral" title="Estás viendo una revisión anterior de este borrador, de solo lectura">
                Histórica · versión {versionData.sequence}
              </span>
            </h1>
            <p className="page-sub">Guardada el {formatDate(versionData.savedAt)}</p>
          </div>
        </div>

        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <span>Estás viendo una revisión anterior de este borrador — es solo de lectura.</span>
          <a className="page-back-link" onClick={() => navigate(`/cotizaciones/${id}`)}>Ver versión actual</a>
        </div>

        <div className="card">
          <div className="items-table-wrap">
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {versionData.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.itemCode || '—'}</td>
                    <td>{item.description || item.itemName || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(item.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="items-total-row navy-totals">
              <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, justifyContent: 'flex-end', gap: 24 }}>
                <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'right' }}>Total</span>
                <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>{formatMoney(versionData.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
            <span className="page-title-dot" />
            Cotización {displayId(quotation.id, quotation.sequence)}
            <span className={`badge ${STATUS_BADGE[quotation.status] ?? 'badge-neutral'}`}>
              {STATUS_LABEL[quotation.status] ?? quotation.status}
            </span>
            {quotation.sequence > 0 && (
              <span className="badge badge-info" title="Veces que se ha editado en borrador">
                Versión {quotation.sequence}
              </span>
            )}
            {quotation.currency && quotation.currency !== monedaBase && (
              <span className="badge badge-info" title={quotation.conversionRate != null ? `Tasa ${quotation.conversionRate}` : undefined}>
                {quotation.currency}
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

      <div className="doc-actions-bar" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: 16 }}>
        <button
          className="btn btn-secondary btn-size-md"
          onClick={() => navigate(`/cotizaciones/nueva?duplicate=${id}`)}
          disabled={isActionsLoading}
        >
          <Copy size={14} /> Duplicar
        </button>
        {quotation.salesOrder && (
          <div className="dropdown" ref={relatedRef} style={{ display: 'flex' }}>
            <button
              className="btn btn-secondary btn-size-md"
              aria-haspopup="true"
              aria-expanded={relatedOpen}
              onClick={() => setRelatedOpen((o) => !o)}
            >
              <Link2 size={14} /> Documentos relacionados
              <ChevronRight size={11} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />
            </button>
            <div
              className={`dropdown-panel${relatedOpen ? ' open' : ''}`}
              role="menu"
              style={{ left: 0, right: 'auto' }}
            >
              <div className="dd-header">
                <div className="dd-name" style={{ fontSize: 11 }}>Pedido de venta</div>
              </div>
              <button
                className="dd-item"
                role="menuitem"
                onClick={() => { setRelatedOpen(false); navigate(`/pedidos/${quotation.salesOrder}`) }}
              >
                {quotation.salesOrder}
              </button>
            </div>
          </div>
        )}
        {quotation.status === 'draft' && (
          <>
            <button
              className="btn btn-secondary btn-size-md"
              onClick={() => navigate(`/cotizaciones/${id}/editar`)}
              disabled={isActionsLoading}
            >
              <FileText size={14} /> Editar
            </button>
            <button
              className="btn btn-navy btn-size-md"
              onClick={() => submitMutation.mutate()}
              disabled={isActionsLoading}
            >
              <Send size={14} /> Someter
            </button>
            <button
              className="btn btn-danger btn-size-md"
              onClick={() => deleteMutation.mutate()}
              disabled={isActionsLoading}
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </>
        )}
        {quotation.status === 'submitted' && (
          <>
            <button className="btn btn-secondary btn-size-md" onClick={() => navigate(`/cotizaciones/${id}/editar`)} disabled={isActionsLoading}>
              <FileText size={14} /> Editar
            </button>
            <button className="btn btn-danger btn-size-md" onClick={() => cancelMutation.mutate()} disabled={isActionsLoading}>
              <XCircle size={14} /> Cancelar
            </button>
            <button className="btn btn-secondary btn-size-md" onClick={() => setConvertDialogOpen(true)} disabled={isActionsLoading}>
              <FileText size={14} /> Convertir a Factura
            </button>
            <button className="btn btn-secondary btn-size-md" onClick={() => navigate(`/pedidos/nuevo?quotation=${id}`)} disabled={isActionsLoading}>
              <ClipboardList size={14} /> Crear Pedido
            </button>
            <button
              className="btn btn-secondary btn-size-md"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending
                ? <><span className="spinner" /> Descargando…</>
                : <><Download size={14} /> Descargar PDF</>}
            </button>
          </>
        )}
        {quotation.status === 'ordered' && (
          <>
            <button
              className="btn btn-secondary btn-size-md"
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
        <div className="card-header navy-card-header">
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
            {quotation.esClienteOcasional && quotation.clienteOcasionalRnc && (
              <div className="detail-field">
                <span className="detail-label">RNC / Cédula</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-body)' }}>{quotation.clienteOcasionalRnc}</span>
              </div>
            )}
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
            {quotation.notes && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Notas</span>
                <span className="detail-value" style={{ whiteSpace: 'pre-line' }}>{quotation.notes}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="items-table-wrap">
          <table className="items-table navy-table items-table-resizable">
            <colgroup>
              {ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: itemsColWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Código
                  <span className="col-resize-handle" onMouseDown={startItemsResize('codigo')} />
                </th>
                <th>
                  Descripción
                  <span className="col-resize-handle" onMouseDown={startItemsResize('descripcion')} />
                </th>
                <th>
                  Notas
                  <span className="col-resize-handle" onMouseDown={startItemsResize('notas')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Cant.
                  <span className="col-resize-handle" onMouseDown={startItemsResize('cantidad')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Precio Unit.
                  <span className="col-resize-handle" onMouseDown={startItemsResize('precio')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Dto. %
                  <span className="col-resize-handle" onMouseDown={startItemsResize('descuento')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Importe
                  <span className="col-resize-handle" onMouseDown={startItemsResize('importe')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Impuesto
                  <span className="col-resize-handle" onMouseDown={startItemsResize('impuesto')} />
                </th>
                <th>
                  UDM
                  <span className="col-resize-handle" onMouseDown={startItemsResize('udm')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.notes ?? ''}>{item.notes ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right' }}>
                    {item.discountPct && item.discountPct > 0 ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)', marginRight: 4 }}>{formatMoney(item.rate, quotation.currency)}</span>
                        {formatMoney(item.discountedRate ?? item.rate, quotation.currency)}
                      </>
                    ) : formatMoney(item.rate, quotation.currency)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{item.discountPct ? `${item.discountPct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.amount, quotation.currency)}</td>
                  <td style={{ textAlign: 'right' }} title={`${item.taxRate}%`}>{formatMoney(item.taxAmount, quotation.currency)}</td>
                  <td>{item.uom || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="items-total-row navy-totals">
            <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ textAlign: 'right' }}>Subtotal</span>
              <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(grossTotal, quotation.currency)}</span>
            </div>
            <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ textAlign: 'right' }}>Descuento</span>
              <span style={{ textAlign: 'left', minWidth: 170 }}>-{formatMoney(totalDiscount, quotation.currency)}</span>
            </div>
            {/*<div className="items-total-line">
              <span>Subtotal neto</span>
              <span>{formatMoney(subtotal, quotation.currency)}</span>
            </div>*/}
            <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ textAlign: 'right' }}>Impuesto</span>
              <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(taxAmount, quotation.currency)}</span>
            </div>
            <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'right' }}>Total</span>
              <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>{formatMoney(total, quotation.currency)}</span>
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
              {quotation?.esClienteOcasional && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 12px' }}>
                  <div><strong>Comprador ocasional:</strong> {quotation.clienteOcasionalNombre}</div>
                  <div>RNC / Cédula: {quotation.clienteOcasionalRnc || <span style={{ color: 'var(--text-tertiary)' }}>sin registrar</span>}</div>
                  {quotation.clienteOcasionalDireccion && <div>Dirección: {quotation.clienteOcasionalDireccion}</div>}
                </div>
              )}
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
              {quotation?.esClienteOcasional && selectedNcfType === 'B01' && !quotation.clienteOcasionalRnc && (
                <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                  Falta el RNC del comprador ocasional. Crédito Fiscal (B01) lo requiere — podrás completarlo en la factura recién creada antes de someterla.
                </p>
              )}
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
