import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createItem, updateItem, getItem, listCategories, listBrands } from '@/shared/api/catalog'
import type { CreateItemDto } from '@/shared/api/types'
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
  category: z.string().optional(),
  subcategory: z.string().optional(),
  brand: z.string().optional(),
  itemCode: z.string().optional(),
  shortName: z.string().optional(),
  notes: z.string().optional(),
  image: z.string().optional(),
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
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  // Productos y Servicios son módulos separados que comparten esta implementación — el tipo
  // queda fijo según la ruta desde la que se entró, nunca es elegible por el usuario.
  const fixedType: 'product' | 'service' = location.pathname.startsWith('/catalogo/servicios') ? 'service' : 'product'
  const isProduct = fixedType === 'product'
  const basePath = isProduct ? '/inventario/productos' : '/catalogo/servicios'
  const moduleLabel = isProduct ? 'Producto' : 'Servicio'

  const [showVariants, setShowVariants] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])
  const [showWarranty, setShowWarranty] = useState(false)
  const [barcodes, setBarcodes] = useState<{ barcode: string; barcodeType: string }[]>([])
  const [noPurchaseTax, setNoPurchaseTax] = useState(false)
  const [noSalesTax, setNoSalesTax] = useState(false)

  const { data: categoriesData } = useQuery({
    queryKey: ['categories-tree', fixedType],
    // Solo trae categorías que aplican a este tipo de artículo (aplicaA = 'Ambas' o fixedType) —
    // el usuario nunca ve ni puede elegir una categoría que no le corresponde.
    queryFn: () => listCategories({ tree: true, type: fixedType }),
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

  const { data: existingItem, isLoading: itemLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: () => getItem(id!),
    enabled: isEdit,
  })

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createItem>[0]) => createItem(data),
    onSuccess: (result) => {
      toast.success(`${moduleLabel} creado con código ${result.id}`)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      navigate(basePath)
    },
    onError: (err: { message?: string }) => {
      // Ej. mismatch de categoría/tipo (400): "La categoría "X" solo aplica a Servicios,
      // no se puede usar para un artículo de tipo Producto." — se muestra tal cual.
      toast.error(err?.message ?? `Error al crear el ${moduleLabel.toLowerCase()}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateItemDto>) => updateItem(id!, data),
    onSuccess: () => {
      toast.success(`${moduleLabel} actualizado`)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['item', id] })
      navigate(`${basePath}/${id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? `Error al actualizar el ${moduleLabel.toLowerCase()}`)
    },
  })

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      itemName: '',
      type: fixedType,
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
      image: '',
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

  // Precarga el formulario al editar — se corre una sola vez cuando llega el artículo.
  useEffect(() => {
    if (!existingItem) return
    // Defensivo: si alguien entra a la URL de edición de Productos/Servicios con el id de un
    // artículo del otro tipo, redirige al módulo correcto en vez de mostrar campos que no aplican.
    if (existingItem.type !== fixedType) {
      const correctBase = existingItem.type === 'product' ? '/inventario/productos' : '/catalogo/servicios'
      navigate(`${correctBase}/${existingItem.id}/editar`, { replace: true })
      return
    }
    reset({
      itemName: existingItem.itemName,
      type: existingItem.type,
      category: existingItem.category ?? '',
      subcategory: existingItem.subcategory ?? '',
      brand: existingItem.brand ?? '',
      itemCode: existingItem.id,
      priceA: existingItem.prices?.A,
      priceB: existingItem.prices?.B ?? existingItem.standardRate ?? 0,
      priceC: existingItem.prices?.C,
      priceMode: existingItem.priceMode ?? 'manual',
      marginA: existingItem.marginA,
      marginB: existingItem.marginB,
      marginC: existingItem.marginC,
      valuationRate: existingItem.valuationRate,
      description: existingItem.internalDescription ?? '',
      shortName: existingItem.shortName ?? '',
      notes: existingItem.notes ?? '',
      image: existingItem.image ?? '',
      hasWarranty: existingItem.hasWarranty ?? false,
      warrantyPeriod: existingItem.warrantyPeriod,
      defaultWarehouse: existingItem.defaultWarehouse ?? '',
      stockUom: existingItem.stockUom ?? '',
      allowsDiscount: existingItem.allowsDiscount ?? true,
      maxDiscountPct: existingItem.maxDiscountPct ?? 0,
      trackingType: existingItem.trackingType ?? 'none',
      purchaseTaxTemplate: existingItem.purchaseTaxTemplate ?? '',
      salesTaxTemplate: existingItem.salesTaxTemplate ?? '',
    })
    setBarcodes(existingItem.barcodes ?? [])
    setShowWarranty(!!existingItem.hasWarranty)
    setNoPurchaseTax(!existingItem.purchaseTaxTemplate)
    setNoSalesTax(!existingItem.salesTaxTemplate)
  }, [existingItem, reset, fixedType, navigate])

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
    if (isProduct && !data.category) {
      toast.error('Selecciona una categoría')
      return
    }
    if (subcategoryOptions.length > 0 && !data.subcategory) {
      toast.error('Selecciona una subcategoría')
      return
    }
    if (data.priceMode === 'cost_plus' && !data.valuationRate) {
      toast.error('Debes ingresar el Costo de Valoración para usar el modo "Sobre costo"')
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
    const { description, itemCode, ...rest } = data
    const payload = {
      ...rest,
      category: data.category || undefined,
      brand: isProduct ? (data.brand || undefined) : undefined,
      subcategory: data.subcategory || undefined,
      internalDescription: description || undefined,
      image: data.image || undefined,
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
    }

    if (isEdit) {
      // itemCode nunca se manda en el update — el backend lo rechaza (400) si viene en el body.
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate({
        ...payload,
        itemCode: itemCode || undefined,
        hasVariants: hasVariants || undefined,
        attributes:
          hasVariants && selectedAttributes.length > 0
            ? selectedAttributes.map((attr) => ({ attribute: attr }))
            : undefined,
      })
    }
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

  if (isEdit && itemLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ height: 28, width: '30%', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ height: 400, width: '100%' }} />
      </div>
    )
  }

  const backTo = isEdit ? `${basePath}/${id}` : basePath
  const isTemplate = isEdit && !!existingItem?.hasVariants

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(backTo)}>
        <ArrowLeft size={14} /> {isEdit ? `Volver al ${moduleLabel.toLowerCase()}` : moduleLabel + 's'}
      </button>

      <PageHeader
        title={isEdit ? `Editar ${existingItem?.itemName ?? moduleLabel}` : `Nuevo ${moduleLabel}`}
        description={isEdit ? `Modifica los datos del ${moduleLabel.toLowerCase()}` : `Registra un nuevo ${moduleLabel.toLowerCase()} en el catálogo`}
        overline={isProduct ? 'Inventario' : 'Catálogo'}
      />

      {isTemplate && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          Este artículo es un template con variantes — las variantes no se pueden editar aquí. Usa la ficha del artículo para gestionarlas.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: 20, alignItems: 'start' }}>

        {/* ════════════════ COLUMNA IZQUIERDA ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Información básica ─────────────────────────────────────── */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Información General</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div className="ff-wrap">
                  <label className="ff-label" htmlFor="itemCode">
                    Código {!isEdit && !isAutoCode && <span className="ff-required">*</span>}
                  </label>
                  {isEdit ? (
                    <div className="ff-input" style={{ color: 'var(--text-secondary)', cursor: 'default', background: 'var(--bg-muted)', fontFamily: 'var(--font-mono)' }}>
                      {existingItem?.id}
                    </div>
                  ) : isAutoCode ? (
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
                  {!isEdit && codePreviewPrefix && (
                    <p className="ff-hint">
                      Se usará el prefijo de la{subcategoryOptions.length > 0 && watchedSubcategory ? ' subcategoría' : ' categoría'}: <strong style={{ fontFamily: 'var(--font-mono)' }}>{codePreviewPrefix}-XXXX</strong>
                    </p>
                  )}
                  {isEdit && <p className="ff-hint">El código del artículo no se puede modificar.</p>}
                  {!isEdit && errors.itemCode && <span className="ff-error">{errors.itemCode.message}</span>}
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

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="image">Imagen (URL)</label>
                <input
                  id="image"
                  className="ff-input"
                  placeholder="https://…"
                  {...register('image')}
                />
              </div>

              <div className="form-row">
                <div className="ff-wrap">
                  <label className={`ff-label${isProduct ? ' ff-required' : ''}`} htmlFor="category">Categoría</label>
                  <Controller
                    name="category"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="category"
                        value={field.value ?? ''}
                        onChange={(val) => {
                          field.onChange(val)
                          // Solo se limpia al elegir manualmente una categoría distinta —
                          // no debe correr al precargar el formulario en modo edición.
                          if (val !== field.value) setValue('subcategory', '')
                        }}
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

                {isProduct && (
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
                )}
              </div>

              {subcategoryOptions.length > 0 && (
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
          {fixedType === 'product' && (
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

          {/* ── Variantes (opcional) — solo al crear; editar variantes/atributos
                de un template ya existente no está soportado por este formulario ── */}
          {!isEdit && fixedType === 'product' && (
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
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="valuationRate">Costo de Valoración</label>
                <input
                  id="valuationRate"
                  type="number" step="0.01" min="0"
                  className="ff-input"
                  placeholder="0.00"
                  {...register('valuationRate', { valueAsNumber: true })}
                />
                <p className="ff-hint">
                  Costo unitario del artículo (base para calcular márgenes). Opcional — requerido solo si
                  usas el modo de precio "Sobre costo".
                </p>
              </div>
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
                      onChange={(val) => {
                        if (val === 'cost_plus' && !watchedValuationRate) {
                          toast.error('Ingresa el Costo de Valoración para poder seleccionar "Sobre costo"')
                          return
                        }
                        field.onChange(val)
                      }}
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

              {fixedType === 'product' && (
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
          {fixedType === 'product' && (
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
          <button type="button" className="btn btn-secondary" onClick={() => navigate(backTo)}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
          >
            {isEdit
              ? (updateMutation.isPending ? 'Guardando…' : 'Guardar Cambios')
              : (createMutation.isPending ? 'Guardando…' : `Crear ${moduleLabel}`)}
          </button>
        </div>
      </form>
    </div>
  )
}
