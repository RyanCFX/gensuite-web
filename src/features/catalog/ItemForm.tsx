import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createItem, listCategories, listBrands } from '@/shared/api/catalog'
import { listWarehouses } from '@/shared/api/inventory'
import { listUOMs, getEmpresa, listItemTaxTemplates } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { AttributeSelect } from '@/components/shared/AttributeSelect'
import { ArrowLeft, Plus, Trash2, HelpCircle } from 'lucide-react'

const schema = z.object({
  itemName: z.string().min(1, 'El nombre es requerido'),
  type: z.enum(['product', 'service']),
  category: z.string().min(1, 'La categoría es requerida'),
  subcategory: z.string().optional(),
  brand: z.string().optional(),
  itemCode: z.string().optional(),
  shortName: z.string().optional(),
  notes: z.string().optional(),
  hasWarranty: z.boolean().optional(),
  warrantyPeriod: z.number().min(0).optional().catch(undefined),
  description: z.string().optional(),
  priceA: z.number().min(0).optional().catch(undefined),
  priceB: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  priceC: z.number().min(0).optional().catch(undefined),
  priceMode: z.enum(['manual', 'cost_plus']).optional(),
  marginA: z.number().min(0).optional().catch(undefined),
  marginB: z.number().min(0).optional().catch(undefined),
  marginC: z.number().min(0).optional().catch(undefined),
  valuationRate: z.number().min(0).optional().catch(undefined),
  defaultWarehouse: z.string().optional(),
  stockUom: z.string().optional(),
  allowsDiscount: z.boolean().optional(),
  maxDiscountPct: z.number().min(0).max(100).optional().catch(undefined),
  trackingType: z.enum(['none', 'batch', 'serial']).optional(),
  purchaseTaxTemplate: z.string().optional(),
  salesTaxTemplate: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const TYPE_OPTIONS_ALL = [
  { value: 'product', label: 'Producto' },
  { value: 'service', label: 'Servicio' },
]

const PRICE_MODE_OPTIONS_ALL = [
  { value: 'manual', label: 'Manual' },
  { value: 'cost_plus', label: 'Sobre costo' },
]

const TRACKING_OPTIONS_ALL = [
  { value: 'none', label: 'Ninguno' },
  { value: 'batch', label: 'Por lote' },
  { value: 'serial', label: 'Por número de serie' },
]

const BARCODE_TYPE_OPTIONS_ALL = [
  { value: 'EAN', label: 'EAN' },
  { value: 'UPC', label: 'UPC' },
  { value: 'CODE-128', label: 'CODE-128' },
]

export default function ItemForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showVariants, setShowVariants] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])
  const [showWarranty, setShowWarranty] = useState(false)
  const [barcodes, setBarcodes] = useState<{ barcode: string; barcodeType: string }[]>([])
  const [noPurchaseTax, setNoPurchaseTax] = useState(false)
  const [noSalesTax, setNoSalesTax] = useState(false)

  const { data: categoriesData } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => listCategories({ tree: true }),
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

  const { data: empresa } = useQuery({
    queryKey: ['empresa'],
    queryFn: getEmpresa,
    staleTime: 5 * 60_000,
  })

  // "Impuesto de Compra"/"Impuesto de Venta" del artículo son Item Tax Template — mismo
  // doctype para ambos campos, distinto de los templates de impuesto de documento
  // (impuestos-ventas/impuestos-compras) que aplican al total de cotizaciones/facturas/compras.
  const { data: itemTaxTemplates } = useQuery({
    queryKey: ['item-tax-templates'],
    queryFn: listItemTaxTemplates,
    staleTime: 5 * 60_000,
  })

  const itemCodeMode = empresa?.itemCodeMode ?? 'manual'
  const isAutoCode = itemCodeMode === 'auto' || itemCodeMode === 'prefix_auto'

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createItem>[0]) => createItem(data),
    onSuccess: (result) => {
      toast.success(`Artículo creado con código ${result.id}`)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      navigate('/inventario/articulos')
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      itemName: '',
      type: 'product',
      category: '',
      subcategory: '',
      brand: '',
      itemCode: '',
      priceA: undefined,
      priceB: 0,
      priceC: undefined,
      priceMode: 'manual',
      marginA: undefined,
      marginB: undefined,
      marginC: undefined,
      valuationRate: undefined,
      description: '',
      shortName: '',
      notes: '',
      hasWarranty: false,
      warrantyPeriod: undefined,
      defaultWarehouse: '',
      stockUom: '',
      allowsDiscount: true,
      maxDiscountPct: 0,
      trackingType: 'none',
      purchaseTaxTemplate: '',
      salesTaxTemplate: '',
    },
  })

  const selectedType = watch('type')
  const watchedPriceMode = watch('priceMode')
  const watchedSalesTaxTemplate = watch('salesTaxTemplate')
  const watchedValuationRate = watch('valuationRate')
  const watchedMarginA = watch('marginA')
  const watchedMarginB = watch('marginB')
  const watchedMarginC = watch('marginC')
  const watchedPriceA = watch('priceA')
  const watchedPriceB = watch('priceB')
  const watchedPriceC = watch('priceC')

  const onSubmit = (data: FormValues) => {
    if (subcategoryOptions.length > 0 && !data.subcategory) {
      toast.error('Selecciona una subcategoría')
      return
    }
    if (!noPurchaseTax && !data.purchaseTaxTemplate) {
      toast.error('Selecciona el impuesto de compra o marca "No lleva impuesto de compra"')
      return
    }
    if (!noSalesTax && !data.salesTaxTemplate) {
      toast.error('Selecciona el impuesto de venta o marca "No lleva impuesto de venta"')
      return
    }
    const { description, ...rest } = data
    createMutation.mutate({
      ...rest,
      brand: data.brand || undefined,
      subcategory: data.subcategory || undefined,
      internalDescription: description || undefined,
      defaultWarehouse: data.defaultWarehouse || undefined,
      valuationRate: data.valuationRate || undefined,
      stockUom: data.stockUom || undefined,
      priceA: data.priceA || undefined,
      priceB: data.priceB || undefined,
      priceC: data.priceC || undefined,
      priceMode: data.priceMode || undefined,
      marginA: data.marginA || undefined,
      marginB: data.marginB || undefined,
      marginC: data.marginC || undefined,
      allowsDiscount: data.allowsDiscount,
      maxDiscountPct: data.maxDiscountPct || undefined,
      shortName: data.shortName || undefined,
      notes: data.notes || undefined,
      hasWarranty: data.hasWarranty,
      warrantyPeriod: data.warrantyPeriod || undefined,
      barcodes: barcodes.length > 0 ? barcodes : undefined,
      trackingType: data.trackingType === 'none' ? undefined : data.trackingType,
      purchaseTaxTemplate: noPurchaseTax ? undefined : data.purchaseTaxTemplate || undefined,
      salesTaxTemplate: noSalesTax ? undefined : data.salesTaxTemplate || undefined,
      hasVariants: hasVariants || undefined,
      attributes:
        hasVariants && selectedAttributes.length > 0
          ? selectedAttributes.map((attr) => ({ attribute: attr }))
          : undefined,
    })
  }

  const parentCategories = useMemo(() => {
    const items = categoriesData?.items ?? []
    return items.filter((c) => c.isGroup)
  }, [categoriesData])

  const watchedCategory = watch('category')
  const watchedSubcategory = watch('subcategory')
  const watchedBrand = watch('brand')

  const subcategoryOptions = useMemo(() => {
    const catId = watchedCategory
    if (!catId) return []
    for (const parent of parentCategories) {
      if (parent.id === catId || parent.name === catId) {
        return (parent.children ?? []).map((c) => ({ value: c.id, label: c.name }))
      }
    }
    return []
  }, [parentCategories, watchedCategory])

  const brands = brandsData?.items ?? []
  const warehouses = warehousesData ?? []
  const [catSearch, setCatSearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [subcatSearch, setSubcatSearch] = useState('')
  const [uomSearch, setUomSearch] = useState('')
  const [purchaseTaxSearch, setPurchaseTaxSearch] = useState('')
  const [salesTaxSearch, setSalesTaxSearch] = useState('')
  const [typeSearch, setTypeSearch] = useState('')
  const [priceModeSearch, setPriceModeSearch] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [trackingSearch, setTrackingSearch] = useState('')
  const [barcodeTypeSearch, setBarcodeTypeSearch] = useState('')

  const uomOptions: SearchSelectOption[] = useMemo(() => {
    const q = uomSearch.toLowerCase()
    return (uomsData ?? [])
      .filter((u) => !q || u.name.toLowerCase().includes(q))
      .map((u) => ({ value: u.name, label: u.name }))
  }, [uomsData, uomSearch])

  const categoryOptions: SearchSelectOption[] = useMemo(() => {
    const q = catSearch.toLowerCase()
    return parentCategories
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ value: c.id, label: c.name }))
  }, [parentCategories, catSearch])

  const brandOptions: SearchSelectOption[] = useMemo(() => {
    const q = brandSearch.toLowerCase()
    return brands
      .filter((b) => !q || b.name.toLowerCase().includes(q))
      .map((b) => ({ value: b.id, label: b.name }))
  }, [brands, brandSearch])

  const subcatFiltered: SearchSelectOption[] = useMemo(() => {
    const q = subcatSearch.toLowerCase()
    return subcategoryOptions
      .filter((o) => !q || o.label.toLowerCase().includes(q))
  }, [subcategoryOptions, subcatSearch])

  const purchaseTaxOptions: SearchSelectOption[] = useMemo(() => {
    const q = purchaseTaxSearch.toLowerCase()
    return (itemTaxTemplates ?? [])
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .map((t) => ({ value: String(t.id), label: t.title }))
  }, [itemTaxTemplates, purchaseTaxSearch])

  const salesTaxOptions: SearchSelectOption[] = useMemo(() => {
    const q = salesTaxSearch.toLowerCase()
    return (itemTaxTemplates ?? [])
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .map((t) => ({ value: String(t.id), label: t.title }))
  }, [itemTaxTemplates, salesTaxSearch])

  const typeOptions: SearchSelectOption[] = useMemo(() => {
    const q = typeSearch.toLowerCase()
    return TYPE_OPTIONS_ALL.filter((o) => !q || o.label.toLowerCase().includes(q))
  }, [typeSearch])

  const priceModeOptions: SearchSelectOption[] = useMemo(() => {
    const q = priceModeSearch.toLowerCase()
    return PRICE_MODE_OPTIONS_ALL.filter((o) => !q || o.label.toLowerCase().includes(q))
  }, [priceModeSearch])

  const warehouseOptions: SearchSelectOption[] = useMemo(() => {
    const q = warehouseSearch.toLowerCase()
    return warehouses
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => ({ value: w.id, label: w.name }))
  }, [warehouses, warehouseSearch])

  const trackingOptions: SearchSelectOption[] = useMemo(() => {
    const q = trackingSearch.toLowerCase()
    return TRACKING_OPTIONS_ALL.filter((o) => !q || o.label.toLowerCase().includes(q))
  }, [trackingSearch])

  const barcodeTypeOptions: SearchSelectOption[] = useMemo(() => {
    const q = barcodeTypeSearch.toLowerCase()
    return BARCODE_TYPE_OPTIONS_ALL.filter((o) => !q || o.label.toLowerCase().includes(q))
  }, [barcodeTypeSearch])

  const selectedCategoryLabel = parentCategories.find((c) => c.id === watchedCategory)?.name ?? ''

  const codePreviewPrefix = useMemo(() => {
    if (itemCodeMode !== 'prefix_auto' || !watchedCategory) return null
    const parent = parentCategories.find((c) => c.id === watchedCategory)
    if (!parent) return null
    if (watchedSubcategory) {
      const subCategory = parent.children?.find((c) => c.id === watchedSubcategory)
      if (subCategory?.itemCodePrefix) return subCategory.itemCodePrefix
    }
    return parent.itemCodePrefix ?? null
  }, [itemCodeMode, watchedCategory, watchedSubcategory, parentCategories])

  const selectedBrandLabel = brands.find((b) => b.id === watchedBrand)?.name ?? ''

  useEffect(() => {
    setValue('subcategory', '')
  }, [watchedCategory, setValue])

  const taxRate = useMemo(() => {
    const selected = itemTaxTemplates?.find((t) => String(t.id) === watchedSalesTaxTemplate)
    return selected?.taxes?.reduce((sum, t) => sum + (t.notApplicable ? 0 : t.rate), 0) ?? 0
  }, [itemTaxTemplates, watchedSalesTaxTemplate])

  const taxMultiplier = 1 + taxRate / 100

  function priceLabel(totalPrice: number | undefined) {
    if (!totalPrice || totalPrice <= 0) return null
    const netPrice = totalPrice * taxMultiplier
    const tax = netPrice - totalPrice
    const parts: string[] = [`Bruto: RD$ ${totalPrice.toFixed(2)}`]
    if (taxRate > 0) parts.push(`Impuesto: RD$ ${tax.toFixed(2)}`)
    parts.push(`Neto: RD$ ${netPrice.toFixed(2)}`)
    return (
      <p className="ff-hint" style={{ marginTop: 2, lineHeight: 1.5 }}>
        {parts.join(' | ')}
      </p>
    )
  }

  function calcTotalFromMargin(marginPct: number | undefined) {
    if (!watchedValuationRate || !marginPct) return undefined

    // const net = watchedValuationRate * (1 + marginPct / 100)
    return watchedValuationRate / (1 - (marginPct / 100))
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate('/inventario/articulos')}>
        <ArrowLeft size={14} /> Artículos
      </button>

      <PageHeader
        title="Nuevo Artículo"
        description="Registra un nuevo producto o servicio en el catálogo"
        overline="Catálogo"
      />

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: 20, alignItems: 'start' }}>

        {/* ════════════════ COLUMNA IZQUIERDA ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Información básica ─────────────────────────────────────── */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Información General</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="type">Tipo <span className="ff-required">*</span></label>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="type"
                        value={field.value}
                        onChange={(val) => field.onChange(val)}
                        options={typeOptions}
                        onSearch={setTypeSearch}
                        selectedLabel={TYPE_OPTIONS_ALL.find((o) => o.value === field.value)?.label ?? ''}
                      />
                    )}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="itemCode">
                    Código {!isAutoCode && <span className="ff-required">*</span>}
                  </label>
                  {isAutoCode ? (
                    <div className="ff-input" style={{ color: 'var(--text-secondary)', cursor: 'default', background: 'var(--bg-muted)', fontFamily: codePreviewPrefix ? 'var(--font-mono)' : undefined }}>
                      {codePreviewPrefix
                        ? `${codePreviewPrefix}-XXXX`
                        : 'El código se asignará automáticamente'}
                    </div>
                  ) : (
                    <input
                      id="itemCode"
                      className={`ff-input${errors.itemCode ? ' ff-input-error' : ''}`}
                      placeholder="Ej: PROD-001"
                      {...register('itemCode')}
                    />
                  )}
                  {codePreviewPrefix && (
                    <p className="ff-hint">
                      Se usará el prefijo de la{subcategoryOptions.length > 0 && watchedSubcategory ? ' subcategoría' : ' categoría'}: <strong style={{ fontFamily: 'var(--font-mono)' }}>{codePreviewPrefix}-XXXX</strong>
                    </p>
                  )}
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
                <label className="ff-label" htmlFor="shortName">
                  Nombre Corto
                  <span className="ff-tooltip-icon" title="Se usa internamente para búsquedas rápidas"><HelpCircle size={13} /></span>
                </label>
                <input
                  id="shortName"
                  className="ff-input"
                  placeholder="Nombre corto (máx 50 caracteres)"
                  {...register('shortName')}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="description">
                  Descripción interna
                  <span className="ff-tooltip-icon" title="Solo visible en la ficha del artículo, no aparece en facturas ni cotizaciones"><HelpCircle size={13} /></span>
                </label>
                <textarea id="description" className="ff-textarea" rows={2} placeholder="Descripción interna — solo visible en la ficha del artículo" {...register('description')} />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="notes">
                  Notas
                  <span className="ff-tooltip-icon" title="Aparece en cotizaciones y facturas"><HelpCircle size={13} /></span>
                </label>
                <textarea id="notes" className="ff-textarea" rows={2} placeholder="Notas que aparecen en documentos" {...register('notes')} />
              </div>

              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="category">Categoría</label>
                  <Controller
                    name="category"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="category"
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        options={categoryOptions}
                        onSearch={setCatSearch}
                        selectedLabel={selectedCategoryLabel}
                        placeholder="Seleccionar categoría"
                        error={!!errors.category}
                      />
                    )}
                  />
                  {errors.category && <span className="ff-error">{errors.category.message}</span>}
                </div>

                {selectedType === 'product' ? (
                  <div className="ff-wrap">
                    <label className="ff-label" htmlFor="brand">Marca</label>
                    <Controller
                      name="brand"
                      control={control}
                      render={({ field }) => (
                        <SearchSelect
                          id="brand"
                          value={field.value ?? ''}
                          onChange={(val) => field.onChange(val)}
                          options={brandOptions}
                          onSearch={setBrandSearch}
                          selectedLabel={selectedBrandLabel}
                          placeholder="Seleccionar marca"
                          loading={false}
                        />
                      )}
                    />
                  </div>
                ) : subcategoryOptions.length > 0 ? (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="subcategory">Subcategoría</label>
                    <Controller
                      name="subcategory"
                      control={control}
                      render={({ field }) => (
                        <SearchSelect
                          id="subcategory"
                          value={field.value ?? ''}
                          onChange={(val) => field.onChange(val)}
                          options={subcatFiltered}
                          onSearch={setSubcatSearch}
                          selectedLabel={subcategoryOptions.find((o) => o.value === field.value)?.label ?? ''}
                          placeholder="Seleccionar subcategoría"
                          error={!!errors.subcategory}
                        />
                      )}
                    />
                    {errors.subcategory && <span className="ff-error">{errors.subcategory.message}</span>}
                  </div>
                ) : null}
              </div>

              {selectedType === 'product' && subcategoryOptions.length > 0 && (
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="subcategory">Subcategoría</label>
                  <Controller
                    name="subcategory"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="subcategory"
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        options={subcatFiltered}
                        onSearch={setSubcatSearch}
                        selectedLabel={subcategoryOptions.find((o) => o.value === field.value)?.label ?? ''}
                        placeholder="Seleccionar subcategoría"
                        error={!!errors.subcategory}
                      />
                    )}
                  />
                  {errors.subcategory && <span className="ff-error">{errors.subcategory.message}</span>}
                </div>
              )}
            </div>
          </div>

          {/* ── Unidad de Medida ─────────────────────────────────────── */}
          {selectedType === 'product' && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Unidad de Medida</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-row">
                  <div className="ff-wrap">
                    <label className="ff-label" htmlFor="stockUom">UDM de Stock</label>
                    <Controller
                      name="stockUom"
                      control={control}
                      render={({ field }) => (
                          <SearchSelect
                            id="stockUom"
                            value={field.value ?? ''}
                            onChange={(val) => field.onChange(val)}
                            options={uomOptions}
                            onSearch={setUomSearch}
                            placeholder="Seleccionar UDM"
                          />
                      )}
                    />
                    <p className="ff-hint">
                      Unidad base del artículo. Las conversiones se gestionan desde Configuración → Unidades de medida.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Variantes (opcional) ───────────────────────────────────── */}
          {selectedType === 'product' && (
            <>
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
            </>
          )}
        </div>

        {/* ════════════════ COLUMNA DERECHA ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── COMPRA ────────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Compra</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  <p className="ff-hint">Costo unitario del artículo (base para calcular márgenes)</p>
                </div>
              )}
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="purchaseTaxTemplate">
                  Impuesto de Compra {!noPurchaseTax && <span className="ff-required">*</span>}
                </label>
                <Controller
                  name="purchaseTaxTemplate"
                  control={control}
                  render={({ field }) => (
                    <SearchSelect
                      id="purchaseTaxTemplate"
                      value={field.value ?? ''}
                      onChange={(val) => field.onChange(val)}
                      options={purchaseTaxOptions}
                      onSearch={setPurchaseTaxSearch}
                      selectedLabel={itemTaxTemplates?.find((t) => String(t.id) === field.value)?.title ?? ''}
                      placeholder="Seleccionar impuesto"
                      disabled={noPurchaseTax}
                    />
                  )}
                />
                <label className="ff-check-wrap" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={noPurchaseTax}
                    onChange={(e) => setNoPurchaseTax(e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>No lleva impuesto de compra</span>
                </label>
                <p className="ff-hint">Excepción de impuesto para este artículo en compras y gastos (Item Tax Template)</p>
              </div>
            </div>
          </div>

          {/* ── VENTA ──────────────────────────────────────────────────── */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Venta</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="priceMode">Modo de precio</label>
                <Controller
                  name="priceMode"
                  control={control}
                  render={({ field }) => (
                    <SearchSelect
                      id="priceMode"
                      value={field.value ?? ''}
                      onChange={(val) => field.onChange(val)}
                      options={priceModeOptions}
                      onSearch={setPriceModeSearch}
                      selectedLabel={PRICE_MODE_OPTIONS_ALL.find((o) => o.value === field.value)?.label ?? ''}
                    />
                  )}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="ff-label-sm">Precios de venta</span>
                {watchedPriceMode === 'cost_plus' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="ff-wrap">
                      <label className="ff-label">Margen A (%)</label>
                      <input type="number" step="0.1" min="0" max="100" className="ff-input" placeholder="Ej: 40" {...register('marginA', { valueAsNumber: true })} />
                      {priceLabel(calcTotalFromMargin(watchedMarginA))}
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label">Margen B (%) <span className="ff-required">*</span></label>
                      <input type="number" step="0.1" min="0" max="100" className="ff-input" placeholder="Ej: 25" {...register('marginB', { valueAsNumber: true })} />
                      {priceLabel(calcTotalFromMargin(watchedMarginB))}
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label">Margen C (%)</label>
                      <input type="number" step="0.1" min="0" max="100" className="ff-input" placeholder="Ej: 10" {...register('marginC', { valueAsNumber: true })} />
                      {priceLabel(calcTotalFromMargin(watchedMarginC))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="ff-wrap">
                      <label className="ff-label" style={{ color: 'var(--text-secondary)' }}>Precio A — Máximo</label>
                      <input type="number" step="0.01" min="0" className="ff-input" placeholder="0.00" {...register('priceA', { valueAsNumber: true })} />
                      {priceLabel(watchedPriceA)}
                      <p className="ff-hint">Clientes VIP / venta especial</p>
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label">Precio B — Promedio <span className="ff-required">*</span></label>
                      <input
                        type="number" step="0.01" min="0"
                        className={`ff-input${errors.priceB ? ' ff-input-error' : ''}`}
                        placeholder="0.00"
                        {...register('priceB', { valueAsNumber: true })}
                      />
                      {errors.priceB && <span className="ff-error">{errors.priceB.message}</span>}
                      {priceLabel(watchedPriceB)}
                      <p className="ff-hint">Precio estándar (el más usado)</p>
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label" style={{ color: 'var(--text-secondary)' }}>Precio C — Mínimo</label>
                      <input type="number" step="0.01" min="0" className="ff-input" placeholder="0.00" {...register('priceC', { valueAsNumber: true })} />
                      {priceLabel(watchedPriceC)}
                      <p className="ff-hint">Precio al por mayor</p>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="salesTaxTemplate">
                    Impuesto de Venta {!noSalesTax && <span className="ff-required">*</span>}
                  </label>
                  <Controller
                    name="salesTaxTemplate"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="salesTaxTemplate"
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        options={salesTaxOptions}
                        onSearch={setSalesTaxSearch}
                        selectedLabel={itemTaxTemplates?.find((t) => String(t.id) === field.value)?.title ?? ''}
                        placeholder="Seleccionar impuesto"
                        disabled={noSalesTax}
                      />
                    )}
                  />
                  {!noSalesTax && taxRate > 0 && (
                    <p className="ff-hint" style={{ marginTop: 4 }}>
                      Tasa de impuesto: {taxRate}%
                    </p>
                  )}
                  <label className="ff-check-wrap" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      className="ff-check"
                      checked={noSalesTax}
                      onChange={(e) => setNoSalesTax(e.target.checked)}
                    />
                    <span style={{ fontSize: 13 }}>No lleva impuesto de venta</span>
                  </label>
                  <p className="ff-hint">Excepción de impuesto para este artículo en cotizaciones, pedidos y facturas (Item Tax Template)</p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                <label className="ff-check-wrap">
                  <input type="checkbox" className="ff-check" {...register('allowsDiscount')} />
                  <span style={{ fontSize: 13 }}>Acepta descuento</span>
                </label>
                {watch('allowsDiscount') && (
                  <div className="ff-wrap" style={{ marginTop: 8 }}>
                    <label className="ff-label" htmlFor="maxDiscountPct">% máximo de descuento permitido</label>
                    <input
                      id="maxDiscountPct"
                      type="number" min="0" max="100" step="0.1"
                      className="ff-input"
                      style={{ width: 120 }}
                      {...register('maxDiscountPct', { valueAsNumber: true })}
                    />
                    <p className="ff-hint">Descuento máximo permitido para este artículo en documentos</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Garantía y Códigos de Barras ───────────────────────────── */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Garantía y Códigos</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={showWarranty}
                  onChange={(e) => setShowWarranty(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>Tiene garantía</span>
              </label>

              {showWarranty && (
                <div className="ff-wrap" style={{ width: 200 }}>
                  <label className="ff-label">Período de garantía (días)</label>
                  <input
                    type="number" min="0"
                    className="ff-input"
                    placeholder="365"
                    {...register('warrantyPeriod', { valueAsNumber: true })}
                  />
                </div>
              )}

              {selectedType === 'product' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="ff-label" style={{ margin: 0 }}>Códigos de barras</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-sm"
                      onClick={() => setBarcodes(prev => [...prev, { barcode: '', barcodeType: 'EAN' }])}
                    >
                      <Plus size={13} /> Agregar código
                    </button>
                  </div>
                  {barcodes.length === 0 ? (
                    <p className="ff-hint">Sin códigos de barras registrados.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {barcodes.map((bc, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            className="ff-input"
                            style={{ flex: 1 }}
                            placeholder="Código"
                            value={bc.barcode}
                            onChange={(e) => setBarcodes(prev => prev.map((b, i) => i === idx ? { ...b, barcode: e.target.value } : b))}
                          />
                          <div style={{ width: 110 }}>
                            <SearchSelect
                              value={bc.barcodeType}
                              onChange={(val) => setBarcodes(prev => prev.map((b, i) => i === idx ? { ...b, barcodeType: val } : b))}
                              options={barcodeTypeOptions}
                              onSearch={setBarcodeTypeSearch}
                              selectedLabel={BARCODE_TYPE_OPTIONS_ALL.find((o) => o.value === bc.barcodeType)?.label ?? ''}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-size-icon-sm"
                            onClick={() => setBarcodes(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Inventario / Seguimiento ────────────────────────────────── */}
          {selectedType === 'product' && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Inventario</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="defaultWarehouse">Almacén por defecto</label>
                  <Controller
                    name="defaultWarehouse"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="defaultWarehouse"
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        options={warehouseOptions}
                        onSearch={setWarehouseSearch}
                        selectedLabel={warehouses.find((w) => w.id === field.value)?.name ?? ''}
                        placeholder="Sin asignar"
                      />
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="trackingType">Seguimiento</label>
                  <Controller
                    name="trackingType"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="trackingType"
                        value={field.value ?? 'none'}
                        onChange={(val) => field.onChange(val)}
                        options={trackingOptions}
                        onSearch={setTrackingSearch}
                        selectedLabel={TRACKING_OPTIONS_ALL.find((o) => o.value === (field.value ?? 'none'))?.label ?? ''}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ════════════════ BOTONES (ancho completo) ════════════════ */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/inventario/articulos')}>
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
