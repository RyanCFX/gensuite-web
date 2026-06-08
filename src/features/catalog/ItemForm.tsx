import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createItem, listCategories, listBrands } from '@/shared/api/catalog'
import { listWarehouses } from '@/shared/api/inventory'
import { PageHeader } from '@/components/shared/PageHeader'
import { ArrowLeft } from 'lucide-react'

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
})

type FormValues = z.infer<typeof schema>

export default function ItemForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => createItem(data),
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
    },
  })

  const selectedType = watch('type')

  const onSubmit = (data: FormValues) => {
    const payload: FormValues = {
      ...data,
      brand: data.brand || undefined,
      itemCode: data.itemCode,
      description: data.description || undefined,
      defaultWarehouse: data.defaultWarehouse || undefined,
      valuationRate: data.valuationRate || undefined,
    }
    createMutation.mutate(payload)
  }

  // unwrapPaginated returns { items, meta } — use .items, not .data
  const categories = categoriesData?.items ?? []
  const brands = brandsData?.items ?? []
  const warehouses = warehousesData ?? []

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

      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tipo */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="type">
                Tipo <span className="ff-required">*</span>
              </label>
              <select id="type" className="ff-select" {...register('type')}>
                <option value="product">Producto</option>
                <option value="service">Servicio</option>
              </select>
            </div>

            {/* Código */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="itemCode">
                Código <span className="ff-required">*</span>
              </label>
              <input
                id="itemCode"
                className={`ff-input${errors.itemCode ? ' ff-input-error' : ''}`}
                placeholder="Ej: PROD-001"
                {...register('itemCode')}
              />
              {errors.itemCode && <span className="ff-error">{errors.itemCode.message}</span>}
            </div>

            {/* Nombre */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="itemName">
                Nombre <span className="ff-required">*</span>
              </label>
              <input
                id="itemName"
                className="ff-input"
                placeholder="Nombre del artículo"
                {...register('itemName')}
              />
              {errors.itemName && <span className="ff-error">{errors.itemName.message}</span>}
            </div>

            {/* Descripción */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="description">Descripción</label>
              <textarea
                id="description"
                className="ff-textarea"
                rows={3}
                placeholder="Descripción opcional"
                {...register('description')}
              />
            </div>

            {/* Categoría */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="category">
                Categoría <span className="ff-required">*</span>
              </label>
              <select id="category" className="ff-select" {...register('category')}>
                <option value="">Seleccionar categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {errors.category && <span className="ff-error">{errors.category.message}</span>}
            </div>

            {/* Marca */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="brand">Marca</label>
              <select id="brand" className="ff-select" {...register('brand')}>
                <option value="">Sin marca</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Precio de Venta */}
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="standardRate">
                Precio de Venta <span className="ff-required">*</span>
              </label>
              <input
                id="standardRate"
                type="number"
                step="0.01"
                min="0"
                className="ff-input"
                placeholder="0.00"
                {...register('standardRate', { valueAsNumber: true })}
              />
              {errors.standardRate && <span className="ff-error">{errors.standardRate.message}</span>}
            </div>

            {selectedType === 'product' && (
              <>
                {/* Costo de Valoración */}
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="valuationRate">Costo de Valoración</label>
                  <input
                    id="valuationRate"
                    type="number"
                    step="0.01"
                    min="0"
                    className="ff-input"
                    placeholder="0.00"
                    {...register('valuationRate', { valueAsNumber: true })}
                  />
                  {errors.valuationRate && <span className="ff-error">{errors.valuationRate.message}</span>}
                </div>

                {/* Almacén por defecto */}
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="defaultWarehouse">Almacén por defecto</label>
                  <select id="defaultWarehouse" className="ff-select" {...register('defaultWarehouse')}>
                    <option value="">Sin asignar</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="card-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/catalogo/articulos')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || createMutation.isPending}
            >
              {createMutation.isPending ? 'Guardando…' : 'Crear Artículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
