import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Ban, Printer } from 'lucide-react'
import { getCheque, anularCheque, getChequePdfBlobUrl } from '@/shared/api/tesoreria'
import type { ChequeEstado } from '@/shared/api/types'
import { formatDate, formatDOP } from '@/lib/formatters'

const STATUS_BADGE: Record<ChequeEstado, string> = {
  Reservado: 'badge-draft',
  Emitido: 'badge-submitted',
  Cobrado: 'badge-success',
  Anulado: 'badge-cancelled',
}

export default function ChequeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmAnular, setConfirmAnular] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [printError, setPrintError] = useState<string | null>(null)

  const { data: cheque, isLoading, isError } = useQuery({
    queryKey: ['tesoreria-cheque', id],
    queryFn: () => getCheque(id!),
    enabled: !!id,
  })

  function invalidateRelated() {
    queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque', id] })
    queryClient.invalidateQueries({ queryKey: ['tesoreria-cheques'] })
  }

  const anularMutation = useMutation({
    mutationFn: () => anularCheque(id!, motivo ? { motivo } : undefined),
    onSuccess: () => {
      toast.success('Cheque anulado')
      invalidateRelated()
      setConfirmAnular(false)
      setMotivo('')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al anular el cheque')
    },
  })

  const printMutation = useMutation({
    mutationFn: () => getChequePdfBlobUrl(id!),
    onSuccess: (url) => {
      setPrintError(null)
      window.open(url, '_blank')
    },
    onError: (err: { message?: string }) => {
      setPrintError(err?.message ?? 'No se pudo generar el PDF')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 8 }} />
        <span className="skeleton-box" style={{ height: 16, width: 160, display: 'block', marginBottom: 24 }} />
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="skeleton-box" style={{ height: 18, width: `${60 + (i % 3) * 15}%`, display: 'block' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError || !cheque) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/tesoreria/cheques')}>
          <ArrowLeft size={14} /> Cheques
        </a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          No se encontró el cheque
        </div>
      </div>
    )
  }

  const isAnulado = cheque.estado === 'Anulado'

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/tesoreria/cheques')}>
        <ArrowLeft size={14} /> Cheques
      </a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Cheque {cheque.chequeNo}
            <span className={`badge ${STATUS_BADGE[cheque.estado]}`}>{cheque.estado}</span>
          </h1>
          <p className="page-sub">
            {cheque.beneficiario?.nombre ?? cheque.beneficiarioNombre ?? 'Sin beneficiario'} · {formatDate(cheque.fecha)}
          </p>
        </div>
      </div>

      <div className="doc-actions-bar">
        <button className="btn btn-ghost btn-size-sm" onClick={() => printMutation.mutate()} disabled={printMutation.isPending}>
          <Printer size={14} /> {printMutation.isPending ? 'Generando…' : 'Imprimir'}
        </button>
        {!isAnulado && (
          <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAnular(true)} disabled={anularMutation.isPending}>
            <Ban size={14} /> Anular
          </button>
        )}
      </div>

      {printError && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{printError}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>
            Intente regenerar la plantilla desde{' '}
            <a onClick={() => navigate('/config/tesoreria/plantillas-cheque')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
              Configuración → Plantillas de Cheque
            </a>
            , o quite la plantilla configurada en la cuenta bancaria para usar el comprobante genérico mientras se resuelve.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Información del Cheque</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cuenta Bancaria</span>
              <span className="detail-value">{cheque.cuentaBancariaNombre ?? cheque.cuentaBancaria}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(cheque.fecha)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Impreso</span>
              <span className="detail-value">{cheque.impreso ? `Sí${cheque.vecesImpreso ? ` (×${cheque.vecesImpreso})` : ''}` : 'No'}</span>
            </div>
            {cheque.documentoOrigen?.doctype && (
              <div className="detail-field">
                <span className="detail-label">Documento Contable</span>
                <span className="detail-value">{cheque.documentoOrigen.doctype} — {cheque.documentoOrigen.name}</span>
              </div>
            )}
            {cheque.motivo && (
              <div className="detail-field">
                <span className="detail-label">Motivo de anulación</span>
                <span className="detail-value">{cheque.motivo}</span>
              </div>
            )}
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div className="detail-field">
              <span className="detail-label">Monto</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--error-text)' }}>{formatDOP(cheque.monto)}</span>
            </div>
          </div>
        </div>
      </div>

      {cheque.facturas.length > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title">Facturas donde se utilizó</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th style={{ textAlign: 'right' }}>Monto aplicado</th>
                </tr>
              </thead>
              <tbody>
                {cheque.facturas.map((f, i) => (
                  <tr key={i}>
                    <td>{f.invoiceId}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(f.allocatedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmAnular && (
        <div className="modal-overlay" onClick={() => setConfirmAnular(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2 className="modal-title">Anular Cheque</h2></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0 }}>
                ¿Confirmas anular el cheque <strong>{cheque.chequeNo}</strong>?
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                Si el documento asociado ya fue sometido, se cancelará automáticamente — esto revierte
                los asientos contables y, si liquidaba una factura de compra, esa factura vuelve a
                quedar pendiente de pago. El número de cheque queda quemado y no se puede reutilizar.
              </p>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="chequeMotivo">Motivo (opcional)</label>
                <textarea
                  id="chequeMotivo"
                  className="ff-input"
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmAnular(false)}>Volver</button>
              <button className="btn btn-danger" onClick={() => anularMutation.mutate()} disabled={anularMutation.isPending}>
                {anularMutation.isPending ? <><span className="spinner" /> Anulando…</> : <><Ban size={14} /> Confirmar anulación</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
