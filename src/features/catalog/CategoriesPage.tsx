import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { listCategories, createCategory, updateCategory, deleteCategory } from '@/shared/api/catalog'
import type { Category } from '@/shared/api/types'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'

const categorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  parentCategory: z.string().optional(),
  isGroup: z.boolean(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

interface CategoryRowProps {
  category: Category
  depth: number
  onEdit: (cat: Category) => void
  onDelete: (cat: Category) => void
}

function CategoryRow({ category, depth, onEdit, onDelete }: CategoryRowProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = category.children && category.children.length > 0

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `8px 12px 8px ${12 + depth * 20}px`,
          borderRadius: 'var(--radius)',
        }}
        className="table-row-clickable"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasChildren ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="btn btn-ghost btn-size-icon-sm"
              type="button"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span style={{ width: 24 }} />
          )}
          {category.isGroup ? (
            expanded
              ? <FolderOpen size={15} style={{ color: '#ca8a04' }} />
              : <Folder size={15} style={{ color: '#ca8a04' }} />
          ) : (
            <span style={{ width: 15 }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 500 }}>{category.name}</span>
          {category.isGroup && (
            <span className="badge badge-neutral" style={{ fontSize: 11 }}>Grupo</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-ghost btn-size-icon-sm" type="button" onClick={() => onEdit(category)}>
            <Pencil size={13} />
          </button>
          <button
            className="btn btn-ghost btn-size-icon-sm"
            type="button"
            style={{ color: 'var(--color-error)' }}
            onClick={() => onDelete(category)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && hasChildren && (
        <>
          {category.children!.map((child) => (
            <CategoryRow
              key={child.id}
              category={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </>
      )}
    </>
  )
}

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['categories', { tree: true }],
    queryFn: () => listCategories({ tree: true }),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', parentCategory: '', isGroup: false },
  })

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      toast.success('Categoría creada')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear categoría'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<CategoryFormValues> }) =>
      updateCategory(id, d),
    onSuccess: () => {
      toast.success('Categoría actualizada')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      toast.success('Categoría eliminada')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '', parentCategory: '', isGroup: false })
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditTarget(cat)
    reset({
      name: cat.name,
      parentCategory: cat.parentCategory ?? '',
      isGroup: cat.isGroup,
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: CategoryFormValues) {
    const payload = {
      name: values.name,
      parentCategory: values.parentCategory || undefined,
      isGroup: values.isGroup,
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
          <h1 className="page-title">Categorías</h1>
          <p className="page-sub">Árbol de categorías del catálogo</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} />
          Nueva Categoría
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-box" style={{ height: 32, width: '100%' }} />
              ))}
            </div>
          ) : isError ? (
            <p style={{ textAlign: 'center', color: 'var(--color-error)', padding: '24px 0' }}>
              Error al cargar categorías
            </p>
          ) : !data?.items.length ? (
            <div className="empty-state">
              <div className="empty-title">Sin categorías</div>
              <p className="empty-sub">No hay categorías. Crea la primera.</p>
            </div>
          ) : (
            <div style={{ paddingBlock: 8 }}>
              {data.items.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  depth={0}
                  onEdit={openEdit}
                  onDelete={setToDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {dialogOpen && (
        <div className="modal-overlay" onClick={closeDialog}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Categoría' : 'Nueva Categoría'}</h2>
              <button className="modal-close" type="button" onClick={closeDialog}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="catName">Nombre</label>
                  <input id="catName" className={`ff-input${errors.name ? ' ff-input-error' : ''}`} {...register('name')} />
                  {errors.name && <p className="ff-error">{errors.name.message}</p>}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="parentCategory">Categoría Padre (ID)</label>
                  <input
                    id="parentCategory"
                    className="ff-input"
                    placeholder="Dejar vacío si es raíz"
                    {...register('parentCategory')}
                  />
                </div>

                <label className="ff-check-wrap">
                  <input type="checkbox" className="ff-check" id="isGroup" {...register('isGroup')} />
                  <span style={{ fontSize: 13 }}>Es un grupo (puede contener subcategorías)</span>
                </label>
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
              <h2 className="modal-title">¿Eliminar categoría?</h2>
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
