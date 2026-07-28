import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, Plus, Trash2, Lock } from 'lucide-react'
import { getFacturacionConfig, listMetodosPago } from '@/shared/api/config'
import { getTurnoActual, abrirTurno, getPreviewCierreTurno, cerrarTurno } from '@/shared/api/pos'
import type { ApiError, BalanceDetailLine, ClosingAmountLine, CierreTurnoResult } from '@/shared/api/types'
import { formatDateTime, formatDOP } from '@/lib/formatters'

export function TurnoCajaIndicator() {
  const queryClient = useQueryClient()

  // ── Apertura de turno ─────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [balanceDetails, setBalanceDetails] = useState<BalanceDetailLine[]>([
    { modeOfPayment: '', openingAmount: 0 },
  ])

  // ── Cierre de turno ────────────────────────────────────────────────────────
  const [cierreModalOpen, setCierreModalOpen] = useState(false)
  const [cierreStep, setCierreStep] = useState<'preview' | 'result'>('preview')
  const [closingAmounts, setClosingAmounts] = useState<ClosingAmountLine[]>([])
  const [cierreResult, setCierreResult] = useState<CierreTurnoResult | null>(null)

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })

  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false

  const { data: turno } = useQuery({
    queryKey: ['turno-actual'],
    queryFn: getTurnoActual,
    enabled: usaModuloPos,
    staleTime: 30_000,
  })

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: modalOpen,
    staleTime: 5 * 60_000,
  })

  const abrirMutation = useMutation({
    mutationFn: () =>
      abrirTurno({
        balanceDetails: balanceDetails.filter((b) => b.modeOfPayment),
      }),
    onSuccess: () => {
      toast.success('Turno de caja abierto')
      queryClient.invalidateQueries({ queryKey: ['turno-actual'] })
      setModalOpen(false)
      setBalanceDetails([{ modeOfPayment: '', openingAmount: 0 }])
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al abrir el turno')
    },
  })

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['turno-preview-cierre', turno?.openingEntryId],
    queryFn: () => getPreviewCierreTurno(turno!.openingEntryId),
    enabled: cierreModalOpen && cierreStep === 'preview' && !!turno?.openingEntryId,
  })

  useEffect(() => {
    if (preview) {
      setClosingAmounts(
        preview.paymentReconciliation.map((p) => ({ modeOfPayment: p.modeOfPayment, amount: 0 })),
      )
    }
  }, [preview])

  const cerrarMutation = useMutation({
    mutationFn: () => cerrarTurno(turno!.openingEntryId, { closingAmounts }),
    onSuccess: (result) => {
      setCierreResult(result)
      setCierreStep('result')
      queryClient.invalidateQueries({ queryKey: ['turno-actual'] })
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al cerrar el turno')
    },
  })

  if (!usaModuloPos) return null

  function openModal() {
    setBalanceDetails([{ modeOfPayment: '', openingAmount: 0 }])
    setModalOpen(true)
  }

  function updateLine(i: number, patch: Partial<BalanceDetailLine>) {
    setBalanceDetails((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  function addLine() {
    setBalanceDetails((prev) => [...prev, { modeOfPayment: '', openingAmount: 0 }])
  }

  function removeLine(i: number) {
    setBalanceDetails((prev) => prev.filter((_, idx) => idx !== i))
  }

  const canSubmit = balanceDetails.some((b) => b.modeOfPayment)

  function openCierreModal() {
    setCierreStep('preview')
    setCierreResult(null)
    setClosingAmounts([])
    setCierreModalOpen(true)
  }

  function closeCierreModal() {
    setCierreModalOpen(false)
    setCierreStep('preview')
    setCierreResult(null)
    setClosingAmounts([])
  }

  function updateClosingAmount(modeOfPayment: string, amount: number) {
    setClosingAmounts((prev) => prev.map((c) => (c.modeOfPayment === modeOfPayment ? { ...c, amount } : c)))
  }

  return (
    <>
      {turno ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="badge badge-success"
            title={`Perfil: ${turno.posProfile}`}
            style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
          >
            <Clock size={12} /> Turno abierto — {formatDateTime(turno.periodStartDate).split(' ')[1]}
          </span>
          <button className="btn btn-ghost btn-size-sm" onClick={openCierreModal}>
            <Lock size={14} /> Cerrar turno
          </button>
        </div>
      ) : (
        <button className="btn btn-secondary btn-size-sm" onClick={openModal}>
          <Clock size={14} /> Abrir turno
        </button>
      )}

      {/* Modal: abrir turno */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={16} /> Abrir turno de caja
              </h2>
              <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p className="ff-hint">Fondo inicial de caja por método de pago.</p>
              {balanceDetails.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div className="ff-wrap" style={{ flex: 1 }}>
                    <label className="ff-label">Método de pago</label>
                    <select
                      className="ff-select"
                      value={line.modeOfPayment}
                      onChange={(e) => updateLine(i, { modeOfPayment: e.target.value })}
                    >
                      <option value="">Seleccionar</option>
                      {(metodos ?? []).filter((m) => !m.disabled).map((m) => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="ff-wrap" style={{ width: 130 }}>
                    <label className="ff-label">Monto</label>
                    <input
                      type="number"
                      min={0}
                      className="ff-input"
                      value={line.openingAmount}
                      onChange={(e) => updateLine(i, { openingAmount: Number(e.target.value) })}
                    />
                  </div>
                  {balanceDetails.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-icon-sm"
                      onClick={() => removeLine(i)}
                      aria-label="Quitar línea"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={addLine} style={{ alignSelf: 'flex-start' }}>
                <Plus size={14} /> Agregar método de pago
              </button>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => abrirMutation.mutate()}
                disabled={!canSubmit || abrirMutation.isPending}
              >
                {abrirMutation.isPending ? 'Abriendo…' : 'Abrir turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cerrar turno */}
      {cierreModalOpen && (
        <div className="modal-overlay" onClick={closeCierreModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={16} /> {cierreStep === 'preview' ? 'Cerrar turno de caja' : 'Turno cerrado'}
              </h2>
              <button className="modal-close" onClick={closeCierreModal}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {cierreStep === 'preview' ? (
                previewLoading || !preview ? (
                  <span className="skeleton-box" style={{ height: 120, display: 'block' }} />
                ) : preview.paymentReconciliation.length === 0 ? (
                  <p className="ff-hint">
                    Este turno no registró movimientos — no hay nada que contar. Puedes cerrarlo directamente.
                  </p>
                ) : (
                  <>
                    <p className="ff-hint">
                      Ingresa el monto contado físicamente por cada método de pago. El sistema ya calculó lo
                      que debería haber según las ventas del turno.
                    </p>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Método</th>
                            <th style={{ textAlign: 'right' }}>Esperado</th>
                            <th style={{ textAlign: 'right' }}>Contado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.paymentReconciliation.map((p) => (
                            <tr key={p.modeOfPayment}>
                              <td>{p.modeOfPayment}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {formatDOP(p.expectedAmount)}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <input
                                  type="number"
                                  min={0}
                                  className="ff-input"
                                  style={{ textAlign: 'right', maxWidth: 130 }}
                                  value={closingAmounts.find((c) => c.modeOfPayment === p.modeOfPayment)?.amount ?? 0}
                                  onChange={(e) => updateClosingAmount(p.modeOfPayment, Number(e.target.value))}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              ) : (
                cierreResult && (
                  <>
                    <div className="inline-alert inline-alert-success">
                      <span>Turno cerrado correctamente ({cierreResult.id}).</span>
                    </div>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Método</th>
                            <th style={{ textAlign: 'right' }}>Esperado</th>
                            <th style={{ textAlign: 'right' }}>Contado</th>
                            <th style={{ textAlign: 'right' }}>Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cierreResult.paymentReconciliation.map((p) => (
                            <tr key={p.modeOfPayment}>
                              <td>{p.modeOfPayment}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {formatDOP(p.expectedAmount)}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {formatDOP(p.closingAmount)}
                              </td>
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontFamily: 'monospace',
                                  fontWeight: 600,
                                  color:
                                    p.difference < 0
                                      ? 'var(--error-text)'
                                      : p.difference > 0
                                        ? 'var(--warning-text)'
                                        : 'var(--success-text)',
                                }}
                              >
                                {p.difference > 0 ? '+' : ''}
                                {formatDOP(p.difference)}
                                {p.difference !== 0 && (
                                  <span style={{ display: 'block', fontSize: 11, fontWeight: 400 }}>
                                    {p.difference < 0 ? 'Faltante' : 'Sobrante'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              )}
            </div>
            <div className="modal-foot">
              {cierreStep === 'preview' ? (
                <>
                  <button className="btn btn-secondary" onClick={closeCierreModal}>
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => cerrarMutation.mutate()}
                    disabled={!preview || cerrarMutation.isPending}
                  >
                    {cerrarMutation.isPending ? 'Cerrando…' : 'Confirmar cierre'}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={closeCierreModal}>
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
