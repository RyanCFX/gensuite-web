import { Fragment, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, BookOpen, X, Split } from 'lucide-react'
import { formatDate, formatDOP } from '@/lib/formatters'
import { DistribucionCuentaEditor } from '@/components/shared/DistribucionCuentaEditor'
import type { AsientoPreviewRow, ApiError, DistribucionCuentaDto, ImpuestoDistribucionDto } from '@/shared/api/types'

interface AsientosPreviewModalProps {
  open: boolean
  onClose: () => void
  queryKey: unknown[]
  queryFn: () => Promise<AsientoPreviewRow[]>
  /** Si se pasa, habilita el botón "Redistribuir" en las filas que no son la de CxP (partyType/party). */
  onRedistribuir?: (payload: ImpuestoDistribucionDto) => Promise<unknown>
}

/** Modal con el preview de los asientos contables (GL) que se generarían al someter una
 *  Compra/Gasto en Draft. Reutilizado por CompraDetail y GastoDetail. Además del preview de solo
 *  lectura, permite redistribuir un impuesto ya calculado (fila sin partyType/party) entre varias
 *  cuentas — el backend rechaza con un mensaje explícito si la cuenta elegida no es de impuesto o
 *  la suma no cuadra; ese mensaje se muestra tal cual, sin reformular. */
export function AsientosPreviewModal({ open, onClose, queryKey, queryFn, onRedistribuir }: AsientosPreviewModalProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn,
    enabled: open,
    retry: false,
  })

  const [redistribuirRow, setRedistribuirRow] = useState<AsientoPreviewRow | null>(null)
  const [redistribuirRows, setRedistribuirRows] = useState<DistribucionCuentaDto[]>([])

  const redistribuirMutation = useMutation({
    mutationFn: (payload: ImpuestoDistribucionDto) => onRedistribuir!(payload),
    onSuccess: () => {
      toast.success('Impuesto redistribuido')
      setRedistribuirRow(null)
      refetch()
    },
    onError: (err) => {
      toast.error((err as unknown as ApiError)?.message ?? 'No se pudo redistribuir el impuesto')
    },
  })

  function closeAndReset() {
    setRedistribuirRow(null)
    onClose()
  }

  if (!open) return null

  const rows = data ?? []
  const totalDebit = rows.reduce((s, r) => s + (r.debit ?? 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (r.credit ?? 0), 0)
  const apiMessage = (error as unknown as ApiError | null)?.message ?? 'No se pudo generar el preview de asientos'

  function startRedistribuir(row: AsientoPreviewRow) {
    setRedistribuirRow(row)
    setRedistribuirRows([{ cuenta: '', monto: row.debit || row.credit }])
  }

  return (
    <div className="modal-overlay" onClick={closeAndReset}>
      <div
        className="modal-box"
        style={{ width: '95vw', maxWidth: 1300, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={16} />Impacto contable (preview)
          </h2>
          <button className="modal-close" onClick={closeAndReset} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {isLoading && (
            <div style={{ padding: 16 }}>
              <span className="skeleton-box" style={{ height: 120, width: '100%', display: 'block' }} />
            </div>
          )}
          {isError && (
            <div className="inline-alert inline-alert-error" style={{ margin: 16 }}>
              {apiMessage}
            </div>
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <div className="empty-state">
              <p className="empty-title">Sin movimientos contables</p>
              <p className="empty-sub">El documento no genera asientos contables con la información actual.</p>
            </div>
          )}
          {!isLoading && !isError && rows.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cuenta</th>
                    <th style={{ textAlign: 'right' }}>Débito</th>
                    <th style={{ textAlign: 'right' }}>Crédito</th>
                    <th>Contra cuenta</th>
                    <th>Centro de costo</th>
                    {onRedistribuir && <th style={{ width: 100 }} />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <Fragment key={i}>
                      <tr>
                        <td className="td-muted">{formatDate(r.postingDate)}</td>
                        <td>
                          {r.account}
                          {/*{r.origen === 'impuesto' && (
                            <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 10 }}>Impuesto</span>
                          )}
                          {r.origen === 'retencion' && (
                            <span className="badge badge-default" style={{ marginLeft: 6, fontSize: 10 }}>Retención</span>
                          )}*/}
                          {r.party && (
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {r.partyType ?? 'Party'}: {r.party}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>{r.debit > 0 ? formatDOP(r.debit) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{r.credit > 0 ? formatDOP(r.credit) : '—'}</td>
                        <td className="td-muted">{r.against ?? '—'}</td>
                        <td className="td-muted">{r.costCenter ?? '—'}</td>
                        {onRedistribuir && (
                          <td style={{ textAlign: 'center' }}>
                            {r.origen === 'impuesto' && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-xs"
                                onClick={() => startRedistribuir(r)}
                                title="Redistribuir esta cuenta de impuesto entre varias cuentas"
                              >
                                <Split size={12} />Redistribuir
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {redistribuirRow === r && (
                        <tr>
                          <td colSpan={onRedistribuir ? 7 : 6} style={{ padding: '4px 8px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 520 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Redistribuir "{r.account}" ({formatDOP(r.debit || r.credit)})
                              </span>
                              <DistribucionCuentaEditor
                                rows={redistribuirRows}
                                onChange={setRedistribuirRows}
                                targetAmount={r.debit || r.credit}
                                targetLabel="del impuesto"
                              />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-size-xs"
                                  disabled={redistribuirMutation.isPending || redistribuirRows.filter((d) => d.cuenta).length === 0}
                                  onClick={() => redistribuirMutation.mutate({
                                    cuentaOrigen: r.account,
                                    distribucion: redistribuirRows.filter((d) => d.cuenta),
                                  })}
                                >
                                  {redistribuirMutation.isPending ? 'Guardando…' : 'Guardar redistribución'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-size-xs"
                                  onClick={() => setRedistribuirRow(null)}
                                  disabled={redistribuirMutation.isPending}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                    <td colSpan={2} style={{ textAlign: 'right' }}>Total</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(totalDebit)}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(totalCredit)}</td>
                    <td colSpan={onRedistribuir ? 3 : 2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="ff-hint" style={{ margin: 0 }}>
            Solo lectura salvo "Redistribuir". Si una cuenta no es la esperada, edita el documento
            (cuenta contable por línea y/o cuenta CxP), guarda y refresca.
          </p>
          <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} />{isFetching ? 'Actualizando…' : 'Refrescar'}
          </button>
        </div>
      </div>
    </div>
  )
}
