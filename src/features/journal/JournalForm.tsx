import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { createJournalEntry, submitJournalEntry } from '@/shared/api/journal-entry'
import type { CreateJournalEntryDto, JournalEntryLine, ItemProps } from '@/shared/api/types'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { CostCenterSelect } from '@/components/shared/CostCenterSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { listSucursales } from '@/shared/api/sucursales'
import { getCuenta } from '@/shared/api/cuentas'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react'

interface EntryRow {
  id: number
  account: string
  accountName: string
  debit: number
  credit: number
  description: string
  branch: string
  department: string
  costCenter: string
  reportType?: 'Profit and Loss' | 'Balance Sheet'
}

let rowCounter = 2

function makeRow(): EntryRow {
  return { id: rowCounter++, account: '', accountName: '', debit: 0, credit: 0, description: '', branch: '', department: '', costCenter: '' }
}

function defaultRows(): EntryRow[] {
  return [
    { id: 0, account: '', accountName: '', debit: 0, credit: 0, description: '', branch: '', department: '', costCenter: '' },
    { id: 1, account: '', accountName: '', debit: 0, credit: 0, description: '', branch: '', department: '', costCenter: '' },
  ]
}

export default function JournalForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()

  const today = new Date().toISOString().slice(0, 10)
  const [postingDate, setPostingDate] = useState(today)
  const [remarks, setRemarks] = useState('')
  const [rows, setRows] = useState<EntryRow[]>(defaultRows)

  // Defaults a nivel de cabecera — el backend los aplica a las líneas que no traigan valor propio
  const [defaultBranch, setDefaultBranch] = useState('')
  const [defaultDepartment, setDefaultDepartment] = useState('')
  const [defaultCostCenter, setDefaultCostCenter] = useState<ItemProps | null>(null)

  const [sucursalQuery, setSucursalQuery] = useState('')
  const { data: sucursalesData, isLoading: sucursalesLoading } = useQuery({
    queryKey: ['sucursales-search', sucursalQuery],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 30_000,
  })
  const sucursalOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !sucursalQuery || s.name.toLowerCase().includes(sucursalQuery.toLowerCase()))
    .map((s) => ({ value: s.id, label: s.name }))

  const totalDebits = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredits = rows.reduce((s, r) => s + r.credit, 0)
  const difference = totalDebits - totalCredits
  const isBalanced = Math.abs(difference) < 0.01

  const createMutation = useMutation({
    mutationFn: (data: CreateJournalEntryDto) => createJournalEntry(data),
    onError: (err: { message?: string }) => {
      if (isApiErrorCode(err, ERROR_CODES.BRANCH_REQUIRED)) {
        toast.error(err?.message ?? 'Sucursal requerida para una o más líneas')
        return
      }
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
        branch: r.branch || undefined,
        department: r.department || undefined,
        costCenter: r.costCenter || undefined,
      }))
    return {
      postingDate,
      remarks: remarks || undefined,
      branch: defaultBranch || undefined,
      department: defaultDepartment || undefined,
      costCenter: defaultCostCenter?.id || undefined,
      entries,
    }
  }

  async function handleSaveDraft() {
    const payload = buildPayload()
    const entry = await createMutation.mutateAsync(payload)
    toast.success('Asiento guardado como borrador')
    const formTabId = activeId
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    navigate(`/asientos/${encodeURIComponent(entry.id)}`)
    // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
    // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
    if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
  }

  async function handleSaveAndSubmit() {
    if (!isBalanced) return
    const payload = buildPayload()
    const entry = await createMutation.mutateAsync(payload)
    await submitMutation.mutateAsync(entry.id)
    toast.success('Asiento guardado y confirmado')
    const formTabId = activeId
    queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
    navigate(`/asientos/${encodeURIComponent(entry.id)}`)
    if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
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

  const handleAccountChange = useCallback((id: number, accountId: string) => {
    updateRow(id, { account: accountId, reportType: undefined })
    if (!accountId) return
    getCuenta(accountId)
      .then((cuenta) => {
        updateRow(id, { reportType: cuenta.reportType })
      })
      .catch(() => {
        // Si falla el fetch puntual, no bloqueamos al usuario — el backend valida de todas formas
      })
  }, [updateRow])

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
                <DatePicker
                  id="postingDate"
                  className="ff-input"
                  value={postingDate}
                  onChange={setPostingDate}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="defaultBranch">Sucursal (default)</label>
                <SearchSelect
                  id="defaultBranch"
                  value={defaultBranch}
                  onChange={(val) => setDefaultBranch(val)}
                  options={sucursalOptions}
                  onSearch={setSucursalQuery}
                  loading={sucursalesLoading}
                  placeholder="Buscar sucursal…"
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="defaultDepartment">Departamento (default)</label>
                <DepartmentSelect
                  id="defaultDepartment"
                  value={defaultDepartment}
                  onChange={setDefaultDepartment}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="defaultCostCenter">Centro de Costo (default)</label>
                <CostCenterSelect
                  id="defaultCostCenter"
                  value={defaultCostCenter}
                  onChange={setDefaultCostCenter}
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
                    <th style={{ width: '22%' }}>Cuenta</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Débito</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Crédito</th>
                    <th style={{ width: '16%' }}>Descripción</th>
                    <th style={{ width: '14%' }}>Sucursal</th>
                    <th style={{ width: '14%' }}>Departamento</th>
                    <th style={{ width: '14%' }}>Centro de Costo</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const requiresBranch = row.reportType === 'Profit and Loss'
                    const branchResolved = row.branch || defaultBranch
                    const branchMissing = requiresBranch && !branchResolved
                    return (
                    <tr key={row.id}>
                      <td>
                        <AccountSelect
                          value={row.account}
                          onChange={(val) => handleAccountChange(row.id, val)}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <SearchSelect
                            value={row.branch}
                            onChange={(val) => updateRow(row.id, { branch: val })}
                            options={sucursalOptions}
                            onSearch={setSucursalQuery}
                            loading={sucursalesLoading}
                            placeholder="Sucursal…"
                            error={branchMissing}
                          />
                          {branchMissing && <span className="ff-required" title="Requerida: la cuenta es de Estado de Resultados">*</span>}
                        </div>
                      </td>
                      <td>
                        <DepartmentSelect
                          value={row.department}
                          onChange={(val) => updateRow(row.id, { department: val })}
                          placeholder="Depto…"
                        />
                      </td>
                      <td>
                        <CostCenterSelect
                          value={row.costCenter ? { id: row.costCenter, name: '' } : null}
                          onChange={(val) => updateRow(row.id, { costCenter: val?.id ?? '' })}
                          placeholder="C. Costo…"
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
                    )
                  })}
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
                    <td className="items-total-line" colSpan={5}>
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
