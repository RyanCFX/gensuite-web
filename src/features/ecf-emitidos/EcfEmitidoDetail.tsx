// Detalle de un e-CF emitido (origin: ISSUED): flujo de estado ante la DGII, líneas, totales,
// timbre (QR) y enlace al documento de ERPNext. Solo lectura + "Refrescar estado".
//
// CONSTANCIA: las pruebas end-to-end con datos reales quedan pendientes — ningún tenant tiene Vega
// conectado en producción.

import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { ArrowLeft, Receipt, RefreshCw, RotateCcw, ExternalLink, AlertTriangle, Info, Link2, ChevronRight, Archive } from 'lucide-react'
import { getEcfEmitido, refreshEcfEmitido, regenerarEcfEmitido } from '@/shared/api/ecf-emitidos'
import { Permitido } from '@/components/shared/Permitido'
import { downloadInvoiceEcfPdfa } from '@/shared/api/invoices'
import { formatDate, formatDateTime, formatDOP, formatNumber } from '@/lib/formatters'
import {
  ecfStatusLabel, ecfFlujoStatusLabel, ecfStatusBadge, ecfTipoLabel, ecfEnvChip, ecfPuedeRefrescar, ECF_ENV_LABELS,
} from '@/lib/dgii'
import { EcfFlujoStepper } from './EcfFlujoStepper'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

const ECF_LINEAS_COLUMNS = [
  { key: 'descripcion', width: 240 },
  { key: 'cantidad', width: 90 },
  { key: 'precioUnit', width: 110 },
  { key: 'descuento', width: 110 },
  { key: 'pctItbis', width: 90 },
  { key: 'itbis', width: 100 },
  { key: 'importe', width: 110 },
]

function num(s?: string | null): string {
  if (s == null || s === '') return '—'
  const n = Number(s)
  return Number.isFinite(n) ? formatNumber(n) : s
}
function money(s?: string | null): string {
  if (s == null || s === '') return '—'
  const n = Number(s)
  return Number.isFinite(n) ? formatDOP(n) : s
}

export default function EcfEmitidoDetail() {
  const { voucherId = '' } = useParams<{ voucherId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: v, isLoading } = useQuery({
    queryKey: ['ecf-emitido', voucherId],
    queryFn: () => getEcfEmitido(voucherId),
    enabled: !!voucherId,
  })

  const refreshMutation = useMutation({
    mutationFn: () => refreshEcfEmitido(voucherId),
    onSuccess: (res) => {
      if (res.cambio) {
        toast.success(`Estado actualizado: ${ecfStatusLabel(res.statusPrevio)} → ${ecfFlujoStatusLabel(res.flujo, res.status)}`)
      } else {
        toast.info('El estado no ha cambiado')
      }
      queryClient.invalidateQueries({ queryKey: ['ecf-emitido', voucherId] })
      queryClient.invalidateQueries({ queryKey: ['ecf-emitidos'] })
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo consultar el estado'),
  })

  const pdfaMutation = useMutation({
    mutationFn: (docname: string) => downloadInvoiceEcfPdfa(docname, `ecf-${docname}-pdfa.pdf`),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo generar el PDF/A'),
  })

  // Solo aplica a un voucher REJECTED — asigna un e-NCF nuevo sobre el MISMO documento (el
  // invoiceId no cambia). No es exclusivo de Farmacia, pero ese vertical fue el que lo motivó
  // (docs/PROMPT_FARMACIA_V2_FRONTEND.md §4.4): tanto cobrar la factura del paciente como
  // "Facturar lote" pueden terminar con un e-CF rechazado que hay que regenerar sin perder el
  // documento ya sometido.
  const regenerarMutation = useMutation({
    mutationFn: () => regenerarEcfEmitido(voucherId),
    onSuccess: (res) => {
      toast.success(`e-NCF regenerado: ${res.ncf}`)
      queryClient.invalidateQueries({ queryKey: ['ecf-emitido', voucherId] })
      queryClient.invalidateQueries({ queryKey: ['ecf-emitidos'] })
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo regenerar el e-NCF'),
  })

  const { widths: colWidths, startResize } = useResizableColumns(ECF_LINEAS_COLUMNS)
  const [relatedOpen, setRelatedOpen] = useState(false)
  const relatedRef = useRef<HTMLDivElement>(null)

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

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 280, height: 28, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 96, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 256, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (!v) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-title">e-CF emitido no encontrado</div>
          <button className="btn btn-ghost btn-size-sm" onClick={() => navigate('/ecf-emitidos')}>
            Volver a la bandeja
          </button>
        </div>
      </div>
    )
  }

  const chip = ecfEnvChip(v.env)
  const canRefresh = ecfPuedeRefrescar(v.status, v.flujo?.esTerminal ?? true)
  const alerta = v.flujo?.alerta ?? null
  const esSales = v.erpnext?.doctype === 'Sales Invoice'
  const docPath = v.erpnext
    ? (esSales ? `/facturas/${encodeURIComponent(v.erpnext.docname)}` : `/compras/${encodeURIComponent(v.erpnext.docname)}`)
    : null

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/ecf-emitidos')}>
            <ArrowLeft size={14} /> e-CF Emitidos
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="page-title-dot" />
            <span style={{ fontFamily: 'var(--font-body)' }}>{v.ncf}</span>
            <span className={`badge ${ecfStatusBadge(v.status)}`}>{ecfFlujoStatusLabel(v.flujo, v.status)}</span>
            {chip && <span className={`badge ${chip.className}`}>{chip.label}</span>}
            {v.deferredSend && <span className="badge badge-info">Contingencia</span>}
          </h1>
          <p className="page-sub">
            {ecfTipoLabel(v.typeId)} · {v.counterpartName || 'Consumidor final'}
            {v.counterpartRnc ? ` · ${v.counterpartRnc}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {v.status === 'REJECTED' && (
            <Permitido accion="ecf.emitidos.regenerar">
              <button
                className="btn btn-secondary btn-size-md"
                style={{ border: '1.457px solid var(--Gris-Forms, #CCDBE2)', color: '#0E3D51' }}
                disabled={regenerarMutation.isPending}
                onClick={() => regenerarMutation.mutate()}
              >
                <RotateCcw size={14} style={regenerarMutation.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
                Regenerar
              </button>
            </Permitido>
          )}
          {canRefresh && (
            <button
              className="btn btn-secondary btn-size-md"
              style={{ border: '1.457px solid var(--Gris-Forms, #CCDBE2)', color: '#0E3D51' }}
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
            >
              <RefreshCw size={14} style={refreshMutation.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
              Refrescar estado
            </button>
          )}
          {v.erpnext && esSales && (
            <button
              className="btn btn-secondary btn-size-md"
              style={{ border: '1.457px solid var(--Gris-Forms, #CCDBE2)', color: '#0E3D51' }}
              disabled={pdfaMutation.isPending}
              onClick={() => pdfaMutation.mutate(v.erpnext!.docname)}
            >
              <Archive size={14} /> {pdfaMutation.isPending ? 'Generando…' : 'PDF/A (archivo fiscal)'}
            </button>
          )}
          {docPath && (
            <div className="dropdown" ref={relatedRef} style={{ display: 'flex' }}>
              <button
                className="btn btn-secondary btn-size-md"
                style={{ border: '1.457px solid var(--Gris-Forms, #CCDBE2)', color: '#0E3D51' }}
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
                  <div className="dd-name" style={{ fontSize: 11 }}>{esSales ? 'Factura de venta' : 'Factura de compra'}</div>
                </div>
                <button
                  className="dd-item"
                  role="menuitem"
                  onClick={() => { setRelatedOpen(false); navigate(docPath) }}
                >
                  {v.erpnext!.docname}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {alerta && (
        <div
          className={`inline-alert ${v.flujo.requiereAtencion ? 'inline-alert-error' : 'inline-alert-warn'}`}
          style={{ marginBottom: 16 }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{alerta}</span>
        </div>
      )}

      {/* Flujo de estado ante la DGII */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header">
          <h2 className="card-title">Flujo de estado ante la DGII</h2>
        </div>
        <div className="card-body">
          <EcfFlujoStepper flujo={v.flujo} />
        </div>
      </div>

      {/* Datos del comprobante */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header">
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Receipt size={16} /> Datos del comprobante
          </h2>
        </div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field"><span className="detail-label">e-NCF</span><span className="detail-value" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{v.ncf}</span></div>
            <div className="detail-field"><span className="detail-label">Tipo</span><span className="detail-value">{ecfTipoLabel(v.typeId)}</span></div>
            <div className="detail-field"><span className="detail-label">Ambiente</span><span className="detail-value">{ECF_ENV_LABELS[v.env] ?? v.env}</span></div>
            <div className="detail-field"><span className="detail-label">Comprador</span><span className="detail-value">{v.counterpartName || 'Consumidor final'}{v.counterpartRnc ? ` (${v.counterpartRnc})` : ''}</span></div>
            <div className="detail-field"><span className="detail-label">Fecha de emisión</span><span className="detail-value">{formatDate(v.issuedAt)}</span></div>
            <div className="detail-field"><span className="detail-label">Creado</span><span className="detail-value">{formatDateTime(v.createdAt)}</span></div>
            <div className="detail-field"><span className="detail-label">Moneda</span><span className="detail-value">{v.currency}{v.exchangeRate && v.exchangeRate !== 1 ? ` · TC ${v.exchangeRate}` : ''}</span></div>
            <div className="detail-field"><span className="detail-label">Track ID (DGII)</span><span className="detail-value" style={{ fontFamily: 'var(--font-body)' }}>{v.trackId || '—'}</span></div>
            <div className="detail-field"><span className="detail-label">Código de seguridad</span><span className="detail-value" style={{ fontFamily: 'var(--font-body)' }}>{v.securityCode || '—'}</span></div>
            {v.archived && <div className="detail-field"><span className="detail-label">Archivado</span><span className="detail-value">Sí</span></div>}
          </div>

          {v.lastError && (
            <div className="inline-alert inline-alert-error" style={{ marginTop: 12 }}>
              <Info size={15} style={{ flexShrink: 0 }} />
              <span style={{ whiteSpace: 'pre-line' }}>{v.lastError}</span>
            </div>
          )}


        </div>
      </div>

      {/* Totales */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header">
          <h2 className="card-title">Totales</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field"><span className="detail-label">Monto gravado</span><span className="detail-value">{formatDOP(v.taxedAmount)}</span></div>
            <div className="detail-field"><span className="detail-label">Monto exento</span><span className="detail-value">{formatDOP(v.exemptAmount)}</span></div>
            <div className="detail-field"><span className="detail-label">ITBIS</span><span className="detail-value">{formatDOP(v.itbisAmount)}</span></div>
            <div className="detail-field"><span className="detail-label">ISC</span><span className="detail-value">{formatDOP(v.iscAmount)}</span></div>
            <div className="detail-field"><span className="detail-label">Total</span><span className="detail-value" style={{ fontWeight: 700 }}>{formatDOP(v.total)} {v.currency}</span></div>
          </div>
        </div>
      </div>

      {/* Líneas */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="items-table-wrap">
          <table className="items-table navy-table items-table-resizable">
            <colgroup>
              {ECF_LINEAS_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Descripción
                  <span className="col-resize-handle" onMouseDown={startResize('descripcion')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Cant.
                  <span className="col-resize-handle" onMouseDown={startResize('cantidad')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Precio Unit.
                  <span className="col-resize-handle" onMouseDown={startResize('precioUnit')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Descuento
                  <span className="col-resize-handle" onMouseDown={startResize('descuento')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  % ITBIS
                  <span className="col-resize-handle" onMouseDown={startResize('pctItbis')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  ITBIS
                  <span className="col-resize-handle" onMouseDown={startResize('itbis')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Importe
                  <span className="col-resize-handle" onMouseDown={startResize('importe')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {(v.items ?? []).length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '16px 0' }}>Sin líneas</td></tr>
              ) : (
                v.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.description || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{num(it.quantity)}</td>
                    <td style={{ textAlign: 'right' }}>{money(it.unitPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{it.discountAmount ? money(it.discountAmount) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{it.itbisRate != null && it.itbisRate !== '' ? `${it.itbisRate}%` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{money(it.itbisAmount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{money(it.lineTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timbre / QR */}
      <div className="card">
        <div className="card-header navy-card-header">
          <h2 className="card-title">Timbre fiscal (DGII)</h2>
        </div>
        <div className="card-body">
          {v.qrUrl ? (
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ background: '#fff', padding: 8, borderRadius: 8, border: '1px solid var(--border-default)' }}>
                <QRCodeSVG value={v.qrUrl} size={132} level="M" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {v.securityCode && (
                  <span style={{ fontSize: 13 }}>
                    Código de seguridad: <strong style={{ fontFamily: 'var(--font-body)' }}>{v.securityCode}</strong>
                  </span>
                )}
                <a href={v.qrUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-size-sm" style={{ width: 'fit-content' }}>
                  <ExternalLink size={14} /> Verificar en DGII
                </a>
              </div>
            </div>
          ) : (
            <p className="ff-hint" style={{ margin: 0 }}>
              El código QR estará disponible cuando la DGII firme el comprobante.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
