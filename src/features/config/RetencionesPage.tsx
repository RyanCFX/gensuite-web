import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, useWatch, Controller, useController } from 'react-hook-form'
import type { Resolver, Control, UseFormRegister, FieldErrors } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listRetenciones,
  getRetencion,
  createRetencion,
  updateRetencion,
  deleteRetencion,
} from '@/shared/api/retenciones'
import { listTasasImpuesto } from '@/shared/api/config'
import type { RetencionListItem, CreateRetencionDto, TasaImpuesto } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'

const PAGE_SIZE = 20

const TAX_DEDUCTION_BASIS_OPTIONS = ['Gross Total', 'Net Total'] as const

// impuestoBaseId no se exige aquí (a nivel de item) porque en modo "fijo" el tramo conserva un
// array `componentes` de relleno sin usar — la exigencia real solo aplica en modo "catalogo" y
// se valida en el superRefine de abajo, item por item, para poder marcar el input exacto.
const componenteSchema = z.object({
  impuestoBaseId: z.string().optional(),
  factor: z.coerce.number().min(0, 'Debe ser >= 0').optional(),
})

// Convierte '' (input vacío) en undefined en vez de NaN, para poder distinguir "no capturado"
// de "capturó 0" al validar el modo % fijo.
const numberOrUndefined = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().optional(),
)

// Cada tramo usa un modo u otro, nunca ambos — "catalogo" liga impuestos del catálogo
// (componentes), "fijo" es un % fijo con descripción libre opcional.
const rateSchema = z.object({
  mode: z.enum(['catalogo', 'fijo']),
  componentes: z.array(componenteSchema).optional(),
  valorFijo: numberOrUndefined,
  descripcion: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.mode === 'catalogo') {
    const comps = val.componentes ?? []
    if (comps.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Agrega al menos un impuesto', path: ['componentes'] })
    }
    comps.forEach((c, i) => {
      if (!c.impuestoBaseId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecciona un impuesto', path: ['componentes', i, 'impuestoBaseId'] })
      }
    })
  } else if (val.valorFijo === undefined || Number.isNaN(val.valorFijo)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ingresa el % fijo del tramo', path: ['valorFijo'] })
  }
})

const retencionSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  taxDeductionBasis: z.string().optional(),
  account: z.string().optional(),
  rates: z.array(rateSchema).min(1, 'Agrega al menos un tramo'),
})

type RetencionFormValues = z.infer<typeof retencionSchema>
type RateMode = RetencionFormValues['rates'][number]['mode']

const emptyComponente = { impuestoBaseId: '', factor: 100 }
const emptyRate: RetencionFormValues['rates'][number] = {
  mode: 'catalogo',
  componentes: [{ ...emptyComponente }],
  valorFijo: undefined,
  descripcion: '',
  fromDate: '',
  toDate: '',
}

export default function RetencionesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<RetencionListItem | null>(null)
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['retenciones', { search: debouncedSearch, offset, orderBy }],
    queryFn: () => listRetenciones({
      search: debouncedSearch || undefined,
      orderBy: orderBy || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const { data: editDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['retencion', editId],
    queryFn: () => getRetencion(editId as string),
    enabled: !!editId,
  })

  const { data: tasasImpuesto } = useQuery({ queryKey: ['tasas-impuesto'], queryFn: listTasasImpuesto })

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
  } = useForm<RetencionFormValues>({
    resolver: zodResolver(retencionSchema) as Resolver<RetencionFormValues>,
    defaultValues: { name: '', taxDeductionBasis: '', account: '', rates: [emptyRate] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'rates' })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  useEffect(() => {
    if (editDetail) {
      reset({
        name: editDetail.categoryName,
        taxDeductionBasis: editDetail.taxDeductionBasis ?? '',
        account: editDetail.accounts?.[0]?.account ?? '',
        rates: (editDetail.rates ?? []).length > 0
          ? (editDetail.rates ?? []).map((r) => {
              const isFijo = !r.componentes || r.componentes.length === 0
              return {
                mode: (isFijo ? 'fijo' : 'catalogo') as RateMode,
                componentes: isFijo
                  ? [{ ...emptyComponente }]
                  : r.componentes.map((c) => ({ impuestoBaseId: c.impuestoBaseId, factor: c.factor ?? 100 })),
                valorFijo: isFijo ? (r.valorFijo ?? r.taxWithholdingRate) : undefined,
                descripcion: r.descripcion ?? '',
                fromDate: r.fromDate?.slice(0, 10) ?? '',
                toDate: r.toDate?.slice(0, 10) ?? '',
              }
            })
          : [emptyRate],
      })
    }
  }, [editDetail, reset])

  const createMutation = useMutation({
    mutationFn: createRetencion,
    onSuccess: () => {
      toast.success('Retención creada')
      queryClient.invalidateQueries({ queryKey: ['retenciones'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la retención'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<CreateRetencionDto> }) => updateRetencion(id, d),
    onSuccess: () => {
      toast.success('Retención actualizada')
      queryClient.invalidateQueries({ queryKey: ['retenciones'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la retención'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRetencion(id),
    onSuccess: () => {
      toast.success('Retención eliminada')
      queryClient.invalidateQueries({ queryKey: ['retenciones'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar la retención'),
  })

  function openCreate() {
    setEditId(null)
    reset({ name: '', taxDeductionBasis: '', account: '', rates: [emptyRate] })
    setDialogOpen(true)
  }

  function openEdit(r: RetencionListItem) {
    setEditId(r.id)
    reset({ name: r.categoryName, taxDeductionBasis: r.taxDeductionBasis ?? '', account: '', rates: [emptyRate] })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditId(null)
    reset({ name: '', taxDeductionBasis: '', account: '', rates: [emptyRate] })
  }

  function onSubmit(values: RetencionFormValues) {
    const payload: CreateRetencionDto = {
      name: values.name,
      taxDeductionBasis: values.taxDeductionBasis || undefined,
      account: values.account || undefined,
      rates: values.rates.map((r) => ({
        ...(r.mode === 'catalogo'
          ? {
              componentes: (r.componentes ?? []).map((c) => ({
                impuestoBaseId: c.impuestoBaseId,
                factor: c.factor || 100,
              })),
            }
          : {
              valorFijo: r.valorFijo,
              ...(r.descripcion ? { descripcion: r.descripcion } : {}),
            }),
        ...(r.fromDate ? { fromDate: r.fromDate } : {}),
        ...(r.toDate ? { toDate: r.toDate } : {}),
      })),
    }
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const retenciones = data?.items ?? []
  const totalPages = data?.meta ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Retenciones"
        description={data?.meta ? `${data.meta.total ?? 0} categorías de retención` : undefined}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nueva Retención
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
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Nombre" sortKey="categoryName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                <th>Base de deducción</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 3 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                          Error al cargar retenciones
                        </td>
                      </tr>
                    )
                  : retenciones.length === 0
                    ? (
                        <tr>
                          <td colSpan={3}>
                            <div className="empty-state">
                              <p className="empty-title">Sin retenciones</p>
                              <p className="empty-sub">Crea la primera categoría de retención (ITBIS/ISR).</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : retenciones.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.categoryName}</td>
                          <td className="td-muted">{r.taxDeductionBasis || '—'}</td>
                          <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                            <ActionsMenu>
                              <ActionsMenuItem onClick={() => openEdit(r)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                              <ActionsMenuItem onClick={() => setToDelete(r)}>
                                <Trash2 size={14} /> Eliminar
                              </ActionsMenuItem>
                            </ActionsMenu>
                          </td>
                        </tr>
                      ))}
            </tbody>
          </table>
        </div>

        {data?.meta && data.meta.total > PAGE_SIZE && (
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
          <div className="modal-box" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editId ? 'Editar Retención' : 'Nueva Retención'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {editId && isLoadingDetail ? (
                  <p className="ff-hint">Cargando detalle…</p>
                ) : (
                  <>
                    <div className="ff-wrap">
                      <label className="ff-label ff-required" htmlFor="retName">Nombre</label>
                      <input
                        id="retName"
                        className={`ff-input${errors.name ? ' ff-input-error' : ''}`}
                        placeholder='Ej: "Retención ITBIS Servicios 30%"'
                        {...register('name')}
                      />
                      {errors.name && <p className="ff-error">{errors.name.message}</p>}
                    </div>

                    <div className="ff-wrap">
                      <label className="ff-label" htmlFor="retBasis">Base de deducción</label>
                      <Controller
                        name="taxDeductionBasis"
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Sin especificar">
                            {TAX_DEDUCTION_BASIS_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </Select>
                        )}
                      />
                    </div>

                    <div className="ff-wrap">
                      <label className="ff-label">Cuenta contable</label>
                      <RetencionAccountField control={control} />
                    </div>

                    <div className="ff-wrap">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="ff-label ff-required">Tramos</label>
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-sm"
                          onClick={() => append({ ...emptyRate, componentes: [{ ...emptyComponente }] })}
                        >
                          <Plus size={14} /> Agregar tramo
                        </button>
                      </div>
                      {errors.rates?.message && <p className="ff-error">{errors.rates.message}</p>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {fields.map((field, index) => (
                          <RateRow
                            key={field.id}
                            index={index}
                            control={control}
                            register={register}
                            errors={errors}
                            tasasImpuesto={tasasImpuesto ?? []}
                            onRemoveRate={() => remove(index)}
                            canRemoveRate={fields.length > 1}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || (!!editId && isLoadingDetail)}>
                  {isSubmitting ? 'Guardando…' : editId ? 'Guardar' : 'Crear'}
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
              <h2 className="modal-title">¿Eliminar retención?</h2>
              <button className="modal-close" type="button" onClick={() => setToDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará <strong>{toDelete.categoryName}</strong>. Esta acción no se puede deshacer.
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
    </div>
  )
}

// Small wrapper so AccountSelect (controlled value/onChange) plugs into react-hook-form control.
function RetencionAccountField({ control }: { control: Control<RetencionFormValues> }) {
  const { field } = useController({ control, name: 'account' })
  return (
    <AccountSelect
      value={field.value ?? ''}
      onChange={field.onChange}
    />
  )
}

// Un tramo de retención: N impuestos referenciados (con su factor) + vigencia opcional.
// useFieldArray para `componentes` vive aquí (no en el padre) porque los hooks de RHF por
// índice de un array anidado deben llamarse desde un componente propio por fila.
function RateRow({
  index,
  control,
  register,
  errors,
  tasasImpuesto,
  onRemoveRate,
  canRemoveRate,
}: {
  index: number
  control: Control<RetencionFormValues>
  register: UseFormRegister<RetencionFormValues>
  errors: FieldErrors<RetencionFormValues>
  tasasImpuesto: TasaImpuesto[]
  onRemoveRate: () => void
  canRemoveRate: boolean
}) {
  const { fields: compFields, append: appendComp, remove: removeComp } = useFieldArray({
    control,
    name: `rates.${index}.componentes` as const,
  })
  const componentesValues = useWatch({ control, name: `rates.${index}.componentes` as const }) ?? []
  const mode = useWatch({ control, name: `rates.${index}.mode` as const })
  const descripcionValue = useWatch({ control, name: `rates.${index}.descripcion` as const })

  // Preview visual con las tasas ya cargadas del catálogo — el backend recalcula el valor real al guardar.
  const previewTasa = componentesValues.reduce((sum, c) => {
    const base = tasasImpuesto.find((t) => t.id === c?.impuestoBaseId)
    if (!base || base.tasa == null) return sum
    return sum + (Number(c?.factor) || 100) / 100 * base.tasa
  }, 0)

  const rateErrors = errors.rates?.[index]

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Tramo {index + 1}</span>
          {mode === 'fijo' && <span className="badge badge-info">% Fijo</span>}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-size-icon-sm"
          style={{ color: 'var(--icon-muted)' }}
          onClick={onRemoveRate}
          disabled={!canRemoveRate}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="ff-wrap" style={{ marginBottom: 8 }}>
        <label className="ff-label">Modo</label>
        <Controller
          name={`rates.${index}.mode` as const}
          control={control}
          render={({ field }) => (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn btn-size-sm ${field.value === 'catalogo' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => field.onChange('catalogo')}
              >
                Por impuestos del catálogo
              </button>
              <button
                type="button"
                className={`btn btn-size-sm ${field.value === 'fijo' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => field.onChange('fijo')}
              >
                % Fijo
              </button>
            </div>
          )}
        />
      </div>

      {mode === 'catalogo' ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {compFields.map((cf, cIdx) => (
              <div key={cf.id}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Controller
                      name={`rates.${index}.componentes.${cIdx}.impuestoBaseId` as const}
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange} placeholder="Seleccionar impuesto…">
                          {tasasImpuesto.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.nombre}{t.tasa != null ? ` — ${t.tasa}%` : ''}
                            </SelectItem>
                          ))}
                        </Select>
                      )}
                    />
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="100"
                    className="ff-input"
                    style={{ width: 90 }}
                    {...register(`rates.${index}.componentes.${cIdx}.factor` as const)}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-size-icon-sm"
                    onClick={() => removeComp(cIdx)}
                    disabled={compFields.length <= 1}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {rateErrors?.componentes?.[cIdx]?.impuestoBaseId?.message && (
                  <p className="ff-error">{rateErrors.componentes[cIdx]?.impuestoBaseId?.message}</p>
                )}
              </div>
            ))}
            {rateErrors?.componentes?.message && <p className="ff-error">{rateErrors.componentes.message}</p>}
            <button
              type="button"
              className="btn btn-secondary btn-size-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => appendComp({ ...emptyComponente })}
            >
              <Plus size={13} /> Agregar impuesto
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            Tasa efectiva (preview): <strong>{previewTasa.toFixed(2)}%</strong> — el valor real lo calcula el servidor al guardar.
          </p>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          <div className="form-row">
            <div className="ff-wrap" style={{ marginBottom: 0 }}>
              <label className="ff-label ff-required">% Fijo</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej: 10"
                className={`ff-input${rateErrors?.valorFijo ? ' ff-input-error' : ''}`}
                {...register(`rates.${index}.valorFijo` as const)}
              />
              {rateErrors?.valorFijo?.message && <p className="ff-error">{rateErrors.valorFijo.message}</p>}
            </div>
            <div className="ff-wrap" style={{ marginBottom: 0 }}>
              <label className="ff-label">Descripción</label>
              <input
                type="text"
                placeholder="Descripción del tramo (opcional)"
                className="ff-input"
                {...register(`rates.${index}.descripcion` as const)}
              />
            </div>
          </div>
          {descripcionValue && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{descripcionValue}</p>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="ff-wrap" style={{ marginBottom: 0 }}>
          <label className="ff-label">Desde</label>
          <Controller
            name={`rates.${index}.fromDate` as const}
            control={control}
            render={({ field }) => (
              <DatePicker
                value={field.value ?? ''}
                onChange={field.onChange}
                className="ff-input"
                clearable
                placeholder="Sin límite inferior"
                error={!!rateErrors?.fromDate}
              />
            )}
          />
        </div>
        <div className="ff-wrap" style={{ marginBottom: 0 }}>
          <label className="ff-label">Hasta</label>
          <Controller
            name={`rates.${index}.toDate` as const}
            control={control}
            render={({ field }) => (
              <DatePicker
                value={field.value ?? ''}
                onChange={field.onChange}
                className="ff-input"
                clearable
                placeholder="Sin límite superior"
                error={!!rateErrors?.toDate}
              />
            )}
          />
        </div>
      </div>
    </div>
  )
}
