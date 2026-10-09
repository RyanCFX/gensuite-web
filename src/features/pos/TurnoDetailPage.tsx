import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Clock, Lock, Download, Eye, Loader2 } from 'lucide-react'
import { getTurnoDetail, downloadTurnoPdf, getTurnoPdfBlobUrl } from '@/shared/api/pos'
import { formatDateTime, formatDOP } from '@/lib/formatters'
import { CorteCajaView } from '@/components/shared/CorteCajaView'
import { PdfPreviewModal } from '@/components/shared/PdfPreviewModal'
import { RecargarButton } from '@/components/shared/RecargarButton'
import type { TurnoClosing } from '@/shared/api/types'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { listDenominacionesLookup } from '@/shared/api/formularios'

const CONCILIACION_COLUMNS = [
  { key: 'metodo', width: 140 },
  { key: 'apertura', width: 110 },
  { key: 'esperado', width: 110 },
  { key: 'contado', width: 110 },
  { key: 'diferencia', width: 110 },
  { key: 'conciliacion', width: 110 },
]

const DENOMINACIONES_COLUMNS = [
  { key: 'denominacion', width: 140 },
  { key: 'cantidad', width: 100 },
  { key: 'subtotal', width: 120 },
]

export default function TurnoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const { data: turno, isLoading, isError } = useQuery({
    queryKey: ['turno', id],
    queryFn: () => getTurnoDetail(id!),
    enabled: !!id,
  })

  const previewMutation = useMutation({
    mutationFn: () => getTurnoPdfBlobUrl(id!),
    onSuccess: (url) => setPreviewUrl(url),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo generar la vista previa del PDF'),
  })

  const downloadPdfMutation = useMutation({
    mutationFn: () => downloadTurnoPdf(id!),
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo descargar el PDF'),
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
          <span className="skeleton-box" style={{ width: 200, height: 20 }} />
          <span className="skeleton-box" style={{ height: 200, display: 'block' }} />
        </div>
      </div>
    )
  }

  if (isError || !turno) {
    return (
      <div className="page-container">
        <div className="page-header">
          <button className="page-back-link" onClick={() => navigate('/turnos')}>
            <ArrowLeft size={14} /> Volver a turnos
          </button>
        </div>
        <p style={{ color: 'var(--error-text)', fontSize: 14, padding: 24 }}>Error al cargar el detalle del turno.</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <button className="page-back-link" onClick={() => navigate('/turnos')}>
            <ArrowLeft size={14} /> Turnos de caja
          </button>
          <h1 className="page-title">Turno {turno.id}</h1>
          <p className="page-sub">
            <span className={`badge ${turno.status === 'Open' ? 'badge-success' : 'badge-draft'}`}>
              {turno.status === 'Open' ? 'Abierto' : 'Cerrado'}
            </span>
            {' — '}Apertura: {formatDateTime(turno.periodStartDate)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton label="Actualizar" />
        </div>
      </div>

      {turno.closing && (
        <div className="doc-actions-bar">
          <button
            className="btn btn-secondary btn-size-sm"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? <Loader2 size={13} className="spin" /> : <Eye size={13} aria-hidden="true" />}
            {' '}Ver PDF
          </button>
          <button
            className="btn btn-secondary btn-size-sm"
            onClick={() => downloadPdfMutation.mutate()}
            disabled={downloadPdfMutation.isPending}
          >
            {downloadPdfMutation.isPending ? <Loader2 size={13} className="spin" /> : <Download size={13} aria-hidden="true" />}
            {' '}Descargar PDF
          </button>
        </div>
      )}

      {/* Información de apertura */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Apertura
          </span>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Perfil POS</span>
          <span style={{ fontWeight: 500 }}>{turno.posProfile}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Compañía</span>
          <span style={{ fontWeight: 500 }}>{turno.company}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Cajero</span>
          <span style={{ fontWeight: 500 }}>{turno.user}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Fecha de apertura</span>
          <span style={{ fontWeight: 500 }}>{formatDateTime(turno.periodStartDate)}</span>
          {turno.modeOfPayment && (
            <>
              <span style={{ color: 'var(--text-secondary)' }}>Método de pago</span>
              <span style={{ fontWeight: 500 }}>{turno.modeOfPayment}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Fondo inicial</span>
              <span style={{ fontWeight: 500, fontFamily: 'var(--font-body)' }}>{formatDOP(turno.openingAmount)}</span>
            </>
          )}
        </div>
      </div>

      {/* Información de cierre (si existe) */}
      {turno.closing ? (
        <ClosingSection closing={turno.closing} turnoCajero={turno.user} closedBy={turno.closedBy} />
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="inline-alert inline-alert-info" style={{ alignItems: 'flex-start' }}>
              <Lock size={16} />
              <span>Este turno sigue abierto. Debe cerrarse para ver el detalle del cierre.</span>
            </div>
          </div>
        </div>
      )}

      <PdfPreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}

function ClosingSection({ closing, turnoCajero, closedBy }: { closing: TurnoClosing; turnoCajero: string; closedBy?: string }) {
  const { data: denominaciones } = useQuery({
    queryKey: ['denominaciones'],
    queryFn: listDenominacionesLookup,
  })

  const denomMap = new Map((denominaciones ?? []).map((d) => [d.denominacion, d.valor]))
  const { widths: conciliacionColWidths, startResize: startConciliacionResize } = useResizableColumns(CONCILIACION_COLUMNS)
  const { widths: denominacionesColWidths, startResize: startDenominacionesResize } = useResizableColumns(DENOMINACIONES_COLUMNS)

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={16} /> Cierre
          </span>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
          <span style={{ color: 'var(--text-secondary)' }}>ID de cierre</span>
          <span style={{ fontWeight: 500, fontFamily: 'var(--font-body)' }}>{closing.id}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Estado</span>
          <span><span className="badge badge-submitted">{closing.status}</span></span>
          <span style={{ color: 'var(--text-secondary)' }}>Fecha de apertura</span>
          <span style={{ fontWeight: 500 }}>{formatDateTime(closing.periodStartDate)}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Fecha de cierre</span>
          <span style={{ fontWeight: 500 }}>{formatDateTime(closing.periodEndDate)}</span>
          {(() => {
            const cerradoPor = closedBy ?? closing.closedBy
            if (!cerradoPor) return null
            const esSupervisor = cerradoPor !== turnoCajero
            return (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>Cerrado por</span>
                <span style={{ fontWeight: 500 }}>
                  {cerradoPor}
                  {esSupervisor && (
                    <span
                      className="badge badge-info"
                      style={{ marginLeft: 6, fontSize: 10 }}
                      title={`El turno pertenece a ${turnoCajero}, pero lo cerró ${cerradoPor}`}
                    >
                      Supervisor
                    </span>
                  )}
                </span>
              </>
            )
          })()}
          <span style={{ color: 'var(--text-secondary)' }}>Total facturado</span>
          <span style={{ fontWeight: 600 }}>{formatDOP(closing.grandTotal)}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Total neto</span>
          <span style={{ fontWeight: 500 }}>{formatDOP(closing.netTotal)}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Artículos vendidos</span>
          <span style={{ fontWeight: 500 }}>{closing.totalQuantity}</span>
        </div>
      </div>

      {/* Conciliación de pagos */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Conciliación de pagos</span>
        </div>
        <div className="table-scroll">
          <table className="data-table items-table-resizable">
            <colgroup>
              {CONCILIACION_COLUMNS.map((c) => <col key={c.key} style={{ width: conciliacionColWidths[c.key] }} />)}
            </colgroup>
            <thead>
                <tr>
                  <th>
                    Método
                    <span className="col-resize-handle" onMouseDown={startConciliacionResize('metodo')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Apertura
                    <span className="col-resize-handle" onMouseDown={startConciliacionResize('apertura')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Esperado
                    <span className="col-resize-handle" onMouseDown={startConciliacionResize('esperado')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Contado
                    <span className="col-resize-handle" onMouseDown={startConciliacionResize('contado')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Diferencia
                    <span className="col-resize-handle" onMouseDown={startConciliacionResize('diferencia')} />
                  </th>
                  <th>
                    Conciliación
                    <span className="col-resize-handle" onMouseDown={startConciliacionResize('conciliacion')} />
                  </th>
                </tr>
            </thead>
            <tbody>
              {closing.paymentReconciliation.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                    Sin movimientos registrados
                  </td>
                </tr>
              ) : (
                closing.paymentReconciliation.map((p) => p.esDeliveryTransito ? (
                  // §3.4: fila de tránsito — informativa, sin conteo ni diferencia.
                  <tr key={p.modeOfPayment}>
                    <td>
                      {p.modeOfPayment}
                      <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: 10 }}>Ventas delivery — contra entrega</span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{formatDOP(p.openingAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{formatDOP(p.expectedAmount)}</td>
                    <td style={{ textAlign: 'right' }} className="td-muted">—</td>
                    <td style={{ textAlign: 'right' }} className="td-muted">—</td>
                    <td><span className="badge badge-neutral">Informativa</span></td>
                  </tr>
                ) : (
                  <tr key={p.modeOfPayment}>
                    <td>{p.modeOfPayment}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{formatDOP(p.openingAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{formatDOP(p.expectedAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{formatDOP(p.closingAmount)}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-body)',
                        fontWeight: 600,
                        color:
                          p.difference < 0
                            ? 'var(--error-text)'
                            : p.difference > 0
                              ? 'var(--warning-text)'
                              : 'var(--text-secondary)',
                      }}
                    >
                      {p.difference > 0 ? '+' : ''}{formatDOP(p.difference)}
                      {p.difference !== 0 && (
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 400 }}>
                          {p.difference < 0 ? 'Faltante' : 'Sobrante'}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.requiereConciliacion ? (
                        <span className="badge badge-info">Manual</span>
                      ) : (
                        <span className="badge badge-submitted">Auto</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Corte de Caja */}
      {closing.corteCaja && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Corte de Caja</h2>
          <CorteCajaView corteCaja={closing.corteCaja} />
        </div>
      )}

      {/* Arqueo de efectivo */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Arqueo de efectivo</span>
        </div>
        <div className="card-body">
          {closing.denominacionesEfectivo.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
              No se registró desglose de denominaciones para este turno.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="data-table items-table-resizable">
                <colgroup>
                  {DENOMINACIONES_COLUMNS.map((c) => <col key={c.key} style={{ width: denominacionesColWidths[c.key] }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      Denominación
                      <span className="col-resize-handle" onMouseDown={startDenominacionesResize('denominacion')} />
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      Cantidad
                      <span className="col-resize-handle" onMouseDown={startDenominacionesResize('cantidad')} />
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      Subtotal
                      <span className="col-resize-handle" onMouseDown={startDenominacionesResize('subtotal')} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {closing.denominacionesEfectivo.map((d) => {
                    const valor = denomMap.get(d.denominacion) ?? 0
                    return (
                      <tr key={d.denominacion}>
                        <td>{d.denominacion}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{d.cantidad}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                          {formatDOP(valor * d.cantidad)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
