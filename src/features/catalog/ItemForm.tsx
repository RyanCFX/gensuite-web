import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createItem, listCategories, listBrands } from '@/shared/api/catalog'
import { listWarehouses } from '@/shared/api/inventory'
import { listUOMs, getUOM } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { AttributeSelect } from '@/components/shared/AttributeSelect'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

const uomConversionSchema = z.object({
  uom: z.string().min(1, 'Requerido'),
  conversionFactor: z.number().min(0.0001, 'Debe ser mayor a 0'),
})

const schema = z.object({
  itemName: z.string().min(1, 'El nombre es requerido'),
  type: z.enum(['product', 'service']),
  category: z.string().min(1, 'La categoría es requerida'),
  brand: z.string().optional(),
  standardRate: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  valuationRate: z.number().min(0).optional(),
  description: z.string().optional(),
  itemCode: z.string().min(1, 'El código es requerido'),
  defaultWarehouse: z.string().optional(),
  stockUom: z.string().optional(),
  purchaseUom: z.string().optional(),
  salesUom: z.string().optional(),
  uoms: z.array(uomConversionSchema).optional(),
  incomeAccount: z.string().optional(),
  expenseAccount: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function ItemForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showAccounting, setShowAccounting] = useState(false)
  const [showVariants, setShowVariants] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', {}],
    queryFn: () => listCategories(),
  })

  const { data: brandsData } = useQuery({
    queryKey: ['brands', {}],
    queryFn: () => listBrands(),
  })

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(),
  })

  const { data: uomsData } = useQuery({
    queryKey: ['uoms'],
    queryFn: listUOMs,
    staleTime: 5 * 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createItem>[0]) => createItem(data),
    onSuccess: () => {
      toast.success('Artículo creado correctamente')
      queryClient.invalidateQueries({ queryKey: ['items'] })
      navigate('/catalogo/articulos')
    },
    onError: () => {
      toast.error('Error al crear el artículo')
    },
  })

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      itemName: '',
      type: 'product',
      category: '',
      brand: '',
      standardRate: 0,
      valuationRate: undefined,
      description: '',
      itemCode: '',
      defaultWarehouse: '',
      stockUom: '',
      purchaseUom: '',
      salesUom: '',
      uoms: [],
      incomeAccount: '',
      expenseAccount: '',
    },
  })

  const { fields: uomFields, append: appendUom, remove: removeUom } = useFieldArray({
    control,
    name: 'uoms',
  })

  const selectedType = watch('type')
  const watchedPurchaseUom = watch('purchaseUom')
  const watchedSalesUom = watch('salesUom')

  const { data: purchaseUomDetail } = useQuery({
    queryKey: ['uom', watchedPurchaseUom],
    queryFn: () => getUOM(watchedPurchaseUom!),
    enabled: !!watchedPurchaseUom,
    staleTime: 5 * 60_000,
  })

  const { data: salesUomDetail } = useQuery({
    queryKey: ['uom', watchedSalesUom],
    queryFn: () => getUOM(watchedSalesUom!),
    enabled: !!watchedSalesUom,
    staleTime: 5 * 60_000,
  })

  const onSubmit = (data: FormValues) => {
    createMutation.mutate({
      ...data,
      brand: data.brand || undefined,
      description: data.description || undefined,
      defaultWarehouse: data.defaultWarehouse || undefined,
      valuationRate: data.valuationRate || undefined,
      stockUom: data.stockUom || undefined,
      purchaseUom: data.purchaseUom || undefined,
      salesUom: data.salesUom || undefined,
      uoms: data.uoms?.length ? data.uoms : undefined,
      incomeAccount: data.incomeAccount || undefined,
      expenseAccount: data.expenseAccount || undefined,
      hasVariants: hasVariants || undefined,
      attributes:
        hasVariants && selectedAttributes.length > 0
          ? selectedAttributes.map((attr) => ({ attribute: attr }))
          : undefined,
    })
  }

  const categories = categoriesData?.items ?? []
  const brands = brandsData?.items ?? []
  const warehouses = warehousesData ?? []
  const uoms = uomsData ?? []

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate('/catalogo/articulos')}>
        <ArrowLeft size={14} /> Artículos
      </button>

      <PageHeader
        title="Nuevo Artículo"
        description="Registra un nuevo producto o servicio en el catálogo"
        overline="Catálogo"
      />

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>

        {/* ── Información básica ───────────────────────────────────────── */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Información General</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="type">Tipo <span className="ff-required">*</span></label>
                <select id="type" className="ff-select" {...register('type')}>
                  <option value="product">Producto</option>
                  <option value="service">Servicio</option>
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="itemCode">Código <span className="ff-required">*</span></label>
                <input
                  id="itemCode"
                  className={`ff-input${errors.itemCode ? ' ff-input-error' : ''}`}
                  placeholder="Ej: PROD-001"
                  {...register('itemCode')}
                />
                {errors.itemCode && <span className="ff-error">{errors.itemCode.message}</span>}
              </div>
            </div>

            <div className="ff-wrap">
              <label className="ff-label" htmlFor="itemName">Nombre <span className="ff-required">*</span></label>
              <input
                id="itemName"
                className={`ff-input${errors.itemName ? ' ff-input-error' : ''}`}
                placeholder="Nombre del artículo"
                {...register('itemName')}
              />
              {errors.itemName && <span className="ff-error">{errors.itemName.message}</span>}
            </div>

            <div className="ff-wrap">
              <label className="ff-label" htmlFor="description">Descripción</label>
              <textarea id="description" className="ff-textarea" rows={3} placeholder="Descripción opcional" {...register('description')} />
            </div>

            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="category">Categoría <span className="ff-required">*</span></label>
                <select id="category" className={`ff-select${errors.category ? ' ff-input-error' : ''}`} {...register('category')}>
                  <option value="">Seleccionar categoría</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
                {errors.category && <span className="ff-error">{errors.category.message}</span>}
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="brand">Marca</label>
                <select id="brand" className="ff-select" {...register('brand')}>
                  <option value="">Sin marca</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Precios ──────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Precios</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="standardRate">Precio de Venta <span className="ff-required">*</span></label>
                <input
                  id="standardRate"
                  type="number" step="0.01" min="0"
                  className={`ff-input${errors.standardRate ? ' ff-input-error' : ''}`}
                  placeholder="0.00"
                  {...register('standardRate', { valueAsNumber: true })}
                />
                {errors.standardRate && <span className="ff-error">{errors.standardRate.message}</span>}
              </div>

              {selectedType === 'product' && (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="valuationRate">Costo de Valoración</label>
                  <input
                    id="valuationRate"
                    type="number" step="0.01" min="0"
                    className="ff-input"
                    placeholder="0.00"
                    {...register('valuationRate', { valueAsNumber: true })}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Unidades de Medida ───────────────────────────────────────── */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Unidades de Medida</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="stockUom">UDM de Stock</label>
                <select id="stockUom" className="ff-select" {...register('stockUom')}>
                  <option value="">Seleccionar</option>
                  {uoms.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                </select>
                <p className="ff-hint">Unidad base en la que se registra el inventario</p>
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="purchaseUom">UDM de Compra</label>
                <select id="purchaseUom" className="ff-select" {...register('purchaseUom')}>
                  <option value="">Igual a UDM de Stock</option>
                  {uoms.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                </select>
                {watchedPurchaseUom && purchaseUomDetail && (
                  purchaseUomDetail.conversions.length > 0
                    ? <p className="ff-hint">Factor de conversión global: {purchaseUomDetail.conversions.map(c => `1 ${watchedPurchaseUom} = ${c.factor} ${c.toUom}`).join(', ')} (del plan de UOM)</p>
                    : null
                )}
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="salesUom">UDM de Venta</label>
                <select id="salesUom" className="ff-select" {...register('salesUom')}>
                  <option value="">Igual a UDM de Stock</option>
                  {uoms.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                </select>
                {watchedSalesUom && salesUomDetail && (
                  salesUomDetail.conversions.length > 0
                    ? <p className="ff-hint">Factor de conversión global: {salesUomDetail.conversions.map(c => `1 ${watchedSalesUom} = ${c.factor} ${c.toUom}`).join(', ')} (del plan de UOM)</p>
                    : null
                )}
              </div>
            </div>

            {/* Conversiones adicionales */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="ff-label" style={{ margin: 0 }}>Conversiones adicionales</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-size-sm"
                  onClick={() => appendUom({ uom: '', conversionFactor: 1 })}
                >
                  <Plus size={13} /> Agregar
                </button>
              </div>

              {uomFields.length === 0 ? (
                <p className="ff-hint">Sin conversiones. Agrega una si usas múltiples unidades (ej: Caja = 12 Nos).</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uomFields.map((field, idx) => (
                    <div key={field.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div className="ff-wrap" style={{ flex: 1 }}>
                        {idx === 0 && <label className="ff-label">Unidad</label>}
                        <select
                          className={`ff-select${errors.uoms?.[idx]?.uom ? ' ff-input-error' : ''}`}
                          {...register(`uoms.${idx}.uom`)}
                        >
                          <option value="">Seleccionar</option>
                          {uoms.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
                        </select>
                        {errors.uoms?.[idx]?.uom && <span className="ff-error">{errors.uoms[idx]?.uom?.message}</span>}
                      </div>

                      <div className="ff-wrap" style={{ width: 140 }}>
                        {idx === 0 && <label className="ff-label">Factor de conversión</label>}
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          className={`ff-input${errors.uoms?.[idx]?.conversionFactor ? ' ff-input-error' : ''}`}
                          placeholder="Ej: 12"
                          {...register(`uoms.${idx}.conversionFactor`, { valueAsNumber: true })}
                        />
                        {errors.uoms?.[idx]?.conversionFactor && (
                          <span className="ff-error">{errors.uoms[idx]?.conversionFactor?.message}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn btn-ghost btn-size-icon-sm"
                        style={{ marginTop: idx === 0 ? 22 : 0 }}
                        onClick={() => removeUom(idx)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <p className="ff-hint">
                    Ejemplo: UDM Stock = <strong>Nos</strong>, conversión <strong>Box → 12</strong> significa que 1 Box = 12 Nos.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Inventario (solo productos) ──────────────────────────────── */}
        {selectedType === 'product' && (
          <div className="card">
            <div className="card-header"><h2 className="card-title">Inventario</h2></div>
            <div className="card-body">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="defaultWarehouse">Almacén por defecto</label>
                <select id="defaultWarehouse" className="ff-select" {...register('defaultWarehouse')}>
                  <option value="">Sin asignar</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Contabilidad (opcional) ──────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setShowAccounting((s) => !s)}
          className="btn btn-ghost btn-size-sm"
          style={{ alignSelf: 'flex-start' }}
        >
          {showAccounting ? '▾' : '▸'} Contabilidad (opcional)
        </button>

        {showAccounting && (
          <div className="card">
            <div className="card-header"><h2 className="card-title">Cuentas Contables</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="inline-alert inline-alert-info" style={{ fontSize: 12 }}>
                Si no se especifica, se usará la cuenta de la categoría o la de la empresa por defecto.
              </div>
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="incomeAccount">Cuenta de Ingresos</label>
                  <Controller
                    control={control}
                    name="incomeAccount"
                    render={({ field }) => (
                      <AccountSelect
                        id="incomeAccount"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        rootType="Income"
                        ledgerOnly={true}
                      />
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="expenseAccount">Cuenta de Gastos (COGS)</label>
                  <Controller
                    control={control}
                    name="expenseAccount"
                    render={({ field }) => (
                      <AccountSelect
                        id="expenseAccount"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        rootType="Expense"
                        ledgerOnly={true}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Variantes (opcional) ──────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setShowVariants((s) => !s)}
          className="btn btn-ghost btn-size-sm"
          style={{ alignSelf: 'flex-start' }}
        >
          {showVariants ? '▾' : '▸'} Variantes (opcional)
        </button>

        {showVariants && (
          <div className="card">
            <div className="card-header"><h2 className="card-title">Variantes</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={hasVariants}
                  onChange={(e) => setHasVariants(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>Este artículo tiene variantes</span>
              </label>

              {hasVariants && (
                <>
                  <div className="inline-alert inline-alert-info" style={{ fontSize: 12 }}>
                    Al guardar, las variantes se generarán en la pantalla de detalle del artículo.
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Atributos de variantes</label>
                    <AttributeSelect
                      selected={selectedAttributes}
                      onChange={setSelectedAttributes}
                    />
                    <p className="ff-hint">Ej: Color, Talla. Selecciona todos los atributos que diferencian las variantes.</p>
                  </div>
                  <p className="ff-hint" style={{ fontSize: 11 }}>
                    El precio de venta se configura en cada variante individual.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/catalogo/articulos')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting || createMutation.isPending}>
            {createMutation.isPending ? 'Guardando…' : 'Crear Artículo'}
          </button>
        </div>
      </form>
    </div>
  )
}
