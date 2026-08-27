import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listDepartamentos,
  getDepartamentosTree,
  createDepartamento,
  updateDepartamento,
  deleteDepartamento,
} from '@/shared/api/departamentos'
import type { Departamento } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, ChevronDown, List, GitBranch } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'

const PAGE_SIZE = 20

const departamentoSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  parentDepartment: z.string().optional(),
})

type DepartamentoFormValues = z.infer<typeof departamentoSchema>

type ViewMode = 'list' | 'tree'

export default function DepartamentosPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Departamento | null>(null)
  const [toDelete, setToDelete] = useState<Departamento | null>(null)
  const [page, setPage] = useState(1)
  const [includeDisabled, setIncludeDisabled] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['departamentos', { search: debouncedSearch, offset, orderBy, includeDisabled }],
    queryFn: () => listDepartamentos({
      search: debouncedSearch || undefined,
      orderBy: orderBy || undefined,
      limit: PAGE_SIZE,
      offset,
      includeDisabled,
    }),
    enabled: viewMode === 'list',
  })

  const { data: treeData, isLoading: isTreeLoading, isError: isTreeError } = useQuery({
    queryKey: ['departamentos-tree'],
    queryFn: getDepartamentosTree,
    enabled: viewMode === 'tree',
  })

  const { data: parentOptionsData } = useQuery({
    queryKey: ['departamentos', { forSelect: true }],
    queryFn: () => listDepartamentos({ limit: 100 }),
    enabled: dialogOpen,
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DepartamentoFormValues>({
    resolver: zodResolver(departamentoSchema),
    defaultValues: { name: '', parentDepartment: '' },
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: createDepartamento,
    onSuccess: () => {
      toast.success('Departamento creado')
      queryClient.invalidateQueries({ queryKey: ['departamentos'] })
      queryClient.invalidateQueries({ queryKey: ['departamentos-tree'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el departamento'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: { name?: string; parentDepartment?: string } }) => updateDepartamento(id, d),
    onSuccess: () => {
      toast.success('Departamento actualizado')
      queryClient.invalidateQueries({ queryKey: ['departamentos'] })
      queryClient.invalidateQueries({ queryKey: ['departamentos-tree'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar el departamento'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDepartamento(id),
    onSuccess: () => {
      toast.success('Departamento eliminado')
      queryClient.invalidateQueries({ queryKey: ['departamentos'] })
      queryClient.invalidateQueries({ queryKey: ['departamentos-tree'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar el departamento'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '', parentDepartment: '' })
    setDialogOpen(true)
  }

  function openEdit(d: Departamento) {
    setEditTarget(d)
    reset({ name: d.name, parentDepartment: d.parentDepartment ?? '' })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: DepartamentoFormValues) {
    const payload = {
      name: values.name,
      parentDepartment: values.parentDepartment || undefined,
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const departamentos = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1
  const parentOptions = (parentOptionsData?.items ?? []).filter((d) => d.id !== editTarget?.id)
  const [parentSearch, setParentSearch] = useState('')
  const parentSelectOptions: SearchSelectOption[] = parentOptions
    .filter((d) => !parentSearch || d.name.toLowerCase().includes(parentSearch.toLowerCase()))
    .map((d) => ({ value: d.id, label: d.name }))

  return (
    <div className="page-container">
      <PageHeader
        title="Departamentos"
        description={data ? `${data.meta.total ?? 0} departamentos` : undefined}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nuevo Departamento
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por nombre…"
              value={search}
              onChange={handleSearchChange}
              disabled={viewMode === 'tree'}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(e) => { setIncludeDisabled(e.target.checked); setPage(1) }}
            />
            Mostrar deshabilitados
          </label>
        </div>
        <div className="filter-bar-right" style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn btn-size-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('list')}
          >
            <List size={14} /> Lista
          </button>
          <button
            className={`btn btn-size-sm ${viewMode === 'tree' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('tree')}
          >
            <GitBranch size={14} /> Árbol
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Nombre" sortKey="name" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Departamento Padre</th>
                  <th>Estado</th>
                  <th style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
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
                            Error al cargar departamentos
                          </td>
                        </tr>
                      )
                    : departamentos.length === 0
                      ? (
                          <tr>
                            <td colSpan={4}>
                              <div className="empty-state">
                                <p className="empty-title">Sin departamentos</p>
                                <p className="empty-sub">Crea el primer departamento del negocio.</p>
                              </div>
                            </td>
                          </tr>
                        )
                      : departamentos.map((d) => (
                          <tr key={d.id}>
                            <td style={{ fontWeight: 500 }}>{d.name}</td>
                            <td className="td-muted">{d.parentDepartment || '—'}</td>
                            <td>
                              <span className={`badge ${d.disabled ? 'badge-muted' : 'badge-success'}`}>
                                {d.disabled ? 'Deshabilitado' : 'Activo'}
                              </span>
                            </td>
                            <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                              <ActionsMenu>
                                <ActionsMenuItem onClick={() => openEdit(d)}>
                                  <Pencil size={14} /> Editar
                                </ActionsMenuItem>
                                <ActionsMenuItem onClick={() => setToDelete(d)}>
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
      ) : (
        <div className="card" style={{ padding: 16 }}>
          {isTreeLoading ? (
            <div className="skeleton-box" style={{ height: 200, width: '100%' }} />
          ) : isTreeError ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
              Error al cargar el árbol de departamentos
            </div>
          ) : !treeData || treeData.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">Sin departamentos</p>
              <p className="empty-sub">Crea el primer departamento del negocio.</p>
            </div>
          ) : (
            <DepartamentoTree nodes={treeData} onEdit={openEdit} onDelete={setToDelete} />
          )}
        </div>
      )}

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Departamento' : 'Nuevo Departamento'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="depName">Nombre</label>
                  <input id="depName" className={`ff-input${errors.name ? ' ff-input-error' : ''}`} placeholder="Ej: Recursos Humanos" {...register('name')} />
                  {errors.name && <p className="ff-error">{errors.name.message}</p>}
                </div>
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="depParent">Departamento Padre</label>
                  <Controller
                    name="parentDepartment"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="depParent"
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        options={parentSelectOptions}
                        onSearch={setParentSearch}
                        selectedLabel={parentOptions.find((d) => d.id === field.value)?.name ?? ''}
                        placeholder="— Ninguno —"
                      />
                    )}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar departamento?</h2>
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

function DepartamentoTree({
  nodes,
  onEdit,
  onDelete,
  level = 0,
}: {
  nodes: Departamento[]
  onEdit: (d: Departamento) => void
  onDelete: (d: Departamento) => void
  level?: number
}) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} onEdit={onEdit} onDelete={onDelete} level={level} />
      ))}
    </ul>
  )
}

function TreeNode({
  node,
  onEdit,
  onDelete,
  level,
}: {
  node: Departamento
  onEdit: (d: Departamento) => void
  onDelete: (d: Departamento) => void
  level: number
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = !!node.children && node.children.length > 0

  return (
    <li>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: level * 20,
          paddingTop: 6,
          paddingBottom: 6,
          borderBottom: '1px solid var(--border-subtle, #eee)',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            visibility: hasChildren ? 'visible' : 'hidden',
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span style={{ fontWeight: node.isGroup ? 600 : 400 }}>{node.name}</span>
        {node.disabled && <span className="badge badge-muted" style={{ marginLeft: 4 }}>Deshabilitado</span>}
        <span style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <ActionsMenu>
            <ActionsMenuItem onClick={() => onEdit(node)}>
              <Pencil size={14} /> Editar
            </ActionsMenuItem>
            <ActionsMenuItem onClick={() => onDelete(node)}>
              <Trash2 size={14} /> Eliminar
            </ActionsMenuItem>
          </ActionsMenu>
        </span>
      </div>
      {hasChildren && expanded && (
        <DepartamentoTree nodes={node.children!} onEdit={onEdit} onDelete={onDelete} level={level + 1} />
      )}
    </li>
  )
}
