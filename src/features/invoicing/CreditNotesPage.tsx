import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCreditNotes,
  createCreditNote,
  submitCreditNote,
} from '@/shared/api/notes'
import { listInvoices } from '@/shared/api/invoices'
import type { Invoice, CreateCreditNoteDto } from '@/shared/api/types'
import { Plus, Loader2 } from 'lucide-react'
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

interface CreditNote {
  id: string
  originalInvoice: string
  invoiceName?: string
  customerName?: string
  date?: string
  grandTotal?: number
  status: 'Draft' | 'Submitted' | 'Cancelled'
  reason?: string
  items: NoteItem[]
}

interface NoteLineItem {
  itemCode: string
  qty: number
  rate: number
}

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Submitted: 'badge-submitted',
  Cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Cancelled: 'Cancelado',
}

export default function CreditNotesPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [reason, setReason] = useState('')
  const [noteItems, setNoteItems] = useState<NoteLineItem[]>([])

  const { data: notesData, isLoading } = useQuery({
    queryKey: ['credit-notes', orderBy],
    queryFn: () => listCreditNotes({ orderBy: orderBy || undefined }),
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
  const notes = (Array.isArray(notesData) ? notesData : []) as CreditNote[]

  const createMutation = useMutation({
    mutationFn: (dto: CreateCreditNoteDto) => createCreditNote(dto) as Promise<CreditNote>,
    onSuccess: async (note: CreditNote) => {
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
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : notes.length === 0 ? (
              <tr>
                <td colSpan={6}>
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
              notes.map((note) => (
                <tr key={note.id}>
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{note.id}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{note.originalInvoice}</td>
                  <td>{note.customerName ?? '—'}</td>
                  <td>{formatDate(note.date)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(note.grandTotal)}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[note.status] ?? 'badge-neutral'}`}>
                      {STATUS_LABEL[note.status] ?? note.status}
                    </span>
                  </td>
                </tr>
              ))
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
    </div>
  )
}
