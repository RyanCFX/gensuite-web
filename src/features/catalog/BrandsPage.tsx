import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  listCategories,
} from '@/shared/api/catalog'
import type { Brand } from '@/shared/api/types'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

const brandSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
})

type BrandFormValues = z.infer<typeof brandSchema>

export default function BrandsPage() {
  const queryClient = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Brand | null>(null)
  const [toDelete, setToDelete] = useState<Brand | null>(null)
  const { orderBy, sort } = useSortState()

  const { data: brandsData, isLoading, isError } = useQuery({
    queryKey: ['brands', { category: categoryFilter, orderBy }],
    queryFn: () => listBrands({ category: categoryFilter || undefined, limit: 100, orderBy: orderBy || undefined }),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', { tree: false }],
    queryFn: () => listCategories(),
  })

  const [categoryFilterSearch, setCategoryFilterSearch] = useState('')
  const categoryFilterOptions: SearchSelectOption[] = (categoriesData?.items ?? [])
    .filter((c) => !categoryFilterSearch || c.name.toLowerCase().includes(categoryFilterSearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.name }))

  const [formCategorySearch, setFormCategorySearch] = useState('')
  const formCategoryOptions: SearchSelectOption[] = (categoriesData?.items ?? [])
    .filter((c) => !formCategorySearch || c.name.toLowerCase().includes(formCategorySearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.name }))

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BrandFormValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: '', description: '', categoryId: '' },
  })

  const createMutation = useMutation({
    mutationFn: createBrand,
    onSuccess: () => {
      toast.success('Marca creada')
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear marca'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BrandFormValues> }) =>
      updateBrand(id, data),
    onSuccess: () => {
      toast.success('Marca actualizada')
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: () => {
      toast.success('Marca eliminada')
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '', description: '', categoryId: '' })
    setDialogOpen(true)
  }

  function openEdit(brand: Brand) {
    setEditTarget(brand)
    reset({
      name: brand.name,
      description: brand.description ?? '',
      categoryId: brand.categoryId ?? '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: BrandFormValues) {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      categoryId: values.categoryId || undefined,
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Marcas</h1>
          {brandsData && <p className="page-sub">{brandsData.meta.total} marcas</p>}
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} />
          Nueva Marca
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 220 }}>
            <SearchSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryFilterOptions}
              onSearch={setCategoryFilterSearch}
              selectedLabel={categoriesData?.items.find((c) => c.id === categoryFilter)?.name ?? ''}
              placeholder="Todas las categorías"
            />
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Nombre" sortKey="name" orderBy={orderBy} onSort={sort} />
              <th>Descripción</th>
              <th>Categoría</th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : isError
                ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar las marcas
                      </td>
                    </tr>
                  )
                : brandsData?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                          No se encontraron marcas
                        </td>
                      </tr>
                    )
                  : brandsData?.items.map((brand) => (
                      <tr key={brand.id}>
                        <td style={{ fontWeight: 500 }}>{brand.name}</td>
                        <td className="td-muted">{brand.description ?? '—'}</td>
                        <td className="td-muted">{brand.categoryName ?? '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-ghost btn-size-icon-sm"
                              type="button"
                              onClick={() => openEdit(brand)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="btn btn-ghost btn-size-icon-sm"
                              type="button"
                              style={{ color: 'var(--color-error)' }}
                              onClick={() => setToDelete(brand)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>

      {dialogOpen && (
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Marca' : 'Nueva Marca'}</h2>
              <button className="modal-close" type="button" onClick={closeDialog}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="brandName">Nombre</label>
                  <input id="brandName" className={`ff-input${errors.name ? ' ff-input-error' : ''}`} {...register('name')} />
                  {errors.name && <p className="ff-error">{errors.name.message}</p>}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="brandDescription">Descripción</label>
                  <input id="brandDescription" className="ff-input" {...register('description')} />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Categoría</label>
                  <Controller
                    name="categoryId"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        options={formCategoryOptions}
                        onSearch={setFormCategorySearch}
                        selectedLabel={categoriesData?.items.find((c) => c.id === field.value)?.name ?? ''}
                        placeholder="Sin categoría"
                      />
                    )}
                  />
                </div>
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

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar marca?</h2>
              <button className="modal-close" type="button" onClick={() => setToDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará <strong>{toDelete.name}</strong>. Esta acción no se puede deshacer.
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
