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
import { Plus, Pencil, Ban, Search, ChevronLeft, ChevronRight, ReceiptText, CircleCheck, ArrowDownToLine, ArrowUpFromLine, FileWarning, SlidersHorizontal, X } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import './TiposDocumento.css'

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

function requirementSummary(t: TipoDocumentoBancario): string {
  const parts: string[] = []
  if (t.requiresParty) parts.push('Tercero')
  if (t.requiresNcf) parts.push(t.ncfPrefix ? `NCF ${t.ncfPrefix}` : 'NCF')
  if (t.requiresFiscalClass) parts.push('Clase 606')
  if (t.requiresRnc) parts.push('RNC')
  return parts.length ? parts.join(' · ') : '—'
}

export default function TiposDocumentoPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [natureFilter, setNatureFilter] = useState('')
  const [txFilter, setTxFilter] = useState<'Débito' | 'Crédito' | ''>('')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TipoDocumentoBancario | null>(null)
  const [toDisable, setToDisable] = useState<TipoDocumentoBancario | null>(null)
  const { orderBy, sort } = useSortState()

  // El usuario puede tocar transactionType manualmente — si lo hace, dejamos de autocompletarlo
  // al cambiar nature. Se resetea cada vez que se abre el diálogo (ver openCreate/openEdit).
  const transactionTypeTouched = useRef(false)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tesoreria-tipos-documento', { search: debouncedSearch, natureFilter, txFilter, enabledFilter, offset, orderBy }],
    queryFn: () =>
      listTiposDocumento({
        search: debouncedSearch || undefined,
        nature: (natureFilter as TesoreriaNaturaleza) || undefined,
        transactionType: txFilter || undefined,
        enabled: enabledFilter === 'all' ? undefined : enabledFilter === 'enabled',
        orderBy: orderBy || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  // Stats del catálogo completo (sin filtros) para el KPI strip — el catálogo
  // pre-sembrado trae 8 registros y rara vez pasa de unas decenas, así que un
  // limit alto en una sola llamada es suficiente y barato.
  const { data: stats } = useQuery({
    queryKey: ['tesoreria-tipos-documento-stats'],
    queryFn: () => listTiposDocumento({ limit: 500 }),
    staleTime: 60_000,
  })
  const all = stats?.items ?? []
  const totalCat = stats?.meta.total ?? all.length
  const enabledCount = all.filter((t) => t.enabled).length
  const debitCount = all.filter((t) => t.transactionType === 'Débito').length
  const creditCount = all.filter((t) => t.transactionType === 'Crédito').length
  const ncfCount = all.filter((t) => t.requiresNcf).length

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
  const liveCode = (watch('code') || '').toUpperCase()
  const liveDescription = watch('description') || ''
  const liveTx = watch('transactionType')

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

  function clearFilters() {
    setSearch('')
    setNatureFilter('')
    setTxFilter('')
    setEnabledFilter('all')
    setPage(1)
  }

  const tipos = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1
  const activeMoreFiltersCount = [natureFilter, txFilter, enabledFilter === 'all' ? '' : enabledFilter].filter((v) => v !== '').length

  function clearMoreFilters() {
    setNatureFilter('')
    setTxFilter('')
    setEnabledFilter('all')
    setPage(1)
  }

  return (
    <div className="page-container tdoc-page">
      <PageHeader
        overline="Configuración · Tesorería"
        title={
          <span className="tdoc-title-row">
            <span><span className="page-title-dot" />Tipos de Documento Bancario</span>
            <span className="tdoc-badges">
              <span className="badge badge-neutral">{totalCat} en catálogo</span>
              <span className="badge badge-success">{enabledCount} habilitados</span>
              {ncfCount > 0 && <span className="badge badge-warning">{ncfCount} con NCF</span>}
            </span>
          </span>
        }
        description="Catálogo que alimenta los selectores de Emisiones, Depósitos y Transferencias Internas"
        action={
          <>
            <RecargarButton />
            <button className="btn btn-navy" onClick={openCreate}>
              <Plus size={16} />
              Nuevo Tipo de Documento
            </button>
          </>
        }
      />

      {/* ── KPI strip: cada tarjeta filtra la vista ── */}
      <div className="tdoc-kpis">
        <button
          type="button"
          className="tdoc-kpi"
          style={{ '--i': 0 } as React.CSSProperties}
          data-active={!natureFilter && !txFilter && enabledFilter === 'all' ? '' : undefined}
          onClick={clearFilters}
          title="Ver todo el catálogo"
        >
          <div className="tdoc-kpi-top">
            <span className="tdoc-kpi-icon"><ReceiptText size={14} /></span>
            <span className="tdoc-kpi-label">Catálogo</span>
          </div>
          <div className="tdoc-kpi-value">{stats ? totalCat : '—'}<small> tipos</small></div>
          <div className="tdoc-kpi-foot">Clic para limpiar filtros</div>
        </button>
        <button
          type="button"
          className="tdoc-kpi"
          style={{ '--i': 1 } as React.CSSProperties}
          data-active={enabledFilter === 'enabled' ? '' : undefined}
          onClick={() => { setEnabledFilter((f) => (f === 'enabled' ? 'all' : 'enabled')); setPage(1) }}
          title="Filtrar habilitados"
        >
          <div className="tdoc-kpi-top">
            <span className="tdoc-kpi-icon"><CircleCheck size={14} /></span>
            <span className="tdoc-kpi-label">Habilitados</span>
          </div>
          <div className="tdoc-kpi-value">{stats ? enabledCount : '—'}<small> de {stats ? totalCat : '—'}</small></div>
          <div className="tdoc-kpi-foot">{stats && totalCat - enabledCount > 0 ? `${totalCat - enabledCount} deshabilitados` : 'Todo el catálogo activo'}</div>
        </button>
        <button
          type="button"
          className="tdoc-kpi"
          style={{ '--i': 2 } as React.CSSProperties}
          data-active={txFilter === 'Débito' ? '' : undefined}
          onClick={() => { setTxFilter((f) => (f === 'Débito' ? '' : 'Débito')); setPage(1) }}
          title="Filtrar entradas (débito)"
        >
          <div className="tdoc-kpi-top">
            <span className="tdoc-kpi-icon"><ArrowDownToLine size={14} /></span>
            <span className="tdoc-kpi-label">Débito · entradas</span>
          </div>
          <div className="tdoc-kpi-value">{stats ? debitCount : '—'}<small> tipos</small></div>
          <div className="tdoc-kpi-foot">Depósitos, transferencias recibidas…</div>
        </button>
        <button
          type="button"
          className="tdoc-kpi"
          style={{ '--i': 3 } as React.CSSProperties}
          data-active={txFilter === 'Crédito' ? '' : undefined}
          onClick={() => { setTxFilter((f) => (f === 'Crédito' ? '' : 'Crédito')); setPage(1) }}
          title="Filtrar salidas (crédito)"
        >
          <div className="tdoc-kpi-top">
            <span className="tdoc-kpi-icon"><ArrowUpFromLine size={14} /></span>
            <span className="tdoc-kpi-label">Crédito · salidas</span>
          </div>
          <div className="tdoc-kpi-value">{stats ? creditCount : '—'}<small> tipos</small></div>
          <div className="tdoc-split" style={{ marginTop: 2 }}>
            <span className="tdoc-split-deb" style={{ width: `${totalCat ? (debitCount / totalCat) * 100 : 0}%` }} />
            <span className="tdoc-split-cred" style={{ width: `${totalCat ? (creditCount / totalCat) * 100 : 0}%` }} />
          </div>
          <div className="tdoc-kpi-foot">Cheques, pagos, notas de débito…</div>
        </button>
      </div>

      <div className="card filter-card-navy">
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
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
              <FilterField label="Transacción">
                <Select value={txFilter} onValueChange={(v) => { setTxFilter(v as typeof txFilter); setPage(1) }} placeholder="Débito y Crédito">
                  <SelectItem value="Débito">Débito · entradas</SelectItem>
                  <SelectItem value="Crédito">Crédito · salidas</SelectItem>
                </Select>
              </FilterField>
            </div>
            <div className="filter-bar-right">
              <button
                type="button"
                className="btn btn-secondary btn-size-sm"
                onClick={() => setMoreFiltersOpen(true)}
              >
                <SlidersHorizontal size={14} />
                Más filtros
                {activeMoreFiltersCount > 0 && <span className="badge badge-brand" style={{ marginLeft: 2 }}>{activeMoreFiltersCount}</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <SortableTh label="Código" sortKey="code" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                <th>Descripción</th>
                <th>Naturaleza</th>
                <th>Transacción</th>
                <th>Requisitos</th>
                <th>Estado</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                          Error al cargar los tipos de documento
                        </td>
                      </tr>
                    )
                  : tipos.length === 0
                    ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty-state">
                              <p className="empty-title">Sin tipos de documento</p>
                              <p className="empty-sub">Ningún registro coincide con los filtros — o crea el primero del catálogo.</p>
                              <button className="btn btn-navy btn-size-sm" style={{ marginTop: 12 }} onClick={openCreate}>
                                <Plus size={14} />Nuevo Tipo de Documento
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    : tipos.map((t) => (
                        <tr key={t.id}>
                          <td className="tdoc-code">{t.code}</td>
                          <td>
                            <span style={{ fontWeight: 500 }}>{t.description}</span>
                            {t.requiresNcf && <span className="badge badge-warning" style={{ marginLeft: 6 }}>NCF{t.ncfPrefix ? ` ${t.ncfPrefix}` : ''}</span>}
                          </td>
                          <td><span className="badge badge-neutral">{t.nature}</span></td>
                          <td>
                            <span className={`badge ${t.transactionType === 'Débito' ? 'badge-success' : 'badge-info'}`}>
                              {t.transactionType}
                            </span>
                          </td>
                          <td className="td-muted">{requirementSummary(t)}</td>
                          <td>
                            <span className={`badge ${t.enabled ? 'badge-success' : 'badge-error'}`}>
                              <span className="badge-dot" />
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

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de tipos de documento"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Ver resultados</button>
          </>
        }
      >
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
        <p className="ff-hint">Naturaleza y Transacción viven en la barra principal; el buscador filtra por código o descripción.</p>
      </Drawer>

      {dialogOpen && (
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-box tdoc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-head">
              <div>
                <h2 className="modal-title">{editTarget ? 'Editar Tipo de Documento' : 'Nuevo Tipo de Documento'}</h2>
                <p className="modal-sub">{editTarget ? `${editTarget.code} — ${editTarget.description}` : 'Define cómo se comporta en Emisiones, Depósitos y Transferencias'}</p>
              </div>
              <button className="modal-close" type="button" onClick={closeDialog}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Vista previa en vivo */}
                <div className="tdoc-preview">
                  <span className="tdoc-preview-code">{liveCode || '···'}</span>
                  <span className="tdoc-preview-desc">{liveDescription || 'Sin descripción'}</span>
                  <span className="tdoc-preview-chips">
                    <span className="badge badge-neutral">{nature}</span>
                    <span className={`badge ${liveTx === 'Débito' ? 'badge-success' : 'badge-info'}`}>{liveTx}</span>
                  </span>
                </div>

                <div>
                  <div className="ff-section-divider" style={{ marginBottom: 12 }}>Identificación</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="ff-wrap" style={{ flex: 1 }}>
                      <label className="ff-label ff-required" htmlFor="tdCode">
                        Código
                        <FieldTooltip>Se normaliza a mayúsculas automáticamente.</FieldTooltip>
                      </label>
                      <input
                        id="tdCode"
                        className={`ff-input${errors.code ? ' ff-input-error' : ''}`}
                        placeholder="Ej: AZL"
                        style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                        {...register('code')}
                      />
                      {errors.code && <p className="ff-error">{errors.code.message}</p>}
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
                </div>

                <div>
                  <div className="ff-section-divider" style={{ marginBottom: 12 }}>Clasificación</div>
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
                            <SelectItem value="Débito">Débito · entradas</SelectItem>
                            <SelectItem value="Crédito">Crédito · salidas</SelectItem>
                          </Select>
                        )}
                      />
                      {NATURALEZA_SUGIERE_TRANSACCION[nature] && !transactionTypeTouched.current && (
                        <p className="ff-hint">Sugerido para "{nature}" — puedes cambiarlo.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="ff-section-divider" style={{ marginBottom: 12 }}>Contrapartida</div>
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Cuenta Contrapartida por Defecto
                      <FieldTooltip>
                        Se usa como contrapartida sugerida al registrar un documento de este tipo sin
                        beneficiario ni distribución explícita. Opcional.
                      </FieldTooltip>
                    </label>
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
                  </div>
                </div>

                <div>
                  <div className="ff-section-divider" style={{ marginBottom: 12 }}>Requisitos al registrar</div>
                  <div className="tdoc-req-grid">
                    <label className="tdoc-req" data-on={watch('requiresParty') ? '' : undefined}>
                      <input type="checkbox" className="ff-check" {...register('requiresParty')} />
                      <span><span className="tdoc-req-title">Tercero obligatorio</span><br /><span className="tdoc-req-sub">Exige Payment Entry con beneficiario u origen.</span></span>
                    </label>
                    <label className="tdoc-req" data-on={watch('requiresRnc') ? '' : undefined}>
                      <input type="checkbox" className="ff-check" {...register('requiresRnc')} />
                      <span><span className="tdoc-req-title">RNC del tercero</span><br /><span className="tdoc-req-sub">Pide el RNC al registrar el documento.</span></span>
                    </label>
                    <label className="tdoc-req tdoc-req-ncf" data-on={requiresNcf ? '' : undefined}>
                      <input type="checkbox" className="ff-check" {...register('requiresNcf')} />
                      <span><span className="tdoc-req-title">NCF de terceros</span><br /><span className="tdoc-req-sub">Para documentos que sustentan costos y gastos ante la DGII.</span></span>
                    </label>
                    {requiresNcf && (
                      <div className="ff-wrap" style={{ gridColumn: '1 / -1', marginLeft: 4 }}>
                        <label className="ff-label" htmlFor="tdNcfPrefix">Prefijo NCF esperado</label>
                        <input id="tdNcfPrefix" className="ff-input" placeholder="Ej: B01" {...register('ncfPrefix')} />
                      </div>
                    )}
                    <label className="tdoc-req" data-on={watch('requiresFiscalClass') ? '' : undefined}>
                      <input type="checkbox" className="ff-check" {...register('requiresFiscalClass')} />
                      <span><span className="tdoc-req-title">Clasificación 606</span><br /><span className="tdoc-req-sub">Exige clasificar el gasto para el reporte DGII.</span></span>
                    </label>
                    {editTarget && (
                      <label className="tdoc-req" data-on={watch('enabled') ? '' : undefined}>
                        <input type="checkbox" className="ff-check" {...register('enabled')} />
                        <span><span className="tdoc-req-title">Habilitado</span><br /><span className="tdoc-req-sub">Visible en Emisiones, Depósitos y Transferencias.</span></span>
                      </label>
                    )}
                  </div>
                </div>

                <div>
                  <div className="ff-section-divider" style={{ marginBottom: 12 }}>Notas</div>
                  <div className="ff-wrap">
                    <label className="ff-label" htmlFor="tdComment">Comentario interno</label>
                    <textarea id="tdComment" className="ff-input" rows={2} placeholder="Nota libre para el administrador" {...register('comment')} />
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={closeDialog}>Cancelar</button>
                <button type="submit" className="btn btn-navy" disabled={isSubmitting || (!isDirty && !!editTarget)}>
                  {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toDisable && (
        <div className="modal-overlay" onClick={() => setToDisable(null)}>
          <div className="modal-box modal-box-sm tdoc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 className="modal-title">¿Deshabilitar tipo?</h2>
                <p className="modal-sub">{toDisable.code} — {toDisable.description}</p>
              </div>
              <button className="modal-close" type="button" onClick={() => setToDisable(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="inline-alert inline-alert-warn">
                <FileWarning size={15} />
                <span>Dejará de aparecer en Emisiones, Depósitos y Transferencias Internas. Los documentos históricos no se ven afectados.</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                No hay eliminar en este catálogo — solo deshabilitar. Puedes volver a habilitarlo editándolo.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDisable(null)}>Cancelar</button>
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
