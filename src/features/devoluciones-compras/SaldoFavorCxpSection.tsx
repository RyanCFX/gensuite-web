import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import { getDevolucionesSaldoFavor, applyDevolucionToCxp, unapplyDevolucionFromCxp } from '@/shared/api/devoluciones-compras'
import { formatDOP, formatDate } from '@/lib/formatters'

export interface SaldoFavorCxpSectionProps {
  /** Proveedor registrado — si es un proveedor ocasional (sin id) no hay saldo a favor que consultar. */
  supplierId?: string | null
  supplierName?: string
  invoiceId: string
  invoiceStatus: 'draft' | 'submitted' | 'cancelled'
  invoiceGrandTotal: number
  /** Solo aplica a facturas sometidas — para Draft el pendiente se calcula localmente (grandTotal menos lo ya enlazado). */
  outstandingAmount?: number
  /** Se invoca tras aplicar/deshacer con éxito, además de la invalidación interna del saldo a favor. */
  onChanged?: () => void
}

/**
 * Sección reutilizable para consultar y aplicar el saldo a favor de un proveedor
 * (generado por devoluciones de compra sometidas) a una factura de Compra o Gasto/CxP.
 * Mismos endpoints y comportamiento en ambos módulos — ver /devoluciones-compras.
 */
export function SaldoFavorCxpSection({
  supplierId,
  supplierName,
  invoiceId,
  invoiceStatus,
  invoiceGrandTotal,
  outstandingAmount,
  onChanged,
}: SaldoFavorCxpSectionProps) {
  const queryClient = useQueryClient()
  const [amounts, setAmounts] = useState<Record<string, number>>({})

  const { data: saldoFavor, isLoading } = useQuery({
    queryKey: ['devoluciones-saldo-favor', supplierId],
    queryFn: () => getDevolucionesSaldoFavor(supplierId!),
    enabled: !!supplierId && invoiceStatus !== 'cancelled',
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['devoluciones-saldo-favor', supplierId] })
    onChanged?.()
  }

  const applyMutation = useMutation({
    mutationFn: ({ devolucionId, amount }: { devolucionId: string; amount: number }) =>
      applyDevolucionToCxp(devolucionId, { invoiceId, amount }),
    onSuccess: (result) => {
      invalidate()
      toast.success(
        result.status === 'reconciled'
          ? `Saldo a favor de ${formatDOP(result.amount)} aplicado y reconciliado`
          : `Saldo a favor de ${formatDOP(result.amount)} enlazado — se reconciliará al someter la factura`,
      )
    },
    onError: (err: { message?: string; code?: string }) => {
      if (err?.code === 'CONFLICT') {
        toast.error('Esta devolución ya está aplicada a esta factura.')
      } else {
        toast.error(err?.message ?? 'No se pudo aplicar el saldo a favor')
      }
    },
  })

  const unapplyMutation = useMutation({
    mutationFn: (devolucionId: string) => unapplyDevolucionFromCxp(devolucionId, invoiceId),
    onSuccess: () => {
      invalidate()
      toast.success('Enlace de saldo a favor deshecho')
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo deshacer el enlace'),
  })

  if (!supplierId || invoiceStatus === 'cancelled') return null

  const entries = saldoFavor?.entries ?? []

  // Aplicaciones de cualquier devolución del proveedor que ya apuntan a ESTA factura.
  const appliedToThisInvoice = entries
    .map((entry) => ({ entry, applied: entry.appliedTo?.find((a) => a.invoiceId === invoiceId) }))
    .filter((x) => !!x.applied)

  // Draft: aún no hay efecto contable — lo enlazado a esta factura reduce lo que falta por cubrir al someter.
  // Sometida: outstandingAmount ya refleja el estado real (todo lo aplicado a una factura sometida reconcilia de inmediato).
  const alreadyLinkedPending = appliedToThisInvoice
    .filter((x) => x.applied!.status === 'pending')
    .reduce((sum, x) => sum + x.applied!.amount, 0)

  const remaining =
    invoiceStatus === 'draft'
      ? Math.max(0, invoiceGrandTotal - alreadyLinkedPending)
      : Math.max(0, outstandingAmount ?? 0)

  // Sometida y saldada — no se puede aplicar a ESTA factura (el backend lo rechazaría), pero el saldo
  // del proveedor sigue existiendo y puede aplicarse a otra factura pendiente suya.
  if (invoiceStatus === 'submitted' && remaining <= 0) {
    if (!saldoFavor || saldoFavor.balance <= 0) return null
    return (
      <div className="inline-alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Wallet size={16} />
        <span>
          {supplierName ?? 'Este proveedor'} tiene {formatDOP(saldoFavor.balance)} de saldo a favor disponible, pero
          esta factura ya está saldada — aplique el saldo a otra factura pendiente del proveedor.
        </span>
      </div>
    )
  }

  if (isLoading) return null
  if (!saldoFavor || saldoFavor.balance <= 0) return null

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wallet size={16} /> Saldo a favor disponible
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Total disponible: {formatDOP(saldoFavor.balance)}
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {invoiceStatus === 'draft' && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Se enlazará a esta factura sin efecto contable inmediato — se aplicará (reconciliará) automáticamente al
            someterla.
          </p>
        )}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Devolución</th>
                <th>NCF</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Disponible</th>
                <th style={{ textAlign: 'right', width: 140 }}>Monto a aplicar</th>
                <th style={{ width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const applied = entry.appliedTo?.find((a) => a.invoiceId === invoiceId)
                const fullyUsed = entry.availableAmount <= 0.01
                const defaultAmount = Math.min(entry.availableAmount, remaining || entry.availableAmount)
                return (
                  <tr key={entry.devolucionId}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{entry.devolucionId}</td>
                    <td className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{entry.ncf ?? '—'}</td>
                    <td>{formatDate(entry.postingDate)}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(entry.grandTotal)}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(entry.availableAmount)}</td>
                    <td>
                      {!fullyUsed && !applied && remaining > 0 && (
                        <input
                          className="items-input"
                          type="number"
                          min="0.01"
                          max={Math.min(entry.availableAmount, remaining)}
                          step="0.01"
                          style={{ textAlign: 'right', width: '100%' }}
                          value={amounts[entry.devolucionId] ?? defaultAmount}
                          onChange={(e) =>
                            setAmounts((prev) => ({ ...prev, [entry.devolucionId]: parseFloat(e.target.value) || 0 }))
                          }
                        />
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {!applied && (fullyUsed || remaining <= 0) && (
                          <span className="badge badge-neutral" style={{ whiteSpace: 'nowrap' }}>
                            {fullyUsed ? 'Agotada' : 'Factura saldada'}
                          </span>
                        )}
                        {!applied && !fullyUsed && remaining > 0 && (
                          <button
                            className="btn btn-secondary btn-size-sm"
                            disabled={applyMutation.isPending}
                            onClick={() => {
                              const amount = Math.min(amounts[entry.devolucionId] ?? defaultAmount, entry.availableAmount, remaining)
                              if (!amount || amount <= 0) {
                                toast.error('El monto debe ser mayor a 0 y no exceder el disponible ni el pendiente de la factura')
                                return
                              }
                              applyMutation.mutate({ devolucionId: entry.devolucionId, amount })
                            }}
                          >
                            Aplicar
                          </button>
                        )}
                        {applied && (
                          <>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              Aplicado: {formatDOP(applied.amount)}
                            </span>
                            <span
                              className={`badge ${applied.status === 'reconciled' ? 'badge-success' : 'badge-warning'}`}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              {applied.status === 'reconciled' ? 'Reconciliada' : 'Pendiente'}
                            </span>
                            {applied.status === 'pending' && (
                              <button
                                className="btn btn-ghost btn-size-sm"
                                style={{ color: 'var(--color-error, var(--error-text))' }}
                                disabled={unapplyMutation.isPending}
                                onClick={() => unapplyMutation.mutate(entry.devolucionId)}
                                title="Deshacer enlace — solo posible mientras la factura siga en Draft"
                              >
                                Deshacer
                              </button>
                            )}
                          </>
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
    </div>
  )
}
