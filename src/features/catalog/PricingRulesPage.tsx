import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listPricingRules,
  createPricingRule,
  updatePricingRule,
  togglePricingRule,
  listItems,
  listCategories,
  listBrands,
} from '@/shared/api/catalog'
import type { PricingRule, CreatePricingRuleDto, UpdatePricingRuleDto } from '@/shared/api/types'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { Plus, Pencil, Power, ChevronLeft, ChevronRight, Search, Info } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useDebounce } from '@/lib/useDebounce'
import { formatDOP } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'

const PAGE_SIZE = 20

const applyOnOptions = [
  { value: 'Item Code', label: 'Código de Artículo' },
  { value: 'Item Group', label: 'Grupo de Artículos' },
  { value: 'Brand', label: 'Marca' },
]

const discountTypeOptions = [
  { value: 'Discount Percentage', label: '% Porcentaje' },
  { value: 'Discount Amount', label: 'Monto fijo' },
]

const pricingRuleSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  applyOn: z.enum(['Item Code', 'Item Group', 'Brand']),
  itemCodes: z.array(z.string()).optional(),
  itemGroups: z.array(z.string()).optional(),
  brands: z.array(z.string()).optional(),
  discountType: z.enum(['Discount Percentage', 'Discount Amount']),
  discountPercentage: z.preprocess(
    (v) => (v === '' || v === undefined || v === null || Number.isNaN(v)) ? undefined : v,
    z.union([z.number().min(0).max(100), z.undefined()])
  ),
  discountAmount: z.preprocess(
    (v) => (v === '' || v === undefined || v === null || Number.isNaN(v)) ? undefined : v,
    z.union([z.number().min(0), z.undefined()])
  ),
  minQty: z.preprocess((v) => (v === '' || v === undefined || v === null || Number.isNaN(v)) ? undefined : v, z.number().optional()),
  maxQty: z.preprocess((v) => (v === '' || v === undefined || v === null || Number.isNaN(v)) ? undefined : v, z.number().optional()),
  validFrom: z.string().optional(),
  validUpto: z.string().optional(),
  priority: z.preprocess((v) => (v === '' || v === undefined || v === null || Number.isNaN(v)) ? undefined : v, z.number().min(0).max(20).optional()),
}).refine(
  (data) => {
    if (data.applyOn === 'Item Code' && (!data.itemCodes || data.itemCodes.length < 1)) return false
    if (data.applyOn === 'Item Group' && (!data.itemGroups || data.itemGroups.length < 1)) return false
    if (data.applyOn === 'Brand' && (!data.brands || data.brands.length < 1)) return false
    return true
  },
  {
    message: 'Debe seleccionar al menos un elemento',
    path: ['applyOn'],
  }
).refine(
  (data) => {
    if (data.discountType === 'Discount Percentage' && (data.discountPercentage === undefined || data.discountPercentage === null)) {
      return false
    }
    if (data.discountType === 'Discount Amount' && (data.discountAmount === undefined || data.discountAmount === null)) {
      return false
    }
    return true
  },
  {
    message: 'Debe especificar el valor del descuento',
    path: ['discountType'],
  }
)

type PricingRuleFormValues = z.infer<typeof pricingRuleSchema>

function applyOnLabel(applyOn: string, values?: string[]) {
  if (!values || values.length === 0) return applyOn
  const names = values.slice(0, 3).join(', ')
  const more = values.length > 3 ? ` (+${values.length - 3})` : ''
  return `${applyOn}: ${names}${more}`
}

function discountLabel(rule: Pick<PricingRule, 'discountType' | 'discountPercentage' | 'discountAmount'>) {
  if (rule.discountType === 'Discount Percentage') {
    return `${rule.discountPercentage ?? 0}%`
  }
  return formatDOP(rule.discountAmount ?? 0)
}

function MultiSelect({
  options,
  selected,
  onChange,
  onSearch,
  loading,
  placeholder,
}: {
  options: SearchSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  onSearch: (query: string) => void
  loading?: boolean
  placeholder: string
}) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const debouncedQuery = useDebounce(inputValue, 300)

  const filtered = useMemo(() => {
    if (!debouncedQuery) return options
    const q = debouncedQuery.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q) && !selected.includes(o.value))
  }, [options, debouncedQuery, selected])

  function addOption(value: string) {
    if (!selected.includes(value)) {
      onChange([...selected, value])
    }
    setInputValue('')
  }

  function removeOption(value: string) {
    onChange(selected.filter((v) => v !== value))
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 36, padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--surface-app)', cursor: 'text' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selected.map((val) => {
          const opt = options.find((o) => o.value === val)
          return (
            <span key={val} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', background: 'var(--color-primary-bg, #eef2ff)', color: 'var(--color-primary)', borderRadius: 4, fontSize: 12 }}>
              {opt?.label ?? val}
              <button type="button" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit', fontSize: 14, lineHeight: 1 }} onClick={(e) => { e.stopPropagation(); removeOption(val) }}>×</button>
            </span>
          )
        })}
        <input
          style={{ border: 'none', outline: 'none', flex: 1, minWidth: 100, fontSize: 13, background: 'transparent', padding: '2px 4px' }}
          placeholder={selected.length === 0 ? placeholder : 'Buscar…'}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); onSearch(e.target.value) }}
          onFocus={() => setIsOpen(true)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, background: 'var(--surface-overlay, var(--surface-app))', border: '1px solid var(--border-default)', borderRadius: 6, padding: 4, zIndex: 100, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
          {loading ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>Buscando…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>Sin resultados</div>
          ) : (
            filtered.map((opt) => (
              <button key={opt.value} type="button" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, borderRadius: 4 }}
                onClick={(e) => { e.preventDefault(); addOption(opt.value); setInputValue('') }}
              >
                {opt.label}{opt.sublabel ? <span style={{ color: 'var(--text-tertiary)', marginLeft: 8, fontSize: 11 }}>{opt.sublabel}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function PricingRulesPage() {
  const queryClient = useQueryClient()
  const [applyOnFilter, setApplyOnFilter] = useState('')
  const [disabledFilter, setDisabledFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PricingRule | null>(null)
  const { orderBy, sort } = useSortState()
  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pricingRules', { search: debouncedSearch, applyOn: applyOnFilter || undefined, disabled: disabledFilter || undefined, offset, orderBy }],
    queryFn: () => listPricingRules({
      search: debouncedSearch || undefined,
      applyOn: applyOnFilter || undefined,
      disabled: disabledFilter || undefined,
      limit: PAGE_SIZE,
      offset,
      orderBy: orderBy || undefined,
    }),
  })

  const { data: itemsData } = useQuery({
    queryKey: ['items', { search: '' }],
    queryFn: () => listItems({ limit: 100 }),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', { tree: false }],
    queryFn: () => listCategories(),
  })

  const { data: brandsData } = useQuery({
    queryKey: ['brands', {}],
    queryFn: () => listBrands(),
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PricingRuleFormValues>({
    resolver: zodResolver(pricingRuleSchema) as Resolver<PricingRuleFormValues>,
    defaultValues: {
      title: '',
      applyOn: 'Item Code',
      discountType: 'Discount Percentage',
      discountPercentage: undefined,
      discountAmount: undefined,
      minQty: undefined,
      maxQty: undefined,
      validFrom: '',
      validUpto: '',
      priority: 1,
    },
  })

  const watchedApplyOn = watch('applyOn')
  const watchedDiscountType = watch('discountType')

  const itemOptions = useMemo(() => {
    return (itemsData?.items ?? []).map((item) => ({
      value: item.id,
      label: `${item.id} — ${item.itemName}`,
      sublabel: item.type === 'service' ? 'Servicio' : 'Producto',
    }))
  }, [itemsData])

  const categoryOptions = useMemo(() => {
    return (categoriesData?.items ?? []).map((cat) => ({
      value: cat.id,
      label: cat.name,
    }))
  }, [categoriesData])

  const brandOptions = useMemo(() => {
    return (brandsData?.items ?? []).map((brand) => ({
      value: brand.id,
      label: brand.name,
    }))
  }, [brandsData])

  const createMutation = useMutation({
    mutationFn: createPricingRule,
    onSuccess: () => {
      toast.success('Regla de descuento creada')
      queryClient.invalidateQueries({ queryKey: ['pricingRules'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la regla'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePricingRuleDto }) => updatePricingRule(id, data),
    onSuccess: () => {
      toast.success('Regla de descuento actualizada')
      queryClient.invalidateQueries({ queryKey: ['pricingRules'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la regla'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => {
      console.log('toggleMutation called with id:', id)
      return togglePricingRule(id)
    },
    onSuccess: (rule: PricingRule) => {
      console.log('toggleMutation onSuccess:', rule)
      toast.success(rule.disabled ? 'Regla desactivada' : 'Regla activada')
      queryClient.invalidateQueries({ queryKey: ['pricingRules'] })
    },
    onError: (err: { message?: string }) => {
      console.log('toggleMutation onError:', err)
      toast.error(err?.message ?? 'Error al cambiar el estado de la regla')
    },
  })

  function openCreate() {
    setEditTarget(null)
    reset({
      title: '',
      applyOn: 'Item Code',
      discountType: 'Discount Percentage',
      discountPercentage: undefined,
      discountAmount: undefined,
      minQty: undefined,
      maxQty: undefined,
      validFrom: '',
      validUpto: '',
      priority: 1,
    })
    setDialogOpen(true)
  }

  function openEdit(rule: PricingRule) {
    setEditTarget(rule)
    reset({
      title: rule.title,
      applyOn: rule.applyOn,
      itemCodes: rule.itemCodes ?? [],
      itemGroups: rule.itemGroups ?? [],
      brands: rule.brands ?? [],
      discountType: rule.discountType,
      discountPercentage: rule.discountPercentage ?? undefined,
      discountAmount: rule.discountAmount ?? undefined,
      minQty: rule.minQty ?? undefined,
      maxQty: rule.maxQty ?? undefined,
      validFrom: rule.validFrom ?? '',
      validUpto: rule.validUpto ?? '',
      priority: rule.priority ?? 1,
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: PricingRuleFormValues) {
    console.log('onSubmit called', values)
    console.log('errors:', errors)
    console.log('editTarget:', editTarget)
    const payload: CreatePricingRuleDto = {
      title: values.title,
      applyOn: values.applyOn,
      itemCodes: values.itemCodes,
      itemGroups: values.itemGroups,
      brands: values.brands,
      discountType: values.discountType,
      discountPercentage: values.discountType === 'Discount Percentage' ? values.discountPercentage : undefined,
      discountAmount: values.discountType === 'Discount Amount' ? values.discountAmount : undefined,
      minQty: values.minQty,
      maxQty: values.maxQty,
      validFrom: values.validFrom || undefined,
      validUpto: values.validUpto || undefined,
      priority: values.priority,
    }
    console.log('payload:', payload)
    if (editTarget) {
      console.log('calling updateMutation with id:', editTarget.id)
      updateMutation.mutate({ id: editTarget.id, data: payload })
    } else {
      console.log('calling createMutation')
      createMutation.mutate(payload)
    }
  }

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Descuentos por Producto</h1>
          {data && <p className="page-sub">{data.meta.total} reglas</p>}
          <p className="page-sub" style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            <Info size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Estos descuentos se aplican automáticamente en cada factura o cotización — el vendedor no necesita tocarlos.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} />
          Nueva Regla
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <Select
            value={applyOnFilter || '_all'}
            onValueChange={(val) => { setApplyOnFilter(val === '_all' ? '' : val); setPage(1) }}
          >
            <SelectItem value="_all">Todos los tipos de aplicación</SelectItem>
            {applyOnOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </Select>
          <Select
            value={disabledFilter || '_all'}
            onValueChange={(val) => { setDisabledFilter(val === '_all' ? '' : val); setPage(1) }}
          >
            <SelectItem value="_all">Todos los estados</SelectItem>
            <SelectItem value="false">Activas</SelectItem>
            <SelectItem value="true">Desactivadas</SelectItem>
          </Select>
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input className="search-input" placeholder="Buscar por título…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Título" sortKey="title" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                <th>Aplica a</th>
                <th>Descuento</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
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
                          Error al cargar las reglas de descuento
                        </td>
                      </tr>
                    )
                  : data?.items.length === 0
                    ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                            No se encontraron reglas de descuento
                          </td>
                        </tr>
                      )
                    : data?.items.map((rule) => (
                        <tr key={rule.id}>
                          <td style={{ fontWeight: 500 }}>{rule.title}</td>
                          <td className="td-muted">{applyOnLabel(rule.applyOn, rule.itemCodes ?? rule.itemGroups ?? rule.brands)}</td>
                          <td>{discountLabel(rule)}</td>
                          <td className="td-muted">
                            {rule.validFrom && rule.validUpto
                              ? `${rule.validFrom} → ${rule.validUpto}`
                              : rule.validFrom
                                ? `Desde ${rule.validFrom}`
                                : rule.validUpto
                                  ? `Hasta ${rule.validUpto}`
                                  : 'Sin vigencia'}
                          </td>
                          <td>
                            {rule.disabled
                              ? <span className="badge badge-neutral">Inactiva</span>
                              : <span className="badge badge-success">Activa</span>}
                          </td>
                          <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                            <ActionsMenu>
                              <ActionsMenuItem onClick={() => openEdit(rule)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                              <ActionsMenuItem onClick={() => toggleMutation.mutate(rule.id)}>
                                <Power size={14} />
                                {rule.disabled ? ' Activar' : ' Desactivar'}
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
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Regla' : 'Nueva Regla de Descuento'}</h2>
              <button className="modal-close" type="button" onClick={closeDialog}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="pr-title">Título</label>
                  <input id="pr-title" className={`ff-input${errors.title ? ' ff-input-error' : ''}`} {...register('title')} />
                  {errors.title && <p className="ff-error">{errors.title.message}</p>}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="pr-applyOn">Aplicar a</label>
                  <Controller
                    name="applyOn"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        {applyOnOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </Select>
                    )}
                  />
                  {errors.applyOn && <p className="ff-error">{errors.applyOn.message}</p>}
                </div>

                {watchedApplyOn === 'Item Code' && (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Artículos</label>
                    <Controller
                      name="itemCodes"
                      control={control}
                      render={({ field }) => (
                        <MultiSelect
                          options={itemOptions}
                          selected={field.value ?? []}
                          onChange={field.onChange}
                          onSearch={() => {}}
                          placeholder="Buscar artículo…"
                        />
                      )}
                    />
                    {errors.itemCodes && <p className="ff-error">{errors.itemCodes.message}</p>}
                  </div>
                )}

                {watchedApplyOn === 'Item Group' && (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Grupos de artículos</label>
                    <Controller
                      name="itemGroups"
                      control={control}
                      render={({ field }) => (
                        <MultiSelect
                          options={categoryOptions}
                          selected={field.value ?? []}
                          onChange={field.onChange}
                          onSearch={() => {}}
                          placeholder="Buscar categoría…"
                        />
                      )}
                    />
                    {errors.itemGroups && <p className="ff-error">{errors.itemGroups.message}</p>}
                  </div>
                )}

                {watchedApplyOn === 'Brand' && (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Marcas</label>
                    <Controller
                      name="brands"
                      control={control}
                      render={({ field }) => (
                        <MultiSelect
                          options={brandOptions}
                          selected={field.value ?? []}
                          onChange={field.onChange}
                          onSearch={() => {}}
                          placeholder="Buscar marca…"
                        />
                      )}
                    />
                    {errors.brands && <p className="ff-error">{errors.brands.message}</p>}
                  </div>
                )}

                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="pr-discountType">Tipo de descuento</label>
                  <Controller
                    name="discountType"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        {discountTypeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </Select>
                    )}
                  />
                  {errors.discountType && <p className="ff-error">{errors.discountType.message}</p>}
                </div>

                {watchedDiscountType === 'Discount Percentage' && (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="pr-discountPercentage">Porcentaje de descuento</label>
                    <input id="pr-discountPercentage" type="number" min={0} max={100} step={0.01} className={`ff-input${errors.discountPercentage ? ' ff-input-error' : ''}`} {...register('discountPercentage', { valueAsNumber: true })} />
                    {errors.discountPercentage && <p className="ff-error">{errors.discountPercentage.message}</p>}
                  </div>
                )}

                {watchedDiscountType === 'Discount Amount' && (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="pr-discountAmount">Monto de descuento</label>
                    <input id="pr-discountAmount" type="number" min={0} step={0.01} className={`ff-input${errors.discountAmount ? ' ff-input-error' : ''}`} {...register('discountAmount', { valueAsNumber: true })} />
                    {errors.discountAmount && <p className="ff-error">{errors.discountAmount.message}</p>}
                  </div>
                )}

                <details>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', padding: '4px 0' }}>
                    Opciones avanzadas
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div className="ff-wrap" style={{ flex: 1 }}>
                        <label className="ff-label" htmlFor="pr-minQty">Cantidad mínima</label>
                        <input id="pr-minQty" type="number" min={0} step={1} className="ff-input" {...register('minQty', { valueAsNumber: true })} />
                      </div>
                      <div className="ff-wrap" style={{ flex: 1 }}>
                        <label className="ff-label" htmlFor="pr-maxQty">Cantidad máxima</label>
                        <input id="pr-maxQty" type="number" min={0} step={1} className="ff-input" {...register('maxQty', { valueAsNumber: true })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div className="ff-wrap" style={{ flex: 1 }}>
                        <label className="ff-label" htmlFor="pr-validFrom">Vigencia desde</label>
                        <input id="pr-validFrom" type="date" className="ff-input" {...register('validFrom')} />
                      </div>
                      <div className="ff-wrap" style={{ flex: 1 }}>
                        <label className="ff-label" htmlFor="pr-validUpto">Vigencia hasta</label>
                        <input id="pr-validUpto" type="date" className="ff-input" {...register('validUpto')} />
                      </div>
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label" htmlFor="pr-priority">Prioridad (1-20)</label>
                      <input id="pr-priority" type="number" min={0} max={20} step={1} className="ff-input" {...register('priority', { valueAsNumber: true })} />
                    </div>
                  </div>
                </details>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={closeDialog}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
