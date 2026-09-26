import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { listSucursales, createSucursal, updateSucursal, deleteSucursal } from '@/shared/api/sucursales'
import { listAlmacenes } from '@/shared/api/config'
import type { Sucursal } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Warehouse } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useLimites } from '@/shared/features/can'
import { limiteSucursalesAlcanzado, textoContadorSucursales } from '@/shared/features/catalog'
import { isApiErrorCode } from '@/shared/api/client'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'

const PAGE_SIZE = 20

const sucursalSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  almacenVenta: z.string().optional(),
  almacenCompra: z.string().optional(),
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
  // Límites del plan (§8): mismo criterio que Usuarios — contador "X de Y" + botón deshabilitado.
  const limites = useLimites()
  const limiteAlcanzado = limiteSucursalesAlcanzado(limites)
  const contador = textoContadorSucursales(limites)

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
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SucursalFormValues>({
    resolver: zodResolver(sucursalSchema),
    defaultValues: { name: '', almacenVenta: '', almacenCompra: '' },
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  // Almacenes de la sucursal en edición — solo estos son elegibles como "Almacén de venta"/"Almacén
  // de compras" (el backend igual valida, pero filtrar acá evita que se elija algo que se va a rechazar).
  const { data: almacenesSucursal, isLoading: loadingAlmacenes } = useQuery({
    queryKey: ['almacenes', { branch: editTarget?.name }],
    queryFn: () => listAlmacenes({ branch: editTarget!.name }),
    enabled: !!editTarget,
  })
  const almacenVentaOptions: SearchSelectOption[] = (almacenesSucursal ?? [])
    .filter((a) => !a.disabled)
    .map((a) => ({ value: a.id, label: a.name }))
  const almacenCompraOptions: SearchSelectOption[] = almacenVentaOptions

  const createMutation = useMutation({
    mutationFn: createSucursal,
    onSuccess: () => {
      toast.success('Sucursal creada')
      queryClient.invalidateQueries({ queryKey: ['sucursales'] })
      closeDialog()
    },
    // §9 LIMITE_SUCURSALES_ALCANZADO (400): mensaje con el límite exacto — mismo texto que el
    // tooltip del botón deshabilitado.
    onError: (err: { message?: string; code?: string; details?: Record<string, unknown> }) => {
      if (isApiErrorCode(err, 'LIMITE_SUCURSALES_ALCANZADO')) {
        const limite = err.details?.['limite']
        toast.error(typeof limite === 'number'
          ? `Se alcanzó el límite del plan (${limite} sucursales).`
          : (err?.message ?? 'Se alcanzó el límite de sucursales del plan.'))
        return
      }
      toast.error(err?.message ?? 'Error al crear la sucursal')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: { name?: string; almacenVenta?: string; almacenCompra?: string } }) => updateSucursal(id, d),
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
    reset({ name: '', almacenVenta: '', almacenCompra: '' })
    setDialogOpen(true)
  }

  function openEdit(s: Sucursal) {
    setEditTarget(s)
    reset({ name: s.name, almacenVenta: s.almacenVenta ?? '', almacenCompra: s.almacenCompra ?? '' })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: SucursalFormValues) {
    if (editTarget) {
      updateMutation.mutate({
        id: editTarget.id,
        data: {
          name: values.name,
          // "" = quitar el almacén de venta/compras (vuelve a sin restricción) — solo se manda
          // cuando cambió respecto al valor original, para no pisar nada si el campo no se tocó.
          ...((values.almacenVenta ?? '') !== (editTarget.almacenVenta ?? '')
            ? { almacenVenta: values.almacenVenta ?? '' }
            : {}),
          ...((values.almacenCompra ?? '') !== (editTarget.almacenCompra ?? '')
            ? { almacenCompra: values.almacenCompra ?? '' }
            : {}),
        },
      })
    } else {
      createMutation.mutate({ name: values.name })
    }
  }

  const sucursales = data?.items ?? []
  const totalPages = data ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Sucursales</>}
        description={data ? `${data.meta.total ?? 0} sucursales` : undefined}
        action={
          <>
            <RecargarButton />
            {contador && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }} title={`${contador} — límite del plan`}>
                {contador}
              </span>
            )}
            <button
              className="btn btn-navy"
              onClick={openCreate}
              disabled={limiteAlcanzado}
              title={limiteAlcanzado ? `Se alcanzó el límite del plan (${contador}).` : undefined}
            >
              <Plus size={16} />
              Nueva Sucursal
            </button>
          </>
        }
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
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
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <SortableTh label="Nombre" sortKey="name" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                <th>Almacenes</th>
                <th>Almacén de venta</th>
                <th>Almacén de compras</th>
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
                          Error al cargar sucursales
                        </td>
                      </tr>
                    )
                  : sucursales.length === 0
                    ? (
                        <tr>
                          <td colSpan={5}>
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
                          <td>
                            {s.almacenVenta ? (
                              <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Warehouse size={12} /> {s.almacenVenta}
                              </span>
                            ) : (
                              <span className="td-muted">Sin restricción</span>
                            )}
                          </td>
                          <td>
                            {s.almacenCompra ? (
                              <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Warehouse size={12} /> {s.almacenCompra}
                              </span>
                            ) : (
                              <span className="td-muted">Sin configurar</span>
                            )}
                          </td>
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

                {editTarget && (
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Almacén de venta
                      <FieldTooltip>
                        Opcional. Si se configura, toda venta de esta sucursal debe salir de este
                        almacén — si no hay suficiente stock ahí, hay que transferirlo primero desde
                        otro almacén de la compañía, aunque pertenezca a la misma sucursal.
                      </FieldTooltip>
                    </label>
                    {almacenVentaOptions.length === 0 ? (
                      <p className="ff-hint">
                        {loadingAlmacenes ? 'Cargando almacenes…' : 'Asigne almacenes a esta sucursal primero (desde Almacenes) para poder elegir uno como almacén de venta.'}
                      </p>
                    ) : (
                      <SearchSelect
                        value={watch('almacenVenta') ?? ''}
                        onChange={(val) => setValue('almacenVenta', val, { shouldDirty: true })}
                        options={almacenVentaOptions}
                        onSearch={() => {}}
                        placeholder="Sin restricción — cualquier almacén de la sucursal sirve"
                        loading={loadingAlmacenes}
                      />
                    )}
                  </div>
                )}

                {editTarget && (
                  <div className="ff-wrap">
                    <label className="ff-label">Almacén de compras</label>
                    <p className="ff-hint" style={{ marginBottom: 8 }}>
                      Opcional. Almacén donde entra la mercancía comprada desde esta sucursal — si no
                      se configura acá ni en el proveedor, las compras que afectan inventario
                      quedarán bloqueadas.
                    </p>
                    {almacenCompraOptions.length === 0 ? (
                      <p className="ff-hint">
                        {loadingAlmacenes ? 'Cargando almacenes…' : 'Asigne almacenes a esta sucursal primero (desde Almacenes) para poder elegir uno como almacén de compras.'}
                      </p>
                    ) : (
                      <SearchSelect
                        value={watch('almacenCompra') ?? ''}
                        onChange={(val) => setValue('almacenCompra', val, { shouldDirty: true })}
                        options={almacenCompraOptions}
                        onSearch={() => {}}
                        placeholder="Sin configurar"
                        loading={loadingAlmacenes}
                      />
                    )}
                  </div>
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
