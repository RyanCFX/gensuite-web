// Secuencias e-NCF (rangos electrónicos autorizados por la DGII) — análogo a las Secuencias NCF
// físicas de este mismo archivo/pantalla, pero contra Aura (/config/ecf/secuencias).
//
// CONSTANCIA: construido contra la API; las pruebas de integración end-to-end quedan pendientes —
// ningún tenant real tiene todavía una cuenta de Aura conectada ni un certificado cargado.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, AlertCircle, Plus, Pencil, Trash2, Info, Ban } from 'lucide-react'
import { getEcfConfig } from '@/shared/api/config'
import {
  listEcfSequences, createEcfSequence, updateEcfSequence, deleteEcfSequence, getEcfTipos, voidEcfRanges,
} from '@/shared/api/ecf'
import type { EcfSequence, EcfTipoElectronico } from '@/shared/api/types'
import { ECF_TIPOS, ECF_ENV_LABELS, ecfTipoLabel } from '@/lib/dgii'
import { formatDate } from '@/lib/formatters'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'

const ECF_TYPE_IDS = ECF_TIPOS.map((t) => t.typeId) as EcfTipoElectronico[]

function MiniProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100)
  const color = clamped > 90 ? 'var(--error-text)' : clamped > 70 ? 'var(--warning-text)' : 'var(--brand-primary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 6, background: 'var(--surface-sunken)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden',
      }}>
        <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: 'var(--radius-full)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{clamped.toFixed(1)}%</span>
    </div>
  )
}

function StatusBadge({ s }: { s: EcfSequence }) {
  if (s.exhausted) {
    return (
      <span className="badge" style={{ background: 'var(--surface-sunken)', color: 'var(--text-tertiary)', borderColor: 'var(--border-default)' }}>
        ⚫ Agotado
      </span>
    )
  }
  if (s.alertaActiva) {
    return (
      <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <AlertTriangle size={11} aria-hidden="true" /> Por agotarse
      </span>
    )
  }
  return <span className="badge badge-success">Activo</span>
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ company, onClose }: { company: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [typeId, setTypeId] = useState<EcfTipoElectronico>('31')
  const [startOn, setStartOn] = useState(1)
  const [stopOn, setStopOn] = useState(200)
  const [expireAt, setExpireAt] = useState('')
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const maxExpire = new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().slice(0, 10)

  const isDirty = useDirtyCheck({ typeId, startOn, stopOn, expireAt }, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  const createMutation = useMutation({
    mutationFn: () => createEcfSequence(company, {
      typeId, startOn, stopOn, expireAt: expireAt || undefined,
    }),
    onSuccess: () => {
      toast.success(`Rango e-NCF ${typeId} creado`)
      qc.invalidateQueries({ queryKey: ['ecf-secuencias'] })
      onClose()
    },
    onError: (err: { message?: string }) => setError(err?.message ?? 'Error al crear el rango'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (stopOn <= startOn) { setError('El número final debe ser mayor que el inicial'); return }
    if (expireAt && expireAt <= today) { setError('La fecha de vencimiento debe ser futura'); return }
    createMutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Nuevo rango e-NCF</div>
            <div className="modal-sub">Aura — Facturación Electrónica</div>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ff-wrap">
              <label className="ff-label">Tipo de comprobante <span className="ff-required">*</span></label>
              <Select value={typeId} onValueChange={(v) => setTypeId(v as EcfTipoElectronico)}>
                {ECF_TYPE_IDS.map((id) => (
                  <SelectItem key={id} value={id}>{ecfTipoLabel(id)}</SelectItem>
                ))}
              </Select>
            </div>
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label">Número inicial <span className="ff-required">*</span></label>
                <input type="number" min={1} className="ff-input" value={startOn}
                  onChange={(e) => setStartOn(parseInt(e.target.value) || 1)} />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Número final <span className="ff-required">*</span></label>
                <input type="number" min={startOn + 1} className="ff-input" value={stopOn}
                  onChange={(e) => setStopOn(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Fecha de vencimiento</label>
              <DatePicker className="ff-input" min={today} max={maxExpire} value={expireAt} onChange={setExpireAt} />
              <p className="ff-hint">Fecha que aparece en la resolución de la DGII. El ambiente se infiere del modo activo.</p>
            </div>
            {error && (
              <div className="inline-alert inline-alert-error">
                <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creando…' : 'Crear rango'}
            </button>
          </div>
        </form>
      </div>
      <ConfirmModal
        open={confirming} onClose={cancelDiscard} onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios" variant="danger"
      />
    </div>
  )
}

// ─── Edit modal (solo extender: stopOn / expireAt) ────────────────────────────

function EditModal({ company, seq, onClose }: { company: string; seq: EcfSequence; onClose: () => void }) {
  const qc = useQueryClient()
  const [stopOn, setStopOn] = useState(seq.stopOn)
  const [expireAt, setExpireAt] = useState(seq.expireAt ?? '')
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const maxExpire = new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().slice(0, 10)

  const isDirty = useDirtyCheck({ stopOn, expireAt }, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  const updateMutation = useMutation({
    mutationFn: () => updateEcfSequence(company, seq.id, {
      stopOn: stopOn !== seq.stopOn ? stopOn : undefined,
      expireAt: expireAt && expireAt !== (seq.expireAt ?? '') ? expireAt : undefined,
    }),
    onSuccess: () => {
      toast.success('Rango e-NCF actualizado')
      qc.invalidateQueries({ queryKey: ['ecf-secuencias'] })
      onClose()
    },
    onError: (err: { message?: string }) => setError(err?.message ?? 'Error al actualizar el rango'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (stopOn < seq.currentNumber) { setError(`El número final no puede ser menor que el actual (${seq.currentNumber})`); return }
    if (expireAt && expireAt <= today) { setError('La fecha de vencimiento debe ser futura'); return }
    updateMutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Editar rango e-NCF</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ff-wrap">
              <label className="ff-label">Tipo de comprobante</label>
              <input className="ff-input" value={ecfTipoLabel(seq.typeId)} disabled />
              <p className="ff-hint">🔒 No editable — para cambiar de tipo hay que crear un rango nuevo.</p>
            </div>
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label">Número inicial</label>
                <input className="ff-input" value={seq.startOn} disabled />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Número final <span className="ff-required">*</span></label>
                <input type="number" min={seq.currentNumber} className="ff-input" value={stopOn}
                  onChange={(e) => setStopOn(parseInt(e.target.value) || 0)} />
                <p className="ff-hint">Solo se puede extender.</p>
              </div>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Fecha de vencimiento</label>
              <DatePicker className="ff-input" min={today} max={maxExpire} value={expireAt} onChange={setExpireAt} />
            </div>
            {error && (
              <div className="inline-alert inline-alert-error">
                <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
      <ConfirmModal
        open={confirming} onClose={cancelDiscard} onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios" variant="danger"
      />
    </div>
  )
}

// ─── Delete modal ─────────────────────────────────────────────────────────────

function DeleteModal({ company, seq, onClose }: { company: string; seq: EcfSequence; onClose: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const deleteMutation = useMutation({
    mutationFn: () => deleteEcfSequence(company, seq.id),
    onSuccess: () => {
      toast.success('Rango e-NCF eliminado')
      qc.invalidateQueries({ queryKey: ['ecf-secuencias'] })
      onClose()
    },
    // El backend responde 400 si el rango ya emitió — mostrar el mensaje tal cual, no reintentar.
    onError: (err: { message?: string }) => setError(err?.message ?? 'No se puede eliminar este rango'),
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">¿Eliminar rango e-NCF?</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {ecfTipoLabel(seq.typeId)} · {seq.startOn.toLocaleString('es-DO')}–{seq.stopOn.toLocaleString('es-DO')}.
            Solo se puede eliminar si nunca emitió un comprobante.
          </p>
          {error && (
            <div className="inline-alert inline-alert-error">
              <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

type PanelModal =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; seq: EcfSequence }
  | { type: 'delete'; seq: EcfSequence }
  | { type: 'void'; seq: EcfSequence }

// ─── Anular rango sin usar ────────────────────────────────────────────────────

function VoidRangeModal({ company, seq, onClose }: { company: string; seq: EcfSequence; onClose: () => void }) {
  const qc = useQueryClient()
  const [from, setFrom] = useState(seq.currentNumber)
  const [to, setTo] = useState(seq.stopOn)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const isDirty = useDirtyCheck({ from, to, reason }, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  const mutation = useMutation({
    mutationFn: () => voidEcfRanges(company, {
      ranges: [{ typeId: seq.typeId, from, to }],
      reason: reason.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Rango anulado')
      qc.invalidateQueries({ queryKey: ['ecf-secuencias'] })
      onClose()
    },
    onError: (err: { message?: string }) => setError(err?.message ?? 'No se pudo anular el rango'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (from < 1 || to < from) { setError('Rango inválido — el número final debe ser mayor o igual al inicial'); return }
    mutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Anular rango e-NCF sin usar</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="inline-alert inline-alert-warn">
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>
                Acción irreversible. Los números anulados no podrán volver a emitirse. Los e-CF ya
                aceptados por la DGII dentro del rango se saltan automáticamente.
              </span>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Tipo de comprobante</label>
              <input className="ff-input" value={ecfTipoLabel(seq.typeId)} disabled />
            </div>
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label">Desde el número <span className="ff-required">*</span></label>
                <input type="number" min={1} className="ff-input" value={from}
                  onChange={(e) => setFrom(parseInt(e.target.value) || 0)} />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Hasta el número <span className="ff-required">*</span></label>
                <input type="number" min={from} className="ff-input" value={to}
                  onChange={(e) => setTo(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <p className="ff-hint">Precargado con el tramo aún no emitido ({seq.currentNumber.toLocaleString('es-DO')}–{seq.stopOn.toLocaleString('es-DO')}).</p>
            <div className="ff-wrap">
              <label className="ff-label">Motivo</label>
              <textarea className="ff-input" rows={2} maxLength={500} value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Cierre de operación / cambio de rango autorizado" />
            </div>
            {error && (
              <div className="inline-alert inline-alert-error">
                <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button type="submit" className="btn btn-danger" disabled={from > to || mutation.isPending}>
              {mutation.isPending ? 'Anulando…' : 'Anular rango'}
            </button>
          </div>
        </form>
      </div>
      <ConfirmModal
        open={confirming} onClose={cancelDiscard} onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios" variant="danger"
      />
    </div>
  )
}

export function EcfSequencesPanel() {
  const [modal, setModal] = useState<PanelModal>({ type: 'none' })

  const { data: ecfConfig, isLoading: configLoading } = useQuery({
    queryKey: ['ecf-config'],
    queryFn: getEcfConfig,
  })
  const company = ecfConfig?.company ?? ''

  const { data: tipos } = useQuery({ queryKey: ['ecf-tipos'], queryFn: getEcfTipos })

  const { data: sequences, isLoading, isError } = useQuery({
    queryKey: ['ecf-secuencias', company],
    queryFn: () => listEcfSequences(company),
    enabled: !!company,
  })

  if (configLoading) {
    return <span className="skeleton-box" style={{ height: 160, display: 'block' }} />
  }

  if (!company || !ecfConfig?.provisioning?.provisionado) {
    return (
      <div className="inline-alert inline-alert-info">
        <Info size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>
          Este tenant todavía no está conectado a Aura. Conéctalo desde{' '}
          <Link to="/config/ecf/admin">Facturación Electrónica → Avanzado</Link> para gestionar rangos e-NCF.
        </span>
      </div>
    )
  }

  const electronicosCount = (tipos ?? []).filter((t) => t.electronico).length

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="inline-alert inline-alert-info">
        <Info size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>
          Rangos numéricos autorizados por la DGII para comprobantes electrónicos, sincronizados con Aura.
          {electronicosCount > 0
            ? ` Hay ${electronicosCount} tipo(s) habilitado(s) para emitirse como e-CF.`
            : ' Ningún tipo está habilitado todavía para emitirse como e-CF.'}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-size-sm" onClick={() => setModal({ type: 'create' })}>
          <Plus size={14} aria-hidden="true" /> Nuevo rango
        </button>
      </div>

      {(sequences ?? []).filter((s) => s.alertaActiva && !s.exhausted).map((s) => (
        <div key={s.id} className="inline-alert inline-alert-warn">
          <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>
            El rango e-NCF <strong>{ecfTipoLabel(s.typeId)}</strong> está por agotarse
            ({s.remaining.toLocaleString('es-DO')} restantes). Considera crear uno nuevo antes de que se agote.
          </span>
        </div>
      ))}

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Ambiente</th>
                <th>Rango</th>
                <th>Siguiente</th>
                <th style={{ minWidth: 160 }}>Disponibles</th>
                <th>Vence</th>
                <th>Estado</th>
                <th style={{ width: 90 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><span className="skeleton-box" style={{ height: 14, width: '80%', display: 'block' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar los rangos e-NCF
                        </td>
                      </tr>
                    )
                  : !sequences || sequences.length === 0
                    ? (
                        <tr>
                          <td colSpan={8}>
                            <div className="empty-state">
                              <span className="empty-icon" aria-hidden="true" style={{ fontSize: 24 }}>⚡</span>
                              <p className="empty-title">Sin rangos e-NCF</p>
                              <p className="empty-sub">Crea el primer rango electrónico para comenzar a emitir e-CF.</p>
                              <button className="btn btn-primary btn-size-sm" onClick={() => setModal({ type: 'create' })}>
                                <Plus size={14} /> Nuevo rango
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    : sequences.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span className="badge badge-neutral" style={{ fontWeight: 600 }}>{s.typeId}</span>
                            <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>{s.ncfType}</span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ECF_ENV_LABELS[s.env] ?? s.env}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {s.startOn.toLocaleString('es-DO')} — {s.stopOn.toLocaleString('es-DO')}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {s.exhausted ? <span style={{ color: 'var(--text-tertiary)' }}>Agotado</span> : s.currentNumber.toLocaleString('es-DO')}
                          </td>
                          <td>
                            {s.exhausted
                              ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                              : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: s.alertaActiva ? 'var(--warning-text)' : 'var(--text-primary)' }}>
                                      {s.remaining.toLocaleString('es-DO')}
                                    </span>
                                    <MiniProgressBar pct={s.usedPct} />
                                  </div>
                                )}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {s.expireAt ? formatDate(s.expireAt) : '—'}
                          </td>
                          <td><StatusBadge s={s} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              {!s.exhausted && (
                                <button className="btn btn-ghost btn-size-icon-sm" title="Editar"
                                  onClick={() => setModal({ type: 'edit', seq: s })}>
                                  <Pencil size={13} aria-hidden="true" />
                                </button>
                              )}
                              {!s.exhausted && (
                                <button className="btn btn-ghost btn-size-icon-sm" title="Anular rango sin usar"
                                  style={{ color: 'var(--warning-text)' }}
                                  onClick={() => setModal({ type: 'void', seq: s })}>
                                  <Ban size={14} aria-hidden="true" />
                                </button>
                              )}
                              <button className="btn btn-ghost btn-size-icon-sm" title="Eliminar"
                                style={{ color: 'var(--icon-muted)' }}
                                onClick={() => setModal({ type: 'delete', seq: s })}>
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal.type === 'create' && <CreateModal company={company} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'edit' && <EditModal company={company} seq={modal.seq} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'delete' && <DeleteModal company={company} seq={modal.seq} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'void' && <VoidRangeModal company={company} seq={modal.seq} onClose={() => setModal({ type: 'none' })} />}
    </div>
  )
}
