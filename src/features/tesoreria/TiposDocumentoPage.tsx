import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listTiposDocumento,
  createTipoDocumento,
  updateTipoDocumento,
  disableTipoDocumento,
} from '@/shared/api/tesoreria'
import type { TipoDocumentoBancario, TesoreriaNaturaleza, TesoreriaTipoTransaccion } from '@/shared/api/types'
import { Plus, Pencil, Ban, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const PAGE_SIZE = 20

const NATURALEZAS: TesoreriaNaturaleza[] = [
  'Cheque',
  'Depósito',
  'Transferencia',
  'Transferencia interna',
  'Ajuste bancario',
  'Nota de débito',
  'Nota de crédito',
  'Otro',
]

// Sugerencia de UX (no validación bloqueante): estas naturalezas típicamente van con este
// tipoTransaccion. El backend no exige esta coherencia, solo valida las combinaciones absurdas.
const NATURALEZA_SUGIERE_TRANSACCION: Partial<Record<TesoreriaNaturaleza, TesoreriaTipoTransaccion>> = {
  Cheque: 'Crédito',
  'Depósito': 'Débito',
  'Transferencia': 'Débito',
  'Transferencia interna': 'Crédito',
}

const tipoDocumentoSchema = z.object({
  code: z.string().min(1, 'El código es requerido').max(10, 'Máximo 10 caracteres'),
  description: z.string().min(1, 'La descripción es requerida'),
  nature: z.enum(NATURALEZAS as [TesoreriaNaturaleza, ...TesoreriaNaturaleza[]], { message: 'Selecciona una naturaleza' }),
  transactionType: z.enum(['Débito', 'Crédito'], { message: 'Selecciona un tipo de transacción' }),
  defaultOffsetAccount: z.string().optional(),
  requiresParty: z.boolean(),
  enabled: z.boolean(),
  requiresNcf: z.boolean(),
  ncfPrefix: z.string().optional(),
  requiresFiscalClass: z.boolean(),
  requiresRnc: z.boolean(),
  comment: z.string().optional(),
})

type TipoDocumentoFormValues = z.infer<typeof tipoDocumentoSchema>

const DEFAULT_VALUES: TipoDocumentoFormValues = {
  code: '',
  description: '',
  nature: 'Otro',
  transactionType: 'Débito',
  defaultOffsetAccount: '',
  requiresParty: false,
  enabled: true,
  requiresNcf: false,
  ncfPrefix: '',
  requiresFiscalClass: false,
  requiresRnc: false,
  comment: '',
}

export default function TiposDocumentoPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [natureFilter, setNatureFilter] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TipoDocumentoBancario | null>(null)
  const [toDisable, setToDisable] = useState<TipoDocumentoBancario | null>(null)
  const { orderBy, sort } = useSortState()

  // El usuario puede tocar transactionType manualmente — si lo hace, dejamos de autocompletarlo
  // al cambiar nature. Se resetea cada vez que se abre el diálogo (ver openCreate/openEdit).
  const transactionTypeTouched = useRef(false)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tesoreria-tipos-documento', { search: debouncedSearch, natureFilter, enabledFilter, offset, orderBy }],
    queryFn: () =>
      listTiposDocumento({
        search: debouncedSearch || undefined,
        nature: (natureFilter as TesoreriaNaturaleza) || undefined,
        enabled: enabledFilter === 'all' ? undefined : enabledFilter === 'enabled',
        orderBy: orderBy || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TipoDocumentoFormValues>({
    resolver: zodResolver(tipoDocumentoSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const requiresNcf = watch('requiresNcf')
  const nature = watch('nature')

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['tesoreria-tipos-documento'] })
  }

  const createMutation = useMutation({
    mutationFn: createTipoDocumento,
    onSuccess: () => {
      toast.success('Tipo de documento creado')
      invalidate()
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el tipo de documento'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: TipoDocumentoFormValues }) => updateTipoDocumento(id, normalizePayload(d)),
    onSuccess: () => {
      toast.success('Tipo de documento actualizado')
      invalidate()
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar el tipo de documento'),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => disableTipoDocumento(id),
    onSuccess: () => {
      toast.success('Tipo de documento deshabilitado')
      invalidate()
      setToDisable(null)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al deshabilitar el tipo de documento')
      setToDisable(null)
    },
  })

  function normalizePayload(v: TipoDocumentoFormValues) {
    return {
      ...v,
      defaultOffsetAccount: v.defaultOffsetAccount || undefined,
      ncfPrefix: v.requiresNcf ? (v.ncfPrefix || undefined) : undefined,
      comment: v.comment || undefined,
    }
  }

  function openCreate() {
    transactionTypeTouched.current = false
    setEditTarget(null)
    reset(DEFAULT_VALUES)
    setDialogOpen(true)
  }

  function openEdit(t: TipoDocumentoBancario) {
    transactionTypeTouched.current = true // en edición no auto-sugerimos, ya viene configurado
    setEditTarget(t)
    reset({
      code: t.code,
      description: t.description,
      nature: t.nature,
      transactionType: t.transactionType,
      defaultOffsetAccount: t.defaultOffsetAccount ?? '',
      requiresParty: t.requiresParty,
      enabled: t.enabled,
      requiresNcf: t.requiresNcf,
      ncfPrefix: t.ncfPrefix ?? '',
      requiresFiscalClass: t.requiresFiscalClass,
      requiresRnc: t.requiresRnc,
      comment: t.comment ?? '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset(DEFAULT_VALUES)
  }

  function handleNatureChange(value: string) {
    const nv = value as TesoreriaNaturaleza
    setValue('nature', nv, { shouldDirty: true })
    if (!transactionTypeTouched.current) {
      const suggested = NATURALEZA_SUGIERE_TRANSACCION[nv]
      if (suggested) setValue('transactionType', suggested, { shouldDirty: true })
    }
  }

  function onSubmit(values: TipoDocumentoFormValues) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: values })
    } else {
      createMutation.mutate(normalizePayload(values))
    }
  }

  const tipos = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Tipos de Documento Bancario"
        description={data ? `${data.meta.total ?? 0} tipos de documento` : 'Catálogo de Tesorería'}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nuevo Tipo de Documento
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por código o descripción…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <FilterField label="Naturaleza">
            <Select value={natureFilter} onValueChange={(v) => { setNatureFilter(v); setPage(1) }} placeholder="Todas las naturalezas">
              {NATURALEZAS.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Estado">
            <Select
              value={enabledFilter}
              onValueChange={(v) => { setEnabledFilter(v as typeof enabledFilter); setPage(1) }}
              clearable={false}
            >
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="enabled">Habilitados</SelectItem>
              <SelectItem value="disabled">Deshabilitados</SelectItem>
            </Select>
          </FilterField>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Código" sortKey="code" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                <th>Descripción</th>
                <th>Naturaleza</th>
                <th>Tipo de Transacción</th>
                <th>Estado</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                          Error al cargar los tipos de documento
                        </td>
                      </tr>
                    )
                  : tipos.length === 0
                    ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="empty-state">
                              <p className="empty-title">Sin tipos de documento</p>
                              <p className="empty-sub">Crea el primer tipo de documento bancario.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : tipos.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{t.code}</td>
                          <td>{t.description}</td>
                          <td className="td-muted">{t.nature}</td>
                          <td className="td-muted">{t.transactionType}</td>
                          <td>
                            <span className={`badge ${t.enabled ? 'badge-success' : 'badge-muted'}`}>
                              {t.enabled ? 'Habilitado' : 'Deshabilitado'}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                            <ActionsMenu>
                              <ActionsMenuItem onClick={() => openEdit(t)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                              {t.enabled && (
                                <ActionsMenuItem onClick={() => setToDisable(t)}>
                                  <Ban size={14} /> Deshabilitar
                                </ActionsMenuItem>
                              )}
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
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Tipo de Documento' : 'Nuevo Tipo de Documento'}</h2>
              <button className="modal-close" type="button" onClick={closeDialog}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="ff-wrap" style={{ flex: 1 }}>
                    <label className="ff-label ff-required" htmlFor="tdCode">Código</label>
                    <input
                      id="tdCode"
                      className={`ff-input${errors.code ? ' ff-input-error' : ''}`}
                      placeholder="Ej: AZL"
                      style={{ textTransform: 'uppercase' }}
                      {...register('code')}
                    />
                    {errors.code && <p className="ff-error">{errors.code.message}</p>}
                    <p className="ff-hint">Se normaliza a mayúsculas automáticamente.</p>
                  </div>
                  <div className="ff-wrap" style={{ flex: 2 }}>
                    <label className="ff-label ff-required" htmlFor="tdDescription">Descripción</label>
                    <input
                      id="tdDescription"
                      className={`ff-input${errors.description ? ' ff-input-error' : ''}`}
                      placeholder="Ej: Pago de Azul"
                      {...register('description')}
                    />
                    {errors.description && <p className="ff-error">{errors.description.message}</p>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="ff-wrap" style={{ flex: 1 }}>
                    <label className="ff-label ff-required">Naturaleza</label>
                    <Controller
                      name="nature"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={handleNatureChange} clearable={false}>
                          {NATURALEZAS.map((n) => (
                            <SelectItem key={n} value={n}>{n}</SelectItem>
                          ))}
                        </Select>
                      )}
                    />
                  </div>
                  <div className="ff-wrap" style={{ flex: 1 }}>
                    <label className="ff-label ff-required">Tipo de Transacción</label>
                    <Controller
                      name="transactionType"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(v) => { transactionTypeTouched.current = true; field.onChange(v) }}
                          clearable={false}
                        >
                          <SelectItem value="Débito">Débito</SelectItem>
                          <SelectItem value="Crédito">Crédito</SelectItem>
                        </Select>
                      )}
                    />
                    {NATURALEZA_SUGIERE_TRANSACCION[nature] && !transactionTypeTouched.current && (
                      <p className="ff-hint">Sugerido para "{nature}" — puedes cambiarlo.</p>
                    )}
                  </div>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Cuenta Contrapartida por Defecto</label>
                  <Controller
                    name="defaultOffsetAccount"
                    control={control}
                    render={({ field }) => (
                      <AccountSelect
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Buscar cuenta contable…"
                      />
                    )}
                  />
                  <p className="ff-hint">
                    Se usa como contrapartida sugerida al registrar un documento de este tipo sin
                    beneficiario ni distribución explícita. Opcional.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="ff-check-wrap">
                    <input type="checkbox" className="ff-check" {...register('requiresParty')} />
                    Requiere beneficiario/origen (Payment Entry obligatorio)
                  </label>
                  <label className="ff-check-wrap">
                    <input type="checkbox" className="ff-check" {...register('requiresNcf')} />
                    Requiere NCF de terceros
                  </label>
                  {requiresNcf && (
                    <div className="ff-wrap" style={{ marginLeft: 24 }}>
                      <label className="ff-label" htmlFor="tdNcfPrefix">Prefijo NCF esperado</label>
                      <input id="tdNcfPrefix" className="ff-input" placeholder="Ej: B01" {...register('ncfPrefix')} />
                    </div>
                  )}
                  <label className="ff-check-wrap">
                    <input type="checkbox" className="ff-check" {...register('requiresFiscalClass')} />
                    Requiere clasificación fiscal 606
                  </label>
                  <label className="ff-check-wrap">
                    <input type="checkbox" className="ff-check" {...register('requiresRnc')} />
                    Requiere RNC del tercero
                  </label>
                  {editTarget && (
                    <label className="ff-check-wrap">
                      <input type="checkbox" className="ff-check" {...register('enabled')} />
                      Habilitado (visible en los selectores de Emisiones/Depósitos/Transferencias)
                    </label>
                  )}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="tdComment">Comentario</label>
                  <textarea id="tdComment" className="ff-input" rows={2} placeholder="Nota libre para el administrador" {...register('comment')} />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || (!isDirty && !!editTarget)}>
                  {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toDisable && (
        <div className="modal-overlay" onClick={() => setToDisable(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Deshabilitar tipo de documento?</h2>
              <button className="modal-close" type="button" onClick={() => setToDisable(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                <strong>{toDisable.code} — {toDisable.description}</strong> dejará de aparecer como
                opción en los formularios de Emisiones, Depósitos y Transferencias Internas. Los
                documentos históricos que ya lo usan no se ven afectados.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                No hay una acción de eliminar para este catálogo — solo deshabilitar. Puedes
                volver a habilitarlo editándolo.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setToDisable(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => disableMutation.mutate(toDisable.id)}
                disabled={disableMutation.isPending}
              >
                {disableMutation.isPending ? 'Deshabilitando…' : 'Deshabilitar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
