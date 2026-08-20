import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wallet, Shuffle } from 'lucide-react'
import { getSaldoFavorProveedor, aplicarSaldosFavor } from '@/shared/api/pagos'
import { formatDOP, formatDate } from '@/lib/formatters'
import type { SaldoFavorProveedorEntry, FacturaConSaldosFavorDto } from '@/shared/api/types'

export interface SaldoFavorInvoiceRow {
  invoiceId: string
  outstandingAmount: number
  postingDate: string
  checked: boolean
}

export interface SaldoFavorProveedorPagosSectionProps {
  supplierId: string
  supplierName?: string
  invoices: SaldoFavorInvoiceRow[]
  onApplied?: () => void
}

function byPostingDateAsc<T extends { postingDate: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => (a.postingDate < b.postingDate ? -1 : a.postingDate > b.postingDate ? 1 : 0))
}

/**
 * Vista previa de "monto a aplicar" por saldo, mientras el usuario va marcando facturas:
 * si un saldo alcanza por sí solo para cubrir el total seleccionado, muestra ese total;
 * si no alcanza, se pone en 0 salvo que sea el de mayor antigüedad (candidato a iniciar
 * el reparto); si NINGÚN saldo alcanza por sí solo, se reparte en cascada por antigüedad.
 */
function computePreview(entriesOldestFirst: SaldoFavorProveedorEntry[], totalFacturas: number): Record<string, number> {
  const preview: Record<string, number> = {}
  if (totalFacturas <= 0) return preview
  const anySufficient = entriesOldestFirst.some((e) => e.availableAmount >= totalFacturas)
  if (anySufficient) {
    entriesOldestFirst.forEach((e, i) => {
      preview[e.paymentEntryId] = e.availableAmount >= totalFacturas ? totalFacturas : i === 0 ? e.availableAmount : 0
    })
    return preview
  }
  let remaining = totalFacturas
  for (const e of entriesOldestFirst) {
    const alloc = Math.round(Math.min(remaining, e.availableAmount) * 100) / 100
    preview[e.paymentEntryId] = alloc
    remaining = Math.round((remaining - alloc) * 100) / 100
  }
  return preview
}

/** Reparte `amount` entre facturas (ya ordenadas por antigüedad), topado al pendiente de cada una. */
function allocateAcrossInvoices(amount: number, invoicesOldestFirst: SaldoFavorInvoiceRow[]): { invoiceId: string; amount: number }[] {
  const result: { invoiceId: string; amount: number }[] = []
  let remaining = amount
  for (const inv of invoicesOldestFirst) {
    if (remaining <= 0) break
    const alloc = Math.round(Math.min(remaining, inv.outstandingAmount) * 100) / 100
    if (alloc > 0) result.push({ invoiceId: inv.invoiceId, amount: alloc })
    remaining = Math.round((remaining - alloc) * 100) / 100
  }
  return result
}

function buildFacturasDto(breakdown: { invoiceId: string; paymentEntryId: string; amount: number }[]): FacturaConSaldosFavorDto[] {
  const byInvoice = new Map<string, { paymentEntryId: string; amount: number }[]>()
  for (const { invoiceId, paymentEntryId, amount } of breakdown) {
    if (!byInvoice.has(invoiceId)) byInvoice.set(invoiceId, [])
    byInvoice.get(invoiceId)!.push({ paymentEntryId, amount })
  }
  return Array.from(byInvoice.entries()).map(([invoiceId, saldos]) => ({ invoiceId, saldos }))
}

export function SaldoFavorProveedorPagosSection({
  supplierId,
  supplierName,
  invoices,
  onApplied,
}: SaldoFavorProveedorPagosSectionProps) {
  const queryClient = useQueryClient()
  const [manualAmounts, setManualAmounts] = useState<Record<string, number>>({})
  const [choiceEntry, setChoiceEntry] = useState<SaldoFavorProveedorEntry | null>(null)
  const [choiceAmount, setChoiceAmount] = useState(0)
  const [splitModal, setSplitModal] = useState<{ entry: SaldoFavorProveedorEntry; amount: number; rows: Record<string, number> } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null)

  const { data: saldoFavor, isLoading } = useQuery({
    queryKey: ['saldo-favor-proveedor-pagos', supplierId],
    queryFn: () => getSaldoFavorProveedor(supplierId),
    enabled: !!supplierId,
  })

  const entries = useMemo(() => byPostingDateAsc(saldoFavor?.entries ?? []), [saldoFavor])

  const selectedInvoices = useMemo(
    () => byPostingDateAsc(invoices.filter((i) => i.checked)),
    [invoices],
  )
  const totalFacturas = selectedInvoices.reduce((s, i) => s + i.outstandingAmount, 0)
  const preview = useMemo(() => computePreview(entries, totalFacturas), [entries, totalFacturas])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['saldo-favor-proveedor-pagos', supplierId] })
    queryClient.invalidateQueries({ queryKey: ['pagos-pendientes-form', supplierId] })
    onApplied?.()
  }

  const applyMutation = useMutation({
    mutationFn: aplicarSaldosFavor,
    onSuccess: () => {
      invalidate()
      setManualAmounts({})
      setChoiceEntry(null)
      setSplitModal(null)
      setConfirmAction(null)
      toast.success('Saldo a favor aplicado')
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo aplicar el saldo a favor'),
  })

  if (!supplierId) return null
  if (isLoading) return null
  if (!saldoFavor || saldoFavor.balance <= 0) return null

  function requireInvoices(): boolean {
    if (selectedInvoices.length === 0) {
      toast.error('Por favor, seleccione al menos una factura a aplicar el saldo a favor')
      return false
    }
    return true
  }

  function handleApplyEntry(entry: SaldoFavorProveedorEntry) {
    if (!requireInvoices()) return
    const amount = Math.min(manualAmounts[entry.paymentEntryId] ?? preview[entry.paymentEntryId] ?? entry.availableAmount, entry.availableAmount)
    if (!amount || amount <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }

    if (amount >= totalFacturas) {
      setConfirmAction({
        message: `¿Aplicar ${formatDOP(Math.min(amount, totalFacturas))} del saldo ${entry.paymentEntryId} a las facturas seleccionadas?`,
        onConfirm: () => {
          const breakdown = allocateAcrossInvoices(totalFacturas, selectedInvoices).map((b) => ({ ...b, paymentEntryId: entry.paymentEntryId }))
          applyMutation.mutate({ facturas: buildFacturasDto(breakdown) })
        },
      })
      return
    }

    setChoiceEntry(entry)
    setChoiceAmount(amount)
  }

  function handleRedistribuirAutomatico() {
    if (!requireInvoices()) return
    if (entries.length === 0) return
    setConfirmAction({
      message: 'Las facturas seleccionadas se saldarán con el saldo a favor disponible en orden de antigüedad. ¿Continuar?',
      onConfirm: executeRedistribuirAutomatico,
    })
  }

  function executeRedistribuirAutomatico() {
    const entryRemaining: Record<string, number> = {}
    entries.forEach((e) => { entryRemaining[e.paymentEntryId] = e.availableAmount })
    const breakdown: { invoiceId: string; paymentEntryId: string; amount: number }[] = []
    for (const inv of selectedInvoices) {
      let invRemaining = inv.outstandingAmount
      for (const e of entries) {
        if (invRemaining <= 0) break
        const avail = entryRemaining[e.paymentEntryId]
        if (avail <= 0) continue
        const alloc = Math.round(Math.min(invRemaining, avail) * 100) / 100
        if (alloc > 0) {
          breakdown.push({ invoiceId: inv.invoiceId, paymentEntryId: e.paymentEntryId, amount: alloc })
          invRemaining = Math.round((invRemaining - alloc) * 100) / 100
          entryRemaining[e.paymentEntryId] = Math.round((avail - alloc) * 100) / 100
        }
      }
    }
    if (breakdown.length === 0) {
      toast.error('No hay saldo a favor disponible para redistribuir')
      return
    }
    applyMutation.mutate({ facturas: buildFacturasDto(breakdown) })
  }

  function submitChoiceAutomatico() {
    if (!choiceEntry) return
    const breakdown = allocateAcrossInvoices(choiceAmount, selectedInvoices).map((b) => ({ ...b, paymentEntryId: choiceEntry.paymentEntryId }))
    applyMutation.mutate({ facturas: buildFacturasDto(breakdown) })
  }

  function openManualSplit(prefill: boolean) {
    if (!choiceEntry) return
    const rows: Record<string, number> = {}
    if (prefill) {
      for (const b of allocateAcrossInvoices(choiceAmount, selectedInvoices)) rows[b.invoiceId] = b.amount
    } else {
      for (const inv of selectedInvoices) rows[inv.invoiceId] = 0
    }
    setSplitModal({ entry: choiceEntry, amount: choiceAmount, rows })
    setChoiceEntry(null)
  }

  function submitManualSplit() {
    if (!splitModal) return
    const sum = Object.values(splitModal.rows).reduce((s, v) => s + (v || 0), 0)
    if (sum <= 0) { toast.error('Ingresa al menos un monto'); return }
    if (Math.round(sum * 100) / 100 > Math.round(splitModal.amount * 100) / 100) {
      toast.error(`La suma (${formatDOP(sum)}) no puede exceder el saldo a aplicar (${formatDOP(splitModal.amount)})`)
      return
    }
    const breakdown = Object.entries(splitModal.rows)
      .filter(([, amount]) => amount > 0)
      .map(([invoiceId, amount]) => ({ invoiceId, paymentEntryId: splitModal.entry.paymentEntryId, amount }))
    applyMutation.mutate({ facturas: buildFacturasDto(breakdown) })
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wallet size={16} /> Saldo a Favor de {supplierName ?? 'Proveedor'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Total disponible: {formatDOP(saldoFavor.balance)}
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {selectedInvoices.length > 0
              ? `${selectedInvoices.length} factura${selectedInvoices.length !== 1 ? 's' : ''} marcada${selectedInvoices.length !== 1 ? 's' : ''} arriba en "Facturas Pendientes" — total ${formatDOP(totalFacturas)}`
              : 'Marca las facturas a saldar en la tabla "Facturas Pendientes" de arriba'}
          </span>
          <button type="button" className="btn btn-secondary btn-size-sm" onClick={handleRedistribuirAutomatico} disabled={applyMutation.isPending}>
            <Shuffle size={14} /> Redistribuir saldo automáticamente
          </button>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment Entry</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Disponible</th>
                <th style={{ textAlign: 'right', width: 140 }}>Monto a aplicar</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.paymentEntryId}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{entry.paymentEntryId}</td>
                  <td>{formatDate(entry.postingDate)}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(entry.availableAmount)}</td>
                  <td>
                    <input
                      className="items-input"
                      type="number"
                      min="0"
                      max={entry.availableAmount}
                      step="0.01"
                      style={{ textAlign: 'right', width: '100%' }}
                      value={manualAmounts[entry.paymentEntryId] ?? preview[entry.paymentEntryId] ?? 0}
                      onChange={(e) => setManualAmounts((prev) => ({ ...prev, [entry.paymentEntryId]: parseFloat(e.target.value) || 0 }))}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-size-sm"
                      disabled={applyMutation.isPending || entry.availableAmount <= 0}
                      onClick={() => handleApplyEntry(entry)}
                    >
                      Aplicar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {choiceEntry && createPortal(
        <div className="modal-overlay" onClick={() => setChoiceEntry(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Cómo repartir el saldo?</h2>
              <button type="button" className="modal-close" onClick={() => setChoiceEntry(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                El saldo de <strong>{choiceEntry.paymentEntryId}</strong> ({formatDOP(choiceAmount)} a aplicar) es menor
                al total de las facturas seleccionadas ({formatDOP(totalFacturas)}). Elige cómo repartirlo entre ellas.
              </p>
            </div>
            <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={() => openManualSplit(false)}>Redistribuir manualmente</button>
              <button type="button" className="btn btn-secondary" onClick={() => openManualSplit(true)}>Calcular</button>
              <button type="button" className="btn btn-primary" onClick={submitChoiceAutomatico}>Redistribuir automáticamente</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {splitModal && createPortal(
        <div className="modal-overlay" onClick={() => setSplitModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Repartir saldo manualmente</h2>
              <button type="button" className="modal-close" onClick={() => setSplitModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Saldo a repartir de <strong>{splitModal.entry.paymentEntryId}</strong>: {formatDOP(splitModal.amount)}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th style={{ textAlign: 'right' }}>Pendiente</th>
                      <th style={{ textAlign: 'right', width: 140 }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoices.map((inv) => (
                      <tr key={inv.invoiceId}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{inv.invoiceId}</td>
                        <td style={{ textAlign: 'right' }}>{formatDOP(inv.outstandingAmount)}</td>
                        <td>
                          <input
                            className="items-input"
                            type="number"
                            min="0"
                            max={Math.min(inv.outstandingAmount, splitModal.amount)}
                            step="0.01"
                            style={{ textAlign: 'right', width: '100%' }}
                            value={splitModal.rows[inv.invoiceId] || ''}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0
                              setSplitModal((prev) => (prev ? { ...prev, rows: { ...prev.rows, [inv.invoiceId]: value } } : prev))
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const sum = Object.values(splitModal.rows).reduce((s, v) => s + (v || 0), 0)
                const over = Math.round(sum * 100) / 100 > Math.round(splitModal.amount * 100) / 100
                return (
                  <span style={{ fontSize: 12, color: over ? 'var(--error-text)' : 'var(--text-secondary)', textAlign: 'right' }}>
                    Total: {formatDOP(sum)} / {formatDOP(splitModal.amount)}
                  </span>
                )
              })()}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary" onClick={() => setSplitModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={submitManualSplit} disabled={applyMutation.isPending}>
                Aplicar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {confirmAction && createPortal(
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Confirmar</h2>
              <button type="button" className="modal-close" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{confirmAction.message}</p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={applyMutation.isPending} onClick={confirmAction.onConfirm}>
                Confirmar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
