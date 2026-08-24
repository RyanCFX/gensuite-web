import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listCuentasBancarias,
  createCuentaBancaria,
  updateCuentaBancaria,
  deleteCuentaBancaria,
  getCuentaBancariaBalance,
  listBancosCatalogo,
  listTiposCuentaBancaria,
} from '@/shared/api/cuentas-bancarias'
import type { CuentaBancaria, CuentaBancariaEstado, ChequeFormat } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Wallet } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { useDebounce } from '@/lib/useDebounce'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { formatDOP } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'

const PAGE_SIZE = 20

const ESTADOS: CuentaBancariaEstado[] = ['Activa', 'Inactiva', 'Cerrada']
const CHEQUE_FORMATS: ChequeFormat[] = ['Estándar', 'Voucher', 'Media Carta', 'Cartera']

const cuentaBancariaSchema = z.object({
  accountName: z.string().min(1, 'El nombre es requerido'),
  bank: z.string().min(1, 'El banco es requerido'),
  account: z.string().min(1, 'La cuenta contable es requerida'),
  bankAccountNo: z.string().optional(),
  currency: z.string().min(1, 'La moneda es requerida'),
  estado: z.enum(['Activa', 'Inactiva', 'Cerrada']),
  chequeFormat: z.enum(['Estándar', 'Voucher', 'Media Carta', 'Cartera']),
  chequesManuales: z.boolean(),
  isDefault: z.boolean(),
  balanceInicial: z.number().min(0).optional(),
  ultimoCheque: z.number().min(0).optional(),
  ultimoDeposito: z.number().min(0).optional(),
  tipoCuenta: z.string().optional(),
})

type CuentaBancariaFormValues = z.infer<typeof cuentaBancariaSchema>

const DEFAULT_VALUES: CuentaBancariaFormValues = {
  accountName: '',
  bank: '',
  account: '',
  bankAccountNo: '',
  currency: 'DOP',
  estado: 'Activa',
  chequeFormat: 'Estándar',
  chequesManuales: false,
  isDefault: false,
  balanceInicial: 0,
  ultimoCheque: undefined,
  ultimoDeposito: undefined,
  tipoCuenta: '',
}

export default function CuentasBancariasPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<CuentaBancariaEstado | ''>('')
  const [tipoCuentaFilter, setTipoCuentaFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CuentaBancaria | null>(null)
  const [toDelete, setToDelete] = useState<CuentaBancaria | null>(null)
  const [balanceTarget, setBalanceTarget] = useState<CuentaBancaria | null>(null)
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cuentas-bancarias', { search: debouncedSearch, offset, estadoFilter, tipoCuentaFilter }],
    queryFn: () => listCuentasBancarias({
      search: debouncedSearch || undefined,
      estado: estadoFilter || undefined,
      tipoCuenta: tipoCuentaFilter || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const { data: bancos } = useQuery({
    queryKey: ['bancos-catalogo'],
    queryFn: listBancosCatalogo,
    enabled: dialogOpen,
    staleTime: 5 * 60_000,
  })

  const { data: tiposCuenta } = useQuery({
    queryKey: ['tipos-cuenta-bancaria'],
    queryFn: listTiposCuentaBancaria,
    staleTime: 60 * 60_000,
  })
  const [bankSearch, setBankSearch] = useState('')
  const bankOptions: SearchSelectOption[] = (bancos ?? [])
    .filter((b) => !bankSearch || b.name.toLowerCase().includes(bankSearch.toLowerCase()))
    .map((b) => ({ value: b.name, label: b.name }))

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['cuenta-bancaria-balance', balanceTarget?.id],
    queryFn: () => getCuentaBancariaBalance(balanceTarget!.id),
    enabled: !!balanceTarget,
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CuentaBancariaFormValues>({
    resolver: zodResolver(cuentaBancariaSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: createCuentaBancaria,
    onSuccess: () => {
      toast.success('Cuenta bancaria creada')
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la cuenta bancaria'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Parameters<typeof updateCuentaBancaria>[1] }) =>
      updateCuentaBancaria(id, d),
    onSuccess: () => {
      toast.success('Cuenta bancaria actualizada')
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la cuenta bancaria'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCuentaBancaria(id),
    onSuccess: () => {
      toast.success('Cuenta bancaria eliminada')
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al eliminar la cuenta bancaria')
      setToDelete(null)
    },
  })

  function openCreate() {
    setEditTarget(null)
    reset(DEFAULT_VALUES)
    setDialogOpen(true)
  }

  function openEdit(c: CuentaBancaria) {
    setEditTarget(c)
    reset({
      accountName: c.accountName,
      bank: c.bank,
      account: c.account,
      bankAccountNo: c.bankAccountNo ?? '',
      currency: c.currency,
      estado: c.estado,
      chequeFormat: c.chequeFormat,
      chequesManuales: c.chequesManuales,
      isDefault: c.isDefault,
      balanceInicial: c.balanceInicial,
      ultimoCheque: c.ultimoCheque,
      ultimoDeposito: c.ultimoDeposito,
      tipoCuenta: c.tipoCuenta ?? '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset(DEFAULT_VALUES)
  }

  function onSubmit(values: CuentaBancariaFormValues) {
    if (editTarget) {
      updateMutation.mutate({
        id: editTarget.id,
        data: {
          accountName: values.accountName,
          bank: values.bank,
          account: values.account,
          bankAccountNo: values.bankAccountNo || undefined,
          currency: values.currency,
          estado: values.estado,
          chequeFormat: values.chequeFormat,
          chequesManuales: values.chequesManuales,
          isDefault: values.isDefault,
          ultimoCheque: values.ultimoCheque,
          ultimoDeposito: values.ultimoDeposito,
          tipoCuenta: values.tipoCuenta || undefined,
        },
      })
    } else {
      createMutation.mutate({
        accountName: values.accountName,
        bank: values.bank,
        account: values.account,
        bankAccountNo: values.bankAccountNo || undefined,
        currency: values.currency,
        estado: values.estado,
        chequeFormat: values.chequeFormat,
        chequesManuales: values.chequesManuales,
        isDefault: values.isDefault,
        balanceInicial: values.balanceInicial ?? 0,
        tipoCuenta: values.tipoCuenta || undefined,
      })
    }
  }

  const cuentas = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Cuentas Bancarias"
        description={data ? `${data.meta.total ?? 0} cuentas bancarias` : undefined}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nueva Cuenta Bancaria
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por nombre…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <select
            className="ff-select"
            value={estadoFilter}
            onChange={(e) => { setEstadoFilter(e.target.value as CuentaBancariaEstado | ''); setPage(1) }}
            style={{ width: 160 }}
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            className="ff-select"
            value={tipoCuentaFilter}
            onChange={(e) => { setTipoCuentaFilter(e.target.value); setPage(1) }}
            style={{ width: 200 }}
          >
            <option value="">Todos los tipos</option>
            {(tiposCuenta ?? []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Banco</th>
                <th>Número de cuenta</th>
                <th>Moneda</th>
                <th>Tipo de Cuenta</th>
                <th>Estado</th>
                <th>Por defecto</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                          Error al cargar cuentas bancarias
                        </td>
                      </tr>
                    )
                  : cuentas.length === 0
                    ? (
                        <tr>
                          <td colSpan={8}>
                            <div className="empty-state">
                              <p className="empty-title">Sin cuentas bancarias</p>
                              <p className="empty-sub">Crea la primera cuenta bancaria del negocio.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : cuentas.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>{c.accountName}</td>
                          <td className="td-muted">{c.bank}</td>
                          <td className="td-muted">{c.bankAccountNo ?? '—'}</td>
                          <td className="td-muted">{c.currency}</td>
                          <td className="td-muted">{c.tipoCuenta ?? '—'}</td>
                          <td>
                            <span className={`badge ${c.estado === 'Activa' ? 'badge-success' : c.estado === 'Cerrada' ? 'badge-error' : 'badge-muted'}`}>
                              {c.estado}
                            </span>
                          </td>
                          <td className="td-muted">{c.isDefault ? 'Sí' : '—'}</td>
                          <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                            <ActionsMenu>
                              <ActionsMenuItem onClick={() => setBalanceTarget(c)}>
                                <Wallet size={14} /> Ver balance
                              </ActionsMenuItem>
                              <ActionsMenuItem onClick={() => openEdit(c)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                              <ActionsMenuItem onClick={() => setToDelete(c)}>
                                <Trash2 size={14} /> Eliminar
                              </ActionsMenuItem>
                            </ActionsMenu>
                          </td>
                        </tr>
                      ))}
            </tbody>
          </table>
        </div>

        {data && data.meta.total > PAGE_SIZE && (
          <div className="pagination">
            <span className="pagination-info">
              Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
            </span>
            <div className="pagination-controls">
              <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="cbAccountName">Nombre de la cuenta</label>
                  <input
                    id="cbAccountName"
                    className={`ff-input${errors.accountName ? ' ff-input-error' : ''}`}
                    placeholder="Ej: Cuenta Corriente Operativa"
                    {...register('accountName')}
                  />
                  {errors.accountName && <p className="ff-error">{errors.accountName.message}</p>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="cbBank">Banco</label>
                    <Controller
                      name="bank"
                      control={control}
                      render={({ field }) => (
                        <SearchSelect
                          id="cbBank"
                          value={field.value}
                          selectedLabel={field.value}
                          error={!!errors.bank}
                          onChange={(val) => field.onChange(val)}
                          options={bankOptions}
                          onSearch={setBankSearch}
                          placeholder="Buscar banco…"
                        />
                      )}
                    />
                    {errors.bank && <p className="ff-error">{errors.bank.message}</p>}
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label" htmlFor="cbAccountNo">Número de cuenta</label>
                    <input
                      id="cbAccountNo"
                      className="ff-input"
                      placeholder="000123456789"
                      {...register('bankAccountNo')}
                    />
                  </div>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="cbAccount">Cuenta contable</label>
                  <Controller
                    name="account"
                    control={control}
                    render={({ field }) => (
                      <AccountSelect
                        id="cbAccount"
                        value={field.value}
                        error={!!errors.account}
                        onChange={(val) => field.onChange(val)}
                        placeholder="Buscar cuenta contable…"
                      />
                    )}
                  />
                  {errors.account && <p className="ff-error">{errors.account.message}</p>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="cbCurrency">Moneda</label>
                    <input
                      id="cbCurrency"
                      className={`ff-input${errors.currency ? ' ff-input-error' : ''}`}
                      placeholder="DOP"
                      {...register('currency')}
                    />
                    {errors.currency && <p className="ff-error">{errors.currency.message}</p>}
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label">Estado</label>
                    <Controller
                      name="estado"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange} clearable={false}>
                          {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </Select>
                      )}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="ff-wrap">
                    <label className="ff-label">Formato de cheques</label>
                    <Controller
                      name="chequeFormat"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange} clearable={false}>
                          {CHEQUE_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </Select>
                      )}
                    />
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label">Tipo de Cuenta</label>
                    <Controller
                      name="tipoCuenta"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Sin especificar">
                          {(tiposCuenta ?? []).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </Select>
                      )}
                    />
                  </div>

                  {!editTarget && (
                    <div className="ff-wrap">
                      <label className="ff-label" htmlFor="cbBalanceInicial">Balance inicial (conciliado)</label>
                      <input
                        id="cbBalanceInicial"
                        className="ff-input"
                        type="number"
                        min="0"
                        step="0.01"
                        {...register('balanceInicial', { valueAsNumber: true })}
                      />
                    </div>
                  )}
                </div>

                {editTarget && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="ff-wrap">
                      <label className="ff-label" htmlFor="cbUltimoCheque">Último cheque</label>
                      <input
                        id="cbUltimoCheque"
                        className="ff-input"
                        type="number"
                        min="0"
                        step="0.01"
                        {...register('ultimoCheque', { valueAsNumber: true })}
                      />
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label" htmlFor="cbUltimoDeposito">Último depósito</label>
                      <input
                        id="cbUltimoDeposito"
                        className="ff-input"
                        type="number"
                        min="0"
                        step="0.01"
                        {...register('ultimoDeposito', { valueAsNumber: true })}
                      />
                    </div>
                  </div>
                )}

                <div className="ff-wrap" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input id="cbChequesManuales" type="checkbox" {...register('chequesManuales')} />
                  <label className="ff-label" htmlFor="cbChequesManuales" style={{ margin: 0 }}>
                    Cheques manuales
                  </label>
                </div>

                <div className="ff-wrap" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input id="cbIsDefault" type="checkbox" {...register('isDefault')} />
                  <label className="ff-label" htmlFor="cbIsDefault" style={{ margin: 0 }}>
                    Cuenta por defecto
                  </label>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar cuenta bancaria?</h2>
              <button className="modal-close" type="button" onClick={() => setToDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará <strong>{toDelete.accountName}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setToDelete(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate(toDelete.id)}
                disabled={deleteMutation.isPending}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {balanceTarget && (
        <div className="modal-overlay" onClick={() => setBalanceTarget(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Balance — {balanceTarget.accountName}</h2>
              <button className="modal-close" type="button" onClick={() => setBalanceTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              {balanceLoading || !balanceData
                ? <div className="skeleton-box" style={{ height: 60, width: '100%' }} />
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Balance inicial</span>
                        <strong>{formatDOP(balanceData.balanceInicial)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Balance actual</span>
                        <strong>{formatDOP(balanceData.balance)}</strong>
                      </div>
                    </div>
                  )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setBalanceTarget(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
