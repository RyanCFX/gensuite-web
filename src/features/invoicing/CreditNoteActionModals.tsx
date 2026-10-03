import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Wallet, ArrowRightLeft, Loader2 } from 'lucide-react'
import {
  refundCreditNote,
  aplicarCreditNoteAFactura,
  removerCreditNoteAplicada,
  getCreditNoteSaldoFavor,
} from '@/shared/api/notes'
import { listInvoices, getInvoice } from '@/shared/api/invoices'
import type { ApiError } from '@/shared/api/types'
import { formatDate, formatMoney } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useOpcionesLista, useOpcionesArray } from '@/shared/hooks/useOpciones'
import { reglasCuentaBancaria } from '@/lib/pagoBancario'

/** Nota mínima necesaria para los modales de reembolso/aplicación (la usan la tabla y el detalle). */
export interface CreditNoteActionTarget {
  id: string
  returnAgainst?: string | null
  grandTotal?: number | null
  currency?: string
}

// ─── Reembolsar ─────────────────────────────────────────────────────────────

export function RefundCreditNoteModal({ note, onClose }: { note: CreditNoteActionTarget; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [refundAmount, setRefundAmount] = useState(() => Math.abs(note.grandTotal ?? 0))
  const [refundModeOfPayment, setRefundModeOfPayment] = useState('')
  const [refundBankAccount, setRefundBankAccount] = useState('')

  const { data: metodos } = useOpcionesArray('metodos-pago', { limit: 100, staleTime: 5 * 60_000 })
  const [refundModeOfPaymentSearch, setRefundModeOfPaymentSearch] = useState('')
  const refundModeOfPaymentOptions: SearchSelectOption[] = (metodos ?? [])
    .filter((m) => !m.disabled)
    .filter((m) => !refundModeOfPaymentSearch || m.name.toLowerCase().includes(refundModeOfPaymentSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))

  const refundMetodoSeleccionado = (metodos ?? []).find((m) => m.name === refundModeOfPayment)
  const { mostrarCuenta: refundMostrarCuenta, cuentaObligatoria: refundRequiresBankAccount, tieneCuentaPorDefecto: refundCuentaPorDefecto } = reglasCuentaBancaria(refundMetodoSeleccionado)

  const { data: refundCuentasBancarias } = useOpcionesLista('cuentas-bancarias', { limit: 100, enabled: refundMostrarCuenta })
  const [refundBankAccountSearch, setRefundBankAccountSearch] = useState('')
  const refundBankAccountOptions: SearchSelectOption[] = (refundCuentasBancarias?.items ?? [])
    .filter((c) => !refundBankAccountSearch || c.accountName.toLowerCase().includes(refundBankAccountSearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.accountName, sublabel: c.bank }))

  const refundMutation = useMutation({
    mutationFn: () => refundCreditNote(note.id, {
      modeOfPayment: refundModeOfPayment,
      amount: refundAmount,
      bankAccount: refundBankAccount || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['credit-note', note.id] })
      toast.success('Nota de crédito reembolsada')
      onClose()
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al reembolsar la nota de crédito')
    },
  })

  const refundAmountValid = refundAmount > 0 && refundAmount <= Math.abs(note.grandTotal ?? 0)
  const canConfirmRefund = refundAmountValid && !!refundModeOfPayment && (!refundRequiresBankAccount || !!refundBankAccount)

  const reembolsoIsDirty = useDirtyCheck({ refundAmount, refundModeOfPayment, refundBankAccount }, true)
  const reembolsoClose = useConfirmClose(reembolsoIsDirty, onClose)

  return (
    <>
      <div className="modal-overlay" onClick={reembolsoClose.requestClose}>
        <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wallet size={16} /> Reembolsar nota de crédito
            </h2>
            <button className="modal-close" onClick={reembolsoClose.requestClose}>×</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {note.id} — Total disponible: {formatMoney(Math.abs(note.grandTotal ?? 0), note.currency)}
            </p>
            <div className="ff-wrap">
              <label className="ff-label ff-required" htmlFor="refundAmount">Monto a reembolsar</label>
              <input
                id="refundAmount"
                className={`ff-input${!refundAmountValid ? ' items-input-error' : ''}`}
                type="number"
                min="0.01"
                max={Math.abs(note.grandTotal ?? 0)}
                step="0.01"
                value={refundAmount || ''}
                onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
              />
              {!refundAmountValid && (
                <p className="ff-hint" style={{ color: 'red' }}>El monto debe ser mayor a 0 y no exceder {formatMoney(Math.abs(note.grandTotal ?? 0), note.currency)}</p>
              )}
            </div>
            <div className="ff-wrap">
              <label className="ff-label ff-required" htmlFor="refundModeOfPayment">Método de pago</label>
              <SearchSelect
                id="refundModeOfPayment"
                value={refundModeOfPayment}
                onChange={(val) => { setRefundModeOfPayment(val); setRefundBankAccount('') }}
                options={refundModeOfPaymentOptions}
                onSearch={setRefundModeOfPaymentSearch}
                selectedLabel={refundModeOfPayment}
                placeholder="Seleccionar…"
              />
            </div>

            {refundMostrarCuenta && (
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="refundBankAccount">
                  Cuenta Bancaria {refundRequiresBankAccount && <span className="ff-required">*</span>}
                </label>
                <SearchSelect
                  id="refundBankAccount"
                  value={refundBankAccount}
                  onChange={setRefundBankAccount}
                  options={refundBankAccountOptions}
                  onSearch={setRefundBankAccountSearch}
                  selectedLabel={refundCuentasBancarias?.items.find((c) => c.id === refundBankAccount)?.accountName ?? ''}
                  placeholder={refundCuentaPorDefecto ? 'Usar cuenta por defecto…' : 'Seleccionar cuenta bancaria…'}
                  error={refundRequiresBankAccount && !refundBankAccount}
                />
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={reembolsoClose.requestClose}>Volver</button>
            <button
              className="btn btn-primary"
              onClick={() => refundMutation.mutate()}
              disabled={!canConfirmRefund || refundMutation.isPending}
            >
              {refundMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              <Wallet size={14} /> Confirmar reembolso
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={reembolsoClose.confirming}
        onClose={reembolsoClose.cancelDiscard}
        onConfirm={reembolsoClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </>
  )
}

// ─── Aplicar a factura ──────────────────────────────────────────────────────

export function ApplyCreditNoteModal({ note, onClose }: { note: CreditNoteActionTarget; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [applyInvoiceId, setApplyInvoiceId] = useState('')
  const [applyInvoiceLabel, setApplyInvoiceLabel] = useState('')
  const [applyInvoiceQuery, setApplyInvoiceQuery] = useState('')
  const [applyAmount, setApplyAmount] = useState(() => Math.abs(note.grandTotal ?? 0))

  // La nota de crédito no expone el `customer` directamente — lo obtenemos de su factura original.
  const { data: applyOriginalInvoice } = useQuery({
    queryKey: ['invoice', note.returnAgainst],
    queryFn: () => getInvoice(note.returnAgainst!),
    enabled: !!note.returnAgainst,
  })

  // Facturas destino válidas: en Draft (sin paymentStatus aún) o Sometidas con saldo pendiente
  // (unpaid/partial) — no tiene sentido ofrecer una factura ya paid como destino.
  const { data: applyInvoicesData, isLoading: applyInvoicesLoading } = useQuery({
    queryKey: ['invoices-for-credit-apply', applyOriginalInvoice?.customer, applyInvoiceQuery],
    queryFn: async () => {
      const customer = applyOriginalInvoice!.customer
      const search = applyInvoiceQuery || undefined
      const [draft, pending] = await Promise.all([
        listInvoices({ customer, search, status: 'draft', limit: 20 }),
        listInvoices({ customer, search, status: 'submitted', paymentStatus: ['unpaid', 'partly_paid'], limit: 20 }),
      ])
      const seen = new Set<string>()
      const items = [...draft.items, ...pending.items].filter((inv) => {
        if (seen.has(inv.id)) return false
        seen.add(inv.id)
        return true
      })
      return { items, meta: draft.meta }
    },
    enabled: !!applyOriginalInvoice?.customer,
  })

  const applyInvoiceOptions: SearchSelectOption[] = (applyInvoicesData?.items ?? []).map((inv) => ({
    value: inv.id,
    label: inv.ncf ?? inv.id,
    sublabel: `${formatDate(inv.postingDate)} — ${formatMoney(inv.grandTotal, inv.currency)} (${inv.status})`,
  }))

  // Para saber si la nota ya está aplicada a la factura seleccionada (evita el 409 del backend)
  const { data: applyCreditNoteSaldo } = useQuery({
    queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer],
    queryFn: () => getCreditNoteSaldoFavor(applyOriginalInvoice!.customer),
    enabled: !!applyOriginalInvoice?.customer,
  })

  const applyTargetEntry = applyCreditNoteSaldo?.entries.find((e) => e.creditNoteId === note.id)
  const alreadyAppliedToSelected = applyInvoiceId
    ? applyTargetEntry?.appliedTo.find((a) => a.invoiceId === applyInvoiceId)
    : undefined
  const canUndoApply = alreadyAppliedToSelected?.status === 'pending'

  const applyMutation = useMutation({
    mutationFn: () => aplicarCreditNoteAFactura(note.id, {
      invoiceId: applyInvoiceId,
      amount: applyAmount || undefined,
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['credit-note', note.id] })
      queryClient.invalidateQueries({ queryKey: ['invoice', result.id] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Aplicado a la factura correctamente')
      navigate(`/facturas/${result.id}`)
      onClose()
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 400) {
        toast.error('Selecciona una factura destino para aplicar la nota de crédito')
        return
      }
      if (err?.statusCode === 409) {
        toast.error(err.message)
        queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer] })
        return
      }
      toast.error(err?.message ?? 'Error al aplicar la nota de crédito')
    },
  })

  const removeApplyMutation = useMutation({
    mutationFn: () => removerCreditNoteAplicada(note.id, applyInvoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['credit-note', note.id] })
      queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer] })
      queryClient.invalidateQueries({ queryKey: ['invoice', applyInvoiceId] })
      toast.success('Aplicación deshecha — ya puedes volver a aplicar con un nuevo monto')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al deshacer la aplicación — solo es posible mientras la factura siga en Borrador')
    },
  })

  const applyAmountValid = applyAmount > 0
  const canConfirmApply = applyAmountValid && !!applyInvoiceId && !alreadyAppliedToSelected

  const aplicarIsDirty = useDirtyCheck({ applyInvoiceId, applyAmount }, true)
  const aplicarClose = useConfirmClose(aplicarIsDirty, onClose)

  return (
    <>
      <div className="modal-overlay" onClick={aplicarClose.requestClose}>
        <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowRightLeft size={16} /> Aplicar nota de crédito
            </h2>
            <button className="modal-close" onClick={aplicarClose.requestClose}>×</button>
          </div>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {note.id} — Total de la nota: {formatMoney(Math.abs(note.grandTotal ?? 0), note.currency)}
            </p>

            <div className="ff-wrap">
              <label className="ff-label ff-required">
                Factura destino
                <FieldTooltip>Se aplicará directamente a la factura seleccionada.</FieldTooltip>
              </label>
              <SearchSelect
                value={applyInvoiceId}
                selectedLabel={applyInvoiceLabel}
                onChange={(val, opt) => {
                  setApplyInvoiceId(val)
                  setApplyInvoiceLabel(opt?.label ?? '')
                }}
                options={applyInvoiceOptions}
                onSearch={setApplyInvoiceQuery}
                loading={applyInvoicesLoading}
                placeholder="Buscar factura del cliente…"
                error={!applyInvoiceId}
              />
              {!applyInvoiceId && (
                <p className="ff-hint" style={{ color: 'red' }}>Selecciona una factura destino</p>
              )}
            </div>

            {alreadyAppliedToSelected ? (
              <div className="inline-alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wallet size={16} />
                <span>
                  Esta nota ya está aplicada a esta factura por {formatMoney(alreadyAppliedToSelected.amount, note.currency)}
                  {' '}
                  <span className={`badge ${alreadyAppliedToSelected.status === 'reconciled' ? 'badge-success' : 'badge-warning'}`}>
                    {alreadyAppliedToSelected.status === 'reconciled' ? 'Reconciliada' : 'Pendiente'}
                  </span>
                  {alreadyAppliedToSelected.status === 'pending'
                    ? '. Para cambiar el monto, deshaz la aplicación y vuelve a aplicarla.'
                    : '. Ya fue reconciliada contra la factura sometida — no se puede deshacer.'}
                </span>
              </div>
            ) : (
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="applyAmount">
                  Monto a aplicar
                  <FieldTooltip>
                    Prellenado con el total de la nota — si excede el saldo restante realmente disponible (ya sea porque hay reembolsos o conversiones previas), el sistema te lo indicará.
                  </FieldTooltip>
                </label>
                <input
                  id="applyAmount"
                  className={`ff-input${!applyAmountValid ? ' items-input-error' : ''}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={applyAmount || ''}
                  onChange={(e) => setApplyAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={aplicarClose.requestClose}>Cancelar</button>
            {alreadyAppliedToSelected ? (
              <button
                className="btn btn-danger"
                onClick={() => removeApplyMutation.mutate()}
                disabled={!canUndoApply || removeApplyMutation.isPending}
                title={canUndoApply ? undefined : 'Ya reconciliada — no se puede deshacer'}
              >
                {removeApplyMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                Deshacer aplicación
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => applyMutation.mutate()}
                disabled={!canConfirmApply || applyMutation.isPending}
              >
                {applyMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                Aplicar a factura
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={aplicarClose.confirming}
        onClose={aplicarClose.cancelDiscard}
        onConfirm={aplicarClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </>
  )
}
