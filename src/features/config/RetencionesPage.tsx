import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
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
import type { RetencionListItem, CreateRetencionDto } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const PAGE_SIZE = 20

const TAX_DEDUCTION_BASIS_OPTIONS = ['Gross Total', 'Net Total'] as const

const rateSchema = z.object({
  taxWithholdingRate: z.coerce.number({ invalid_type_error: 'La tasa es requerida' }).min(0, 'Debe ser >= 0'),
  fromDate: z.string().min(1, 'La fecha desde es requerida'),
  toDate: z.string().min(1, 'La fecha hasta es requerida'),
})

const retencionSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  taxDeductionBasis: z.string().optional(),
  account: z.string().optional(),
  rates: z.array(rateSchema).min(1, 'Agrega al menos una tasa'),
})

type RetencionFormValues = z.infer<typeof retencionSchema>

const emptyRate = { taxWithholdingRate: 0, fromDate: '', toDate: '' }

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

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RetencionFormValues>({
    resolver: zodResolver(retencionSchema),
    defaultValues: { name: '', taxDeductionBasis: '', account: '', rates: [emptyRate] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'rates' })

  useEffect(() => {
    if (editDetail) {
      reset({
        name: editDetail.categoryName,
        taxDeductionBasis: editDetail.taxDeductionBasis ?? '',
        account: editDetail.accounts?.[0]?.account ?? '',
        rates: (editDetail.rates ?? []).length > 0
          ? (editDetail.rates ?? []).map((r) => ({
              taxWithholdingRate: r.taxWithholdingRate,
              fromDate: r.fromDate?.slice(0, 10) ?? '',
              toDate: r.toDate?.slice(0, 10) ?? '',
            }))
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
        taxWithholdingRate: r.taxWithholdingRate,
        fromDate: r.fromDate,
        toDate: r.toDate,
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
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-box" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editId ? 'Editar Retención' : 'Nueva Retención'}</h2>
              <button className="modal-close" type="button" onClick={closeDialog}>×</button>
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
                      <select id="retBasis" className="ff-input" {...register('taxDeductionBasis')}>
                        <option value="">Sin especificar</option>
                        {TAX_DEDUCTION_BASIS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    <div className="ff-wrap">
                      <label className="ff-label">Cuenta contable</label>
                      <RetencionAccountField control={control} />
                    </div>

                    <div className="ff-wrap">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="ff-label ff-required">Tasas</label>
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-sm"
                          onClick={() => append({ ...emptyRate })}
                        >
                          <Plus size={14} /> Agregar tasa
                        </button>
                      </div>
                      {errors.rates?.message && <p className="ff-error">{errors.rates.message}</p>}
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Tasa (%)</th>
                              <th>Desde</th>
                              <th>Hasta</th>
                              <th style={{ width: 40 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {fields.map((field, index) => (
                              <tr key={field.id}>
                                <td>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className={`ff-input${errors.rates?.[index]?.taxWithholdingRate ? ' ff-input-error' : ''}`}
                                    {...register(`rates.${index}.taxWithholdingRate` as const)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="date"
                                    className={`ff-input${errors.rates?.[index]?.fromDate ? ' ff-input-error' : ''}`}
                                    {...register(`rates.${index}.fromDate` as const)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="date"
                                    className={`ff-input${errors.rates?.[index]?.toDate ? ' ff-input-error' : ''}`}
                                    {...register(`rates.${index}.toDate` as const)}
                                  />
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-size-icon-sm"
                                    onClick={() => remove(index)}
                                    disabled={fields.length <= 1}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || (!!editId && isLoadingDetail)}>
                  {isSubmitting ? 'Guardando…' : editId ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
import { useController, type Control } from 'react-hook-form'

function RetencionAccountField({ control }: { control: Control<RetencionFormValues> }) {
  const { field } = useController({ control, name: 'account' })
  return (
    <AccountSelect
      value={field.value ?? ''}
      onChange={field.onChange}
    />
  )
}
