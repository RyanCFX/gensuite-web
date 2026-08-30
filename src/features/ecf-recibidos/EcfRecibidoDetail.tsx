// Detalle de un e-CF recibido de un tercero (F8): líneas del proveedor (solo lectura),
// conciliación con una Purchase Invoice y aprobación comercial (ACECF).
//
// CONSTANCIA: las pruebas end-to-end con datos reales quedan pendientes — no existe todavía
// ningún e-CF recibido de un tercero en los entornos de prueba.

import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Receipt, Link2, Check, X, AlertTriangle } from 'lucide-react'
import { getEcfRecibido, vincularEcfRecibido, aprobacionComercialEcf } from '@/shared/api/ecf-recibidos'
import { listCompras } from '@/shared/api/compras-gastos'
import type { AcecfStatus, ApiError } from '@/shared/api/types'
import { formatDate, formatDateTime, formatDOP } from '@/lib/formatters'
import {
  ecfStatusLabel, ecfStatusBadge, ecfConciliacionLabel, ecfConciliacionBadge,
  acecfStatusLabel, acecfBadge, ecfTipoLabel, ecfSlaUrgencia,
} from '@/lib/dgii'
import { Modal } from '@/shared/ui/Modal'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

function vincularErrorMsg(err: ApiError): string {
  switch (err?.statusCode) {
    case 400:
      return 'El total de la factura de compra no coincide con el del e-CF (±RD$0.01). Revise que sea el documento correcto.'
    case 404:
      return 'Esa factura de compra no existe.'
    case 409:
      return err.message || 'Ya existe un vínculo para este comprobante o para esa factura de compra.'
    default:
      return err?.message ?? 'No se pudo vincular'
  }
}

export default function EcfRecibidoDetail() {
  const { voucherId = '' } = useParams<{ voucherId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [manualPi, setManualPi] = useState('')
  const [manualPiSearch, setManualPiSearch] = useState('')
  const [multipleSel, setMultipleSel] = useState('')
  const [acecfModal, setAcecfModal] = useState<AcecfStatus | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data: v, isLoading } = useQuery({
    queryKey: ['ecf-recibido', voucherId],
    queryFn: () => getEcfRecibido(voucherId),
    enabled: !!voucherId,
  })

  const { data: comprasData, isLoading: comprasLoading } = useQuery({
    queryKey: ['compras-search-ecf', manualPiSearch],
    queryFn: () => listCompras({ search: manualPiSearch || undefined, status: 'all', limit: 20 }),
    enabled: v?.conciliacion === 'NINGUNO',
  })
  const compraOptions: SearchSelectOption[] = (comprasData?.items ?? []).map((c) => ({
    value: c.id,
    label: (c.esProveedorOcasional ? c.proveedorOcasionalNombre ?? c.supplierName : c.supplierName) ?? c.id,
    sublabel: `${c.ncfProveedor ?? c.id} — ${formatDOP(c.grandTotal)}`,
  }))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ecf-recibido', voucherId] })
    queryClient.invalidateQueries({ queryKey: ['ecf-recibidos'] })
  }

  const vincularMutation = useMutation({
    mutationFn: (purchaseInvoice: string) => vincularEcfRecibido(voucherId, { purchaseInvoice }),
    onSuccess: () => { toast.success('e-CF vinculado con la factura de compra'); invalidate() },
    onError: (err: ApiError) => toast.error(vincularErrorMsg(err)),
  })

  const acecfMutation = useMutation({
    mutationFn: ({ status, reason }: { status: AcecfStatus; reason?: string }) =>
      aprobacionComercialEcf(voucherId, { status, reason }),
    onSuccess: (_res, vars) => {
      toast.success(vars.status === 'ACCEPTED' ? 'Comprobante aceptado comercialmente' : 'Comprobante rechazado comercialmente')
      setAcecfModal(null)
      setRejectReason('')
      invalidate()
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 403) {
        toast.error('No tiene permiso para decidir la aprobación comercial de este comprobante.')
        return
      }
      if (err?.statusCode === 409) {
        toast.error('Este comprobante ya tiene una decisión tomada.')
        setAcecfModal(null)
        invalidate()
        return
      }
      toast.error(err?.message ?? 'No se pudo registrar la decisión')
    },
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

  if (!v) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-title">e-CF recibido no encontrado</div>
          <button className="btn btn-ghost btn-size-sm" onClick={() => navigate('/ecf-recibidos')}>
            Volver a la bandeja
          </button>
        </div>
      </div>
    )
  }

  const acecfPendiente = v.acecf?.status == null
  const sla = ecfSlaUrgencia(v.slaVenceEn)
  const rejectReasonValid = rejectReason.trim().length > 0 && rejectReason.trim().length <= 500

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/ecf-recibidos')}>
            <ArrowLeft size={14} /> e-CF Recibidos
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {v.ncf}
            <span className={`badge ${ecfStatusBadge(v.status)}`}>{ecfStatusLabel(v.status)}</span>
            <span className={`badge ${ecfConciliacionBadge(v.conciliacion)}`}>{ecfConciliacionLabel(v.conciliacion)}</span>
            <span className={`badge ${acecfBadge(v.acecf?.status)}`}>{acecfStatusLabel(v.acecf?.status)}</span>
          </h1>
          <p className="page-sub">{v.counterpartName} · {v.counterpartRnc}</p>
        </div>
      </div>

      {acecfPendiente && v.slaVenceEn && (
        <div
          className={`inline-alert ${sla.tone === 'error' ? 'inline-alert-error' : sla.tone === 'warn' ? 'inline-alert-warn' : 'inline-alert-info'}`}
          style={{ marginBottom: 16 }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>Aprobación comercial (ACECF): <strong>{sla.label}</strong>. Es una decisión legal e irreversible.</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Receipt size={16} /> Datos del comprobante
          </h2>
        </div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field"><span className="detail-label">NCF</span><span className="detail-value" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v.ncf}</span></div>
            <div className="detail-field"><span className="detail-label">Tipo</span><span className="detail-value">{ecfTipoLabel(v.typeId)}</span></div>
            <div className="detail-field"><span className="detail-label">Emisor</span><span className="detail-value">{v.counterpartName} ({v.counterpartRnc})</span></div>
            <div className="detail-field"><span className="detail-label">Fecha de emisión</span><span className="detail-value">{formatDate(v.issuedAt)}</span></div>
            <div className="detail-field"><span className="detail-label">Total</span><span className="detail-value" style={{ fontWeight: 600 }}>{formatDOP(v.total)} {v.currency}</span></div>
          </div>
        </div>
      </div>

      {/* Conciliación */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link2 size={16} /> Conciliación con factura de compra
          </h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {v.conciliacion === 'CONCILIADO' && v.purchaseInvoice ? (
            <p style={{ fontSize: 13 }}>
              Vinculado a la factura de compra{' '}
              <Link to={`/compras/${v.purchaseInvoice}`} style={{ fontFamily: 'monospace' }}>{v.purchaseInvoice}</Link>.
            </p>
          ) : v.conciliacion === 'UNICO' && v.candidatosConciliacion[0] ? (
            <>
              <p style={{ fontSize: 13 }}>
                Encontramos una factura de compra que coincide (mismo NCF, RNC y total):{' '}
                <strong style={{ fontFamily: 'monospace' }}>{v.candidatosConciliacion[0]}</strong>.
              </p>
              <div>
                <button
                  className="btn btn-primary btn-size-sm"
                  disabled={vincularMutation.isPending}
                  onClick={() => vincularMutation.mutate(v.candidatosConciliacion[0])}
                >
                  <Link2 size={14} /> Vincular con {v.candidatosConciliacion[0]}
                </button>
              </div>
            </>
          ) : v.conciliacion === 'MULTIPLE' ? (
            <>
              <p style={{ fontSize: 13 }}>Hay varias facturas de compra candidatas. Elige cuál corresponde:</p>
              <div style={{ maxWidth: 360 }}>
                <Select value={multipleSel} onValueChange={setMultipleSel} placeholder="Selecciona la factura de compra">
                  {v.candidatosConciliacion.map((cid) => (
                    <SelectItem key={cid} value={cid}>{cid}</SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <button
                  className="btn btn-primary btn-size-sm"
                  disabled={!multipleSel || vincularMutation.isPending}
                  onClick={() => vincularMutation.mutate(multipleSel)}
                >
                  <Link2 size={14} /> Vincular
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13 }}>
                No hay ninguna factura de compra que coincida automáticamente. Búscala manualmente, o
                regístrala primero en Compras y vuelve aquí.
              </p>
              <div style={{ maxWidth: 420 }}>
                <SearchSelect
                  value={manualPi}
                  onChange={(val) => setManualPi(val)}
                  options={compraOptions}
                  onSearch={setManualPiSearch}
                  loading={comprasLoading}
                  placeholder="Buscar factura de compra…"
                />
              </div>
              <div>
                <button
                  className="btn btn-primary btn-size-sm"
                  disabled={!manualPi || vincularMutation.isPending}
                  onClick={() => vincularMutation.mutate(manualPi)}
                >
                  <Link2 size={14} /> Vincular
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Líneas del proveedor */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Líneas del proveedor</h2>
        </div>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right' }}>% ITBIS</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {(v.items ?? []).length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '16px 0' }}>Sin líneas</td></tr>
              ) : (
                v.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.description || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{it.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(it.unitPrice)}</td>
                    <td style={{ textAlign: 'right' }}>{it.itbisRate != null ? `${it.itbisRate}%` : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{it.amount != null ? formatDOP(it.amount) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card-body">
          <p className="ff-hint" style={{ margin: 0 }}>
            Detalle tal como lo emitió el proveedor. No se usa para crear la factura de compra
            automáticamente — captúrala tú mismo en Compras si aún no la registraste.
          </p>
        </div>
      </div>

      {/* ACECF */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Aprobación comercial (ACECF)</h2>
          <span className={`badge ${acecfBadge(v.acecf?.status)}`}>{acecfStatusLabel(v.acecf?.status)}</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {acecfPendiente ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Decide si aceptas o rechazas comercialmente este comprobante. La decisión es legal e irreversible.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-size-sm" onClick={() => setAcecfModal('ACCEPTED')}>
                  <Check size={14} /> Aceptar
                </button>
                <button className="btn btn-danger btn-size-sm" onClick={() => { setRejectReason(''); setAcecfModal('REJECTED') }}>
                  <X size={14} /> Rechazar
                </button>
              </div>
            </>
          ) : (
            <div className="fields-grid">
              <div className="detail-field"><span className="detail-label">Decisión</span><span className="detail-value">{acecfStatusLabel(v.acecf?.status)}</span></div>
              {v.acecf?.decidedBy && <div className="detail-field"><span className="detail-label">Decidida por</span><span className="detail-value">{v.acecf.decidedBy}</span></div>}
              {v.acecf?.decidedAt && <div className="detail-field"><span className="detail-label">Fecha</span><span className="detail-value">{formatDateTime(v.acecf.decidedAt)}</span></div>}
              {v.acecf?.status === 'REJECTED' && v.acecf?.reason && (
                <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="detail-label">Motivo del rechazo</span>
                  <span className="detail-value" style={{ whiteSpace: 'pre-line' }}>{v.acecf.reason}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={acecfModal != null}
        onClose={() => !acecfMutation.isPending && setAcecfModal(null)}
        title={acecfModal === 'REJECTED' ? 'Rechazar comprobante' : 'Aceptar comprobante'}
        subtitle="Decisión legal e irreversible ante la DGII."
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary btn-size-sm" onClick={() => setAcecfModal(null)} disabled={acecfMutation.isPending}>
              Volver
            </button>
            <button
              className={`btn ${acecfModal === 'REJECTED' ? 'btn-danger' : 'btn-primary'} btn-size-sm`}
              disabled={acecfMutation.isPending || (acecfModal === 'REJECTED' && !rejectReasonValid)}
              onClick={() =>
                acecfMutation.mutate(
                  acecfModal === 'REJECTED'
                    ? { status: 'REJECTED', reason: rejectReason.trim() }
                    : { status: 'ACCEPTED' },
                )
              }
            >
              {acecfMutation.isPending
                ? <span className="spinner spinner-white spinner-sm" />
                : acecfModal === 'REJECTED' ? 'Rechazar' : 'Aceptar'}
            </button>
          </>
        }
      >
        {acecfModal === 'REJECTED' ? (
          <div className="ff-wrap">
            <label className="ff-label ff-required" htmlFor="acecfReason">Motivo del rechazo</label>
            <textarea
              id="acecfReason"
              className="ff-textarea"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Describe por qué se rechaza el comprobante"
              maxLength={500}
              autoFocus
            />
            <p className="ff-hint">{rejectReason.trim().length}/500 caracteres</p>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Confirmas que aceptas comercialmente el comprobante {v.ncf} de {v.counterpartName}.
          </p>
        )}
      </Modal>
    </div>
  )
}
