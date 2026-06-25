import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createItem, listCategories, listBrands } from '@/shared/api/catalog'
import { listWarehouses } from '@/shared/api/inventory'
import { listUOMs, getUOM, getEmpresa, listItemTaxTemplates } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { AttributeSelect } from '@/components/shared/AttributeSelect'
import { ArrowLeft, Plus, Trash2, HelpCircle } from 'lucide-react'

const uomConversionSchema = z.object({
  uom: z.string().min(1, 'Requerido'),
  conversionFactor: z.number().min(0.0001, 'Debe ser mayor a 0'),
})

const schema = z.object({
  itemName: z.string().min(1, 'El nombre es requerido'),
  type: z.enum(['product', 'service']),
  category: z.string().min(1, 'La categoría es requerida'),
  brand: z.string().optional(),
  itemCode: z.string().optional(),
  shortName: z.string().optional(),
  notes: z.string().optional(),
  hasWarranty: z.boolean().optional(),
  warrantyPeriod: z.number().min(0).optional(),
  description: z.string().optional(),
  priceA: z.number().min(0).optional(),
  priceB: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  priceC: z.number().min(0).optional(),
  priceMode: z.enum(['manual', 'cost_plus']).optional(),
  marginA: z.number().min(0).optional(),
  marginB: z.number().min(0).optional(),
  marginC: z.number().min(0).optional(),
  valuationRate: z.number().min(0).optional(),
  defaultWarehouse: z.string().optional(),
  stockUom: z.string().optional(),
  purchaseUom: z.string().optional(),
  salesUom: z.string().optional(),
  uoms: z.array(uomConversionSchema).optional(),
  allowsDiscount: z.boolean().optional(),
  minDiscountPct: z.number().min(0).max(100).optional(),
  trackingType: z.enum(['none', 'batch', 'serial']).optional(),
  taxTemplate: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function ItemForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showVariants, setShowVariants] = useState(false)
  const [hasVariants, setHasVariants] = useState(false)
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])
  const [showWarranty, setShowWarranty] = useState(false)
  const [barcodes, setBarcodes] = useState<{ barcode: string; barcodeType: string }[]>([])

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

  const { data: empresa } = useQuery({
    queryKey: ['empresa'],
    queryFn: getEmpresa,
    staleTime: 5 * 60_000,
  })

  const { data: taxTemplates } = useQuery({
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
      purchaseUom: '',
      salesUom: '',
      uoms: [],
      allowsDiscount: true,
      minDiscountPct: 0,
      trackingType: 'none',
      taxTemplate: '',
    },
  })

  const { fields: uomFields, append: appendUom, remove: removeUom } = useFieldArray({
    control,
    name: 'uoms',
  })

  const selectedType = watch('type')
  const watchedPurchaseUom = watch('purchaseUom')
  const watchedSalesUom = watch('salesUom')
  const watchedPriceMode = watch('priceMode')

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
      priceA: data.priceA || undefined,
      priceB: data.priceB || undefined,
      priceC: data.priceC || undefined,
      priceMode: data.priceMode || undefined,
      marginA: data.marginA || undefined,
      marginB: data.marginB || undefined,
      marginC: data.marginC || undefined,
      allowsDiscount: data.allowsDiscount,
      shortName: data.shortName || undefined,
      notes: data.notes || undefined,
      hasWarranty: data.hasWarranty,
      warrantyPeriod: data.warrantyPeriod || undefined,
      barcodes: barcodes.length > 0 ? barcodes : undefined,
      trackingType: data.trackingType === 'none' ? undefined : data.trackingType,
      taxTemplate: data.taxTemplate || undefined,
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
                <label className="ff-label" htmlFor="itemCode">
                  Código {!isAutoCode && <span className="ff-required">*</span>}
                </label>
                {isAutoCode ? (
                  <div className="ff-input" style={{ color: 'var(--text-secondary)', cursor: 'default', background: 'var(--bg-muted)' }}>
                    El código se asignará automáticamente
                  </div>
                ) : (
                  <input
                    id="itemCode"
                    className={`ff-input${errors.itemCode ? ' ff-input-error' : ''}`}
                    placeholder="Ej: PROD-001"
                    {...register('itemCode')}
                  />
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

            {/* ── #5: shortName ── */}
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

            {/* ── #6: description as internal ── */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="description">
                Descripción interna
                <span className="ff-tooltip-icon" title="Solo visible en la ficha del artículo, no aparece en facturas ni cotizaciones"><HelpCircle size={13} /></span>
              </label>
              <textarea id="description" className="ff-textarea" rows={2} placeholder="Descripción interna — solo visible en la ficha del artículo" {...register('description')} />
            </div>

            {/* ── #5: notes ── */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="notes">
                Notas
                <span className="ff-tooltip-icon" title="Aparece en cotizaciones y facturas"><HelpCircle size={13} /></span>
              </label>
              <textarea id="notes" className="ff-textarea" rows={2} placeholder="Notas que aparecen en documentos" {...register('notes')} />
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

        {/* ── Precios A/B/C (#8) + Modo de Precio (#9) + Descuento (#10) ── */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Precios</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Modo de precio (#9) */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="priceMode">Modo de precio</label>
              <select id="priceMode" className="ff-select" {...register('priceMode')}>
                <option value="manual">Manual</option>
                <option value="cost_plus">Sobre costo</option>
              </select>
            </div>

            {watchedPriceMode === 'cost_plus' ? (
              /* Márgenes para modo sobre costo (#9) */
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">Margen A (%)</label>
                  <input type="number" step="0.1" min="0" max="100" className="ff-input" placeholder="Ej: 40" {...register('marginA', { valueAsNumber: true })} />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Margen B (%) <span className="ff-required">*</span></label>
                  <input type="number" step="0.1" min="0" max="100" className="ff-input" placeholder="Ej: 25" {...register('marginB', { valueAsNumber: true })} />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Margen C (%)</label>
                  <input type="number" step="0.1" min="0" max="100" className="ff-input" placeholder="Ej: 10" {...register('marginC', { valueAsNumber: true })} />
                </div>
              </div>
            ) : (
              /* Precios directos A/B/C (#8) */
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label" style={{ color: 'var(--text-secondary)' }}>Precio A — Máximo</label>
                  <input
                    type="number" step="0.01" min="0"
                    className="ff-input"
                    placeholder="0.00"
                    {...register('priceA', { valueAsNumber: true })}
                  />
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
                  <p className="ff-hint">Precio estándar (el más usado)</p>
                </div>
                <div className="ff-wrap">
                  <label className="ff-label" style={{ color: 'var(--text-secondary)' }}>Precio C — Mínimo</label>
                  <input
                    type="number" step="0.01" min="0"
                    className="ff-input"
                    placeholder="0.00"
                    {...register('priceC', { valueAsNumber: true })}
                  />
                  <p className="ff-hint">Precio al por mayor</p>
                </div>
              </div>
            )}

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

            {/* Descuento por artículo (#10) */}
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  {...register('allowsDiscount')}
                />
                <span style={{ fontSize: 13 }}>Acepta descuento</span>
              </label>
              {watch('allowsDiscount') && (
                <div className="ff-wrap" style={{ marginTop: 8 }}>
                  <label className="ff-label" htmlFor="minDiscountPct">% mínimo de descuento</label>
                  <input
                    id="minDiscountPct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="ff-input"
                    style={{ width: 120 }}
                    {...register('minDiscountPct', { valueAsNumber: true })}
                  />
                  <p className="ff-hint">Descuento mínimo requerido para este artículo en documentos</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Garantía y Códigos de Barras (#5) ────────────────────────── */}
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

            {/* Barcodes */}
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
                      <select
                        className="ff-select"
                        style={{ width: 130 }}
                        value={bc.barcodeType}
                        onChange={(e) => setBarcodes(prev => prev.map((b, i) => i === idx ? { ...b, barcodeType: e.target.value } : b))}
                      >
                        <option value="EAN">EAN</option>
                        <option value="UPC">UPC</option>
                        <option value="CODE-128">CODE-128</option>
                      </select>
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
          </div>
        </div>

        {/* ── Unidades de Medida ───────────────────────────────────────── */}
        {selectedType === 'product' && (
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
                      Las conversiones son bidireccionales: si 1 Caja = 12 Nos, también se puede comprar/vender 24 Nos = 2 Cajas.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Inventario / Seguimiento (#12) ────────────────────────────── */}
        {selectedType === 'product' && (
          <div className="card">
            <div className="card-header"><h2 className="card-title">Inventario</h2></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="defaultWarehouse">Almacén por defecto</label>
                <select id="defaultWarehouse" className="ff-select" {...register('defaultWarehouse')}>
                  <option value="">Sin asignar</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              {/* Tracking type (#12) */}
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="trackingType">Seguimiento</label>
                <select id="trackingType" className="ff-select" {...register('trackingType')}>
                  <option value="none">Ninguno</option>
                  <option value="batch">Por lote</option>
                  <option value="serial">Por número de serie</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Impuesto por artículo (#13) ──────────────────────────────── */}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Impuestos</h2></div>
          <div className="card-body">
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="taxTemplate">Plantilla de impuesto</label>
              <select id="taxTemplate" className="ff-select" {...register('taxTemplate')}>
                <option value="">Usar plantilla de la empresa</option>
                {(taxTemplates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <p className="ff-hint">Si se selecciona, sobreescribe el impuesto aplicado en todos los documentos</p>
            </div>
          </div>
        </div>

        {/* ── Variantes (opcional) ──────────────────────────────────────── */}
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
