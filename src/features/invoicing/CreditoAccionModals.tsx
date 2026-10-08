import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, RefreshCcw, CalendarClock, Trash2 } from 'lucide-react'
import { PinModal } from '@/components/shared/PinModal'
import { DatePicker } from '@/shared/ui/DatePicker'
import { ConfirmModal } from '@/shared/ui/Modal'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useAccionConAutorizacion } from '@/shared/hooks/useAccionConAutorizacion'
import {
  reactivarCreditNote,
  cambiarVencimientoCreditNote,
  darDeBajaCreditNote,
} from '@/shared/api/notes'
import {
  reactivarSaldoFavor,
  cambiarVencimientoSaldoFavor,
  darDeBajaSaldoFavor,
} from '@/shared/api/cobros'
import type {
  AccionCreditoResult,
  ApiError,
  CambiarVencimientoDto,
  CreditoEstado,
  DarDeBajaDto,
  PinOverrideDto,
  ReactivarCreditoDto,
} from '@/shared/api/types'
import { formatMoney } from '@/lib/formatters'
import { formatVenceEl, todayYMD } from '@/lib/creditoVencimiento'

/**
 * Las tres acciones de §5 (reactivar / cambiar vencimiento / dar de baja) en sus
 * dos familias de rutas (notas de crédito y saldos tipo pago), con el flujo de
 * autorización con el código de otro usuario de §6.
 *
 * docs/tasks/PROMPT_VENCIMIENTO_SALDOS_A_FAVOR_FRONTEND.md
 */

/** A qué documento aplican las acciones: nota de crédito o saldo tipo pago. */
export interface CreditoAccionTarget {
  kind: 'nota' | 'saldo'
  /** `id` de la nota o `paymentEntryId` del saldo. */
  id: string
  estado?: CreditoEstado | null
  venceEl?: string | null
  /** Monto libre (para la confirmación de la baja). */
  availableAmount?: number | null
  currency?: string
  /** Para invalidar los saldos del cliente tras la acción. */
  customerId?: string
}

type AccionFn = (pinOverride?: PinOverrideDto) => Promise<AccionCreditoResult>

function buildReactivar(target: CreditoAccionTarget, dto: Omit<ReactivarCreditoDto, 'pinOverride'>): AccionFn {
  return (pinOverride) =>
    target.kind === 'nota'
      ? reactivarCreditNote(target.id, { ...dto, ...(pinOverride ? { pinOverride } : {}) })
      : reactivarSaldoFavor(target.id, { ...dto, ...(pinOverride ? { pinOverride } : {}) })
}

function buildCambiar(target: CreditoAccionTarget, dto: Omit<CambiarVencimientoDto, 'pinOverride'>): AccionFn {
  return (pinOverride) =>
    target.kind === 'nota'
      ? cambiarVencimientoCreditNote(target.id, { ...dto, ...(pinOverride ? { pinOverride } : {}) })
      : cambiarVencimientoSaldoFavor(target.id, { ...dto, ...(pinOverride ? { pinOverride } : {}) })
}

function buildBaja(target: CreditoAccionTarget, dto: Omit<DarDeBajaDto, 'pinOverride'>): AccionFn {
  return (pinOverride) =>
    target.kind === 'nota'
      ? darDeBajaCreditNote(target.id, { ...dto, ...(pinOverride ? { pinOverride } : {}) })
      : darDeBajaSaldoFavor(target.id, { ...dto, ...(pinOverride ? { pinOverride } : {}) })
}

/** Toast de éxito común (§6.4): agrega «Autorizado por …» con código; neutro si idempotente. */
function toastAccionOk(result: AccionCreditoResult, verbo: string) {
  if (result.sinCambios) {
    toast.info('Ya estaba vigente — sin cambios')
    return
  }
  toast.success(
    result.autorizadoConCodigo
      ? `${verbo} — Autorizado por ${result.autorizadoPor}`
      : verbo,
  )
}

function useInvalidarCredito(target: CreditoAccionTarget) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
    queryClient.invalidateQueries({ queryKey: ['credit-note', target.id] })
    if (target.customerId) {
      queryClient.invalidateQueries({ queryKey: ['saldo-favor', target.customerId] })
      queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor', target.customerId] })
    } else {
      queryClient.invalidateQueries({ queryKey: ['saldo-favor'] })
      queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor'] })
    }
  }
}

// ─── Reactivar (§5.1) ────────────────────────────────────────────────────────

export function ReactivarCreditoModal({ target, onClose }: { target: CreditoAccionTarget; onClose: () => void }) {
  const navigate = useNavigate()
  const invalidar = useInvalidarCredito(target)
  const [modo, setModo] = useState<'configurada' | 'fecha'>('configurada')
  const [venceEl, setVenceEl] = useState('')
  const [motivo, setMotivo] = useState('')

  const { ejecutar, isPending, pin } = useAccionConAutorizacion<AccionCreditoResult>({
    tituloAccion: 'Reactivar crédito',
    onSuccess: (r) => {
      invalidar()
      toastAccionOk(r, 'Crédito reactivado')
      onClose()
    },
    onErrorFinal: (err) => {
      // §5.3/§8: sin cuenta configurada el backend manda el mensaje + enlace a Configuración.
      if (/cuenta de saldos vencidos/i.test(err?.message ?? '')) {
        toast.error(err.message, {
          duration: 8000,
          action: { label: 'Ir a Configuración', onClick: () => { onClose(); navigate('/config/facturacion') } },
        })
        return
      }
      toast.error(err?.message ?? 'No se pudo reactivar el crédito')
    },
  })

  const motivoOk = motivo.trim().length >= 5 && motivo.trim().length <= 500
  const fechaOk = modo === 'configurada' || (!!venceEl && venceEl >= todayYMD())
  const canConfirm = motivoOk && fechaOk && !isPending

  const sucio = useDirtyCheck({ modo, venceEl, motivo }, true)
  const cierre = useConfirmClose(sucio, onClose)

  function confirmar() {
    if (!motivoOk) { toast.error('El motivo es obligatorio (5–500 caracteres)'); return }
    if (modo === 'fecha' && !venceEl) { toast.error('Elige la nueva fecha de vencimiento'); return }
    if (modo === 'fecha' && venceEl < todayYMD()) { toast.error('La fecha debe ser hoy o futura'); return }
    // Sin `venceEl` ni `dias` el backend usa la vigencia configurada (§5.1).
    const dto = modo === 'fecha' ? { venceEl, motivo: motivo.trim() } : { motivo: motivo.trim() }
    void ejecutar(buildReactivar(target, dto))
  }

  return (
    <>
      <div className="modal-overlay" onClick={cierre.requestClose}>
        <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCcw size={16} /> Reactivar crédito
            </h2>
            <button className="modal-close" onClick={cierre.requestClose}>×</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              {target.id}
              {target.estado === 'perdido' && (
                <> — <strong>Se revertirá el asiento de baja.</strong></>
              )}
            </p>
            <div className="ff-wrap">
              <label className="ff-label">Nuevo vencimiento</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="ff-check-wrap">
                  <input
                    type="radio"
                    className="ff-check"
                    checked={modo === 'configurada'}
                    onChange={() => setModo('configurada')}
                  />
                  <span style={{ fontSize: 13 }}>Usar la vigencia configurada</span>
                </label>
                <label className="ff-check-wrap">
                  <input
                    type="radio"
                    className="ff-check"
                    checked={modo === 'fecha'}
                    onChange={() => setModo('fecha')}
                  />
                  <span style={{ fontSize: 13 }}>Elegir fecha</span>
                </label>
              </div>
              {modo === 'fecha' && (
                <div style={{ marginTop: 8, maxWidth: 220 }}>
                  <DatePicker value={venceEl} onChange={setVenceEl} min={todayYMD()} error={!!venceEl && venceEl < todayYMD()} />
                  {venceEl && venceEl < todayYMD() && (
                    <p className="ff-hint" style={{ color: 'red' }}>La fecha debe ser hoy o futura.</p>
                  )}
                </div>
              )}
            </div>
            <div className="ff-wrap">
              <label className="ff-label ff-required" htmlFor="reactivar-motivo">Motivo</label>
              <textarea
                id="reactivar-motivo"
                className="ff-input"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Cliente reclamó dentro de la política"
              />
              {motivo && !motivoOk && (
                <p className="ff-hint" style={{ color: 'red' }}>El motivo debe tener entre 5 y 500 caracteres.</p>
              )}
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={cierre.requestClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={!canConfirm}>
              {isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              Reactivar
            </button>
          </div>
        </div>
      </div>
      <ConfirmModal
        open={cierre.confirming}
        onClose={cierre.cancelDiscard}
        onConfirm={cierre.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
      <PinModal open={pin.open} onClose={pin.onClose} onSubmitInline={pin.onSubmitInline} onAuthorized={pin.onClose} title={pin.title} description={pin.description} />
    </>
  )
}

// ─── Cambiar vencimiento (§5.2, PATCH) ────────────────────────────────────────

export function CambiarVencimientoModal({ target, onClose }: { target: CreditoAccionTarget; onClose: () => void }) {
  const invalidar = useInvalidarCredito(target)
  const [venceEl, setVenceEl] = useState(target.venceEl ?? '')
  const [quitar, setQuitar] = useState(false)
  const [motivo, setMotivo] = useState('')

  const { ejecutar, isPending, pin } = useAccionConAutorizacion<AccionCreditoResult>({
    tituloAccion: 'Cambiar vencimiento',
    onSuccess: (r) => {
      invalidar()
      toastAccionOk(r, 'Vencimiento actualizado')
      onClose()
    },
    onErrorFinal: (err: ApiError) => toast.error(err?.message ?? 'No se pudo cambiar el vencimiento'),
  })

  const motivoOk = motivo.trim().length >= 5 && motivo.trim().length <= 500
  const fechaOk = quitar || (!!venceEl && venceEl >= todayYMD())
  const canConfirm = motivoOk && fechaOk && !isPending

  const sucio = useDirtyCheck({ venceEl, quitar, motivo }, true)
  const cierre = useConfirmClose(sucio, onClose)

  function confirmar() {
    if (!motivoOk) { toast.error('El motivo es obligatorio (5–500 caracteres)'); return }
    if (!quitar && !venceEl) { toast.error('Elige la nueva fecha o marca «Sin vencimiento»'); return }
    if (!quitar && venceEl < todayYMD()) { toast.error('La fecha debe ser hoy o futura'); return }
    // `venceEl: null` = quitar el vencimiento — NO omitir la clave (§5.2).
    void ejecutar(buildCambiar(target, { venceEl: quitar ? null : venceEl, motivo: motivo.trim() }))
  }

  return (
    <>
      <div className="modal-overlay" onClick={cierre.requestClose}>
        <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarClock size={16} /> Cambiar vencimiento
            </h2>
            <button className="modal-close" onClick={cierre.requestClose}>×</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              {target.id}
              {target.venceEl && <> — vence el {formatVenceEl(target.venceEl)}</>}
            </p>
            <div className="ff-wrap">
              <label className="ff-label ff-required">Nueva fecha</label>
              <div style={{ maxWidth: 220, opacity: quitar ? 0.5 : 1 }}>
                <DatePicker value={venceEl} onChange={(v) => { setVenceEl(v); if (v) setQuitar(false) }} min={todayYMD()} disabled={quitar} error={!quitar && !!venceEl && venceEl < todayYMD()} />
              </div>
              <label className="ff-check-wrap" style={{ marginTop: 8 }}>
                <input type="checkbox" className="ff-check" checked={quitar} onChange={(e) => setQuitar(e.target.checked)} />
                <span style={{ fontSize: 13 }}>
                  Sin vencimiento
                  <FieldTooltip>Quita el vencimiento de este crédito (manda `null`).</FieldTooltip>
                </span>
              </label>
            </div>
            <div className="ff-wrap">
              <label className="ff-label ff-required" htmlFor="cambiar-motivo">Motivo</label>
              <textarea
                id="cambiar-motivo"
                className="ff-input"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Acuerdo comercial con el cliente"
              />
              {motivo && !motivoOk && (
                <p className="ff-hint" style={{ color: 'red' }}>El motivo debe tener entre 5 y 500 caracteres.</p>
              )}
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={cierre.requestClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={!canConfirm}>
              {isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              Guardar
            </button>
          </div>
        </div>
      </div>
      <ConfirmModal
        open={cierre.confirming}
        onClose={cierre.cancelDiscard}
        onConfirm={cierre.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
      <PinModal open={pin.open} onClose={pin.onClose} onSubmitInline={pin.onSubmitInline} onAuthorized={pin.onClose} title={pin.title} description={pin.description} />
    </>
  )
}

// ─── Dar de baja (§5.3) ──────────────────────────────────────────────────────

export function DarDeBajaModal({ target, onClose }: { target: CreditoAccionTarget; onClose: () => void }) {
  const navigate = useNavigate()
  const invalidar = useInvalidarCredito(target)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const { ejecutar, isPending, pin } = useAccionConAutorizacion<AccionCreditoResult>({
    tituloAccion: 'Dar de baja',
    onSuccess: (r) => {
      invalidar()
      toastAccionOk(r, 'Saldo dado de baja')
      setConfirmando(false)
      onClose()
    },
    onErrorFinal: (err: ApiError) => {
      if (/cuenta de saldos vencidos/i.test(err?.message ?? '')) {
        toast.error(err.message, {
          duration: 8000,
          action: { label: 'Ir a Configuración', onClick: () => { setConfirmando(false); onClose(); navigate('/config/facturacion') } },
        })
        return
      }
      toast.error(err?.message ?? 'No se pudo dar de baja el saldo')
    },
  })

  const monto = target.availableAmount ?? 0
  const motivoOk = motivo.trim().length >= 5 && motivo.trim().length <= 500

  function confirmar() {
    if (!motivoOk) { toast.error('El motivo es obligatorio (5–500 caracteres)'); return }
    void ejecutar(buildBaja(target, { motivo: motivo.trim() }))
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={16} /> Dar de baja
            </h2>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* §5.3: confirmación explícita con el monto. */}
            <p style={{ fontSize: 13, margin: 0 }}>
              ¿Dar de baja <strong>{formatMoney(monto, target.currency)}</strong>? Se registrará un
              asiento contable. Se puede revertir reactivando.
            </p>
            <div className="ff-wrap">
              <label className="ff-label ff-required" htmlFor="baja-motivo">Motivo</label>
              <textarea
                id="baja-motivo"
                className="ff-input"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Saldo vencido sin reclamo del cliente"
              />
              {motivo && !motivoOk && (
                <p className="ff-hint" style={{ color: 'red' }}>El motivo debe tener entre 5 y 500 caracteres.</p>
              )}
            </div>
            {!confirmando ? (
              <div className="modal-foot" style={{ padding: 0, border: 'none' }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn btn-danger" onClick={() => setConfirmando(true)} disabled={!motivoOk}>
                  Continuar
                </button>
              </div>
            ) : (
              <div className="inline-alert" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 13 }}>
                  Confirmá la baja de <strong>{formatMoney(monto, target.currency)}</strong> ({target.id}).
                </span>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmando(false)} disabled={isPending}>
                    Volver
                  </button>
                  <button className="btn btn-danger btn-size-sm" onClick={confirmar} disabled={isPending}>
                    {isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                    Dar de baja
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <PinModal open={pin.open} onClose={pin.onClose} onSubmitInline={pin.onSubmitInline} onAuthorized={pin.onClose} title={pin.title} description={pin.description} />
    </>
  )
}

// ─── Botonera por estado y permisos (§5.4) ────────────────────────────────────
// Los botones se muestran aunque el usuario NO tenga el permiso (siempre que el
// estado lo permita): sin permiso el flujo pide el código de otro usuario (§6).
// No se ocultan por permiso — ocultar sería una decisión de producto a anotar.

export function CreditoAccionesButtons({ target }: { target: CreditoAccionTarget }) {
  const [accion, setAccion] = useState<'reactivar' | 'cambiar' | 'baja' | null>(null)
  const estado = target.estado

  // Reactivar un crédito `agotado` da error (no hay saldo): se oculta (§5.1).
  const puedeReactivar = estado === 'vencido' || estado === 'perdido'
  const puedeCambiar = estado === 'vigente' || estado === 'por_vencer'
  const puedeBaja = estado === 'vencido'

  if (!puedeReactivar && !puedeCambiar && !puedeBaja) return null

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {puedeReactivar && (
          <button className="btn btn-secondary btn-size-md" onClick={() => setAccion('reactivar')}>
            <RefreshCcw size={14} /> Reactivar
          </button>
        )}
        {puedeCambiar && (
          <button className="btn btn-secondary btn-size-md" onClick={() => setAccion('cambiar')}>
            <CalendarClock size={14} /> Cambiar vencimiento
          </button>
        )}
        {puedeBaja && (
          <button className="btn btn-secondary btn-size-md" onClick={() => setAccion('baja')}>
            <Trash2 size={14} /> Dar de baja
          </button>
        )}
      </div>
      {accion === 'reactivar' && <ReactivarCreditoModal target={target} onClose={() => setAccion(null)} />}
      {accion === 'cambiar' && <CambiarVencimientoModal target={target} onClose={() => setAccion(null)} />}
      {accion === 'baja' && <DarDeBajaModal target={target} onClose={() => setAccion(null)} />}
    </>
  )
}
