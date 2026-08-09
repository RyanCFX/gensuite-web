import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listCentrosCosto,
  getCentrosCostoTree,
  createCentroCosto,
  updateCentroCosto,
  deleteCentroCosto,
} from '@/shared/api/centros-costo'
import type { CostCenter } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, List, Network } from 'lucide-react'
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

const centroCostoSchema = z.object({
  costCenterName: z.string().min(1, 'El nombre es requerido'),
  costCenterNumber: z.string().optional(),
  parentCostCenter: z.string().optional(),
  isGroup: z.boolean().optional(),
})

type CentroCostoFormValues = z.infer<typeof centroCostoSchema>

type ViewMode = 'list' | 'tree'

export default function CentrosCostoPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CostCenter | null>(null)
  const [toDelete, setToDelete] = useState<CostCenter | null>(null)
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['centros-costo', { search: debouncedSearch, offset, orderBy }],
    queryFn: () => listCentrosCosto({
      search: debouncedSearch || undefined,
      orderBy: orderBy || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    enabled: view === 'list',
  })

  const { data: treeData, isLoading: isTreeLoading, isError: isTreeError } = useQuery({
    queryKey: ['centros-costo-tree'],
    queryFn: getCentrosCostoTree,
    enabled: view === 'tree',
  })

  // Flattened list used to populate the "parent" select in the create form.
  const { data: parentOptionsData } = useQuery({
    queryKey: ['centros-costo-options'],
    queryFn: () => listCentrosCosto({ limit: 100 }),
    enabled: dialogOpen,
  })
  const parentOptions = useMemo(
    () => (parentOptionsData?.items ?? []).filter((c) => c.isGroup),
    [parentOptionsData],
  )

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const [parentSearch, setParentSearch] = useState('')
  const parentSelectOptions: SearchSelectOption[] = parentOptions
    .filter((p) => !parentSearch || p.name.toLowerCase().includes(parentSearch.toLowerCase()))
    .map((p) => ({ value: p.id, label: p.name }))

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CentroCostoFormValues>({
    resolver: zodResolver(centroCostoSchema),
    defaultValues: { costCenterName: '', costCenterNumber: '', parentCostCenter: '', isGroup: false },
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: createCentroCosto,
    onSuccess: () => {
      toast.success('Centro de costo creado')
      queryClient.invalidateQueries({ queryKey: ['centros-costo'] })
      queryClient.invalidateQueries({ queryKey: ['centros-costo-tree'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el centro de costo'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: { costCenterName?: string; costCenterNumber?: string } }) =>
      updateCentroCosto(id, d),
    onSuccess: () => {
      toast.success('Centro de costo actualizado')
      queryClient.invalidateQueries({ queryKey: ['centros-costo'] })
      queryClient.invalidateQueries({ queryKey: ['centros-costo-tree'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar el centro de costo'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCentroCosto(id),
    onSuccess: () => {
      toast.success('Centro de costo eliminado')
      queryClient.invalidateQueries({ queryKey: ['centros-costo'] })
      queryClient.invalidateQueries({ queryKey: ['centros-costo-tree'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar el centro de costo'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ costCenterName: '', costCenterNumber: '', parentCostCenter: '', isGroup: false })
    setDialogOpen(true)
  }

  function openEdit(c: CostCenter) {
    setEditTarget(c)
    reset({
      costCenterName: c.name,
      costCenterNumber: c.number ?? '',
      parentCostCenter: c.parentCostCenter ?? '',
      isGroup: c.isGroup,
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: CentroCostoFormValues) {
    if (editTarget) {
      updateMutation.mutate({
        id: editTarget.id,
        data: {
          costCenterName: values.costCenterName,
          costCenterNumber: values.costCenterNumber || undefined,
        },
      })
    } else {
      createMutation.mutate({
        costCenterName: values.costCenterName,
        costCenterNumber: values.costCenterNumber || undefined,
        parentCostCenter: values.parentCostCenter || undefined,
        isGroup: values.isGroup,
      })
    }
  }

  const centrosCosto = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Centros de Costo"
        description={view === 'list' && data ? `${data.meta.total ?? 0} centros de costo` : undefined}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nuevo Centro de Costo
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          {view === 'list' && (
            <div className="search-input-wrap">
              <Search size={14} className="search-input-icon" />
              <input
                className="search-input"
                placeholder="Buscar por nombre…"
                value={search}
                onChange={handleSearchChange}
              />
            </div>
          )}
        </div>
        <div className="filter-bar-right" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn btn-size-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('list')}
          >
            <List size={14} /> Lista
          </button>
          <button
            type="button"
            className={`btn btn-size-sm ${view === 'tree' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('tree')}
          >
            <Network size={14} /> Árbol
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Nombre" sortKey="name" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Número</th>
                  <th>Tipo</th>
                  <th>Estado</th>
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
                            Error al cargar centros de costo
                          </td>
                        </tr>
                      )
                    : centrosCosto.length === 0
                      ? (
                          <tr>
                            <td colSpan={5}>
                              <div className="empty-state">
                                <p className="empty-title">Sin centros de costo</p>
                                <p className="empty-sub">Crea el primer centro de costo del negocio.</p>
                              </div>
                            </td>
                          </tr>
                        )
                      : centrosCosto.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 500 }}>{c.name}</td>
                            <td className="td-muted">{c.number ?? '—'}</td>
                            <td className="td-muted">{c.isGroup ? 'Grupo' : 'Detalle'}</td>
                            <td>
                              <span className={`badge ${c.disabled ? 'badge-muted' : 'badge-success'}`}>
                                {c.disabled ? 'Inactivo' : 'Activo'}
                              </span>
                            </td>
                            <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                              <ActionsMenu>
                                <ActionsMenuItem onClick={() => openEdit(c)}>
                                  <Pencil size={14} /> Editar
                                </ActionsMenuItem>
                                <ActionsMenuItem onClick={() => setToDelete(c)}>
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
        <div className="card">
          <div style={{ padding: 16 }}>
            {isTreeLoading
              ? <div className="skeleton-box" style={{ height: 14, width: '60%' }} />
              : isTreeError
                ? <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>Error al cargar el árbol</p>
                : !treeData || treeData.length === 0
                  ? (
                      <div className="empty-state">
                        <p className="empty-title">Sin centros de costo</p>
                        <p className="empty-sub">Crea el primer centro de costo del negocio.</p>
                      </div>
                    )
                  : (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {treeData.map((node) => (
                          <TreeNode key={node.id} node={node} depth={0} onEdit={openEdit} onDelete={setToDelete} />
                        ))}
                      </ul>
                    )}
          </div>
        </div>
      )}

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="ccName">Nombre</label>
                  <input
                    id="ccName"
                    className={`ff-input${errors.costCenterName ? ' ff-input-error' : ''}`}
                    placeholder="Ej: Administración"
                    {...register('costCenterName')}
                  />
                  {errors.costCenterName && <p className="ff-error">{errors.costCenterName.message}</p>}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="ccNumber">Número</label>
                  <input
                    id="ccNumber"
                    className="ff-input"
                    placeholder="Ej: CC-001"
                    {...register('costCenterNumber')}
                  />
                </div>

                {!editTarget && (
                  <>
                    <div className="ff-wrap">
                      <label className="ff-label" htmlFor="ccParent">Centro de costo padre</label>
                      <Controller
                        name="parentCostCenter"
                        control={control}
                        render={({ field }) => (
                          <SearchSelect
                            id="ccParent"
                            value={field.value ?? ''}
                            onChange={(val) => field.onChange(val)}
                            options={parentSelectOptions}
                            onSearch={setParentSearch}
                            selectedLabel={parentOptions.find((p) => p.id === field.value)?.name ?? ''}
                            placeholder="— Sin padre —"
                          />
                        )}
                      />
                    </div>

                    <div className="ff-wrap" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <input id="ccIsGroup" type="checkbox" {...register('isGroup')} />
                      <label className="ff-label" htmlFor="ccIsGroup" style={{ margin: 0 }}>
                        Es un grupo (puede contener otros centros de costo)
                      </label>
                    </div>
                  </>
                )}
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
              <h2 className="modal-title">¿Eliminar centro de costo?</h2>
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

function TreeNode({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: CostCenter
  depth: number
  onEdit: (c: CostCenter) => void
  onDelete: (c: CostCenter) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = !!node.children && node.children.length > 0

  return (
    <li>
      <div
        className="tree-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: depth * 20,
          paddingTop: 6,
          paddingBottom: 6,
          borderBottom: '1px solid var(--border-subtle, #eee)',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: 'none',
            border: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            visibility: hasChildren ? 'visible' : 'hidden',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
        </button>
        <span style={{ fontWeight: node.isGroup ? 600 : 400, flex: 1 }}>
          {node.name}
          {node.number && <span className="td-muted" style={{ marginLeft: 8, fontSize: 12 }}>({node.number})</span>}
        </span>
        {node.disabled && <span className="badge badge-muted">Inactivo</span>}
        <div onClick={(e) => e.stopPropagation()} className="actions-cell">
          <ActionsMenu>
            <ActionsMenuItem onClick={() => onEdit(node)}>
              <Pencil size={14} /> Editar
            </ActionsMenuItem>
            <ActionsMenuItem onClick={() => onDelete(node)}>
              <Trash2 size={14} /> Eliminar
            </ActionsMenuItem>
          </ActionsMenu>
        </div>
      </div>
      {hasChildren && expanded && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </li>
  )
}
