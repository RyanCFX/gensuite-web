import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Clock, Lock, Download, Eye, Loader2 } from 'lucide-react'
import { getTurnoDetail, downloadTurnoPdf, getTurnoPdfBlobUrl } from '@/shared/api/pos'
import { listDenominaciones } from '@/shared/api/config'
import { formatDateTime, formatDOP } from '@/lib/formatters'
import { CorteCajaView } from '@/components/shared/CorteCajaView'
import { PdfPreviewModal } from '@/components/shared/PdfPreviewModal'
import type { TurnoClosing } from '@/shared/api/types'

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
              <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{formatDOP(turno.openingAmount)}</span>
            </>
          )}
        </div>
      </div>

      {/* Información de cierre (si existe) */}
      {turno.closing ? (
        <ClosingSection closing={turno.closing} />
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

function ClosingSection({ closing }: { closing: TurnoClosing }) {
  const { data: denominaciones } = useQuery({
    queryKey: ['denominaciones'],
    queryFn: listDenominaciones,
    staleTime: 5 * 60_000,
  })

  const denomMap = new Map((denominaciones ?? []).map((d) => [d.denominacion, d.valor]))

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
          <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{closing.id}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Estado</span>
          <span><span className="badge badge-submitted">{closing.status}</span></span>
          <span style={{ color: 'var(--text-secondary)' }}>Fecha de apertura</span>
          <span style={{ fontWeight: 500 }}>{formatDateTime(closing.periodStartDate)}</span>
          <span style={{ color: 'var(--text-secondary)' }}>Fecha de cierre</span>
          <span style={{ fontWeight: 500 }}>{formatDateTime(closing.periodEndDate)}</span>
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
          <table className="data-table">
            <thead>
                <tr>
                  <th>Método</th>
                  <th style={{ textAlign: 'right' }}>Apertura</th>
                  <th style={{ textAlign: 'right' }}>Esperado</th>
                  <th style={{ textAlign: 'right' }}>Contado</th>
                  <th style={{ textAlign: 'right' }}>Diferencia</th>
                  <th>Conciliación</th>
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
                closing.paymentReconciliation.map((p) => (
                  <tr key={p.modeOfPayment}>
                    <td>{p.modeOfPayment}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDOP(p.openingAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDOP(p.expectedAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDOP(p.closingAmount)}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
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
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Denominación</th>
                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {closing.denominacionesEfectivo.map((d) => {
                    const valor = denomMap.get(d.denominacion) ?? 0
                    return (
                      <tr key={d.denominacion}>
                        <td>{d.denominacion}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.cantidad}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
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
