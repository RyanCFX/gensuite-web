import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getCreditNote, getCreditNotePdfBlobUrl, downloadCreditNotePdf } from '@/shared/api/notes'
import { getInvoice } from '@/shared/api/invoices'
import { getFacturacionConfig } from '@/shared/api/config'
import { ArrowLeft, Download, Eye, Link2, ChevronRight, Wallet, ArrowRightLeft, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatMoney } from '@/lib/formatters'
import { formatVenceEl } from '@/lib/creditoVencimiento'
import { CreditoEstadoBadge } from '@/shared/ui/CreditoEstadoBadge'
import { DocumentHistoryCard } from '@/components/shared/DocumentHistoryCard'
import { PdfPreviewModal } from '@/components/shared/PdfPreviewModal'
import { ApplyCreditNoteModal } from './CreditNoteActionModals'
import type { CreditNoteActionTarget } from './CreditNoteActionModals'
import { CreditoAccionesButtons } from './CreditoAccionModals'
import type { CreditoAccionTarget } from './CreditoAccionModals'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { EstadoArsBadge } from './EstadoArsBadge'

const ITEMS_COLUMNS = [
  { key: 'codigo', width: 100 },
  { key: 'descripcion', width: 220 },
  { key: 'cantidad', width: 90 },
  { key: 'precio', width: 110 },
  { key: 'importe', width: 110 },
  { key: 'udm', width: 90 },
]

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

const USAGE_LABEL: Record<string, string> = {
  available: 'Disponible',
  partially_used: 'Parcialmente usada',
  fully_used: 'Agotada',
}
const USAGE_BADGE: Record<string, string> = {
  available: 'badge-success',
  partially_used: 'badge-warning',
  fully_used: 'badge-neutral',
}

export default function CreditNoteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [relatedOpen, setRelatedOpen] = useState(false)
  const relatedRef = useRef<HTMLDivElement>(null)
  const { widths: itemsColWidths, startResize: startItemsResize } = useResizableColumns(ITEMS_COLUMNS)

  const { data: note, isLoading } = useQuery({
    queryKey: ['credit-note', id],
    queryFn: () => getCreditNote(id!),
    enabled: !!id,
  })

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
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

  // Normaliza shape de detalle (creditNoteId/documentStatus/originalInvoice objeto) y
  // shape de lista (id/status/originalInvoice string) — ver tipo CreditNoteDetail.
  const noteId = note?.creditNoteId ?? note?.id ?? id ?? ''
  const docStatus = (note?.documentStatus ?? note?.status ?? '').toLowerCase()
  const embeddedOrig = note && typeof note.originalInvoice === 'object' ? note.originalInvoice : null
  const originalInvoiceId =
    embeddedOrig?.id ??
    (note && typeof note.originalInvoice === 'string' ? note.originalInvoice : null) ??
    note?.returnAgainst ??
    null

  // Si el detalle no trae la factura original embebida, se busca para el link + resumen.
  const { data: fetchedInvoice } = useQuery({
    queryKey: ['invoice', originalInvoiceId],
    queryFn: () => getInvoice(originalInvoiceId!),
    enabled: !!originalInvoiceId && !embeddedOrig,
  })
  const orig = embeddedOrig ?? fetchedInvoice ?? null
  const origNcf =
    (orig as { ncf?: string } | null)?.ncf ?? note?.ncfAfectado ?? null

  const downloadMutation = useMutation({
    mutationFn: () => downloadCreditNotePdf(noteId, `nota-credito-${noteId}.pdf`),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [applyTarget, setApplyTarget] = useState<CreditNoteActionTarget | null>(null)
  const previewMutation = useMutation({
    mutationFn: () => getCreditNotePdfBlobUrl(noteId),
    onSuccess: (url) => setPreviewUrl(url),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo generar la vista previa del PDF'),
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 280, height: 28, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 128, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 256, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (!note) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-title">Nota de crédito no encontrada</div>
          <button className="btn btn-ghost btn-size-sm" onClick={() => navigate('/notas-credito')}>
            Volver a notas de crédito
          </button>
        </div>
      </div>
    )
  }

  const usageStatus = note.usageStatus ?? (['available', 'partially_used', 'fully_used'].includes(docStatus) ? docStatus : undefined)
  const hasUsageInfo = note.availableAmount !== undefined || !!usageStatus
  const appliedTo = note.appliedTo ?? []
  const currency = note.currency
  const items = note.items ?? []
  const total = Math.abs(note.grandTotal ?? 0)

  // Target para las acciones de §5 (reactivar / cambiar vencimiento / dar de baja).
  const creditoTarget: CreditoAccionTarget = {
    kind: 'nota',
    id: noteId,
    estado: note.estado,
    venceEl: note.venceEl,
    availableAmount: note.availableAmount,
    currency: currency ?? undefined,
    customerId: typeof note.customer === 'string' ? note.customer : undefined,
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/notas-credito')}>
            <ArrowLeft size={14} /> Notas de Crédito
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="page-title-dot" />
            Nota de Crédito {note.ncf ?? noteId}
            <span className={`badge ${STATUS_BADGE[docStatus] ?? 'badge-neutral'}`}>
              {STATUS_LABEL[docStatus] ?? note.documentStatus ?? note.status}
            </span>
            {usageStatus && (
              <span className={`badge ${USAGE_BADGE[usageStatus] ?? 'badge-neutral'}`}>
                {USAGE_LABEL[usageStatus] ?? usageStatus}
              </span>
            )}
            <CreditoEstadoBadge estado={note.estado} diasRestantes={note.diasRestantes} venceEl={note.venceEl} />
            {currency && currency !== monedaBase && (
              <span className="badge badge-info" title={note.conversionRate != null ? `Tasa ${note.conversionRate}` : undefined}>
                {currency}
              </span>
            )}
          </h1>
          <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Cliente: {note.customerName ?? note.customer ?? '—'}
          </p>
        </div>
      </div>

      <div className="doc-actions-bar" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: 16 }}>
        {(originalInvoiceId || appliedTo.length > 0) && (
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
              {originalInvoiceId && (
                <>
                  <div className="dd-header">
                    <div className="dd-name" style={{ fontSize: 11 }}>Factura original</div>
                  </div>
                  <button
                    className="dd-item"
                    role="menuitem"
                    onClick={() => { setRelatedOpen(false); navigate(`/facturas/${encodeURIComponent(originalInvoiceId)}`) }}
                  >
                    {origNcf ?? originalInvoiceId}
                  </button>
                </>
              )}
              {appliedTo.length > 0 && (
                <>
                  <div className="dd-header">
                    <div className="dd-name" style={{ fontSize: 11 }}>Aplicada a</div>
                  </div>
                  {appliedTo.map((a) => (
                    <button
                      key={a.invoiceId}
                      className="dd-item"
                      role="menuitem"
                      onClick={() => { setRelatedOpen(false); navigate(`/facturas/${encodeURIComponent(a.invoiceId)}`) }}
                    >
                      {a.invoiceId} — {formatMoney(a.amount, currency)}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
        {docStatus !== 'draft' && docStatus !== 'cancelled' && (
          <>
            <button
              className="btn btn-secondary btn-size-md"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending
                ? <><span className="spinner" /> Generando…</>
                : <><Eye size={14} /> Ver PDF</>}
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
        {hasUsageInfo && (note.availableAmount ?? 0) > 0 && (note.puedeAplicar ?? true) && (
          <>
            <button
              className="btn btn-secondary btn-size-md"
              onClick={() => setApplyTarget({ id: noteId, returnAgainst: originalInvoiceId, grandTotal: note.grandTotal, currency })}
            >
              <ArrowRightLeft size={14} /> Aplicar a factura
            </button>
          </>
        )}
        {/* §5.4: reactivar / cambiar vencimiento / dar de baja según estado. */}
        <CreditoAccionesButtons target={creditoTarget} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{note.customerName ?? note.customer ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de emisión</span>
              <span className="detail-value">{formatDate(note.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de creación</span>
              <span className="detail-value">{formatDate(note.createdAt)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">NCF</span>
              <span className="detail-value" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                {note.ncf ?? <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--text-secondary)' }}>Pendiente</em>}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">NCF Afectado</span>
              <span className="detail-value" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                {note.ncfAfectado ?? <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--text-secondary)' }}>—</em>}
              </span>
            </div>
            {originalInvoiceId && (
              <div className="detail-field">
                <span className="detail-label">Factura original</span>
                <span className="detail-value">
                  <button
                    style={{ fontFamily: 'var(--font-body)', color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => navigate(`/facturas/${encodeURIComponent(originalInvoiceId)}`)}
                  >
                    {origNcf ?? originalInvoiceId}
                  </button>
                </span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Estado</span>
              <span className="detail-value">
                <span className={`badge ${STATUS_BADGE[docStatus] ?? 'badge-neutral'}`}>
                  {STATUS_LABEL[docStatus] ?? note.documentStatus ?? note.status}
                </span>
                {usageStatus && (
                  <span className={`badge ${USAGE_BADGE[usageStatus] ?? 'badge-neutral'}`} style={{ marginLeft: 6 }}>
                    {USAGE_LABEL[usageStatus] ?? usageStatus}
                  </span>
                )}
              </span>
            </div>
            {note.reason && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Motivo</span>
                <span className="detail-value" style={{ whiteSpace: 'pre-line' }}>{note.reason}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* §4.1: bloque «Vigencia y uso». Sin `estado`/`venceEl` (tenant sin
          configurar o nota anterior) no se muestra — igual que antes. */}
      {(note.estado || note.venceEl || note.uso) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header navy-card-header">
            <h2 className="card-title">Vigencia y uso</h2>
          </div>
          <div className="card-body">
            <div className="fields-grid">
              {note.estado && (
                <div className="detail-field">
                  <span className="detail-label">Estado</span>
                  <span className="detail-value">
                    <CreditoEstadoBadge estado={note.estado} diasRestantes={note.diasRestantes} venceEl={note.venceEl} />
                  </span>
                </div>
              )}
              {note.venceEl && (
                <>
                  <div className="detail-field">
                    <span className="detail-label">Vence el</span>
                    <span className="detail-value">{formatVenceEl(note.venceEl)}</span>
                  </div>
                  {note.diasRestantes != null && (
                    <div className="detail-field">
                      <span className="detail-label">Días restantes</span>
                      <span className="detail-value">
                        {note.diasRestantes < 0 ? `Vencida hace ${Math.abs(note.diasRestantes)} día${Math.abs(note.diasRestantes) === 1 ? '' : 's'}` : note.diasRestantes === 0 ? 'Vence hoy' : `${note.diasRestantes} días`}
                      </span>
                    </div>
                  )}
                </>
              )}
              {note.uso && (
                <div className="detail-field">
                  <span className="detail-label">Uso</span>
                  <span className="detail-value">{note.uso === 'unico' ? 'Uso único' : 'Varias facturas'}</span>
                </div>
              )}
              {note.uso === 'unico' && note.remanente && (
                <div className="detail-field">
                  <span className="detail-label">Si sobra saldo</span>
                  <span className="detail-value">
                    {note.remanente === 'saldo_favor' ? 'Pasa a saldo a favor' : 'Se pierde'}
                  </span>
                </div>
              )}
              {note.origenSaldoFavor && (
                <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="detail-value" style={{ fontSize: 13 }}>
                    El sobrante de esta nota pasó a saldo a favor.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
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
                  <th style={{ textAlign: 'right' }}>
                    Cant.
                    <span className="col-resize-handle" onMouseDown={startItemsResize('cantidad')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Precio Unit.
                    <span className="col-resize-handle" onMouseDown={startItemsResize('precio')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Importe
                    <span className="col-resize-handle" onMouseDown={startItemsResize('importe')} />
                  </th>
                  <th>
                    UDM
                    <span className="col-resize-handle" onMouseDown={startItemsResize('udm')} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.itemCode || '—'}</td>
                    <td>{item.description || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(item.rate, currency)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(Math.abs(item.amount), currency)}</td>
                    <td>{item.uom || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="items-total-row navy-totals">
              <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, justifyContent: 'flex-end', gap: 24 }}>
                <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'right' }}>Total</span>
                <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>{formatMoney(total, currency)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasUsageInfo && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header navy-card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wallet size={15} /> Estado de uso
            </h2>
          </div>
          <div className="card-body">
            <div className="fields-grid">
              {note.refunded && (
                <div className="detail-field">
                  <span className="detail-label">Reembolsado en efectivo</span>
                  <span className="detail-value">{formatMoney(note.refundedAmount ?? 0, currency)}</span>
                </div>
              )}
              {usageStatus !== 'available' && note.appliedAmount !== undefined && (
                <div className="detail-field">
                  <span className="detail-label">Aplicado a factura(s)</span>
                  <span className="detail-value">{formatMoney(note.appliedAmount, currency)}</span>
                </div>
              )}
              {note.availableAmount !== undefined && (
                <div className="detail-field">
                  <span className="detail-label">Disponible</span>
                  <span className="detail-value" style={{ fontWeight: 600 }}>{formatMoney(note.availableAmount, currency)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {note.aseguradora && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header navy-card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={15} style={{ color: 'var(--icon-muted)' }} />
            <h2 className="card-title" style={{ flex: 1 }}>Cobertura ARS revertida</h2>
            <EstadoArsBadge estado={note.aseguradora.estadoArsAlDevolver} />
          </div>
          <div className="card-body">
            <div className="fields-grid">
              <div className="detail-field">
                <span className="detail-label">Aseguradora</span>
                <span className="detail-value">
                  {note.aseguradora.aseguradoraName ?? note.aseguradora.aseguradora}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Nro. de autorización</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-body)' }}>
                  {note.aseguradora.numeroAutorizacion}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Parte ARS devuelta</span>
                <span className="detail-value" style={{ fontWeight: 600 }}>
                  {formatMoney(note.aseguradora.parteArsDevuelta, currency)}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Estado ARS al devolver</span>
                <span className="detail-value">{note.aseguradora.estadoArsAlDevolver ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial */}
      <DocumentHistoryCard
        history={(note as { history?: NonNullable<Parameters<typeof DocumentHistoryCard>[0]['history']> }).history}
        basePath="/notas-credito"
        currentDocId={noteId}
      />

      {previewUrl && <PdfPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}

      {applyTarget && (
        <ApplyCreditNoteModal note={applyTarget} onClose={() => setApplyTarget(null)} />
      )}
    </div>
  )
}
