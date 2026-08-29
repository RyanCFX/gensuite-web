// Panel de contingencia de Facturación Electrónica (Decreto 587-24) — F9.
// Cuando la DGII no responde, un e-CF se firma "en diferido" (WAITING_DEFERRED) y se transmite
// dentro de la ventana legal de 72h. La activación automática ya existe en el backend; esta
// pantalla es para la gestión manual (activar/desactivar, ver y reenviar diferidos).
//
// Todas las llamadas requieren el rol "System Manager" (403 si no lo tiene).
//
// CONSTANCIA: las pruebas end-to-end con la DGII caída/simulada siguen pendientes.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Check, Info, RefreshCw, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConfirmModal, Modal } from '@/shared/ui/Modal'
import { getEcfConfig } from '@/shared/api/config'
import { getContingenciaPendientes, activarContingencia, desactivarContingencia, flushContingencia } from '@/shared/api/ecf'
import type { ApiError, FlushContingenciaResult } from '@/shared/api/types'
import { useAuthStore } from '@/stores/auth.store'
import { formatDateTime } from '@/lib/formatters'
import { ecfTipoLabel, ecfDiferidoUrgencia } from '@/lib/dgii'

function toIsoLocalPlus72h(): string {
  const d = new Date(Date.now() + 72 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function contingenciaError(err: ApiError): void {
  if (err?.statusCode === 403) {
    toast.error('No tienes permiso para gestionar la contingencia de e-CF.')
    return
  }
  toast.error(err?.message ?? 'Ocurrió un error')
}

function ContingenciaContent({ company }: { company: string }) {
  const qc = useQueryClient()
  const [activarOpen, setActivarOpen] = useState(false)
  const [desactivarOpen, setDesactivarOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [autorizadoHasta, setAutorizadoHasta] = useState(toIsoLocalPlus72h())
  const [flushResult, setFlushResult] = useState<FlushContingenciaResult | null>(null)

  const { data: pendientes, isLoading } = useQuery({
    queryKey: ['ecf-contingencia-pendientes', company],
    queryFn: () => getContingenciaPendientes(company),
  })

  const pendientesCount = pendientes?.length ?? 0
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ecf-contingencia-pendientes', company] })

  const flushMutation = useMutation({
    mutationFn: () => flushContingencia(company),
    onSuccess: (res) => {
      setFlushResult(res)
      if (res.queued > 0) toast.success(`${res.queued} comprobante(s) reencolado(s) para reenvío`)
      invalidate()
    },
    onError: contingenciaError,
  })

  const activarMutation = useMutation({
    mutationFn: () => activarContingencia(company, {
      motivo: motivo.trim(),
      autorizadoHasta: autorizadoHasta ? new Date(autorizadoHasta).toISOString() : undefined,
    }),
    onSuccess: () => {
      toast.success('Contingencia activada')
      setActivarOpen(false)
      setMotivo('')
      setAutorizadoHasta(toIsoLocalPlus72h())
      invalidate()
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: contingenciaError,
  })

  const desactivarMutation = useMutation({
    mutationFn: () => desactivarContingencia(company),
    onSuccess: () => {
      toast.success('Contingencia desactivada')
      setDesactivarOpen(false)
      invalidate()
      qc.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: contingenciaError,
  })

  return (
    <>
      <div className="inline-alert inline-alert-info" style={{ alignItems: 'flex-start' }}>
        <Info size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Cuando la DGII no responde, un e-CF se firma "en diferido" y se transmite dentro de las
          72 horas legales. Si el tenant desactivó <em>«Bloquear sometimiento si Aura no responde»</em>,
          la contingencia se activa sola cuando hace falta — aquí puedes gestionarla manualmente.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-size-sm" onClick={() => { setMotivo(''); setAutorizadoHasta(toIsoLocalPlus72h()); setActivarOpen(true) }}>
          Activar contingencia
        </button>
        <button className="btn btn-secondary btn-size-sm" onClick={() => setDesactivarOpen(true)}>
          Desactivar contingencia
        </button>
        {pendientesCount > 0 && (
          <button className="btn btn-secondary btn-size-sm" onClick={() => { setFlushResult(null); flushMutation.mutate() }} disabled={flushMutation.isPending}>
            <RefreshCw size={14} /> {flushMutation.isPending ? 'Reenviando…' : 'Reenviar ahora'}
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Comprobantes en contingencia</span>
        </div>
        {isLoading ? (
          <span className="skeleton-box" style={{ height: 96, display: 'block', margin: 16 }} />
        ) : pendientesCount === 0 ? (
          <p className="ff-hint" style={{ margin: 16 }}>No hay comprobantes en contingencia.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>NCF</th>
                  <th>Tipo</th>
                  <th>Emitido</th>
                  <th>En diferido</th>
                </tr>
              </thead>
              <tbody>
                {pendientes!.map((d) => {
                  const u = ecfDiferidoUrgencia(d.horasEnDiferido)
                  return (
                    <tr key={d.voucherId}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.ncf}</td>
                      <td style={{ fontSize: 12 }}>{ecfTipoLabel(d.typeId)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDateTime(d.issuedAt)}</td>
                      <td>
                        <span className={`badge ${u.tone === 'error' ? 'badge-error' : u.tone === 'warn' ? 'badge-warning' : 'badge-neutral'}`}>
                          {u.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {flushResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {flushResult.queued > 0 && (
            <div className="inline-alert inline-alert-success">
              <Check size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{flushResult.queued} comprobante(s) reencolado(s) para reenvío a la DGII.</span>
            </div>
          )}
          {flushResult.expired > 0 && (
            <div className="inline-alert inline-alert-error">
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>
                <strong>{flushResult.expired} comprobante(s) superaron las 72 horas legales</strong> sin
                transmitirse. Requieren anulación manual y declaración en el Reporte 608 — la aplicación
                no puede resolverlo automáticamente.
              </span>
            </div>
          )}
          {flushResult.disallowed > 0 && (
            <div className="inline-alert inline-alert-warn">
              <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>
                {flushResult.disallowed} comprobante(s) son de tipos que no se pueden reenviar en
                contingencia (E41/E43/E45/E46/E47, autogenerados por el comprador). Deben resolverse por otra vía.
              </span>
            </div>
          )}
        </div>
      )}

      <Modal
        open={activarOpen}
        onClose={() => !activarMutation.isPending && setActivarOpen(false)}
        title="Activar contingencia"
        subtitle="Decreto 587-24 — acción poco frecuente y seria."
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary btn-size-sm" onClick={() => setActivarOpen(false)} disabled={activarMutation.isPending}>
              Cancelar
            </button>
            <button
              className="btn btn-primary btn-size-sm"
              disabled={!motivo.trim() || activarMutation.isPending}
              onClick={() => activarMutation.mutate()}
            >
              {activarMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Activar contingencia'}
            </button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label ff-required" htmlFor="contingenciaMotivo">Motivo</label>
          <textarea
            id="contingenciaMotivo"
            className="ff-textarea"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            placeholder="Ej: DGII sin respuesta desde las 10:00 — se activa contingencia proactivamente"
            autoFocus
          />
          <p className="ff-hint">{motivo.trim().length}/500 caracteres</p>
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="contingenciaHasta">Autorizada hasta</label>
          <input
            id="contingenciaHasta"
            type="datetime-local"
            className="ff-input"
            value={autorizadoHasta}
            onChange={(e) => setAutorizadoHasta(e.target.value)}
          />
          <p className="ff-hint">Por defecto la contingencia queda autorizada 72 horas (ventana legal).</p>
        </div>
      </Modal>

      <ConfirmModal
        open={desactivarOpen}
        onClose={() => setDesactivarOpen(false)}
        onConfirm={() => desactivarMutation.mutate()}
        loading={desactivarMutation.isPending}
        title="¿Desactivar contingencia?"
        description={
          pendientesCount > 0
            ? `Quedan ${pendientesCount} comprobante(s) en contingencia sin transmitir — desactivar ahora podría dejarlos sin enviar.`
            : 'La emisión de e-CF volverá a exigir respuesta en línea de la DGII.'
        }
        confirmLabel="Desactivar"
        variant="danger"
      />
    </>
  )
}

export default function EcfContingenciaPage() {
  const isSystemManager = useAuthStore((s) => s.user?.roles?.includes('System Manager') ?? false)
  const { data, isLoading } = useQuery({ queryKey: ['ecf-config'], queryFn: getEcfConfig })

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader overline="Facturación Electrónica" title="Contingencia" />
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <span className="empty-icon" aria-hidden="true" style={{ fontSize: 24 }}>🔒</span>
          <p className="empty-title">No tienes acceso a esta sección</p>
          <p className="empty-sub">Requiere el rol «System Manager» en este tenant.</p>
        </div>
      </div>
    )
  }

  const company = data?.company ?? ''

  return (
    <div className="page-container">
      <PageHeader
        overline="Facturación Electrónica"
        title="Contingencia"
        description="Decreto 587-24 — gestión manual de e-CF diferidos"
        action={<Link className="btn btn-ghost btn-size-sm" to="/config/ecf/admin"><ShieldCheck size={14} /> Provisioning</Link>}
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isLoading ? (
          <span className="skeleton-box" style={{ height: 240, display: 'block' }} />
        ) : !company ? (
          <div className="inline-alert inline-alert-info">
            <Info size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>
              Este tenant todavía no está conectado a Aura. Conéctalo desde{' '}
              <Link to="/config/ecf/admin">Provisioning</Link> para gestionar la contingencia.
            </span>
          </div>
        ) : (
          <ContingenciaContent company={company} />
        )}
      </div>
    </div>
  )
}
