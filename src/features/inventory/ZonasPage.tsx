import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listWarehouses } from '@/shared/api/inventory'
import { listZonas, createZona, updateZona, deleteZona } from '@/shared/api/zonas'
import { listUbicaciones, createUbicacion, updateUbicacion, deleteUbicacion } from '@/shared/api/ubicaciones'
import type { ZonaResponseDto, UbicacionResponseDto, ApiError } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Plus, Pencil, Trash2, X, MapPin, Info } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

// ─── Banner "doctype no instalado" ─────────────────────────────────────────

function NoteBanner({ note }: { note?: string }) {
  if (!note) return null
  return (
    <div className="inline-alert inline-alert-info" style={{ marginBottom: 12 }}>
      <Info size={16} />
      Esta función requiere actualizar la app localizacion_rd en el servidor. Contacta al equipo técnico.
      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{note}</span>
    </div>
  )
}

// ─── Zonas de un almacén ────────────────────────────────────────────────────

function ZonasSection({
  warehouse,
  selectedZona,
  onSelectZona,
}: {
  warehouse: string
  selectedZona: ZonaResponseDto | null
  onSelectZona: (z: ZonaResponseDto | null) => void
}) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<ZonaResponseDto | null>(null)
  const [toDelete, setToDelete] = useState<ZonaResponseDto | null>(null)
  const [includeDisabled, setIncludeDisabled] = useState(false)

  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formDescripcion, setFormDescripcion] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['zonas', warehouse, includeDisabled],
    queryFn: () => listZonas({ warehouse, limit: 100, includeDisabled }),
    enabled: !!warehouse,
  })

  const zonas = data?.items ?? []
  const readOnly = !!data?.note

  // Si el almacén tiene una sola zona, la seleccionamos automáticamente.
  // Se guarda en un ref para no volver a forzarla si el usuario la deselecciona
  // manualmente (click de nuevo sobre la fila) mientras siga en el mismo almacén.
  const autoSelectedWarehouseRef = useRef<string | null>(null)
  useEffect(() => {
    if (autoSelectedWarehouseRef.current !== warehouse) {
      autoSelectedWarehouseRef.current = null
    }
    if (zonas.length === 1 && autoSelectedWarehouseRef.current !== warehouse) {
      autoSelectedWarehouseRef.current = warehouse
      onSelectZona(zonas[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse, zonas.length, zonas[0]?.id])

  function openCreate() {
    setEditTarget(null)
    setFormName('')
    setFormCode('')
    setFormDescripcion('')
    setShowForm(true)
  }

  function openEdit(z: ZonaResponseDto) {
    setEditTarget(z)
    setFormName(z.zonaName)
    setFormCode(z.code ?? '')
    setFormDescripcion(z.descripcion ?? '')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editTarget
        ? updateZona(editTarget.id, { zonaName: formName, code: formCode || undefined, descripcion: formDescripcion || undefined })
        : createZona({ zonaName: formName, warehouse, code: formCode || undefined, descripcion: formDescripcion || undefined }),
    onSuccess: () => {
      toast.success(editTarget ? 'Zona actualizada' : 'Zona creada')
      queryClient.invalidateQueries({ queryKey: ['zonas', warehouse] })
      closeForm()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al guardar la zona'),
  })

  const toggleMutation = useMutation({
    mutationFn: (z: ZonaResponseDto) => updateZona(z.id, { disabled: !z.disabled }),
    onSuccess: () => {
      toast.success('Zona actualizada')
      queryClient.invalidateQueries({ queryKey: ['zonas', warehouse] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al actualizar la zona'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteZona(id),
    onSuccess: () => {
      toast.success('Zona eliminada')
      queryClient.invalidateQueries({ queryKey: ['zonas', warehouse] })
      if (toDelete && selectedZona?.id === toDelete.id) onSelectZona(null)
      setToDelete(null)
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al eliminar la zona')
      setToDelete(null)
    },
  })

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Zonas</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeDisabled} onChange={(e) => setIncludeDisabled(e.target.checked)} />
            Mostrar deshabilitadas
          </label>
          {!readOnly && (
            <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
              <Plus size={14} /> Nueva Zona
            </button>
          )}
        </div>
      </div>
      <div className="card-body" style={{ paddingTop: readOnly ? 16 : 0, padding: readOnly ? 16 : 0 }}>
        <NoteBanner note={data?.note} />
      </div>
      {isLoading ? (
        <div className="card-body"><span className="skeleton-box" style={{ height: 96, display: 'block' }} /></div>
      ) : zonas.length === 0 ? (
        <div className="card-body">
          <div className="empty-state">
            <div className="empty-title">Sin zonas</div>
            <p className="empty-sub">
              {readOnly ? 'No hay zonas disponibles.' : 'Crea la primera zona de este almacén.'}
            </p>
          </div>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Código</th>
              <th>Descripción</th>
              <th>Ubicaciones</th>
              <th>Estado</th>
              <th style={{ width: 96 }} />
            </tr>
          </thead>
          <tbody>
            {zonas.map((z) => (
              <tr
                key={z.id}
                className="table-row-clickable"
                style={{ background: selectedZona?.id === z.id ? 'var(--surface-selected)' : undefined }}
                onClick={() => onSelectZona(selectedZona?.id === z.id ? null : z)}
              >
                <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={13} style={{ color: 'var(--text-tertiary)' }} /> {z.zonaName}
                </td>
                <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{z.code ?? '—'}</td>
                <td className="td-muted">{z.descripcion ?? '—'}</td>
                <td>
                  <span className="badge badge-neutral">
                    {z.ubicacionCount ?? 0} ubicación{(z.ubicacionCount ?? 0) === 1 ? '' : 'es'}
                  </span>
                </td>
                <td>
                  {z.disabled
                    ? <span className="badge badge-neutral">Deshabilitada</span>
                    : <span className="badge badge-success">Activa</span>}
                </td>
                <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-size-icon-sm" onClick={() => openEdit(z)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        onClick={() => toggleMutation.mutate(z)}
                        title={z.disabled ? 'Habilitar' : 'Deshabilitar'}
                      >
                        {z.disabled ? '✓' : '⏸'}
                      </button>
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        style={{ color: 'var(--icon-muted)' }}
                        onClick={() => setToDelete(z)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Zona' : 'Nueva Zona'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Nombre</label>
                <input className="ff-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Zona A" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Código</label>
                <input className="ff-input" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="Ej: ZA" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Descripción</label>
                <textarea className="ff-textarea" rows={2} value={formDescripcion} onChange={(e) => setFormDescripcion(e.target.value)} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => saveMutation.mutate()}
                disabled={!formName.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Guardando…' : editTarget ? 'Guardar Cambios' : 'Crear Zona'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Eliminar zona</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se eliminará la zona <strong>{toDelete.zonaName}</strong>. Si tiene ubicaciones asociadas, no se podrá eliminar.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(toDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Ubicaciones de una zona ────────────────────────────────────────────────

function UbicacionesSection({ zona }: { zona: ZonaResponseDto }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<UbicacionResponseDto | null>(null)
  const [toDelete, setToDelete] = useState<UbicacionResponseDto | null>(null)
  const [includeDisabled, setIncludeDisabled] = useState(false)

  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formDescripcion, setFormDescripcion] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['ubicaciones', zona.id, includeDisabled],
    queryFn: () => listUbicaciones({ zona: zona.id, limit: 100, includeDisabled }),
  })

  const ubicaciones = data?.items ?? []
  const readOnly = !!data?.note

  function openCreate() {
    setEditTarget(null)
    setFormName('')
    setFormCode('')
    setFormDescripcion('')
    setShowForm(true)
  }

  function openEdit(u: UbicacionResponseDto) {
    setEditTarget(u)
    setFormName(u.ubicacionName)
    setFormCode(u.code ?? '')
    setFormDescripcion(u.descripcion ?? '')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editTarget
        ? updateUbicacion(editTarget.id, { ubicacionName: formName, code: formCode || undefined, descripcion: formDescripcion || undefined })
        : createUbicacion({ ubicacionName: formName, zona: zona.id, code: formCode || undefined, descripcion: formDescripcion || undefined }),
    onSuccess: () => {
      toast.success(editTarget ? 'Ubicación actualizada' : 'Ubicación creada')
      queryClient.invalidateQueries({ queryKey: ['ubicaciones', zona.id] })
      queryClient.invalidateQueries({ queryKey: ['zonas', zona.warehouse] })
      closeForm()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al guardar la ubicación'),
  })

  const toggleMutation = useMutation({
    mutationFn: (u: UbicacionResponseDto) => updateUbicacion(u.id, { disabled: !u.disabled }),
    onSuccess: () => {
      toast.success('Ubicación actualizada')
      queryClient.invalidateQueries({ queryKey: ['ubicaciones', zona.id] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al actualizar la ubicación'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUbicacion(id),
    onSuccess: () => {
      toast.success('Ubicación eliminada')
      queryClient.invalidateQueries({ queryKey: ['ubicaciones', zona.id] })
      queryClient.invalidateQueries({ queryKey: ['zonas', zona.warehouse] })
      setToDelete(null)
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al eliminar la ubicación')
      setToDelete(null)
    },
  })

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Ubicaciones — {zona.zonaName}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeDisabled} onChange={(e) => setIncludeDisabled(e.target.checked)} />
            Mostrar deshabilitadas
          </label>
          {!readOnly && (
            <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
              <Plus size={14} /> Nueva Ubicación
            </button>
          )}
        </div>
      </div>
      <div className="card-body" style={{ paddingTop: 0, padding: 0 }}>
        <NoteBanner note={data?.note} />
      </div>
      {isLoading ? (
        <div className="card-body"><span className="skeleton-box" style={{ height: 96, display: 'block' }} /></div>
      ) : ubicaciones.length === 0 ? (
        <div className="card-body">
          <div className="empty-state">
            <div className="empty-title">Sin ubicaciones</div>
            <p className="empty-sub">
              {readOnly ? 'No hay ubicaciones disponibles.' : 'Crea la primera ubicación/rack de esta zona.'}
            </p>
          </div>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Código</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th style={{ width: 96 }} />
            </tr>
          </thead>
          <tbody>
            {ubicaciones.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 500 }}>{u.ubicacionName}</td>
                <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.code ?? '—'}</td>
                <td className="td-muted">{u.descripcion ?? '—'}</td>
                <td>
                  {u.disabled
                    ? <span className="badge badge-neutral">Deshabilitada</span>
                    : <span className="badge badge-success">Activa</span>}
                </td>
                <td className="actions-cell">
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-size-icon-sm" onClick={() => openEdit(u)}>
                        <Pencil size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        onClick={() => toggleMutation.mutate(u)}
                        title={u.disabled ? 'Habilitar' : 'Deshabilitar'}
                      >
                        {u.disabled ? '✓' : '⏸'}
                      </button>
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        style={{ color: 'var(--icon-muted)' }}
                        onClick={() => setToDelete(u)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Ubicación' : 'Nueva Ubicación'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Nombre</label>
                <input className="ff-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Rack 1 - Nivel 2" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Código</label>
                <input className="ff-input" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="Ej: R1-N2" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Descripción</label>
                <textarea className="ff-textarea" rows={2} value={formDescripcion} onChange={(e) => setFormDescripcion(e.target.value)} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => saveMutation.mutate()}
                disabled={!formName.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Guardando…' : editTarget ? 'Guardar Cambios' : 'Crear Ubicación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Eliminar ubicación</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se eliminará la ubicación <strong>{toDelete.ubicacionName}</strong>. Si tiene artículos asignados, no se podrá eliminar.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(toDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ZonasPage() {
  const [warehouse, setWarehouse] = useState('')
  const [warehouseLabel, setWarehouseLabel] = useState('')
  const [warehouseQuery, setWarehouseQuery] = useState('')
  const [selectedZona, setSelectedZona] = useState<ZonaResponseDto | null>(null)

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const warehouseOptions: SearchSelectOption[] = (warehouses ?? [])
    .filter((w) => w.name.toLowerCase().includes(warehouseQuery.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  function handleWarehouseChange(w: string, opt: SearchSelectOption | null) {
    setWarehouse(w)
    setWarehouseLabel(opt?.label ?? '')
    setSelectedZona(null)
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Zonas y Ubicaciones"
        description="Organiza físicamente cada almacén en zonas y ubicaciones/racks. No afecta el stock — solo indica dónde encontrar cada artículo."
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 260 }}>
            <SearchSelect
              value={warehouse}
              selectedLabel={warehouseLabel}
              onChange={handleWarehouseChange}
              options={warehouseOptions}
              onSearch={setWarehouseQuery}
              placeholder="Selecciona un almacén…"
            />
          </div>
        </div>
      </div>

      {!warehouse ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-title">Selecciona un almacén</div>
              <p className="empty-sub">Elige un almacén arriba para ver y gestionar sus zonas y ubicaciones.</p>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ZonasSection warehouse={warehouse} selectedZona={selectedZona} onSelectZona={setSelectedZona} />
          {selectedZona && <UbicacionesSection zona={selectedZona} />}
        </div>
      )}
    </div>
  )
}
