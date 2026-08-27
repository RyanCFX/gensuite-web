import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { listSucursales, createSucursal, updateSucursal, deleteSucursal } from '@/shared/api/sucursales'
import type { Sucursal } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'

const PAGE_SIZE = 20

const sucursalSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
})

type SucursalFormValues = z.infer<typeof sucursalSchema>

export default function SucursalesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Sucursal | null>(null)
  const [toDelete, setToDelete] = useState<Sucursal | null>(null)
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sucursales', { search: debouncedSearch, offset, orderBy }],
    queryFn: () => listSucursales({
      search: debouncedSearch || undefined,
      orderBy: orderBy || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SucursalFormValues>({
    resolver: zodResolver(sucursalSchema),
    defaultValues: { name: '' },
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: createSucursal,
    onSuccess: () => {
      toast.success('Sucursal creada')
      queryClient.invalidateQueries({ queryKey: ['sucursales'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la sucursal'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: { name?: string } }) => updateSucursal(id, d),
    onSuccess: () => {
      toast.success('Sucursal actualizada')
      queryClient.invalidateQueries({ queryKey: ['sucursales'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la sucursal'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSucursal(id),
    onSuccess: () => {
      toast.success('Sucursal eliminada')
      queryClient.invalidateQueries({ queryKey: ['sucursales'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar la sucursal'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '' })
    setDialogOpen(true)
  }

  function openEdit(s: Sucursal) {
    setEditTarget(s)
    reset({ name: s.name })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: SucursalFormValues) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: { name: values.name } })
    } else {
      createMutation.mutate({ name: values.name })
    }
  }

  const sucursales = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Sucursales"
        description={data ? `${data.meta.total ?? 0} sucursales` : undefined}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nueva Sucursal
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
                <th>Almacenes</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 3 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                          Error al cargar sucursales
                        </td>
                      </tr>
                    )
                  : sucursales.length === 0
                    ? (
                        <tr>
                          <td colSpan={3}>
                            <div className="empty-state">
                              <p className="empty-title">Sin sucursales</p>
                              <p className="empty-sub">Crea la primera sucursal del negocio.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : sucursales.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}>{s.name}</td>
                          <td className="td-muted">{s.warehouseCount} almacén{s.warehouseCount === 1 ? '' : 'es'}</td>
                          <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                            <ActionsMenu>
                              <ActionsMenuItem onClick={() => openEdit(s)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                              <ActionsMenuItem onClick={() => setToDelete(s)}>
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

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Sucursal' : 'Nueva Sucursal'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="sucName">Nombre</label>
                  <input id="sucName" className={`ff-input${errors.name ? ' ff-input-error' : ''}`} placeholder="Ej: Sucursal Santo Domingo" {...register('name')} />
                  {errors.name && <p className="ff-error">{errors.name.message}</p>}
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
              <h2 className="modal-title">¿Eliminar sucursal?</h2>
              <button className="modal-close" type="button" onClick={() => setToDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará <strong>{toDelete.name}</strong>. Esta acción no se puede deshacer.
              </p>
              {toDelete.warehouseCount > 0 && (
                <p className="ff-hint" style={{ marginTop: 8, color: 'var(--color-error)' }}>
                  Esta sucursal tiene {toDelete.warehouseCount} almacén{toDelete.warehouseCount === 1 ? '' : 'es'} asociado{toDelete.warehouseCount === 1 ? '' : 's'}. Reasígnalos primero desde Almacenes.
                </p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setToDelete(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate(toDelete.id)}
                disabled={deleteMutation.isPending || toDelete.warehouseCount > 0}
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
