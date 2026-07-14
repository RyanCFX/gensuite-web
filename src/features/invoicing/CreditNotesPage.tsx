import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCreditNotes,
  createCreditNote,
  submitCreditNote,
  refundCreditNote,
  aplicarCreditNoteAFactura,
  removerCreditNoteAplicada,
  getCreditNoteSaldoFavor,
} from '@/shared/api/notes'
import { listInvoices, getInvoice } from '@/shared/api/invoices'
import { listMetodosPago } from '@/shared/api/config'
import type { Invoice, CreateCreditNoteDto, ApiError } from '@/shared/api/types'
import { Plus, Loader2, Wallet, ArrowRightLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { formatDate, formatDOP } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

interface NoteItem {
  itemCode: string
  qty: number
  rate: number
}

interface CreditNoteRow {
  id: string
  /** Factura contra la que se emitió esta nota — el campo real de la API es `returnAgainst`, no `originalInvoice` */
  returnAgainst: string
  invoiceName?: string
  customerName?: string
  postingDate?: string
  /** Viene negativo desde la API (es una factura de signo invertido) — usar Math.abs() para mostrarlo/aplicarlo como monto */
  grandTotal?: number
  status: string
  reason?: string
  items: NoteItem[]
  /** true si ya fue reembolsada en efectivo/transferencia; false = sigue como saldo a favor pendiente */
  refunded?: boolean
}

interface NoteLineItem {
  itemCode: string
  qty: number
  rate: number
}

// El backend devuelve el status en minúscula ("submitted"), no en Title Case.
const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

export default function CreditNotesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [reason, setReason] = useState('')
  const [noteItems, setNoteItems] = useState<NoteLineItem[]>([])
  const [refundTarget, setRefundTarget] = useState<CreditNoteRow | null>(null)
  const [refundAmount, setRefundAmount] = useState(0)
  const [refundModeOfPayment, setRefundModeOfPayment] = useState('')

  // ── Aplicar a factura / convertir a saldo a favor ─────────────────────────
  const [applyTarget, setApplyTarget] = useState<CreditNoteRow | null>(null)
  const [applyInvoiceId, setApplyInvoiceId] = useState('')
  const [applyInvoiceLabel, setApplyInvoiceLabel] = useState('')
  const [applyInvoiceQuery, setApplyInvoiceQuery] = useState('')
  const [applyAmount, setApplyAmount] = useState(0)

  const { data: notesData, isLoading } = useQuery({
    queryKey: ['credit-notes', orderBy],
    queryFn: () => listCreditNotes({ orderBy: orderBy || undefined }),
  })

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: !!refundTarget,
    staleTime: 5 * 60_000,
  })

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-submitted', invoiceQuery],
    queryFn: () => listInvoices({ status: 'submitted', search: invoiceQuery || undefined, limit: 20 }),
    enabled: modalOpen,
  })

  const submittedInvoices = invoicesData?.items ?? []

  const invoiceOptions: SearchSelectOption[] = submittedInvoices.map((inv) => ({
    value: inv.id,
    label: inv.customerName ?? inv.id,
    sublabel: (inv.ncf ?? inv.id) + ' — ' + formatDate(inv.postingDate),
  }))
  const notes = (Array.isArray(notesData) ? notesData : []) as unknown as CreditNoteRow[]

  const createMutation = useMutation({
    mutationFn: (dto: CreateCreditNoteDto) => createCreditNote(dto) as unknown as Promise<CreditNoteRow>,
    onSuccess: async (note: CreditNoteRow) => {
      await submitCreditNote(note.id)
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      toast.success('Nota de crédito creada y sometida (NCF B04 asignado)')
      handleCloseModal()
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al crear la nota de crédito')
    },
  })

  function handleCloseModal() {
    setModalOpen(false)
    setSelectedInvoice(null)
    setSelectedInvoiceId('')
    setInvoiceQuery('')
    setReason('')
    setNoteItems([])
  }

  const refundMutation = useMutation({
    mutationFn: () => refundCreditNote(refundTarget!.id, { modeOfPayment: refundModeOfPayment, amount: refundAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      toast.success('Nota de crédito reembolsada')
      closeRefundModal()
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al reembolsar la nota de crédito')
    },
  })

  function openRefundModal(note: CreditNoteRow) {
    setRefundTarget(note)
    setRefundAmount(Math.abs(note.grandTotal ?? 0))
    setRefundModeOfPayment('')
  }

  // La nota de crédito no expone el `customer` directamente — lo obtenemos de su factura original.
  const { data: applyOriginalInvoice } = useQuery({
    queryKey: ['invoice', applyTarget?.returnAgainst],
    queryFn: () => getInvoice(applyTarget!.returnAgainst),
    enabled: !!applyTarget,
  })

  const { data: applyInvoicesData, isLoading: applyInvoicesLoading } = useQuery({
    queryKey: ['invoices-for-credit-apply', applyOriginalInvoice?.customer, applyInvoiceQuery],
    queryFn: () => listInvoices({ customer: applyOriginalInvoice!.customer, search: applyInvoiceQuery || undefined, status: 'all', limit: 20 }),
    enabled: !!applyTarget && !!applyOriginalInvoice?.customer,
  })

  const applyInvoiceOptions: SearchSelectOption[] = (applyInvoicesData?.items ?? []).map((inv) => ({
    value: inv.id,
    label: inv.ncf ?? inv.id,
    sublabel: `${formatDate(inv.postingDate)} — ${formatDOP(inv.grandTotal)} (${inv.status})`,
  }))

  // Para saber si applyTarget ya está aplicada a la factura seleccionada (evita el 409 del backend)
  const { data: applyCreditNoteSaldo } = useQuery({
    queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer],
    queryFn: () => getCreditNoteSaldoFavor(applyOriginalInvoice!.customer),
    enabled: !!applyTarget && !!applyOriginalInvoice?.customer,
  })

  const applyTargetEntry = applyCreditNoteSaldo?.entries.find((e) => e.creditNoteId === applyTarget?.id)
  const alreadyAppliedToSelected = applyInvoiceId
    ? applyTargetEntry?.appliedTo.find((a) => a.invoiceId === applyInvoiceId)
    : undefined
  const selectedApplyInvoiceStatus = applyInvoicesData?.items.find((i) => i.id === applyInvoiceId)?.status
  const canUndoApply = selectedApplyInvoiceStatus === 'draft'

  const applyMutation = useMutation({
    mutationFn: () => aplicarCreditNoteAFactura(applyTarget!.id, {
      invoiceId: applyInvoiceId,
      amount: applyAmount || undefined,
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', result.id] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Aplicado a la factura correctamente')
      navigate(`/facturacion/facturas/${result.id}`)
      closeApplyModal()
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
    mutationFn: () => removerCreditNoteAplicada(applyTarget!.id, applyInvoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor', applyOriginalInvoice?.customer] })
      queryClient.invalidateQueries({ queryKey: ['invoice', applyInvoiceId] })
      toast.success('Aplicación deshecha — ya puedes volver a aplicar con un nuevo monto')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al deshacer la aplicación — solo es posible mientras la factura siga en Borrador')
    },
  })

  function openApplyModal(note: CreditNoteRow) {
    setApplyTarget(note)
    setApplyInvoiceId('')
    setApplyInvoiceLabel('')
    setApplyInvoiceQuery('')
    setApplyAmount(Math.abs(note.grandTotal ?? 0))
  }

  function closeApplyModal() {
    setApplyTarget(null)
    setApplyInvoiceId('')
    setApplyInvoiceLabel('')
    setApplyInvoiceQuery('')
    setApplyAmount(0)
  }

  const applyAmountValid = applyAmount > 0
  const canConfirmApply = applyAmountValid && !!applyInvoiceId && !alreadyAppliedToSelected

  function closeRefundModal() {
    setRefundTarget(null)
    setRefundAmount(0)
    setRefundModeOfPayment('')
  }

  const refundAmountValid = refundAmount > 0 && refundAmount <= Math.abs(refundTarget?.grandTotal ?? 0)
  const canConfirmRefund = refundAmountValid && !!refundModeOfPayment

  function updateNoteItem(index: number, patch: Partial<NoteLineItem>) {
    setNoteItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeNoteItem(index: number) {
    setNoteItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedInvoice) { toast.error('Selecciona una factura'); return }
    if (!reason.trim()) { toast.error('Indica el motivo de la nota de crédito'); return }
    if (noteItems.length === 0) { toast.error('Agrega al menos un artículo'); return }

    const dto: CreateCreditNoteDto = {
      originalInvoice: selectedInvoice.id,
      postingDate: new Date().toISOString().slice(0, 10),
      reason,
      items: noteItems.map((i) => ({ itemCode: i.itemCode, qty: i.qty, rate: i.rate })),
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notas de Crédito</h1>
          <p className="page-sub">Gestiona devoluciones y ajustes (NCF B04)</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Nueva Nota de Crédito
        </button>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <th>Factura Original</th>
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={sort} align="right" />
              <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              <th>Reembolso</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : notes.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin notas de crédito</div>
                    <p className="empty-sub">Crea una nota de crédito para procesar una devolución.</p>
                    <button className="btn btn-primary btn-size-sm" onClick={() => setModalOpen(true)}>
                      <Plus size={14} /> Nueva Nota de Crédito
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              notes.map((note) => {
                const statusLower = (note.status ?? '').toLowerCase()
                return (
                <tr key={note.id}>
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{note.id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{note.returnAgainst}</td>
                  <td>{note.customerName ?? '—'}</td>
                  <td>{formatDate(note.postingDate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(Math.abs(note.grandTotal ?? 0))}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[statusLower] ?? 'badge-neutral'}`}>
                      {STATUS_LABEL[statusLower] ?? note.status}
                    </span>
                  </td>
                  <td>
                    {statusLower !== 'submitted' ? (
                      <span className="td-dim">—</span>
                    ) : note.refunded ? (
                      <span className="badge badge-success">Reembolsada</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-warning">Saldo a favor disponible</span>
                        <button
                          className="btn btn-ghost btn-size-sm"
                          onClick={() => openRefundModal(note)}
                        >
                          <Wallet size={13} /> Reembolsar
                        </button>
                        <button
                          className="btn btn-ghost btn-size-sm"
                          onClick={() => openApplyModal(note)}
                        >
                          <ArrowRightLeft size={13} /> Aplicar a factura
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-head">
              <h2 className="modal-title">Nueva Nota de Crédito</h2>
              <button className="modal-close" type="button" onClick={handleCloseModal}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label">Factura original (sometida)</label>
                  <SearchSelect
                    id="invoice"
                    value={selectedInvoiceId}
                    onChange={(id, _opt) => {
                      setSelectedInvoiceId(id)
                      if (!id) {
                        setSelectedInvoice(null)
                        setNoteItems([])
                      } else {
                        const inv = submittedInvoices.find((i) => i.id === id) ?? null
                        setSelectedInvoice(inv)
                        if (inv) {
                          setNoteItems(inv.items.map((i) => ({ itemCode: i.itemCode, qty: i.qty, rate: i.rate })))
                        }
                      }
                    }}
                    options={invoiceOptions}
                    onSearch={setInvoiceQuery}
                    loading={invoicesLoading}
                    placeholder="Buscar factura por cliente…"
                    error={!selectedInvoiceId}
                  />
                  {selectedInvoice && (
                    <div style={{ marginTop: 4, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-sunken)', fontSize: 13 }}>
                      <span style={{ fontWeight: 500 }}>{selectedInvoice.customerName}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginLeft: 8 }}>
                        {selectedInvoice.ncf ?? selectedInvoice.id} — {formatDate(selectedInvoice.postingDate)} — {formatDOP(selectedInvoice.grandTotal)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="reason">Motivo</label>
                  <input
                    id="reason"
                    className="ff-input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ej: Devolución por producto defectuoso"
                    required
                  />
                </div>

                {noteItems.length > 0 && (
                  <div>
                    <label className="ff-label">Artículos a devolver</label>
                    <div className="items-table-wrap" style={{ marginTop: 4 }}>
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th>Código</th>
                            <th style={{ textAlign: 'right', width: 96 }}>Cant.</th>
                            <th style={{ textAlign: 'right', width: 120 }}>Precio</th>
                            <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                            <th style={{ width: 40 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {noteItems.map((item, index) => (
                            <tr key={index}>
                              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode}</td>
                              <td>
                                <input
                                  className="items-input"
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.qty}
                                  onChange={(e) => updateNoteItem(index, { qty: parseFloat(e.target.value) || 0 })}
                                  style={{ textAlign: 'right' }}
                                />
                              </td>
                              <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.qty * item.rate)}</td>
                              <td>
                                <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeNoteItem(index)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="items-total-row">
                        <div className="items-total-line" style={{ fontWeight: 700 }}>
                          <span>Total crédito</span>
                          <span>{formatDOP(noteItems.reduce((s, i) => s + i.qty * i.rate, 0))}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={handleCloseModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                  Crear y Someter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {refundTarget && (
        <div className="modal-overlay" onClick={closeRefundModal}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Wallet size={16} /> Reembolsar nota de crédito
              </h2>
              <button className="modal-close" onClick={closeRefundModal}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {refundTarget.id} — Total disponible: {formatDOP(Math.abs(refundTarget.grandTotal ?? 0))}
              </p>
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="refundAmount">Monto a reembolsar</label>
                <input
                  id="refundAmount"
                  className={`ff-input${!refundAmountValid ? ' items-input-error' : ''}`}
                  type="number"
                  min="0.01"
                  max={Math.abs(refundTarget.grandTotal ?? 0)}
                  step="0.01"
                  value={refundAmount || ''}
                  onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                />
                {!refundAmountValid && (
                  <p className="ff-hint" style={{ color: 'red' }}>El monto debe ser mayor a 0 y no exceder {formatDOP(Math.abs(refundTarget.grandTotal ?? 0))}</p>
                )}
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="refundModeOfPayment">Método de pago</label>
                <select
                  id="refundModeOfPayment"
                  className="ff-select"
                  value={refundModeOfPayment}
                  onChange={(e) => setRefundModeOfPayment(e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {metodos?.filter((m) => !m.disabled).map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={closeRefundModal}>Volver</button>
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
      )}

      {applyTarget && (
        <div className="modal-overlay" onClick={closeApplyModal}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowRightLeft size={16} /> Aplicar nota de crédito
              </h2>
              <button className="modal-close" onClick={closeApplyModal}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {applyTarget.id} — Total de la nota: {formatDOP(Math.abs(applyTarget.grandTotal ?? 0))}
              </p>

              <div className="ff-wrap">
                <label className="ff-label ff-required">Factura destino</label>
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
                <p className="ff-hint">
                  Se aplicará directamente a la factura seleccionada.
                </p>
                {!applyInvoiceId && (
                  <p className="ff-hint" style={{ color: 'red' }}>Selecciona una factura destino</p>
                )}
              </div>

              {alreadyAppliedToSelected ? (
                <div className="inline-alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wallet size={16} />
                  <span>
                    Esta nota ya está aplicada a esta factura por {formatDOP(alreadyAppliedToSelected.amount)}.
                    Para cambiar el monto, deshaz la aplicación y vuelve a aplicarla.
                  </span>
                </div>
              ) : (
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="applyAmount">Monto a aplicar</label>
                  <input
                    id="applyAmount"
                    className={`ff-input${!applyAmountValid ? ' items-input-error' : ''}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={applyAmount || ''}
                    onChange={(e) => setApplyAmount(parseFloat(e.target.value) || 0)}
                  />
                  <p className="ff-hint">
                    Prellenado con el total de la nota — si excede el saldo restante realmente disponible (ya sea porque hay reembolsos o conversiones previas), el sistema te lo indicará.
                  </p>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={closeApplyModal}>Cancelar</button>
              {alreadyAppliedToSelected ? (
                <button
                  className="btn btn-danger"
                  onClick={() => removeApplyMutation.mutate()}
                  disabled={!canUndoApply || removeApplyMutation.isPending}
                  title={canUndoApply ? undefined : 'Solo se puede deshacer mientras la factura siga en Borrador'}
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
      )}
    </div>
  )
}
