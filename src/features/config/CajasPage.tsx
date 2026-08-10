import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listCajas, createCaja, updateCaja, deleteCaja } from '@/shared/api/cajas'
import { listWarehouses } from '@/shared/api/inventory'
import { listSucursales } from '@/shared/api/sucursales'
import type { Caja } from '@/shared/api/types'
import { Plus, Pencil, Trash2, Search, Ban, CheckCircle } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/shared/ui/Badge'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'

interface CajaFormValues {
  label: string
  warehouse: string
  branch: string
}

function emptyForm(): CajaFormValues {
  return { label: '', warehouse: '', branch: '' }
}

export default function CajasPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Caja | null>(null)
  const [toDelete, setToDelete] = useState<Caja | null>(null)
  const [form, setForm] = useState<CajaFormValues>(emptyForm())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cajas'],
    queryFn: listCajas,
  })

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const warehouseOptions: SearchSelectOption[] = (warehousesData ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const cajas = (data ?? []).filter((c) =>
    !search || c.label.toLowerCase().includes(search.toLowerCase()),
  )

  const isDirty = useDirtyCheck(form, dialogOpen)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: () => createCaja({ label: form.label, warehouse: form.warehouse, branch: form.branch || undefined }),
    onSuccess: () => {
      toast.success('Caja creada')
      queryClient.invalidateQueries({ queryKey: ['cajas'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la caja'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: { warehouse?: string; branch?: string; disabled?: boolean } }) =>
      updateCaja(id, d),
    onSuccess: () => {
      toast.success('Caja actualizada')
      queryClient.invalidateQueries({ queryKey: ['cajas'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la caja'),
  })

  const toggleDisabledMutation = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => updateCaja(id, { disabled }),
    onSuccess: (_, vars) => {
      toast.success(vars.disabled ? 'Caja deshabilitada' : 'Caja habilitada')
      queryClient.invalidateQueries({ queryKey: ['cajas'] })
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la caja'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCaja(id),
    onSuccess: () => {
      toast.success('Caja eliminada')
      queryClient.invalidateQueries({ queryKey: ['cajas'] })
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al eliminar la caja'),
  })

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(c: Caja) {
    setEditTarget(c)
    setForm({ label: c.label, warehouse: c.warehouse, branch: c.branch ?? '' })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    setForm(emptyForm())
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: { warehouse: form.warehouse, branch: form.branch || undefined } })
    } else {
      if (!form.label.trim()) { toast.error('La etiqueta es requerida'); return }
      if (!form.warehouse) { toast.error('Selecciona un almacén'); return }
      createMutation.mutate()
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <div className="page-container">
      <PageHeader
        title="Cajas"
        description={data ? `${data.length} caja(s) — soporta turnos abiertos simultáneamente` : undefined}
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            Nueva Caja
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por etiqueta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th>Almacén</th>
                <th>Sucursal</th>
                <th>Estado</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
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
                          Error al cargar las cajas
                        </td>
                      </tr>
                    )
                  : cajas.length === 0
                    ? (
                        <tr>
                          <td colSpan={5}>
                            <div className="empty-state">
                              <p className="empty-title">Sin cajas</p>
                              <p className="empty-sub">Crea la primera caja para poder abrir turnos.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : cajas.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>
                            {c.label}
                            {c.isTenantDefault && <span className="ff-hint" style={{ marginLeft: 6 }}>(default del tenant)</span>}
                          </td>
                          <td className="td-muted">{c.warehouse}</td>
                          <td className="td-muted">{c.branch ?? '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {c.isOpen && <Badge variant="success">En uso</Badge>}
                              {c.disabled && <Badge variant="neutral">Deshabilitada</Badge>}
                              {c.isUserDefault && <Badge variant="info">Tu caja por defecto</Badge>}
                            </div>
                          </td>
                          <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                            <ActionsMenu>
                              <ActionsMenuItem onClick={() => openEdit(c)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                              <ActionsMenuItem onClick={() => toggleDisabledMutation.mutate({ id: c.id, disabled: !c.disabled })}>
                                {c.disabled ? <CheckCircle size={14} /> : <Ban size={14} />}
                                {c.disabled ? 'Habilitar' : 'Deshabilitar'}
                              </ActionsMenuItem>
                              <ActionsMenuItem danger onClick={() => setToDelete(c)} disabled={c.isOpen}>
                                <Trash2 size={14} /> Eliminar
                              </ActionsMenuItem>
                            </ActionsMenu>
                          </td>
                        </tr>
                      ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Caja' : 'Nueva Caja'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={onSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!editTarget && (
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="cajaLabel">Etiqueta</label>
                    <input
                      id="cajaLabel"
                      className="ff-input"
                      placeholder="Ej: Caja 1, Caja Mostrador"
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    />
                    <p className="ff-hint">Se guardará internamente como "POS {form.label || '…'}".</p>
                  </div>
                )}
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Almacén</label>
                  <SearchSelect
                    value={form.warehouse}
                    onChange={(val) => setForm((f) => ({ ...f, warehouse: val }))}
                    options={warehouseOptions}
                    onSearch={setWarehouseSearch}
                    selectedLabel={warehousesData?.find((w) => w.id === form.warehouse)?.name ?? ''}
                    placeholder="Seleccionar almacén…"
                  />
                  <p className="ff-hint">Almacén del que esta caja descuenta inventario.</p>
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <SearchSelect
                    value={form.branch}
                    onChange={(val) => setForm((f) => ({ ...f, branch: val }))}
                    options={branchOptions}
                    onSearch={setBranchSearch}
                    selectedLabel={form.branch}
                    placeholder="Sin especificar"
                  />
                  <p className="ff-hint">Requerida solo si tu tenant tiene la dimensión "Sucursal" activada.</p>
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
              <h2 className="modal-title">¿Eliminar caja?</h2>
              <button className="modal-close" type="button" onClick={() => setToDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará <strong>{toDelete.label}</strong>. Esta acción no se puede deshacer.
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
