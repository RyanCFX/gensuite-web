import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { getFacturacionConfig } from '@/shared/api/config'
import { getPreviewCierreTurno, cerrarTurno, getTurnoPdfBlobUrl } from '@/shared/api/pos'
import type {
  ApiError,
  ClosingAmountLine,
  CierreTurnoResult,
  DenominacionCierreDto,
} from '@/shared/api/types'
import { formatDOP } from '@/lib/formatters'
import { PdfPreviewModal } from '@/components/shared/PdfPreviewModal'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { listDenominacionesLookup } from '@/shared/api/formularios'
import { TurnoDeliveryAviso } from '@/features/delivery/TurnoDeliveryAviso'
import { facturasBloqueoTurno, esErrorDelivery, type TurnoBloqueoDeliveryFactura } from '@/lib/deliveryErrors'

const PREVIEW_COLUMNS = [
  { key: 'metodo', width: 200 },
  { key: 'esperado', width: 120 },
  { key: 'contado', width: 150 },
  { key: 'flag', width: 90 },
]

const RESULT_COLUMNS = [
  { key: 'metodo', width: 200 },
  { key: 'esperado', width: 120 },
  { key: 'contado', width: 120 },
  { key: 'diferencia', width: 120 },
]

interface CerrarTurnoModalProps {
  open: boolean
  openingEntryId: string | null
  turnoLabel?: string
  onClose: () => void
  onClosed?: () => void
}

export function CerrarTurnoModal({
  open,
  openingEntryId,
  turnoLabel,
  onClose,
  onClosed,
}: CerrarTurnoModalProps) {
  const queryClient = useQueryClient()
  const [cierreStep, setCierreStep] = useState<'preview' | 'result'>('preview')
  const [closingAmounts, setClosingAmounts] = useState<ClosingAmountLine[]>([])
  const [cierreResult, setCierreResult] = useState<CierreTurnoResult | null>(null)
  const [seededKey, setSeededKey] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  // §3.4: lista del 409 TURNO_CON_COBROS_DELIVERY_POR_CONCILIAR (sin excepción para admin).
  const [bloqueoFacturas, setBloqueoFacturas] = useState<TurnoBloqueoDeliveryFactura[] | null>(null)
  const { widths: previewColWidths, startResize: startPreviewResize } = useResizableColumns(PREVIEW_COLUMNS)
  const { widths: resultColWidths, startResize: startResultResize } = useResizableColumns(RESULT_COLUMNS)

  // Reinicia el flujo cuando se abre el modal o cambia el turno objetivo.
  // Patrón "adjust state during render" (comparando el valor previo) — evita
  // el setState en effects.
  const [prevModalKey, setPrevModalKey] = useState<{ open: boolean; id: string | null }>({
    open,
    id: openingEntryId,
  })
  if (open !== prevModalKey.open || openingEntryId !== prevModalKey.id) {
    setPrevModalKey({ open, id: openingEntryId })
    setCierreStep('preview')
    setCierreResult(null)
    setClosingAmounts([])
    setSeededKey(null)
    setPdfPreviewUrl(null)
    setBloqueoFacturas(null)
  }

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
  })

  const arqueoEfectivoRequerido =
    facturacionConfig?.arqueoEfectivoRequerido ?? false
  const modoPagoCaja = facturacionConfig?.modoPagoCaja ?? null

  const { data: denominaciones } = useQuery({
    queryKey: ['denominaciones'],
    queryFn: listDenominacionesLookup,
    enabled: open,
  })

  const denominacionesActivas = (denominaciones ?? []).filter((d) => d.activo)

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['turno-preview-cierre', openingEntryId],
    queryFn: () => getPreviewCierreTurno(openingEntryId!),
    enabled: open && cierreStep === 'preview' && !!openingEntryId,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  // Precarga los montos "contado" iniciales una sola vez por turno objetivo
  // apenas llega el preview. Patrón "adjust state during render".
  if (
    open &&
    cierreStep === 'preview' &&
    preview &&
    seededKey !== preview.posOpeningEntry
  ) {
    setSeededKey(preview.posOpeningEntry)
    setClosingAmounts(
      // §3.4: la fila `esDeliveryTransito` no se cuenta — no entra al arqueo.
      preview.paymentReconciliation.filter((p) => !p.esDeliveryTransito).map((p) => ({
        modeOfPayment: p.modeOfPayment,
        // Métodos que no exigen conciliación se dan por conciliados
        // automáticamente contra `expectedAmount` — el cajero no los toca.
        amount: p.requiereConciliacion ? 0 : p.expectedAmount,
      })),
    )
  }

  const cerrarMutation = useMutation({
    mutationFn: () => {
      const amountsToSend = closingAmounts.filter((c) => {
        const p = preview?.paymentReconciliation.find(
          (p) => p.modeOfPayment === c.modeOfPayment,
        )
        return p?.requiereConciliacion || c.amount > 0
      })
      return cerrarTurno(openingEntryId!, {
        closingAmounts: amountsToSend,
      })
    },
    onSuccess: (result) => {
      setCierreResult(result)
      setCierreStep('result')
      onClosed?.()
      // /pos/turnos/:id espera el ID de apertura (POS Opening Entry) — el mismo
      // que se usó para llamar a cerrarTurno, NO result.id (ese es el del cierre,
      // POS Closing Entry, un documento distinto en ERPNext).
      getTurnoPdfBlobUrl(openingEntryId!)
        .then(setPdfPreviewUrl)
        .catch(() => toast.error('No se pudo generar la vista previa del PDF del turno'))
    },
    onError: (err: ApiError) => {
      if (esErrorDelivery(err, 'TURNO_CON_COBROS_DELIVERY_POR_CONCILIAR')) {
        setBloqueoFacturas(facturasBloqueoTurno(err))
        toast.error(err.message ?? 'El turno tiene cobros delivery por conciliar')
        queryClient.invalidateQueries({ queryKey: ['turno-actual'] })
        queryClient.invalidateQueries({ queryKey: ['turno-preview-cierre'] })
        return
      }
      toast.error(
        err?.message ??
          'No se pudo cerrar el turno. Verifica que tengas permiso para cerrar el turno de este cajero.',
      )
    },
  })

  function closeModal() {
    setCierreStep('preview')
    setCierreResult(null)
    setClosingAmounts([])
    onClose()
  }

  // Siempre pide confirmación al intentar salir en el paso de conciliación, haya o no
  // cambios digitados — cerrar por accidente pierde el arqueo y obliga a recontar. En el paso
  // de resultado el turno ya quedó cerrado y se sale directo. Se mantiene además el aviso
  // nativo del navegador al recargar/cerrar la pestaña mientras haya montos sin guardar.
  const cierreIsDirty = useDirtyCheck(
    { closingAmounts },
    open && cierreStep === 'preview' && seededKey !== null,
  )
  useBeforeUnloadWarning(cierreIsDirty)
  const [confirmingClose, setConfirmingClose] = useState(false)

  function requestClose() {
    if (cierreStep !== 'preview') {
      closeModal()
      return
    }
    setConfirmingClose(true)
  }

  function confirmDiscardClose() {
    setConfirmingClose(false)
    closeModal()
  }

  function cancelDiscardClose() {
    setConfirmingClose(false)
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

  function updateClosingAmount(modeOfPayment: string, amount: number) {
    setClosingAmounts((prev) =>
      prev.map((c) =>
        c.modeOfPayment === modeOfPayment ? { ...c, amount } : c,
      ),
    )
  }

  // §3.4: filas de tránsito delivery informativas (sin conteo); `puedeCerrar` undefined = true.
  const filasConteo = preview?.paymentReconciliation.filter((p) => !p.esDeliveryTransito) ?? []
  const filasTransito = preview?.paymentReconciliation.filter((p) => p.esDeliveryTransito) ?? []
  const bloqueadoPorDelivery = preview?.puedeCerrar === false
  const facturasDelivery = bloqueoFacturas ?? preview?.cobrosDeliveryPorConciliar?.facturas ?? []

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

  if (!open) return null

  return (
    <>
    <div className="modal-overlay" onClick={requestClose}>
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
          <button className="modal-close" onClick={requestClose}>
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {turnoLabel && cierreStep === 'preview' && (
            <p
              className="ff-hint"
              style={{ margin: 0, color: 'var(--text-secondary)' }}
            >
              {turnoLabel}
            </p>
          )}
          {cierreStep === 'preview' ? (
            previewLoading || !preview ? (
              <span
                className="skeleton-box"
                style={{ height: 120, display: 'block' }}
              />
            ) : (
              <>
                {(bloqueadoPorDelivery || bloqueoFacturas) && (
                  <TurnoDeliveryAviso
                    cantidad={bloqueoFacturas ? bloqueoFacturas.length : preview.cobrosDeliveryPorConciliar?.cantidad}
                    monto={bloqueoFacturas ? undefined : preview.cobrosDeliveryPorConciliar?.monto}
                    facturas={facturasDelivery}
                    onNavigate={closeModal}
                  />
                )}
                {filasConteo.length === 0 && filasTransito.length === 0 ? (
              <p className="ff-hint">
                Este turno no registró movimientos — no hay nada que contar.
                Puedes cerrarlo directamente.
              </p>
            ) : (
              <>
                {filasConteo.length > 0 && (<>
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
                  <table className="data-table items-table-resizable">
                    <colgroup>
                      {PREVIEW_COLUMNS.map((c) => <col key={c.key} style={{ width: previewColWidths[c.key] }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Método<span className="col-resize-handle" onMouseDown={startPreviewResize('metodo')} /></th>
                        <th style={{ textAlign: 'right' }}>Esperado<span className="col-resize-handle" onMouseDown={startPreviewResize('esperado')} /></th>
                        <th style={{ textAlign: 'right' }}>Contado<span className="col-resize-handle" onMouseDown={startPreviewResize('contado')} /></th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filasConteo.map((p) => {
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
                                fontFamily: 'var(--font-body)',
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
                              fontFamily: 'var(--font-body)',
                            }}
                          >
                            {formatDOP(totalArqueo)}
                          </span>
                        </div>
                      ) : null
                    })()}
                  </div>
                )}
                </>)}

                {filasTransito.length > 0 && (
                  <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                    <label className="ff-label" style={{ margin: 0 }}>Ventas delivery — contra entrega</label>
                    <p className="ff-hint" style={{ margin: '4px 0 8px' }}>
                      Informativo: no se cuenta físicamente. Se liquida cuando el repartidor entrega el dinero.
                    </p>
                    {filasTransito.map((p) => (
                      <div key={p.modeOfPayment} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{p.modeOfPayment}</span>
                        <span style={{ fontFamily: 'var(--font-body)' }}>{formatDOP(p.expectedAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(preview.desgloseLiquidacionesDelivery?.length ?? 0) > 0 && (
                  <div className="table-scroll">
                    <p className="ff-hint" style={{ margin: '0 0 4px' }}>
                      Liquidaciones delivery incluidas en el esperado de cada método:
                    </p>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Método</th>
                          <th style={{ textAlign: 'right' }}>Esperado propio</th>
                          <th style={{ textAlign: 'right' }}>Liquidaciones delivery</th>
                          <th style={{ textAlign: 'right' }}>Esperado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.desgloseLiquidacionesDelivery!.map((d) => (
                          <tr key={d.modo}>
                            <td>{d.modo}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{formatDOP(d.expectedNativo)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>{formatDOP(d.liquidacionesDelivery)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{formatDOP(d.expected)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
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
                {cierreResult.closedBy &&
                  cierreResult.closedBy !== cierreResult.user && (
                    <p
                      className="ff-hint"
                      style={{ margin: 0, color: 'var(--text-secondary)' }}
                    >
                      Cerrado por: <strong>{cierreResult.closedBy}</strong>
                    </p>
                  )}
                <div className="table-scroll">
                  <table className="data-table items-table-resizable">
                    <colgroup>
                      {RESULT_COLUMNS.map((c) => <col key={c.key} style={{ width: resultColWidths[c.key] }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Método<span className="col-resize-handle" onMouseDown={startResultResize('metodo')} /></th>
                        <th style={{ textAlign: 'right' }}>Esperado<span className="col-resize-handle" onMouseDown={startResultResize('esperado')} /></th>
                        <th style={{ textAlign: 'right' }}>Contado<span className="col-resize-handle" onMouseDown={startResultResize('contado')} /></th>
                        <th style={{ textAlign: 'right' }}>Diferencia<span className="col-resize-handle" onMouseDown={startResultResize('diferencia')} /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cierreResult.paymentReconciliation.map((p) => (
                        <tr key={p.modeOfPayment}>
                          <td>{p.modeOfPayment}</td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontFamily: 'var(--font-body)',
                            }}
                          >
                            {formatDOP(p.expectedAmount)}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontFamily: 'var(--font-body)',
                            }}
                          >
                            {formatDOP(p.closingAmount)}
                          </td>
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
                onClick={requestClose}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => cerrarMutation.mutate()}
                disabled={
                  !preview || cerrarMutation.isPending || !cierreValido || bloqueadoPorDelivery
                }
              >
                {cerrarMutation.isPending
                  ? 'Cerrando…'
                  : 'Confirmar cierre'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={closeModal}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
    <ConfirmModal
      open={confirmingClose}
      onClose={cancelDiscardClose}
      onConfirm={confirmDiscardClose}
      title="¿Salir del cierre de turno?"
      description="El turno seguirá abierto y se perderá lo digitado en el arqueo."
      confirmLabel="Sí, salir"
      variant="danger"
    />
    <PdfPreviewModal
      url={pdfPreviewUrl}
      onClose={() => {
        setPdfPreviewUrl(null)
        closeModal()
      }}
    />
    </>
  )
}