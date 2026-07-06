import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { listCategories, createCategory, updateCategory, deleteCategory } from '@/shared/api/catalog'
import type { Category, UpdateCategoryDto } from '@/shared/api/types'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSmall, FolderOpen, Tag, Folder } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const PAGE_SIZE = 20

const categorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  parentCategory: z.string().optional(),
  itemCodePrefix: z.string().max(5).optional(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({ category, depth, onEdit, onDelete }: { category: Category; depth: number; onEdit: (cat: Category) => void; onDelete: (cat: Category) => void }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = Boolean(category.children && category.children.length > 0)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: depth * 20 + 8,
          paddingTop: 8,
          paddingBottom: 8,
          paddingRight: 16,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Expand / collapse */}
        <button
          type="button"
          style={{
            width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, background: 'none', border: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--text-secondary)', padding: 0,
          }}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded((v) => !v) }}
          aria-label={expanded ? 'Colapsar' : 'Expandir'}
        >
          {hasChildren
            ? expanded ? <ChevronDown size={13} /> : <ChevronRightSmall size={13} />
            : null}
        </button>

        {/* Icon */}
        {category.isGroup
          ? <Folder size={15} style={{ color: '#ca8a04', flexShrink: 0 }} />
          : <Tag size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}

        {/* Name */}
        <span style={{ flex: 1, fontSize: 13, fontWeight: category.isGroup ? 500 : 400 }}>
          {category.name}
        </span>

        {/* Badges */}
        {category.isGroup && (
          <span className="badge badge-neutral" style={{ fontSize: 11 }}>Grupo</span>
        )}
        {!category.isGroup && (
          <span className="badge badge-brand" style={{ fontSize: 11 }}>Categoría</span>
        )}
        {category.itemCodePrefix && (
          <span className="badge" style={{ fontSize: 11, background: 'var(--surface-sunken)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {category.itemCodePrefix}
          </span>
        )}
        {/* Actions */}
        <div style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <ActionsMenu>
            <ActionsMenuItem onClick={() => onEdit(category)}>
              <Pencil size={14} /> Editar
            </ActionsMenuItem>
            <ActionsMenuItem onClick={() => onDelete(category)}>
              <Trash2 size={14} /> Eliminar
            </ActionsMenuItem>
          </ActionsMenu>
        </div>
      </div>

      {hasChildren && expanded && category.children?.map((child) => (
        <TreeNode key={child.id} category={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'lista' | 'arbol'>('lista')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)
  const [parentCatQuery, setParentCatQuery] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  // Lista tab query
  const { data, isLoading, isError } = useQuery({
    queryKey: ['categories', { search: debouncedSearch, offset, orderBy }],
    queryFn: () => listCategories({
      search: debouncedSearch || undefined,
      orderBy: orderBy || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    enabled: activeTab === 'lista',
  })

  // Árbol tab query
  const { data: tree, isLoading: treeLoading, isError: treeError } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => listCategories({ tree: true }),
    enabled: activeTab === 'arbol',
  })

  const { data: parentCatData, isLoading: parentCatLoading } = useQuery({
    queryKey: ['categories-flat', parentCatQuery],
    queryFn: () => listCategories({ search: parentCatQuery || undefined }),
    staleTime: 30_000,
    enabled: dialogOpen,
  })

  const parentNameMap = useMemo(() => {
    if (!data?.items) return {}
    const map: Record<string, string> = {}
    for (const cat of data.items) {
      map[cat.id] = cat.name
    }
    return map
  }, [data])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', parentCategory: '', itemCodePrefix: '' },
  })

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      toast.success('Categoría creada')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] })
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
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      toast.success('Categoría eliminada')
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '', parentCategory: '', itemCodePrefix: '' })
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditTarget(cat)
    reset({
      name: cat.name,
      parentCategory: cat.parentCategory ?? '',
      itemCodePrefix: (cat as any).itemCodePrefix ?? '',
    })
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
      isGroup: !values.parentCategory,
    }
    if (values.itemCodePrefix) {
      basePayload.itemCodePrefix = values.itemCodePrefix
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: basePayload as UpdateCategoryDto })
    } else {
      createMutation.mutate(basePayload as any)
    }
  }

  const categories = data?.items ?? []
  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1
  const treeData = Array.isArray(tree?.items) ? tree.items : []

  return (
    <div className="page-container">
      <PageHeader
        title="Categorías"
        description={activeTab === 'lista' && data ? `${data.meta.total} categorías` : undefined}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nueva Categoría
          </button>
        }
      />

      {/* Tabs */}
      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <button
          className={`tab-btn${activeTab === 'lista' ? ' on' : ''}`}
          onClick={() => setActiveTab('lista')}
        >
          Lista
        </button>
        <button
          className={`tab-btn${activeTab === 'arbol' ? ' on' : ''}`}
          onClick={() => setActiveTab('arbol')}
        >
          Árbol
        </button>
      </div>

      {/* ── Lista Tab ── */}
      {activeTab === 'lista' && (
        <>
          <div className="filter-bar">
            <div className="filter-bar-left">
              <div className="search-input-wrap">
                <Search size={14} className="search-input-icon" />
                <input
                  className="search-input"
                  placeholder="Buscar por nombre…"
                  value={search}
                  onChange={handleSearchChange}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableTh label="Nombre" sortKey="name" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                    <th>Categoría Padre</th>
                    <th>Tipo</th>
                    <th>Prefijo</th>
                    <th style={{ width: 48 }} />
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((__, j) => (
                            <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                          ))}
                        </tr>
                      ))
                    : isError
                      ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                              Error al cargar categorías
                            </td>
                          </tr>
                        )
                      : categories.length === 0
                        ? (
                            <tr>
                              <td colSpan={5}>
                                <div className="empty-state">
                                  <p className="empty-title">Sin categorías</p>
                                  <p className="empty-sub">No se encontraron categorías.</p>
                                </div>
                              </td>
                            </tr>
                          )
                        : categories.map((cat) => (
                            <tr key={cat.id}>
                              <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {cat.isGroup
                                  ? <FolderOpen size={14} style={{ color: '#ca8a04', flexShrink: 0 }} />
                                  : <Tag size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                }
                                {cat.name}
                              </td>
                              <td className="td-muted">{cat.parentCategory ? (parentNameMap[cat.parentCategory] ?? cat.parentCategory) : '—'}</td>
                              <td>
                                {cat.isGroup
                                  ? <span className="badge badge-neutral" style={{ fontSize: 11 }}>Grupo</span>
                                  : <span className="badge badge-brand" style={{ fontSize: 11 }}>Categoría</span>}
                              </td>
                              <td className="td-muted" style={{ fontFamily: 'monospace' }}>{cat.itemCodePrefix ?? '—'}</td>
                              <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                                <ActionsMenu>
                                  <ActionsMenuItem onClick={() => openEdit(cat)}>
                                    <Pencil size={14} /> Editar
                                  </ActionsMenuItem>
                                  <ActionsMenuItem onClick={() => setToDelete(cat)}>
                                    <Trash2 size={14} /> Eliminar
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
                  <button
                    className="btn btn-ghost btn-size-icon-sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    className="btn btn-ghost btn-size-icon-sm"
                    disabled={!data.meta.hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Árbol Tab ── */}
      {activeTab === 'arbol' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {treeLoading
              ? (
                  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton-box" style={{ height: 18, width: `${80 - i * 8}%` }} />
                    ))}
                  </div>
                )
              : treeError
                ? (
                    <div style={{ padding: 24, color: 'var(--color-error)', fontSize: 13 }}>
                      Error al cargar el árbol de categorías
                    </div>
                  )
                : treeData.length === 0
                  ? (
                      <div className="empty-state">
                        <p className="empty-title">Sin categorías</p>
                        <p className="empty-sub">Crea tu primera categoría.</p>
                      </div>
                    )
                  : treeData.map((root) => (
                      <TreeNode
                        key={root.id}
                        category={root}
                        depth={0}
                        onEdit={openEdit}
                        onDelete={setToDelete}
                      />
                    ))}
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
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
                        .filter((c) => c.id !== editTarget?.id && c.isGroup)
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
                  <p className="ff-hint">Vacío = categoría raíz (se crea como grupo)</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="itemCodePrefix">Prefijo de código</label>
                  <input id="itemCodePrefix" className="ff-input" maxLength={5} placeholder="Ej: VEN" {...register('itemCodePrefix')} />
                  <p className="ff-hint">Máx 5 caracteres. Se usará como prefijo en códigos de artículo (ej: VEN-0001)</p>
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
