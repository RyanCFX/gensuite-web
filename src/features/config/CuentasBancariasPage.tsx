import { useState, useCallback, useEffect } from 'react'
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
  listInconsistenciasMoneda,
} from '@/shared/api/cuentas-bancarias'
import { listChequePrintTemplates } from '@/shared/api/tesoreria'
import { getCuenta } from '@/shared/api/cuentas'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import type { CuentaBancaria, CuentaBancariaEstado, ChequeFormat, MonedaCode } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Wallet, ShieldAlert } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useDebounce } from '@/lib/useDebounce'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { formatMoney } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { usePuede } from '@/shared/permissions/can'

const PAGE_SIZE = 20

const ESTADOS: CuentaBancariaEstado[] = ['Activa', 'Inactiva', 'Cerrada']
const CHEQUE_FORMATS: ChequeFormat[] = ['Estándar', 'Voucher', 'Media Carta', 'Cartera']
// Universo cerrado de monedas soportadas por el módulo /monedas (docs/tasks/64_multimoneda_completo.md
// §0.1) — no confundir con el catálogo abierto GET /config/currencies que usan Compras/Gastos.
const MONEDA_OPTIONS: MonedaCode[] = ['DOP', 'USD', 'EUR']

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
  chequePrintTemplate: z.string().optional(),
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
  chequePrintTemplate: '',
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

  const { data: chequePrintTemplates } = useQuery({
    queryKey: ['tesoreria-cheque-print-templates-select'],
    queryFn: () => listChequePrintTemplates({ limit: 100 }),
    enabled: dialogOpen,
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
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CuentaBancariaFormValues>({
    resolver: zodResolver(cuentaBancariaSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const chequesManualesValue = watch('chequesManuales')
  const accountValue = watch('account')

  // La moneda REAL de una cuenta bancaria es siempre la de su cuenta contable (GL) vinculada —
  // nunca un campo editable libre (docs/tasks/64_multimoneda_completo.md §5.6). Se deriva aquí
  // de la cuenta contable elegida y se bloquea el selector de moneda; el backend igual la
  // valida/rechaza con BANK_ACCOUNT_CURRENCY_MISMATCH_GL como defensa adicional.
  const { data: cuentaContableSeleccionada } = useQuery({
    queryKey: ['cuenta-contable-currency', accountValue],
    queryFn: () => getCuenta(accountValue),
    enabled: !!accountValue,
    staleTime: 5 * 60_000,
  })
  useEffect(() => {
    if (cuentaContableSeleccionada) {
      setValue('currency', cuentaContableSeleccionada.currency, { shouldValidate: true, shouldDirty: true })
    }
  }, [cuentaContableSeleccionada, setValue])
  // Requerido cuando pasa a automático y no hay ya un ultimoCheque guardado en la cuenta (creación,
  // o edición cambiando de manual a automático sin contador previo). Ver docs/tasks/45.
  const ultimoChequeRequerido = !chequesManualesValue && !editTarget?.ultimoCheque

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  // BANK_ACCOUNT_CURRENCY_MISMATCH_GL — código DISTINTO al BANK_ACCOUNT_CURRENCY_MISMATCH de
  // Cobros/Pagos/Tesorería (docs/tasks/64_multimoneda_completo.md §5.6): la moneda mandada no
  // coincide con la moneda real de la cuenta contable elegida. Se marca el campo `currency` con
  // el mensaje del backend en vez de solo un toast genérico.
  function handleCuentaBancariaError(err: unknown) {
    if (isApiErrorCode(err, ERROR_CODES.BANK_ACCOUNT_CURRENCY_MISMATCH_GL)) {
      setError('currency', { type: 'manual', message: err.message })
      return
    }
    toast.error((err as { message?: string })?.message ?? 'Error al guardar la cuenta bancaria')
  }

  const createMutation = useMutation({
    mutationFn: createCuentaBancaria,
    onSuccess: () => {
      toast.success('Cuenta bancaria creada')
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      closeDialog()
    },
    onError: handleCuentaBancariaError,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Parameters<typeof updateCuentaBancaria>[1] }) =>
      updateCuentaBancaria(id, d),
    onSuccess: () => {
      toast.success('Cuenta bancaria actualizada')
      queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] })
      closeDialog()
    },
    onError: handleCuentaBancariaError,
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
      chequePrintTemplate: c.chequePrintTemplate ?? '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset(DEFAULT_VALUES)
  }

  function onSubmit(values: CuentaBancariaFormValues) {
    if (!values.chequesManuales && !editTarget?.ultimoCheque && !values.ultimoCheque) {
      setError('ultimoCheque', {
        message: 'Requerido: es el punto de partida del contador para la numeración automática de cheques.',
      })
      return
    }
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
          chequePrintTemplate: values.chequePrintTemplate || undefined,
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
        ultimoCheque: values.ultimoCheque,
        tipoCuenta: values.tipoCuenta || undefined,
        chequePrintTemplate: values.chequePrintTemplate || undefined,
      })
    }
  }

  const cuentas = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  // ── Inconsistencias de moneda (docs/tasks/64_multimoneda_completo.md §5.6) ──
  // Mismo permiso que el resto de esta pantalla — no es un recurso aparte.
  const puedeVerInconsistencias = usePuede('tesoreria.cuentas-bancarias.listar')
  const [showInconsistencias, setShowInconsistencias] = useState(false)
  const { data: inconsistencias, isLoading: inconsistenciasLoading } = useQuery({
    queryKey: ['cuentas-bancarias-inconsistencias-moneda'],
    queryFn: listInconsistenciasMoneda,
    enabled: showInconsistencias,
  })

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Cuentas Bancarias</>}
        description={data ? `${data.meta.total ?? 0} cuentas bancarias` : undefined}
        action={
          <>
            <RecargarButton />
            <button className="btn btn-navy" onClick={openCreate}>
              <Plus size={16} />
              Nueva Cuenta Bancaria
            </button>
          </>
        }
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
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
              <FilterField label="Estado">
                <select
                  className="ff-select"
                  value={estadoFilter}
                  onChange={(e) => { setEstadoFilter(e.target.value as CuentaBancariaEstado | ''); setPage(1) }}
                  style={{ width: 160 }}
                >
                  <option value="">Todos los estados</option>
                  {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </FilterField>
              <FilterField label="Tipo de cuenta">
                <select
                  className="ff-select"
                  value={tipoCuentaFilter}
                  onChange={(e) => { setTipoCuentaFilter(e.target.value); setPage(1) }}
                  style={{ width: 200 }}
                >
                  <option value="">Todos los tipos</option>
                  {(tiposCuenta ?? []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FilterField>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
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

      {puedeVerInconsistencias && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={16} /> Inconsistencias de Moneda
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-size-sm"
              onClick={() => setShowInconsistencias((v) => !v)}
            >
              {showInconsistencias ? 'Ocultar' : 'Revisar'}
            </button>
          </div>
          {showInconsistencias && (
            <>
              <div className="card-body" style={{ paddingBottom: 0 }}>
                <p className="ff-hint" style={{ marginTop: 0 }}>
                  Cuentas donde el campo espejo interno quedó desincronizado de la moneda real de su cuenta
                  contable.
                  Solo informativo: reeditar la cuenta (Editar → Guardar) la resincroniza sola.
                </p>
              </div>
              <div className="table-scroll">
                <table className="data-table navy-table">
                  <thead>
                    <tr>
                      <th>Cuenta Bancaria</th>
                      <th>Cuenta Contable</th>
                      <th>Moneda registrada</th>
                      <th>Moneda real (GL)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistenciasLoading
                      ? Array.from({ length: 2 }).map((_, i) => (
                          <tr key={i}>
                            {Array.from({ length: 4 }).map((__, j) => (
                              <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                            ))}
                          </tr>
                        ))
                      : (inconsistencias ?? []).length === 0
                        ? (
                            <tr>
                              <td colSpan={4}>
                                <div className="empty-state" style={{ padding: '20px 0' }}>
                                  <p className="empty-title">Sin inconsistencias</p>
                                  <p className="empty-sub">Todas las cuentas bancarias tienen su moneda sincronizada con su cuenta contable.</p>
                                </div>
                              </td>
                            </tr>
                          )
                        : inconsistencias!.map((i) => (
                            <tr key={i.id}>
                              <td style={{ fontWeight: 500 }}>{i.accountName}</td>
                              <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{i.account}</td>
                              <td style={{ color: 'var(--error-text)' }}>{i.customMoneda}</td>
                              <td style={{ fontWeight: 600 }}>{i.accountCurrency}</td>
                            </tr>
                          ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

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
                    <Controller
                      name="currency"
                      control={control}
                      render={({ field }) => (
                        // Siempre derivada de la cuenta contable elegida arriba, nunca editable
                        // libre — la moneda real de una cuenta bancaria es la de su cuenta GL
                        // (docs/tasks/64_multimoneda_completo.md §5.6). El backend igual la valida
                        // (BANK_ACCOUNT_CURRENCY_MISMATCH_GL) como defensa adicional.
                        <Select value={field.value} onValueChange={field.onChange} placeholder="Selecciona la cuenta contable primero" clearable={false} disabled>
                          {MONEDA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </Select>
                      )}
                    />
                    {errors.currency
                      ? <p className="ff-error">{errors.currency.message}</p>
                      : <p className="ff-hint">Se toma automáticamente de la moneda real de la cuenta contable elegida arriba.</p>}
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

                  <div className="ff-wrap">
                    <label className="ff-label">Plantilla de Impresión de Cheque</label>
                    <Controller
                      name="chequePrintTemplate"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Sin plantilla (comprobante genérico)">
                          {(chequePrintTemplates?.items ?? []).map((t) => (
                            <SelectItem key={t.bankName} value={t.bankName}>{t.bankName}</SelectItem>
                          ))}
                        </Select>
                      )}
                    />
                  </div>

                  {!editTarget && (
                    <div className="ff-wrap">
                      <label className="ff-label" htmlFor="cbBalanceInicial">Balance inicial</label>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="ff-wrap">
                    <label className={`ff-label${ultimoChequeRequerido ? ' ff-required' : ''}`} htmlFor="cbUltimoCheque">Último cheque</label>
                    <input
                      id="cbUltimoCheque"
                      className={`ff-input${errors.ultimoCheque ? ' ff-input-error' : ''}`}
                      type="number"
                      min="0"
                      step="0.01"
                      {...register('ultimoCheque', { valueAsNumber: true })}
                    />
                    {errors.ultimoCheque && <p className="ff-error">{errors.ultimoCheque.message}</p>}
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

                <div className="ff-wrap" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input id="cbChequesManuales" type="checkbox" {...register('chequesManuales')} />
                  <label className="ff-label" htmlFor="cbChequesManuales" style={{ margin: 0 }}>
                    Cheques manuales
                  </label>
                </div>
                <p className="ff-hint" style={{ marginTop: -8 }}>
                  {chequesManualesValue
                    ? 'Manual: usted digita el número en cada pago/emisión — el sistema solo valida que no se repita en esta cuenta.'
                    : 'Automático: el sistema asigna el número de cheque solo, a partir del último usado en esta cuenta.'}
                </p>

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
                        <strong>{formatMoney(balanceData.balanceInicial, balanceData.moneda)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Balance actual</span>
                        <strong>{formatMoney(balanceData.balance, balanceData.moneda)}</strong>
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
