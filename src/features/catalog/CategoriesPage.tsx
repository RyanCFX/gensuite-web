import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { listCategories, createCategory, updateCategory, deleteCategory } from '@/shared/api/catalog'
import { getEmpresa } from '@/shared/api/config'
import type { Category, UpdateCategoryDto } from '@/shared/api/types'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Folder, FolderOpen, Tag } from 'lucide-react'

const categorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  parentCategory: z.string().optional(),
  isGroup: z.boolean(),
  itemCodePrefix: z.string().max(5).optional(),
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
          {isPrefixAuto && category.itemCodePrefix && (
            <span className="badge badge-brand" style={{ fontSize: 11 }}>Prefijo: {category.itemCodePrefix}</span>
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
  const [editIncomeAccount, setEditIncomeAccount] = useState('')
  const [editExpenseAccount, setEditExpenseAccount] = useState('')
  const [parentCatQuery, setParentCatQuery] = useState('')

  const { data: empresa } = useQuery({
    queryKey: ['empresa'],
    queryFn: getEmpresa,
    staleTime: 5 * 60_000,
  })
  const isPrefixAuto = empresa?.itemCodeMode === 'prefix_auto'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['categories', { tree: true }],
    queryFn: () => listCategories({ tree: true }),
  })

  // For the parent category SearchSelect — flat list (no tree), filtered by search
  const { data: parentCatData, isLoading: parentCatLoading } = useQuery({
    queryKey: ['categories-flat', parentCatQuery],
    queryFn: () => listCategories({ search: parentCatQuery || undefined, limit: 30 }),
    staleTime: 30_000,
    enabled: dialogOpen,
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', parentCategory: '', isGroup: false, itemCodePrefix: '' },
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
    mutationFn: ({ id, data: d }: { id: string; data: UpdateCategoryDto }) =>
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
    reset({ name: '', parentCategory: '', isGroup: false, itemCodePrefix: '' })
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditTarget(cat)
    reset({
      name: cat.name,
      parentCategory: cat.parentCategory ?? '',
      isGroup: cat.isGroup,
      itemCodePrefix: (cat as any).itemCodePrefix ?? '',
    })
    setEditIncomeAccount(cat.incomeAccount ?? '')
    setEditExpenseAccount(cat.expenseAccount ?? '')
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: CategoryFormValues) {
    const basePayload: Record<string, unknown> = {
      name: values.name,
      parentCategory: values.parentCategory || undefined,
      isGroup: values.isGroup,
    }
    if (isPrefixAuto && values.itemCodePrefix) {
      basePayload.itemCodePrefix = values.itemCodePrefix
    }
    if (editTarget) {
      const editPayload = {
        ...basePayload,
        incomeAccount: editIncomeAccount || undefined,
        expenseAccount: editExpenseAccount || undefined,
      }
      updateMutation.mutate({ id: editTarget.id, data: editPayload as UpdateCategoryDto })
    } else {
      createMutation.mutate(basePayload as any)
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
                  <label className="ff-label" htmlFor="parentCategory">Categoría Padre</label>
                  <Controller
                    name="parentCategory"
                    control={control}
                    render={({ field }) => {
                      const parentOptions: SearchSelectOption[] = (parentCatData?.items ?? [])
                        .filter((c) => c.id !== editTarget?.id)
                        .map((c) => ({
                          value: c.id,
                          label: c.name,
                          sublabel: c.parentCategory ? `Sub de: ${c.parentCategory}` : 'Raíz',
                        }))
                      return (
                        <SearchSelect
                          value={field.value ?? ''}
                          onChange={(id) => field.onChange(id || '')}
                          options={parentOptions}
                          onSearch={setParentCatQuery}
                          loading={parentCatLoading}
                          placeholder="Buscar categoría padre… (vacío = raíz)"
                        />
                      )
                    }}
                  />
                  <p className="ff-hint">Deja vacío para crear en la raíz</p>
                </div>

                <label className="ff-check-wrap">
                  <input type="checkbox" className="ff-check" id="isGroup" {...register('isGroup')} />
                  <span style={{ fontSize: 13 }}>Es un grupo (puede contener subcategorías)</span>
                </label>

                {isPrefixAuto && (
                  <div className="ff-wrap">
                    <label className="ff-label" htmlFor="itemCodePrefix">Prefijo de código</label>
                    <input id="itemCodePrefix" className="ff-input" maxLength={5} placeholder="Ej: VEN" {...register('itemCodePrefix')} />
                    <p className="ff-hint">Máx 5 caracteres. Se usará como prefijo en códigos de artículo (ej: VEN-0001)</p>
                  </div>
                )}

                {editTarget && (
                  <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 16, paddingTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 12 }}>
                      Cuentas Contables (opcional)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="ff-wrap">
                        <label className="ff-label">Cuenta de Ingresos</label>
                        <AccountSelect
                          value={editIncomeAccount}
                          onChange={setEditIncomeAccount}
                          rootType="Income"
                        />
                      </div>
                      <div className="ff-wrap">
                        <label className="ff-label">Cuenta de Gastos (COGS)</label>
                        <AccountSelect
                          value={editExpenseAccount}
                          onChange={setEditExpenseAccount}
                          rootType="Expense"
                        />
                      </div>
                    </div>
                  </div>
                )}
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
