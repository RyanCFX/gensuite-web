import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createJournalEntry, submitJournalEntry } from '@/shared/api/journal-entry'
import type { CreateJournalEntryDto, JournalEntryLine } from '@/shared/api/types'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react'

interface EntryRow {
  id: number
  account: string
  accountName: string
  debit: number
  credit: number
  description: string
}

let rowCounter = 2

function makeRow(): EntryRow {
  return { id: rowCounter++, account: '', accountName: '', debit: 0, credit: 0, description: '' }
}

function defaultRows(): EntryRow[] {
  return [
    { id: 0, account: '', accountName: '', debit: 0, credit: 0, description: '' },
    { id: 1, account: '', accountName: '', debit: 0, credit: 0, description: '' },
  ]
}

export default function JournalForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const today = new Date().toISOString().slice(0, 10)
  const [postingDate, setPostingDate] = useState(today)
  const [remarks, setRemarks] = useState('')
  const [rows, setRows] = useState<EntryRow[]>(defaultRows)

  const totalDebits = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredits = rows.reduce((s, r) => s + r.credit, 0)
  const difference = totalDebits - totalCredits
  const isBalanced = Math.abs(difference) < 0.01

  const createMutation = useMutation({
    mutationFn: (data: CreateJournalEntryDto) => createJournalEntry(data),
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al guardar el asiento')
    },
  })

  const submitMutation = useMutation({
    mutationFn: (id: string) => submitJournalEntry(id),
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al confirmar el asiento')
    },
  })

  function buildPayload(): CreateJournalEntryDto {
    const entries: JournalEntryLine[] = rows
      .filter((r) => r.account)
      .map((r) => ({
        account: r.account,
        debit: r.debit,
        credit: r.credit,
        description: r.description || undefined,
      }))
    return {
      postingDate,
      remarks: remarks || undefined,
      entries,
    }
  }

  async function handleSaveDraft() {
    const payload = buildPayload()
    const entry = await createMutation.mutateAsync(payload)
    toast.success('Asiento guardado como borrador')
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    navigate(`/asientos/${encodeURIComponent(entry.id)}`)
  }

  async function handleSaveAndSubmit() {
    if (!isBalanced) return
    const payload = buildPayload()
    const entry = await createMutation.mutateAsync(payload)
    await submitMutation.mutateAsync(entry.id)
    toast.success('Asiento guardado y confirmado')
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    navigate(`/asientos/${encodeURIComponent(entry.id)}`)
  }

  const updateRow = useCallback((id: number, changes: Partial<EntryRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }, [])

  const removeRow = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, makeRow()])
  }, [])

  function handleDebitChange(id: number, value: number) {
    updateRow(id, { debit: value, credit: value > 0 ? 0 : undefined })
  }

  function handleCreditChange(id: number, value: number) {
    updateRow(id, { credit: value, debit: value > 0 ? 0 : undefined })
  }

  const isPending = createMutation.isPending || submitMutation.isPending

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <button className="page-back-link" onClick={() => navigate('/asientos')}>
            <ArrowLeft size={14} /> Asientos Contables
          </button>
          <h1 className="page-title">Nuevo Asiento</h1>
        </div>
      </div>

      <form
        onSubmit={(e) => e.preventDefault()}
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {/* Header fields */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Encabezado</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="postingDate">
                  Fecha <span className="ff-required">*</span>
                </label>
                <input
                  id="postingDate"
                  type="date"
                  className="ff-input"
                  value={postingDate}
                  onChange={(e) => setPostingDate(e.target.value)}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="remarks">Descripción</label>
                <textarea
                  id="remarks"
                  className="ff-textarea"
                  rows={2}
                  placeholder="Descripción del asiento…"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Entry lines */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="card-title">Líneas del Asiento</h2>
            <button type="button" className="btn btn-secondary btn-size-sm" onClick={addRow}>
              <Plus size={14} /> Agregar línea
            </button>
          </div>

          {rows.length < 2 && (
            <div style={{ padding: '12px 20px 0' }}>
              <div className="inline-alert inline-alert-warn">
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                Un asiento debe tener al menos 2 líneas.
              </div>
            </div>
          )}

          <div className="card-body" style={{ padding: 0 }}>
            <div className="items-table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Cuenta</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Débito</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Crédito</th>
                    <th>Descripción</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <AccountSelect
                          value={row.account}
                          onChange={(val) => updateRow(row.id, { account: val })}
                          ledgerOnly
                          placeholder="Buscar cuenta…"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="items-input"
                          style={{ textAlign: 'right' }}
                          value={row.debit || ''}
                          onChange={(e) => handleDebitChange(row.id, parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="items-input"
                          style={{ textAlign: 'right' }}
                          value={row.credit || ''}
                          onChange={(e) => handleCreditChange(row.id, parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="items-input"
                          placeholder="Descripción…"
                          value={row.description}
                          onChange={(e) => updateRow(row.id, { description: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-xs"
                          style={{ color: 'var(--color-error)' }}
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length <= 2}
                          title="Eliminar línea"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="items-total-row">
                    <td className="items-total-line" style={{ fontWeight: 600 }}>Totales</td>
                    <td className="items-total-line" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatDOP(totalDebits)}
                    </td>
                    <td className="items-total-line" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatDOP(totalCredits)}
                    </td>
                    <td className="items-total-line" colSpan={2}>
                      <span style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: isBalanced ? 'var(--success-text)' : 'var(--error-text)',
                      }}>
                        {isBalanced ? '⚖️' : '⚠️'} Diferencia: {formatDOP(difference)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isPending || rows.length < 2}
            onClick={handleSaveDraft}
          >
            {isPending && !submitMutation.isPending
              ? <><span className="spinner spinner-sm" /> Guardando…</>
              : 'Guardar como Borrador'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isBalanced || isPending || rows.length < 2}
            onClick={handleSaveAndSubmit}
            title={!isBalanced ? 'El asiento debe estar balanceado para confirmarlo' : undefined}
          >
            {submitMutation.isPending
              ? <><span className="spinner spinner-white spinner-sm" /> Confirmando…</>
              : 'Guardar y Confirmar'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/asientos')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
