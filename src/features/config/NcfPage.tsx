import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getNcfSeries, getNcfSerie,
  createNcfSerie, updateNcfSerie,
  disableNcfSerie, enableNcfSerie,
} from '@/shared/api/config'
import type { NcfSerie, CreateNcfSerieDto, UpdateNcfSerieDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate } from '@/lib/formatters'
import {
  AlertTriangle, AlertCircle, Plus, Eye, Pencil,
  XCircle, RefreshCw, ChevronRight,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const NCF_TYPE_INFO: Record<string, { label: string; description: string; color: string }> = {
  B01: { label: 'B01', description: 'Crédito Fiscal (clientes con RNC)',   color: '#1a69ab' },
  B02: { label: 'B02', description: 'Consumidor Final (sin RNC)',          color: '#16a34a' },
  B14: { label: 'B14', description: 'Regímenes Especiales (zonas francas)', color: '#ca8a04' },
  B15: { label: 'B15', description: 'Gubernamentales',                     color: '#7c3aed' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSerieStatus(s: NcfSerie): 'active' | 'disabled' | 'exhausted' {
  if (s.exhausted || s.nextNcf === -1) return 'exhausted'
  if (s.disabled) return 'disabled'
  return 'active'
}

function formatNcfPreview(type: string, start: number): string {
  const padded = String(start).padStart(8, '0')
  return `${type}${padded}`
}

function isExpiringSoon(dateStr: string): boolean {
  const d = new Date(dateStr)
  const in30 = new Date()
  in30.setDate(in30.getDate() + 30)
  return d <= in30
}

function isExpired(dateStr: string): boolean {
  return new Date(dateStr) < new Date()
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ used, total, color = 'var(--brand-primary)' }: { used: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const barColor = pct > 90 ? 'var(--error-text)' : pct > 70 ? 'var(--warning-text)' : color

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 6, background: 'var(--surface-sunken)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: barColor, borderRadius: 'var(--radius-full)',
          transition: 'width 500ms var(--ease-out)',
        }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

// ─── NCF Type Badge ───────────────────────────────────────────────────────────

function NcfTypeBadge({ type }: { type: string }) {
  const info = NCF_TYPE_INFO[type]
  if (!info) return <span className="badge badge-neutral">{type}</span>
  return (
    <span className="badge" style={{
      background: `${info.color}18`,
      color: info.color,
      borderColor: `${info.color}40`,
      fontWeight: 600,
      letterSpacing: '0.02em',
    }}>
      {type}
    </span>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadgePill({ serie }: { serie: NcfSerie }) {
  const status = getSerieStatus(serie)
  if (status === 'exhausted') {
    return (
      <span className="badge" style={{ background: 'var(--surface-sunken)', color: 'var(--text-tertiary)', borderColor: 'var(--border-default)' }}>
        ⚫ Agotada
      </span>
    )
  }
  if (status === 'disabled') {
    return (
      <span className="badge badge-error">
        Deshabilitada
      </span>
    )
  }
  return (
    <span className="badge badge-success">
      Activa
    </span>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [ncfType, setNcfType] = useState<'B01' | 'B02' | 'B14' | 'B15'>('B02')
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(50000000)
  const [expiration, setExpiration] = useState('')
  const [error, setError] = useState('')

  const qc = useQueryClient()
  const createMutation = useMutation({
    mutationFn: (data: CreateNcfSerieDto) => createNcfSerie(data),
    onSuccess: () => {
      toast.success(`Secuencia NCF ${ncfType} creada correctamente`)
      qc.invalidateQueries({ queryKey: ['ncf-series'] })
      onSuccess()
    },
    onError: (err: { message?: string }) => {
      setError(err?.message ?? 'Error al crear la secuencia')
    },
  })

  const preview = formatNcfPreview(ncfType, start)
  const today = new Date().toISOString().slice(0, 10)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!expiration) { setError('La fecha de vencimiento es requerida'); return }
    if (expiration <= today) { setError('La fecha de vencimiento debe ser futura'); return }
    if (end <= start) { setError('El número final debe ser mayor que el inicial'); return }
    createMutation.mutate({ ncfType, start, end, nextNcf: start, expirationDate: expiration })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Nueva Secuencia NCF</div>
            <div className="modal-sub">DGII — República Dominicana</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><XCircle size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Tipo NCF */}
            <div className="ff-wrap">
              <label className="ff-label">Tipo de Comprobante <span className="ff-required">*</span></label>
              <select className="ff-select" value={ncfType} onChange={(e) => setNcfType(e.target.value as typeof ncfType)}>
                {Object.entries(NCF_TYPE_INFO).map(([k, v]) => (
                  <option key={k} value={k}>{k} — {v.description}</option>
                ))}
              </select>
              <p className="ff-hint">{NCF_TYPE_INFO[ncfType]?.description}</p>
            </div>

            {/* Rango */}
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label">Número inicial <span className="ff-required">*</span></label>
                <input
                  type="number" min={1} className="ff-input"
                  value={start}
                  onChange={(e) => setStart(parseInt(e.target.value) || 1)}
                />
                <p className="ff-hint">Generalmente comienza en 1</p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Número final <span className="ff-required">*</span></label>
                <input
                  type="number" min={start + 1} className="ff-input"
                  value={end}
                  onChange={(e) => setEnd(parseInt(e.target.value) || 50000000)}
                />
                <p className="ff-hint">Máx. estándar: 50,000,000</p>
              </div>
            </div>

            {/* Vencimiento */}
            <div className="ff-wrap">
              <label className="ff-label">Fecha de vencimiento <span className="ff-required">*</span></label>
              <input
                type="date" className="ff-input" min={today}
                value={expiration} onChange={(e) => setExpiration(e.target.value)}
              />
              <p className="ff-hint">Fecha que aparece en la resolución de la DGII</p>
            </div>

            {/* Preview */}
            <div style={{
              padding: '12px 14px',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Primer NCF que se generará
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
                {preview}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {(end - start + 1).toLocaleString('es-DO')} comprobantes disponibles
              </p>
            </div>

            {error && (
              <div className="inline-alert inline-alert-error">
                <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? <><span className="spinner spinner-white spinner-sm" /> Creando…</>
                : 'Crear Secuencia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({ serie, onClose }: { serie: NcfSerie; onClose: () => void }) {
  const hasUsed = (serie.used ?? 0) > 0
  const [ncfType, setNcfType] = useState(serie.ncfType)
  const [end, setEnd] = useState(serie.end)
  const [expiration, setExpiration] = useState(serie.expirationDate)
  const [warnings, setWarnings] = useState<string[]>([])
  const [formError, setFormError] = useState('')

  const qc = useQueryClient()
  const updateMutation = useMutation({
    mutationFn: (data: UpdateNcfSerieDto) => updateNcfSerie(serie.id, data),
    onSuccess: (data) => {
      const w = (data as NcfSerie & { warnings?: string[] }).warnings ?? []
      if (w.length > 0) setWarnings(w)
      else {
        toast.success('Secuencia actualizada')
        qc.invalidateQueries({ queryKey: ['ncf-series'] })
        qc.invalidateQueries({ queryKey: ['ncf-serie', serie.id] })
        onClose()
      }
    },
    onError: (err: { message?: string }) => {
      setFormError(err?.message ?? 'Error al actualizar')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setWarnings([])
    const payload: UpdateNcfSerieDto = { end, expirationDate: expiration }
    if (!hasUsed) payload.ncfType = ncfType
    updateMutation.mutate(payload)
  }

  function confirmWithWarnings() {
    setWarnings([])
    toast.success('Secuencia actualizada')
    qc.invalidateQueries({ queryKey: ['ncf-series'] })
    qc.invalidateQueries({ queryKey: ['ncf-serie', serie.id] })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Editar Secuencia #{serie.id}</div>
            <div className="modal-sub"><NcfTypeBadge type={serie.ncfType} /> Rango: {serie.start.toLocaleString()} — {serie.end.toLocaleString()}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><XCircle size={16} /></button>
        </div>

        {warnings.length > 0 ? (
          <>
            <div className="modal-body">
              <div className="inline-alert inline-alert-warn">
                <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Advertencias (no bloqueantes)</p>
                  {warnings.map((w, i) => <p key={i} style={{ fontSize: 12, lineHeight: 1.6 }}>{w}</p>)}
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Los cambios se guardaron. ¿Deseas continuar?</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={confirmWithWarnings}>Entendido</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {hasUsed && (
                <div className="inline-alert inline-alert-info" style={{ fontSize: 12 }}>
                  <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span>
                    Esta secuencia tiene <strong>{(serie.used ?? 0).toLocaleString('es-DO')}</strong> comprobantes emitidos.
                    El tipo y el número inicial ya no se pueden cambiar.
                  </span>
                </div>
              )}

              {/* Tipo NCF — disabled if has movements */}
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Comprobante</label>
                <select
                  className="ff-select"
                  value={ncfType}
                  onChange={(e) => setNcfType(e.target.value as typeof ncfType)}
                  disabled={hasUsed}
                  title={hasUsed ? `El tipo no puede cambiarse porque ya se emitieron ${serie.used} comprobantes` : undefined}
                >
                  {Object.entries(NCF_TYPE_INFO).map(([k, v]) => (
                    <option key={k} value={k}>{k} — {v.description}</option>
                  ))}
                </select>
                {hasUsed && (
                  <p className="ff-hint">🔒 No editable — ya se emitieron {(serie.used ?? 0).toLocaleString('es-DO')} comprobantes</p>
                )}
              </div>

              {/* End number */}
              <div className="ff-wrap">
                <label className="ff-label">Número final</label>
                <input
                  type="number"
                  min={serie.nextNcf > 0 ? serie.nextNcf : serie.start}
                  className="ff-input"
                  value={end}
                  onChange={(e) => setEnd(parseInt(e.target.value) || serie.end)}
                />
                <p className="ff-hint">Solo puedes extender el rango (aumentar), no reducirlo</p>
              </div>

              {/* Expiration date */}
              <div className="ff-wrap">
                <label className="ff-label">Fecha de vencimiento</label>
                <input
                  type="date"
                  className="ff-input"
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                />
                {isExpired(expiration) && (
                  <p className="ff-error">⚠ Esta fecha está en el pasado. La DGII podría rechazar comprobantes emitidos después del vencimiento.</p>
                )}
              </div>

              {formError && (
                <div className="inline-alert inline-alert-error">
                  <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                  {formError}
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending
                  ? <><span className="spinner spinner-white spinner-sm" /> Guardando…</>
                  : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ serieId }: { serieId: number; onClose?: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ncf-serie', serieId],
    queryFn: () => getNcfSerie(serieId),
  })

  if (isLoading) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[140, 100, 200, 160].map((w, i) => (
          <span key={i} className="skeleton-box" style={{ height: 16, width: w }} />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="inline-alert inline-alert-error" style={{ margin: 16 }}>
        <AlertCircle size={14} /> Error al cargar el detalle
      </div>
    )
  }

  const status = getSerieStatus(data)
  const usedPct = data.usedPct ?? 0
  const total = data.end - data.start + 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>
      {/* Status + type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <NcfTypeBadge type={data.ncfType} />
        <StatusBadgePill serie={data} />
        {NCF_TYPE_INFO[data.ncfType] && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {NCF_TYPE_INFO[data.ncfType].description}
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: 'Emitidos', value: (data.used ?? 0).toLocaleString('es-DO'), color: 'var(--text-primary)' },
          { label: 'Disponibles', value: data.nextNcf === -1 ? 'Agotada' : data.remaining.toLocaleString('es-DO'), color: data.remaining < 1000 ? 'var(--error-text)' : 'var(--success-text)' },
          { label: '% Usado', value: `${usedPct.toFixed(2)}%`, color: usedPct > 90 ? 'var(--error-text)' : usedPct > 70 ? 'var(--warning-text)' : 'var(--text-primary)' },
        ].map((kpi) => (
          <div key={kpi.label} className="stat-card" style={{ padding: '12px 14px', gap: 4 }}>
            <p className="stat-label">{kpi.label}</p>
            <p className="stat-value" style={{ fontSize: 18, color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {status !== 'exhausted' && (
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Consumo del rango</p>
          <ProgressBar used={data.used ?? 0} total={total} />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {(data.used ?? 0).toLocaleString('es-DO')} de {total.toLocaleString('es-DO')} comprobantes
          </p>
        </div>
      )}

      {/* Details grid */}
      <div className="fields-grid">
        {[
          { label: 'ID Secuencia', value: `#${data.id}` },
          { label: 'Tipo NCF', value: data.ncfType },
          { label: 'Inicio', value: data.start.toLocaleString('es-DO') },
          { label: 'Fin', value: data.end.toLocaleString('es-DO') },
          { label: 'Siguiente NCF', value: data.nextNcf === -1 ? '— Agotada' : data.nextNcf.toLocaleString('es-DO') },
          { label: 'Vencimiento', value: formatDate(data.expirationDate) },
        ].map((f) => (
          <div key={f.label} className="detail-field">
            <span className="detail-label">{f.label}</span>
            <span className="detail-value">{f.value}</span>
          </div>
        ))}
      </div>

      {/* Exhausted warning */}
      {status === 'exhausted' && (
        <div className="inline-alert inline-alert-warn">
          <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>
            Esta secuencia fue <strong>agotada automáticamente</strong> por ERPNext al emitir el último número disponible.
            No puede reactivarse. Crea una nueva secuencia del mismo tipo.
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Disable / Enable Confirm ─────────────────────────────────────────────────

function DisableConfirmModal({
  serie, warning, onConfirm, onClose, isPending,
}: {
  serie: NcfSerie
  warning?: string
  onConfirm: () => void
  onClose: () => void
  isPending: boolean
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">¿Deshabilitar secuencia?</div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><XCircle size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <span className="confirm-icon confirm-icon-warn">
              <AlertTriangle size={20} aria-hidden="true" />
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, textAlign: 'center' }}>
            Se deshabilitará la secuencia <strong>{serie.ncfType} #{serie.id}</strong>.
            ERPNext dejará de usarla para emitir comprobantes fiscales.
          </p>
          {warning && (
            <div className="inline-alert inline-alert-warn" style={{ fontSize: 12 }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{warning}</span>
            </div>
          )}
          {!warning && serie.remaining > 0 && (
            <div className="inline-alert inline-alert-warn" style={{ fontSize: 12 }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>
                Quedan <strong>{serie.remaining.toLocaleString('es-DO')}</strong> comprobantes sin usar.
                Al deshabilitar, esos números nunca serán emitidos.
              </span>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? <><span className="spinner spinner-sm" /> Deshabilitando…</> : 'Deshabilitar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EnableConfirmModal({
  serie, warning, onConfirm, onClose, isPending,
}: {
  serie: NcfSerie
  warning?: string
  onConfirm: () => void
  onClose: () => void
  isPending: boolean
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">¿Reactivar secuencia?</div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><XCircle size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: warning ? 12 : 0, textAlign: 'center' }}>
            Se reactivará la secuencia <strong>{serie.ncfType} #{serie.id}</strong> y ERPNext volverá a usarla.
          </p>
          {warning && (
            <div className="inline-alert inline-alert-info" style={{ fontSize: 12 }}>
              <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{warning}</span>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>Cancelar</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={isPending}>
            {isPending ? <><span className="spinner spinner-white spinner-sm" /> Reactivando…</> : 'Reactivar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; serie: NcfSerie }
  | { type: 'detail'; serieId: number }
  | { type: 'disable-confirm'; serie: NcfSerie; warning?: string }
  | { type: 'enable-confirm'; serie: NcfSerie; warning?: string }
  | { type: 'disable-error'; message: string }

export default function NcfPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  const { data: series, isLoading, isError } = useQuery({
    queryKey: ['ncf-series'],
    queryFn: getNcfSeries,
  })

  // ── Disable ────────────────────────────────────────────────────────────────
  const disableMutation = useMutation({
    mutationFn: (id: number) => disableNcfSerie(id),
    onSuccess: (result, id) => {
      const warnings = result.warnings ?? []
      if (warnings.length > 0) {
        // If we get a successful response with warnings, show confirm again with warning text
        const serie = series?.find((s) => s.id === id)
        if (serie) setModal({ type: 'disable-confirm', serie, warning: warnings[0] })
        // Actually we already called the API — this is post-success, so just show toast
        toast.success(`Secuencia ${result.ncfType} deshabilitada`)
        qc.invalidateQueries({ queryKey: ['ncf-series'] })
        setModal({ type: 'none' })
      } else {
        toast.success(`Secuencia ${result.ncfType} deshabilitada`)
        qc.invalidateQueries({ queryKey: ['ncf-series'] })
        setModal({ type: 'none' })
      }
    },
    onError: (err: { message?: string }) => {
      // API returned 400 — show as blocking error (not modal)
      setModal({ type: 'disable-error', message: err?.message ?? 'No se puede deshabilitar esta secuencia' })
    },
  })

  // ── Enable ─────────────────────────────────────────────────────────────────
  const enableMutation = useMutation({
    mutationFn: (id: number) => enableNcfSerie(id),
    onSuccess: (result) => {
      const warning = result.warnings?.[0]
      toast.success(`Secuencia ${result.ncfType} reactivada${warning ? '' : ''}`)
      if (warning) toast.info(warning, { duration: 6000 })
      qc.invalidateQueries({ queryKey: ['ncf-series'] })
      setModal({ type: 'none' })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'No se puede reactivar esta secuencia')
      setModal({ type: 'none' })
    },
  })

  // ── Proactive alerts ───────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const lowAlerts = (series ?? []).filter(
    (s) => getSerieStatus(s) === 'active' && s.remaining < 1000 && s.remaining >= 0
  )

  const expiredActive = (series ?? []).filter(
    (s) => getSerieStatus(s) === 'active' && s.expirationDate < today
  )

  return (
    <div className='page-container'>
      <PageHeader
        overline="Configuración"
        title="Secuencias NCF"
        description="Números de Comprobante Fiscal — DGII República Dominicana"
        action={
          <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>
            <Plus size={14} aria-hidden="true" /> Nueva Secuencia
          </button>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Proactive alerts */}
        {lowAlerts.map((s) => (
          <div key={s.id} className="inline-alert inline-alert-warn">
            <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>
              La secuencia NCF tipo <strong>{s.ncfType}</strong> tiene menos de 1,000 comprobantes disponibles
              ({s.remaining.toLocaleString('es-DO')} restantes). Considera crear una nueva secuencia antes de que se agote.
            </span>
          </div>
        ))}

        {expiredActive.map((s) => (
          <div key={s.id} className="inline-alert inline-alert-error">
            <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>
              La secuencia <strong>{s.ncfType} #{s.id}</strong> está vencida (venció el {formatDate(s.expirationDate)}).
              ERPNext no bloquea la emisión, pero puede representar incumplimiento con la DGII.
            </span>
          </div>
        ))}

        {/* Disable-only error (blocking) */}
        {modal.type === 'disable-error' && (
          <div className="inline-alert inline-alert-error">
            <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>No se puede deshabilitar</p>
              <p style={{ fontSize: 12 }}>{modal.message}</p>
            </div>
            <button
              className="btn btn-ghost btn-size-xs"
              onClick={() => setModal({ type: 'none' })}
              aria-label="Cerrar"
            >
              <XCircle size={14} />
            </button>
          </div>
        )}

        {/* Main table */}
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Rango</th>
                  <th>Siguiente NCF</th>
                  <th style={{ minWidth: 160 }}>Disponibles</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th style={{ width: 120 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 14, width: '80%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar las secuencias NCF
                          </td>
                        </tr>
                      )
                    : !series || series.length === 0
                      ? (
                          <tr>
                            <td colSpan={7}>
                              <div className="empty-state">
                                <span className="empty-icon" aria-hidden="true" style={{ fontSize: 24 }}>📋</span>
                                <p className="empty-title">Sin secuencias NCF</p>
                                <p className="empty-sub">Crea la primera secuencia NCF para comenzar a emitir comprobantes fiscales.</p>
                                <button className="btn btn-primary btn-size-sm" onClick={() => setModal({ type: 'create' })}>
                                  <Plus size={14} /> Nueva Secuencia
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : series.map((s) => {
                          const status = getSerieStatus(s)
                          const total = s.end - s.start + 1
                          const usedCount = total - s.remaining
                          const expired = s.expirationDate < today
                          const expiringSoon = !expired && isExpiringSoon(s.expirationDate)

                          return (
                            <tr key={s.id} className="table-row-clickable" onClick={() => setModal({ type: 'detail', serieId: s.id })}>
                              <td><NcfTypeBadge type={s.ncfType} /></td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                {s.start.toLocaleString('es-DO')} — {s.end.toLocaleString('es-DO')}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                {s.nextNcf === -1 ? <span style={{ color: 'var(--text-tertiary)' }}>Agotada</span> : s.nextNcf.toLocaleString('es-DO')}
                              </td>
                              <td>
                                {status === 'exhausted'
                                  ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                                  : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: s.remaining < 1000 ? 'var(--error-text)' : 'var(--text-primary)' }}>
                                          {s.remaining.toLocaleString('es-DO')}
                                        </span>
                                        <ProgressBar used={usedCount} total={total} />
                                      </div>
                                    )}
                              </td>
                              <td>
                                <span style={{
                                  fontSize: 12,
                                  color: expired ? 'var(--error-text)' : expiringSoon ? 'var(--warning-text)' : 'var(--text-secondary)',
                                  display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                  {expired && <span title="Secuencia vencida"><AlertCircle size={12} aria-hidden="true" /></span>}
                                  {expiringSoon && !expired && <span title="Vence pronto (menos de 30 días)"><AlertTriangle size={12} aria-hidden="true" /></span>}
                                  {formatDate(s.expirationDate)}
                                </span>
                              </td>
                              <td><StatusBadgePill serie={s} /></td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                  {/* View */}
                                  <button
                                    className="btn btn-ghost btn-size-icon-sm"
                                    title="Ver detalle"
                                    onClick={() => setModal({ type: 'detail', serieId: s.id })}
                                  >
                                    <Eye size={13} aria-hidden="true" />
                                  </button>
                                  {/* Edit */}
                                  {status !== 'exhausted' && (
                                    <button
                                      className="btn btn-ghost btn-size-icon-sm"
                                      title="Editar"
                                      onClick={() => setModal({ type: 'edit', serie: s })}
                                    >
                                      <Pencil size={13} aria-hidden="true" />
                                    </button>
                                  )}
                                  {/* Disable */}
                                  {status === 'active' && (
                                    <button
                                      className="btn btn-ghost btn-size-icon-sm"
                                      title="Deshabilitar"
                                      style={{ color: 'var(--error-text)' }}
                                      onClick={() => setModal({ type: 'disable-confirm', serie: s })}
                                    >
                                      <XCircle size={13} aria-hidden="true" />
                                    </button>
                                  )}
                                  {/* Enable */}
                                  {status === 'disabled' && (
                                    <button
                                      className="btn btn-ghost btn-size-icon-sm"
                                      title="Reactivar"
                                      style={{ color: 'var(--success-text)' }}
                                      onClick={() => setModal({ type: 'enable-confirm', serie: s })}
                                    >
                                      <RefreshCw size={13} aria-hidden="true" />
                                    </button>
                                  )}
                                  {/* Exhausted tooltip */}
                                  {status === 'exhausted' && (
                                    <span
                                      title="Agotada automáticamente por ERPNext. No puede reactivarse."
                                      style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)', padding: '0 4px', fontSize: 12 }}
                                    >
                                      ⚫
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel (inline) */}
        {modal.type === 'detail' && (
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn btn-ghost btn-size-icon-sm"
                  onClick={() => setModal({ type: 'none' })}
                  aria-label="Cerrar detalle"
                >
                  <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <span className="card-title">Detalle de secuencia #{modal.serieId}</span>
              </div>
              <button className="btn btn-ghost btn-size-sm" onClick={() => setModal({ type: 'none' })}>
                Cerrar
              </button>
            </div>
            <div className="card-body">
              <DetailDrawer serieId={modal.serieId} onClose={() => setModal({ type: 'none' })} />
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal.type === 'create' && (
        <CreateModal
          onClose={() => setModal({ type: 'none' })}
          onSuccess={() => setModal({ type: 'none' })}
        />
      )}

      {modal.type === 'edit' && (
        <EditModal
          serie={modal.serie}
          onClose={() => setModal({ type: 'none' })}
        />
      )}

      {modal.type === 'disable-confirm' && (
        <DisableConfirmModal
          serie={modal.serie}
          warning={modal.warning}
          onConfirm={() => disableMutation.mutate(modal.serie.id)}
          onClose={() => setModal({ type: 'none' })}
          isPending={disableMutation.isPending}
        />
      )}

      {modal.type === 'enable-confirm' && (
        <EnableConfirmModal
          serie={modal.serie}
          warning={modal.warning}
          onConfirm={() => enableMutation.mutate(modal.serie.id)}
          onClose={() => setModal({ type: 'none' })}
          isPending={enableMutation.isPending}
        />
      )}
    </div>
  )
}
