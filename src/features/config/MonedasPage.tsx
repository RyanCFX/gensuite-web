import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Trash2, Plus, RefreshCw, Calculator, Wallet } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import {
  listMonedas,
  habilitarMoneda,
  listTasasCambio,
  createTasaCambio,
  updateTasaCambio,
  deleteTasaCambio,
  sincronizarTasas,
  convertirMoneda,
} from '@/shared/api/monedas'
import { listCuentas, createCuenta } from '@/shared/api/cuentas'
import type { Moneda, MonedaCode, TasaCambio, ApiError } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { ConfirmModal } from '@/shared/ui/Modal'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatNumber } from '@/lib/formatters'

const MONEDA_OPTIONS: MonedaCode[] = ['DOP', 'USD', 'EUR']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Catálogo de monedas ────────────────────────────────────────────────────

function CatalogoMonedasSection() {
  const queryClient = useQueryClient()
  const puedeHabilitar = usePuede('monedas.habilitar')
  const [pendingToggle, setPendingToggle] = useState<Moneda | null>(null)
  // Moneda recién habilitada sin ninguna cuenta de Caja/Banco todavía — dispara el modal opcional
  // de docs/tasks/78_validar_cuenta_caja_al_habilitar_moneda.md. `null` = no mostrar nada.
  const [promptCuentaFor, setPromptCuentaFor] = useState<MonedaCode | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['monedas'], queryFn: listMonedas })

  const habilitarMutation = useMutation({
    mutationFn: ({ code, habilitada }: { code: MonedaCode; habilitada: boolean }) =>
      habilitarMoneda(code, { habilitada }),
    onSuccess: async (result) => {
      toast.success(result.enabled ? `${result.currency} habilitada` : `${result.currency} deshabilitada`)
      queryClient.invalidateQueries({ queryKey: ['monedas'] })
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
      setPendingToggle(null)
      // Solo al HABILITAR (nunca al deshabilitar, §3 del doc de la tarea) — verifica si ya existe
      // una cuenta de Caja/Banco en esta moneda; si no, ofrece crear una ahí mismo. Nunca bloquea
      // ni retrasa el toast de éxito de arriba: es un chequeo posterior e informativo.
      if (result.enabled) {
        try {
          const cuentas = await listCuentas()
          const yaExiste = cuentas.items.some(
            (c) => (c.accountType === 'Cash' || c.accountType === 'Bank') && c.currency === result.currency,
          )
          if (!yaExiste) setPromptCuentaFor(result.currency)
        } catch {
          // No hace falta molestar al usuario si este chequeo informativo falla — la moneda ya
          // quedó habilitada correctamente, que es lo que le importa al flujo principal.
        }
      }
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al cambiar el estado de la moneda')
      setPendingToggle(null)
    },
  })

  function handleToggleClick(m: Moneda) {
    if (m.esBase) return
    if (m.habilitada) {
      habilitarMutation.mutate({ code: m.code, habilitada: false })
      return
    }
    setPendingToggle(m)
  }

  return (
    <div className="card navy-table-card">
      <div className="card-header">
        <span className="card-title">Monedas</span>
      </div>
      <div className="table-scroll">
        <table className="data-table navy-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Símbolo</th>
              <th style={{ width: 140 }}>Habilitada</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : (data ?? []).map((m) => (
                  <tr key={m.code}>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{m.code}</td>
                    <td>{m.nombre}</td>
                    <td className="td-muted">{m.simbolo}</td>
                    <td>
                      <label
                        className="ff-check-wrap"
                        style={{ opacity: m.esBase || !puedeHabilitar ? 0.5 : 1, cursor: m.esBase || !puedeHabilitar ? 'default' : 'pointer' }}
                        title={m.esBase ? 'La moneda base nunca se deshabilita' : undefined}
                      >
                        <input
                          type="checkbox"
                          className="ff-check"
                          checked={m.habilitada}
                          disabled={m.esBase || !puedeHabilitar || habilitarMutation.isPending}
                          onChange={() => handleToggleClick(m)}
                        />
                        <span style={{ fontSize: 13 }}>{m.habilitada ? 'Sí' : 'No'}</span>
                      </label>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!pendingToggle}
        onClose={() => setPendingToggle(null)}
        onConfirm={() => pendingToggle && habilitarMutation.mutate({ code: pendingToggle.code, habilitada: true })}
        title={`¿Habilitar ${pendingToggle?.code}?`}
        description={`Esto creará las cuentas contables de Cuentas por Cobrar y por Pagar en ${pendingToggle?.code} para tu empresa. Puede tardar unos segundos. ¿Continuar?`}
        confirmLabel="Habilitar"
        variant="default"
        loading={habilitarMutation.isPending}
      />

      {promptCuentaFor && (
        <CuentaCajaBancoModal code={promptCuentaFor} onClose={() => setPromptCuentaFor(null)} />
      )}
    </div>
  )
}

// ─── Modal: crear cuenta de Caja/Banco tras habilitar una moneda extranjera ────
// docs/tasks/78_validar_cuenta_caja_al_habilitar_moneda.md — no bloqueante: el usuario puede
// cerrarlo sin crear nada, la moneda ya quedó habilitada de todas formas.

interface CuentaCajaBancoModalProps {
  code: MonedaCode
  onClose: () => void
}

function CuentaCajaBancoModal({ code, onClose }: CuentaCajaBancoModalProps) {
  const queryClient = useQueryClient()
  const [accountName, setAccountName] = useState(`Caja ${code}`)
  const [accountType, setAccountType] = useState<'Cash' | 'Bank'>('Cash')
  const [parentAccount, setParentAccount] = useState('')
  const [created, setCreated] = useState(false)

  const createMutation = useMutation({
    mutationFn: () => createCuenta({
      accountName: accountName.trim(),
      parentAccount,
      accountType,
      currency: code,
    }),
    onSuccess: () => {
      toast.success('Cuenta creada')
      queryClient.invalidateQueries({ queryKey: ['cuentas'] })
      queryClient.invalidateQueries({ queryKey: ['cuentas-tree'] })
      setCreated(true)
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al crear la cuenta'),
  })

  const canSubmit = !!accountName.trim() && !!parentAccount

  if (created) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 className="modal-title">Cuenta creada</h2>
            <button className="modal-close" type="button" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Recuerda vincularla a un método de pago (ej. "Efectivo {code}") en{' '}
              <Link to="/config/metodos-pago" onClick={onClose} style={{ fontWeight: 600, textDecoration: 'underline' }}>
                Configuración → Métodos de Pago
              </Link>{' '}
              para poder usarla al cobrar.
            </p>
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" onClick={onClose}>Listo</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={17} /> No tienes una cuenta de Caja o Banco en {code}
          </h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Vas a poder facturar en {code}, pero para poder <strong>cobrar</strong> esas facturas en
            caja necesitas una cuenta de Caja o Banco en esta moneda — sin ella, alguien podría
            configurar por error un método de pago apuntando a la cuenta de Cuentas por Cobrar, lo
            que rompe el cobro más adelante con un error confuso. ¿Quieres crear una cuenta de Caja
            o Banco en {code} ahora?
          </p>

          <div className="ff-wrap">
            <label className="ff-label ff-required">Nombre de la cuenta</label>
            <input
              className="ff-input"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder={`Caja ${code}`}
            />
          </div>

          <div className="ff-wrap">
            <label className="ff-label ff-required">Tipo</label>
            <Select value={accountType} onValueChange={(v) => setAccountType(v as 'Cash' | 'Bank')} clearable={false}>
              <SelectItem value="Cash">Caja</SelectItem>
              <SelectItem value="Bank">Banco</SelectItem>
            </Select>
          </div>

          <div className="ff-wrap">
            <label className="ff-label ff-required">Cuenta padre</label>
            <AccountSelect
              value={parentAccount}
              onChange={setParentAccount}
              rootType="Asset"
              groupOnly
              placeholder="Buscar grupo de cuentas de Activo…"
            />
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Moneda</label>
            <input className="ff-input" value={code} disabled />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Más tarde</button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creando…' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tasas de cambio ────────────────────────────────────────────────────────

const tasaSchema = z.object({
  from: z.enum(['DOP', 'USD', 'EUR']),
  to: z.enum(['DOP', 'USD', 'EUR']),
  rate: z.coerce.number().positive('Debe ser mayor a 0'),
  date: z.string().min(1, 'Requerida'),
})
type TasaFormValues = z.infer<typeof tasaSchema>

function TasasCambioSection() {
  const queryClient = useQueryClient()
  const puedeCrear = usePuede('monedas.tasas.crear')
  const puedeEditar = usePuede('monedas.tasas.editar')
  const puedeEliminar = usePuede('monedas.tasas.eliminar')
  const puedeSincronizar = usePuede('monedas.tasas.sincronizar')

  const [filterFrom, setFilterFrom] = useState<string>('')
  const [filterTo, setFilterTo] = useState<string>('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  // Reusa la misma query key que CatalogoMonedasSection — normalmente ya está en caché, no
  // dispara una llamada de red extra. Solo se usa para no ofrecer cargar una tasa nueva contra
  // una moneda deshabilitada (el filtro de fecha/histórico de abajo sí sigue mostrando las 3,
  // para no ocultar tasas ya cargadas de una moneda que se deshabilitó después).
  const { data: monedasCatalogo } = useQuery({ queryKey: ['monedas'], queryFn: listMonedas })
  const monedasHabilitadasOptions = MONEDA_OPTIONS.filter(
    (c) => !monedasCatalogo || monedasCatalogo.find((m) => m.code === c)?.habilitada,
  )

  const { data, isLoading } = useQuery({
    queryKey: ['monedas-tasas', filterFrom, filterTo, offset],
    queryFn: () => listTasasCambio({
      from: (filterFrom || undefined) as MonedaCode | undefined,
      to: (filterTo || undefined) as MonedaCode | undefined,
      limit,
      offset,
    }),
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TasaCambio | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TasaCambio | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TasaFormValues>({
    resolver: zodResolver(tasaSchema) as Resolver<TasaFormValues>,
    defaultValues: { from: 'USD', to: 'DOP', rate: 0, date: todayIso() },
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function openCreate() {
    setEditTarget(null)
    reset({ from: 'USD', to: 'DOP', rate: 0, date: todayIso() })
    setDialogOpen(true)
  }

  function openEdit(t: TasaCambio) {
    setEditTarget(t)
    reset({ from: t.from, to: t.to, rate: t.tasa, date: t.fecha })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: createTasaCambio,
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['monedas-tasas'] })
      closeDialog()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al cargar la tasa'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) => updateTasaCambio(id, { rate }),
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['monedas-tasas'] })
      closeDialog()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al actualizar la tasa'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTasaCambio(id),
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['monedas-tasas'] })
      setDeleteTarget(null)
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al eliminar la tasa')
      setDeleteTarget(null)
    },
  })

  const sincronizarMutation = useMutation({
    mutationFn: () => sincronizarTasas(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['monedas-tasas'] })
      const okList = result.actualizadas.map((a) => `${a.currency}→${a.base}: ${formatNumber(a.rate)}`).join(', ')
      if (result.errores.length === 0) {
        toast.success(result.actualizadas.length > 0 ? `Tasas actualizadas: ${okList}` : 'No hubo tasas para actualizar')
      } else if (result.actualizadas.length > 0) {
        toast.warning(`Actualizadas: ${okList}. Con error: ${result.errores.map((e) => e.currency).join(', ')}`)
      } else {
        toast.error(`No se pudo sincronizar: ${result.errores.map((e) => `${e.currency} (${e.error})`).join('; ')}`)
      }
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al sincronizar tasas'),
  })

  function onSubmit(values: TasaFormValues) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, rate: values.rate })
    } else {
      createMutation.mutate({ from: values.from, to: values.to, rate: values.rate, date: values.date })
    }
  }

  const items = data?.items ?? []
  const hasNextPage = items.length === limit

  return (
    <div className="card navy-table-card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <span className="card-title">Tasas de Cambio</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {puedeSincronizar && (
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => sincronizarMutation.mutate()}
              disabled={sincronizarMutation.isPending}
            >
              <RefreshCw size={14} className={sincronizarMutation.isPending ? 'spin' : ''} />
              {sincronizarMutation.isPending ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          )}
          {puedeCrear && (
            <button className="btn btn-navy btn-size-sm" onClick={openCreate}>
              <Plus size={14} /> Cargar tasa
            </button>
          )}
        </div>
      </div>

      <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 0 }}>
        <div style={{ minWidth: 140 }}>
          <Select value={filterFrom} onValueChange={(v) => { setFilterFrom(v); setOffset(0) }} placeholder="De (todas)">
            <SelectItem value="">Todas</SelectItem>
            {MONEDA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </Select>
        </div>
        <div style={{ minWidth: 140 }}>
          <Select value={filterTo} onValueChange={(v) => { setFilterTo(v); setOffset(0) }} placeholder="A (todas)">
            <SelectItem value="">Todas</SelectItem>
            {MONEDA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </Select>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table navy-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>De</th>
              <th>A</th>
              <th style={{ textAlign: 'right' }}>Tasa</th>
              <th>Compra</th>
              <th>Venta</th>
              <th style={{ width: 96 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : items.length === 0
                ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state">
                          <p className="empty-title">Sin tasas cargadas</p>
                          <p className="empty-sub">Carga la primera tasa de cambio para empezar a operar en moneda extranjera.</p>
                        </div>
                      </td>
                    </tr>
                  )
                : items.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDate(t.fecha)}</td>
                      <td style={{ fontWeight: 600 }}>{t.from}</td>
                      <td style={{ fontWeight: 600 }}>{t.to}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{t.tasa}</td>
                      <td className="td-muted">{t.forBuying ? 'Sí' : 'No'}</td>
                      <td className="td-muted">{t.forSelling ? 'Sí' : 'No'}</td>
                      <td className="actions-cell">
                        {(puedeEditar || puedeEliminar) && (
                          <ActionsMenu>
                            {puedeEditar && (
                              <ActionsMenuItem onClick={() => openEdit(t)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                            )}
                            {puedeEliminar && (
                              <ActionsMenuItem danger onClick={() => setDeleteTarget(t)}>
                                <Trash2 size={14} /> Eliminar
                              </ActionsMenuItem>
                            )}
                          </ActionsMenu>
                        )}
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>

      {(offset > 0 || hasNextPage) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button className="btn btn-secondary btn-size-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
            Anterior
          </button>
          <button className="btn btn-secondary btn-size-sm" disabled={!hasNextPage} onClick={() => setOffset(offset + limit)}>
            Siguiente
          </button>
        </div>
      )}

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Tasa' : 'Cargar Tasa'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-row form-row-3">
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">De</label>
                    <Select
                      value={watch('from')}
                      onValueChange={(v) => setValue('from', v as MonedaCode, { shouldDirty: true })}
                      disabled={!!editTarget}
                    >
                      {monedasHabilitadasOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </Select>
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">A</label>
                    <Select
                      value={watch('to')}
                      onValueChange={(v) => setValue('to', v as MonedaCode, { shouldDirty: true })}
                      disabled={!!editTarget}
                    >
                      {monedasHabilitadasOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </Select>
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="tasaFecha">Fecha</label>
                    <DatePicker
                      id="tasaFecha"
                      value={watch('date')}
                      onChange={(v) => setValue('date', v, { shouldDirty: true })}
                      disabled={!!editTarget}
                    />
                  </div>
                </div>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="tasaRate">Tasa</label>
                  <input
                    id="tasaRate"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    className={`ff-input${errors.rate ? ' ff-input-error' : ''}`}
                    placeholder="Ej: 60.50"
                    {...register('rate')}
                  />
                  {errors.rate && <p className="ff-error">{errors.rate.message}</p>}
                </div>
                {!editTarget && (
                  <p className="ff-hint" style={{ margin: 0 }}>
                    Si ya existe una tasa para este par en esta fecha exacta, se actualizará en vez de duplicarse.
                  </p>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar' : 'Cargar tasa'}
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

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="¿Eliminar esta tasa de cambio?"
        description={deleteTarget ? `Se eliminará la tasa ${deleteTarget.from} → ${deleteTarget.to} del ${formatDate(deleteTarget.fecha)}. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

// ─── Calculadora de conversión (widget) ─────────────────────────────────────

function ConvertidorSection() {
  const [monto, setMonto] = useState<number>(100)
  const [from, setFrom] = useState<MonedaCode>('USD')
  const [to, setTo] = useState<MonedaCode>('DOP')

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['monedas-convertir', monto, from, to],
    queryFn: () => convertirMoneda({ monto, from, to }),
    enabled: monto > 0 && from !== to,
    retry: false,
  })

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calculator size={16} /> Calculadora de Conversión
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="ff-wrap" style={{ maxWidth: 160 }}>
          <label className="ff-label">Monto</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="ff-input"
            value={monto || ''}
            onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="ff-wrap" style={{ maxWidth: 120 }}>
          <label className="ff-label">De</label>
          <Select value={from} onValueChange={(v) => setFrom(v as MonedaCode)}>
            {MONEDA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </Select>
        </div>
        <div className="ff-wrap" style={{ maxWidth: 120 }}>
          <label className="ff-label">A</label>
          <Select value={to} onValueChange={(v) => setTo(v as MonedaCode)}>
            {MONEDA_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </Select>
        </div>
        <div style={{ fontSize: 14, paddingBottom: 8 }}>
          {from === to
            ? null
            : isFetching
              ? <span className="spinner spinner-sm" />
              : isError
                ? <span style={{ color: 'var(--error-text)' }}>{(error as unknown as ApiError | null)?.message ?? 'No hay tasa disponible'}</span>
                : data
                  ? <strong>{formatNumber(data.resultado)} {to} <span className="td-muted" style={{ fontWeight: 400 }}>(tasa {data.tasa}, {data.origen === 'currency_exchange' ? 'cargada' : 'proveedor'})</span></strong>
                  : null}
        </div>
      </div>
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function MonedasPage() {
  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Monedas</>}
        description="Catálogo de monedas soportadas, tasas de cambio y calculadora de conversión"
        action={<RecargarButton />}
      />
      <CatalogoMonedasSection />
      <TasasCambioSection />
      <ConvertidorSection />
    </div>
  )
}
