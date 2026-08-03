import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Clock, Lock } from 'lucide-react'
import { getFacturacionConfig, listDenominaciones } from '@/shared/api/config'
import {
  getTurnoActual,
  abrirTurno,
  getPreviewCierreTurno,
  cerrarTurno,
} from '@/shared/api/pos'
import type {
  ApiError,
  ClosingAmountLine,
  CierreTurnoResult,
  DenominacionCierreDto,
} from '@/shared/api/types'
import { formatDateTime, formatDOP } from '@/lib/formatters'

export function TurnoCajaIndicator() {
  const queryClient = useQueryClient()

  // ── Apertura de turno ─────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [openingAmount, setOpeningAmount] = useState(0)

  // ── Cierre de turno ────────────────────────────────────────────────────────
  const [cierreModalOpen, setCierreModalOpen] = useState(false)
  const [cierreStep, setCierreStep] = useState<'preview' | 'result'>('preview')
  const [closingAmounts, setClosingAmounts] = useState<ClosingAmountLine[]>([])
  const [cierreResult, setCierreResult] = useState<CierreTurnoResult | null>(
    null,
  )

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })

  const usaModuloPos = facturacionConfig?.usaModuloPos ?? false
  const arqueoEfectivoRequerido =
    facturacionConfig?.arqueoEfectivoRequerido ?? false
  const modoPagoCaja = facturacionConfig?.modoPagoCaja ?? null

  const { data: turno } = useQuery({
    queryKey: ['turno-actual'],
    queryFn: getTurnoActual,
    enabled: usaModuloPos,
    staleTime: 30_000,
  })

  const { data: denominaciones } = useQuery({
    queryKey: ['denominaciones'],
    queryFn: listDenominaciones,
    enabled: cierreModalOpen,
    staleTime: 5 * 60_000,
  })

  const denominacionesActivas = (denominaciones ?? []).filter((d) => d.activo)

  const abrirMutation = useMutation({
    mutationFn: () => abrirTurno({ openingAmount }),
    onSuccess: () => {
      toast.success('Turno de caja abierto')
      queryClient.invalidateQueries({ queryKey: ['turno-actual'] })
      setModalOpen(false)
      setOpeningAmount(0)
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al abrir el turno')
    },
  })

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['turno-preview-cierre', turno?.openingEntryId],
    queryFn: () => getPreviewCierreTurno(turno!.openingEntryId),
    enabled:
      cierreModalOpen && cierreStep === 'preview' && !!turno?.openingEntryId,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (cierreModalOpen && preview) {
      setClosingAmounts(
        preview.paymentReconciliation.map((p) => ({
          modeOfPayment: p.modeOfPayment,
          // Métodos que no exigen conciliación se dan por conciliados
          // automáticamente contra `expectedAmount` — el cajero no los toca.
          amount: p.requiereConciliacion ? 0 : p.expectedAmount,
        })),
      )
    }
  }, [cierreModalOpen, preview])

  const cerrarMutation = useMutation({
    mutationFn: () => {
      const amountsToSend = closingAmounts.filter((c) => {
        const p = preview?.paymentReconciliation.find(
          (p) => p.modeOfPayment === c.modeOfPayment,
        )
        return p?.requiereConciliacion || c.amount > 0
      })
      return cerrarTurno(turno!.openingEntryId, {
        closingAmounts: amountsToSend,
      })
    },
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
    setOpeningAmount(0)
    setModalOpen(true)
  }

  function isCajaMethod(mopName: string): boolean {
    return mopName === modoPagoCaja
  }

  function getDenominacionesForMode(
    modeOfPayment: string,
  ): DenominacionCierreDto[] {
    const ca = closingAmounts.find((c) => c.modeOfPayment === modeOfPayment)
    return ca?.denominaciones ?? []
  }

  function sumDenominaciones(denominaciones: DenominacionCierreDto[]): number {
    return denominaciones.reduce((sum, d) => {
      const denomDef = denominacionesActivas.find((da) => da.denominacion === d.denominacion)
      return sum + (denomDef ? denomDef.valor * d.cantidad : 0)
    }, 0)
  }

  function updateDenominacion(
    modeOfPayment: string,
    denom: string,
    cantidad: number,
  ) {
    setClosingAmounts((prev) =>
      prev.map((c) => {
        if (c.modeOfPayment !== modeOfPayment) return c
        const current = c.denominaciones ?? []
        const existing = current.findIndex((d) => d.denominacion === denom)
        const updated =
          existing >= 0
            ? current.map((d, i) => (i === existing ? { ...d, cantidad } : d))
            : [...current, { denominacion: denom, cantidad }]
        const filtered = updated.filter((d) => d.cantidad > 0)
        // El método de pago de Caja no se concilia manualmente cuando el arqueo es
        // obligatorio — su "Contado" se deriva del desglose de denominaciones.
        const amount =
          isCajaMethod(modeOfPayment) && arqueoEfectivoRequerido
            ? sumDenominaciones(filtered)
            : c.amount
        return { ...c, denominaciones: filtered, amount }
      }),
    )
  }

  const cierreValido =
    preview &&
    closingAmounts.every((c) => {
      if (isCajaMethod(c.modeOfPayment) && arqueoEfectivoRequerido) {
        const dens = c.denominaciones ?? []
        return dens.length > 0 && dens.some((d) => d.cantidad > 0)
      }
      // `requiereConciliacion` viene de `Facturacion Config.modosPagoConciliar` en
      // ERPNext — cualquier método marcado ahí exige un monto contado > 0, sin
      // importar si es el método de Caja o no.
      const p = preview.paymentReconciliation.find(
        (p) => p.modeOfPayment === c.modeOfPayment,
      )
      if (p?.requiereConciliacion) {
        return c.amount > 0
      }
      return true
    })

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
    setClosingAmounts((prev) =>
      prev.map((c) =>
        c.modeOfPayment === modeOfPayment ? { ...c, amount } : c,
      ),
    )
  }

  return (
    <>
      {turno ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="badge badge-success"
            title={`Perfil: ${turno.posProfile}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            <Clock size={12} /> Turno abierto —{' '}
            {formatDateTime(turno.periodStartDate).split(' ')[1]}
          </span>
          <button
            className="btn btn-ghost btn-size-sm"
            onClick={openCierreModal}
          >
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
          <div
            className="modal-box modal-box-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2
                className="modal-title"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Clock size={16} /> Abrir turno de caja
              </h2>
              <button
                className="modal-close"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="ff-wrap">
                <label className="ff-label">
                  Monto de efectivo de apertura
                </label>
                <p className="ff-hint" style={{ marginTop: 4 }}>
                  Efectivo físico con el que se abre el turno. Se asociará
                  automáticamente al método de pago de Caja configurado.
                </p>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="ff-input"
                  value={openingAmount}
                  onChange={(e) =>
                    setOpeningAmount(Number(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-secondary"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => abrirMutation.mutate()}
                disabled={openingAmount <= 0 || abrirMutation.isPending}
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
          <div
            className="modal-box"
            style={{ maxWidth: 640 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2
                className="modal-title"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Lock size={16} />{' '}
                {cierreStep === 'preview'
                  ? 'Cerrar turno de caja'
                  : 'Turno cerrado'}
              </h2>
              <button className="modal-close" onClick={closeCierreModal}>
                ×
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {cierreStep === 'preview' ? (
                previewLoading || !preview ? (
                  <span
                    className="skeleton-box"
                    style={{ height: 120, display: 'block' }}
                  />
                ) : preview.paymentReconciliation.length === 0 ? (
                  <p className="ff-hint">
                    Este turno no registró movimientos — no hay nada que contar.
                    Puedes cerrarlo directamente.
                  </p>
                ) : (
                  <>
                    <p className="ff-hint">
                      Ingresa el monto contado físicamente por cada método de
                      pago. El sistema ya calculó lo que debería haber según las
                      ventas del turno. Los métodos marcados como{' '}
                      <strong>Requerido</strong> deben conciliarse manualmente
                      — los demás se dan por conciliados automáticamente.
                      {arqueoEfectivoRequerido && modoPagoCaja && (
                        <>
                          {' '}
                          El método de pago de <strong>Caja</strong> (
                          {modoPagoCaja}) exige además el desglose de
                          denominaciones.
                        </>
                      )}
                    </p>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Método</th>
                            <th style={{ textAlign: 'right' }}>Esperado</th>
                            <th style={{ textAlign: 'right' }}>Contado</th>
                            <th style={{ width: 40 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {preview.paymentReconciliation.map((p) => {
                            const isCaja = isCajaMethod(p.modeOfPayment)
                            const derivedFromArqueo =
                              isCaja && arqueoEfectivoRequerido
                            // Sin conciliación configurada, el monto es
                            // automático (= esperado) y no se puede editar.
                            const autoConciliado = !p.requiereConciliacion
                            const disabledInput =
                              derivedFromArqueo || autoConciliado
                            return (
                              <tr key={p.modeOfPayment}>
                                <td>{p.modeOfPayment}</td>
                                <td
                                  style={{
                                    textAlign: 'right',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {formatDOP(p.expectedAmount)}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min={0}
                                    className="ff-input"
                                    style={{
                                      textAlign: 'right',
                                      maxWidth: 130,
                                    }}
                                    value={
                                      closingAmounts.find(
                                        (c) =>
                                          c.modeOfPayment === p.modeOfPayment,
                                      )?.amount ?? 0
                                    }
                                    disabled={disabledInput}
                                    title={
                                      derivedFromArqueo
                                        ? 'Se calcula automáticamente del desglose de denominaciones'
                                        : autoConciliado
                                          ? 'Sin conciliación configurada — se concilia automáticamente contra el monto esperado'
                                          : undefined
                                    }
                                    onChange={(e) =>
                                      updateClosingAmount(
                                        p.modeOfPayment,
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td>
                                  {derivedFromArqueo ? (
                                    <span
                                      className="badge badge-info"
                                      style={{ fontSize: 10 }}
                                      title="Método de pago de Caja — exige el desglose de denominaciones al cerrar"
                                    >
                                      Desglose
                                    </span>
                                  ) : p.requiereConciliacion ? (
                                    <span
                                      className="badge badge-warning"
                                      style={{ fontSize: 10 }}
                                      title="Configurado para conciliación — exige un monto contado al cerrar"
                                    >
                                      Requerido
                                    </span>
                                  ) : null}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {preview.paymentReconciliation.some((p) =>
                      isCajaMethod(p.modeOfPayment),
                    ) && (
                      <div
                        style={{
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-md)',
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <label className="ff-label" style={{ margin: 0 }}>
                          Arqueo de efectivo
                          {arqueoEfectivoRequerido && (
                            <span
                              style={{
                                color: 'var(--color-error)',
                                fontWeight: 400,
                                fontSize: 11,
                                marginLeft: 6,
                              }}
                            >
                              (obligatorio)
                            </span>
                          )}
                        </label>
                        <p className="ff-hint" style={{ margin: 0 }}>
                          Desglose de billetes/monedas contados físicamente para
                          el método de pago de Caja ({modoPagoCaja}).
                        </p>
                        {preview.paymentReconciliation
                          .filter((p) => isCajaMethod(p.modeOfPayment))
                          .map((p) => (
                            <div key={p.modeOfPayment}>
                              <label
                                className="ff-label"
                                style={{ fontSize: 12, margin: '8px 0 4px' }}
                              >
                                {p.modeOfPayment}
                              </label>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 80px',
                                  gap: 6,
                                  alignItems: 'center',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: 'var(--text-tertiary)',
                                    fontWeight: 500,
                                  }}
                                >
                                  Denominación
                                </span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: 'var(--text-tertiary)',
                                    fontWeight: 500,
                                    textAlign: 'right',
                                  }}
                                >
                                  Cantidad
                                </span>
                                {denominacionesActivas.map((d) => {
                                  const current = getDenominacionesForMode(
                                    p.modeOfPayment,
                                  )
                                  const line = current.find(
                                    (l) => l.denominacion === d.denominacion,
                                  )
                                  return (
                                    <div
                                      key={d.denominacion}
                                      style={{ display: 'contents' }}
                                    >
                                      <span style={{ fontSize: 13 }}>
                                        {d.denominacion}
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className="ff-input"
                                        style={{
                                          width: '100%',
                                          textAlign: 'right',
                                        }}
                                        value={line?.cantidad ?? ''}
                                        onChange={(e) =>
                                          updateDenominacion(
                                            p.modeOfPayment,
                                            d.denominacion,
                                            Number(e.target.value) || 0,
                                          )
                                        }
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        {(() => {
                          const totalArqueo = preview.paymentReconciliation
                            .filter((p) => isCajaMethod(p.modeOfPayment))
                            .reduce((sum, p) => {
                              const ca = closingAmounts.find(
                                (c) => c.modeOfPayment === p.modeOfPayment,
                              )
                              return (
                                sum +
                                (ca?.denominaciones ?? []).reduce((s, d) => {
                                  const denom = denominacionesActivas.find(
                                    (da) => da.denominacion === d.denominacion,
                                  )
                                  return (
                                    s + (denom ? denom.valor * d.cantidad : 0)
                                  )
                                }, 0)
                              )
                            }, 0)
                          return totalArqueo > 0 ? (
                            <div
                              style={{
                                borderTop: '1px solid var(--border-default)',
                                paddingTop: 10,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span style={{ fontSize: 13, fontWeight: 600 }}>
                                Total arqueado
                              </span>
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {formatDOP(totalArqueo)}
                              </span>
                            </div>
                          ) : null
                        })()}
                      </div>
                    )}
                  </>
                )
              ) : (
                cierreResult && (
                  <>
                    <div className="inline-alert inline-alert-success">
                      <span>
                        Turno cerrado correctamente ({cierreResult.id}).
                      </span>
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
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {formatDOP(p.expectedAmount)}
                              </td>
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontFamily: 'monospace',
                                }}
                              >
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
                                  <span
                                    style={{
                                      display: 'block',
                                      fontSize: 11,
                                      fontWeight: 400,
                                    }}
                                  >
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
              {cierreStep === 'preview' && preview && !cierreValido && (
                <p
                  className="ff-hint"
                  style={{ color: 'var(--error-text)', flex: 1, margin: 0 }}
                >
                  {arqueoEfectivoRequerido && modoPagoCaja
                    ? `Falta el desglose de denominaciones para ${modoPagoCaja}.`
                    : 'Falta el monto contado en uno o más métodos requeridos.'}
                </p>
              )}
              {cierreStep === 'preview' ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={closeCierreModal}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => cerrarMutation.mutate()}
                    disabled={
                      !preview || cerrarMutation.isPending || !cierreValido
                    }
                  >
                    {cerrarMutation.isPending
                      ? 'Cerrando…'
                      : 'Confirmar cierre'}
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
