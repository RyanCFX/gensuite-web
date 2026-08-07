import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { listWarehouses } from '@/shared/api/inventory'
import { listZonas, createZona, updateZona, deleteZona } from '@/shared/api/zonas'
import {
  listUbicaciones, createUbicacion, updateUbicacion, deleteUbicacion,
  listUbicacionesPendientes, distribuirUbicaciones, listMovimientosUbicaciones,
} from '@/shared/api/ubicaciones'
import type { ZonaResponseDto, UbicacionResponseDto, ApiError, DistribuirUbicacionItemDto } from '@/shared/api/types'
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
    queryFn: () => listUbicaciones({ zona: zona.id, includeDisabled }),
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

// ─── Selector de ubicación destino (con búsqueda) ──────────────────────────

function UbicacionDestinoSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')

  const filteredOptions: SearchSelectOption[] = options
    .filter((o) => !query || o.label.toLowerCase().includes(query.toLowerCase()))
    .map((o) => ({ value: o.id, label: o.label }))

  const selectedLabel = options.find((o) => o.id === value)?.label ?? ''

  return (
    <SearchSelect
      value={value}
      selectedLabel={selectedLabel}
      onChange={(val) => onChange(val)}
      options={filteredOptions}
      onSearch={setQuery}
      placeholder="Buscar ubicación…"
      disabled={disabled}
    />
  )
}

// ─── Pendientes de ubicar ───────────────────────────────────────────────────

function PendientesUbicarSection({ warehouse }: { warehouse: string }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Record<string, { ubicacion: string; cantidad: number; esPrincipal: boolean }>>({})

  useEffect(() => {
    setRows({})
  }, [warehouse])

  const { data, isLoading } = useQuery({
    queryKey: ['ubicaciones-pendientes', warehouse],
    queryFn: () => listUbicacionesPendientes(warehouse),
    enabled: !!warehouse,
  })
  const pendientes = data?.items ?? []
  const readOnly = !!data?.note

  const { data: zonasData } = useQuery({
    queryKey: ['zonas', warehouse],
    queryFn: () => listZonas({ warehouse, limit: 100 }),
    enabled: !!warehouse,
  })
  const zonaNameById = new Map((zonasData?.items ?? []).map((z) => [z.id, z.zonaName]))

  const { data: ubicacionesData } = useQuery({
    queryKey: ['ubicaciones', warehouse, 'all'],
    queryFn: () => listUbicaciones({ warehouse }),
    enabled: !!warehouse,
  })
  const ubicacionOptions = (ubicacionesData?.items ?? []).map((u) => ({
    id: u.id,
    label: zonaNameById.get(u.zona) ? `${zonaNameById.get(u.zona)} / ${u.ubicacionName}` : u.ubicacionName,
  }))

  function updateRow(itemCode: string, actualQty: number, patch: Partial<{ ubicacion: string; cantidad: number; esPrincipal: boolean }>) {
    setRows((prev) => {
      const current = prev[itemCode] ?? { ubicacion: '', cantidad: actualQty, esPrincipal: false }
      return { ...prev, [itemCode]: { ...current, ...patch } }
    })
  }

  const distribuirMutation = useMutation({
    mutationFn: (items: DistribuirUbicacionItemDto[]) => distribuirUbicaciones({ items }),
    onSuccess: (results) => {
      toast.success(`${results.length} artículo${results.length === 1 ? '' : 's'} distribuido${results.length === 1 ? '' : 's'}`)
      setRows({})
      queryClient.invalidateQueries({ queryKey: ['ubicaciones-pendientes', warehouse] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al distribuir los artículos'),
  })

  function handleDistribuir() {
    const items: DistribuirUbicacionItemDto[] = []
    for (const p of pendientes) {
      const draft = rows[p.itemCode]
      if (!draft?.ubicacion || !draft.cantidad || draft.cantidad <= 0) continue
      items.push({
        itemCode: p.itemCode,
        warehouse: p.warehouse,
        ubicacion: draft.ubicacion,
        cantidad: draft.cantidad,
        esPrincipal: draft.esPrincipal || undefined,
      })
    }

    if (items.length === 0) {
      toast.error('Selecciona al menos una ubicación y cantidad para distribuir')
      return
    }
    distribuirMutation.mutate(items)
  }

  const readyCount = pendientes.filter((p) => {
    const d = rows[p.itemCode]
    return !!d?.ubicacion && d.cantidad > 0
  }).length

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Artículos pendientes de ubicar</span>
      </div>
      <div className="card-body" style={{ paddingTop: readOnly ? 16 : 0, padding: readOnly ? 16 : 0 }}>
        <NoteBanner note={data?.note} />
      </div>
      {isLoading ? (
        <div className="card-body"><span className="skeleton-box" style={{ height: 96, display: 'block' }} /></div>
      ) : pendientes.length === 0 ? (
        <div className="card-body">
          <div className="empty-state">
            <div className="empty-title">Sin pendientes</div>
            <p className="empty-sub">
              {readOnly ? 'No hay datos disponibles.' : 'Todos los artículos con stock en este almacén ya tienen una ubicación asignada.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th style={{ textAlign: 'right', width: 100 }}>Sin ubicar</th>
                <th style={{ width: 240 }}>Ubicación destino</th>
                <th style={{ width: 110 }}>Cantidad</th>
                <th style={{ width: 90 }}>Principal</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((p) => {
                const draft = rows[p.itemCode] ?? { ubicacion: '', cantidad: p.actualQty, esPrincipal: false }
                return (
                  <tr key={p.itemCode}>
                    <td style={{ fontWeight: 500 }}>
                      {p.itemName}
                      <span className="td-muted" style={{ display: 'block', fontSize: 11, fontFamily: 'monospace' }}>{p.itemCode}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{p.actualQty}</td>
                    <td>
                      <UbicacionDestinoSelect
                        options={ubicacionOptions}
                        value={draft.ubicacion}
                        onChange={(val) => updateRow(p.itemCode, p.actualQty, { ubicacion: val })}
                        disabled={readOnly}
                      />
                    </td>
                    <td>
                      <input
                        className="ff-input"
                        type="number"
                        min="0"
                        max={p.actualQty}
                        step="1"
                        value={draft.cantidad}
                        onChange={(e) => updateRow(p.itemCode, p.actualQty, { cantidad: Math.min(parseFloat(e.target.value) || 0, p.actualQty) })}
                        style={{ textAlign: 'right' }}
                        disabled={readOnly}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={draft.esPrincipal}
                        onChange={(e) => updateRow(p.itemCode, p.actualQty, { esPrincipal: e.target.checked })}
                        disabled={readOnly}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!readOnly && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16 }}>
              <button
                className="btn btn-primary"
                onClick={handleDistribuir}
                disabled={readyCount === 0 || distribuirMutation.isPending}
              >
                {distribuirMutation.isPending ? 'Distribuyendo…' : `Distribuir${readyCount > 0 ? ` (${readyCount})` : ''}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Historial de movimientos ───────────────────────────────────────────────

const MOVIMIENTOS_PAGE_SIZE = 20

function HistorialMovimientosSection({ warehouse }: { warehouse: string }) {
  const [itemCode, setItemCode] = useState('')
  const [ubicacionFilter, setUbicacionFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    setOffset(0)
  }, [warehouse, itemCode, ubicacionFilter, fromDate, toDate])

  const { data, isLoading } = useQuery({
    queryKey: ['ubicaciones-movimientos', warehouse, itemCode, ubicacionFilter, fromDate, toDate, offset],
    queryFn: () =>
      listMovimientosUbicaciones({
        warehouse: warehouse || undefined,
        itemCode: itemCode || undefined,
        ubicacion: ubicacionFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: MOVIMIENTOS_PAGE_SIZE,
        offset,
      }),
  })

  const movimientos = data?.items ?? []
  const meta = data?.meta
  const readOnly = !!data?.note

  const { data: ubicacionesData } = useQuery({
    queryKey: ['ubicaciones', warehouse, 'all'],
    queryFn: () => listUbicaciones({ warehouse, limit: 200 }),
    enabled: !!warehouse,
  })
  const [ubicacionFilterSearch, setUbicacionFilterSearch] = useState('')
  const ubicacionFilterOptions: SearchSelectOption[] = (ubicacionesData?.items ?? [])
    .filter((u) => !ubicacionFilterSearch || u.ubicacionName.toLowerCase().includes(ubicacionFilterSearch.toLowerCase()))
    .map((u) => ({ value: u.id, label: u.ubicacionName }))

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Historial de movimientos</span>
      </div>
      <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 12 }}>
        <input
          className="ff-input"
          style={{ maxWidth: 200 }}
          placeholder="Código de artículo"
          value={itemCode}
          onChange={(e) => setItemCode(e.target.value)}
        />
        <div style={{ maxWidth: 220, width: '100%' }}>
          <SearchSelect
            value={ubicacionFilter}
            onChange={setUbicacionFilter}
            options={ubicacionFilterOptions}
            onSearch={setUbicacionFilterSearch}
            selectedLabel={ubicacionesData?.items.find((u) => u.id === ubicacionFilter)?.ubicacionName ?? ''}
            placeholder="Todas las ubicaciones"
            disabled={!warehouse}
          />
        </div>
        <input className="ff-input" style={{ maxWidth: 160 }} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input className="ff-input" style={{ maxWidth: 160 }} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>
      <div className="card-body" style={{ paddingTop: 0, padding: 0 }}>
        <NoteBanner note={data?.note} />
      </div>
      {isLoading ? (
        <div className="card-body"><span className="skeleton-box" style={{ height: 96, display: 'block' }} /></div>
      ) : movimientos.length === 0 ? (
        <div className="card-body">
          <div className="empty-state">
            <div className="empty-title">Sin movimientos</div>
            <p className="empty-sub">
              {readOnly ? 'No hay datos disponibles.' : 'No hay movimientos que coincidan con los filtros seleccionados.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Artículo</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th>Almacén</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="td-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{m.fecha}</td>
                  <td>
                    <span className={`badge ${m.tipo === 'distribuir' ? 'badge-info' : 'badge-neutral'}`}>
                      {m.tipo === 'distribuir' ? 'Distribución' : 'Movimiento'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.itemCode}</td>
                  <td style={{ textAlign: 'right' }}>{m.qty}</td>
                  <td className="td-muted">{m.almacen}</td>
                  <td className="td-muted">{m.ubicacionOrigen ?? '— (almacén general)'}</td>
                  <td>{m.ubicacionDestino}</td>
                  <td className="td-muted" style={{ fontSize: 12 }}>{m.notas ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {offset + 1}–{Math.min(offset + MOVIMIENTOS_PAGE_SIZE, meta.total)} de {meta.total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-size-sm"
                  onClick={() => setOffset((o) => Math.max(0, o - MOVIMIENTOS_PAGE_SIZE))}
                  disabled={offset === 0}
                >
                  Anterior
                </button>
                <button
                  className="btn btn-secondary btn-size-sm"
                  onClick={() => setOffset((o) => o + MOVIMIENTOS_PAGE_SIZE)}
                  disabled={!meta.hasMore}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ZonasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<'organizacion' | 'pendientes' | 'historial'>(
    initialTab === 'pendientes' ? 'pendientes' : initialTab === 'historial' ? 'historial' : 'organizacion',
  )
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

  function handleTabChange(tab: 'organizacion' | 'pendientes' | 'historial') {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams)
    params.set('tab', tab)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Zonas y Ubicaciones"
        description="Organiza físicamente cada almacén en zonas y ubicaciones/racks, y distribuye el stock sin ubicar."
      />

      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`tab-btn${activeTab === 'organizacion' ? ' on' : ''}`}
          onClick={() => handleTabChange('organizacion')}
        >
          Zonas y Ubicaciones
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'pendientes' ? ' on' : ''}`}
          onClick={() => handleTabChange('pendientes')}
        >
          Pendientes de ubicar
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'historial' ? ' on' : ''}`}
          onClick={() => handleTabChange('historial')}
        >
          Historial de movimientos
        </button>
      </div>

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

      {activeTab === 'historial' ? (
        <HistorialMovimientosSection warehouse={warehouse} />
      ) : !warehouse ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-title">Selecciona un almacén</div>
              <p className="empty-sub">
                {activeTab === 'organizacion'
                  ? 'Elige un almacén arriba para ver y gestionar sus zonas y ubicaciones.'
                  : 'Elige un almacén arriba para ver sus artículos pendientes de ubicar.'}
              </p>
            </div>
          </div>
        </div>
      ) : activeTab === 'organizacion' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ZonasSection warehouse={warehouse} selectedZona={selectedZona} onSelectZona={setSelectedZona} />
          {selectedZona && <UbicacionesSection zona={selectedZona} />}
        </div>
      ) : (
        <PendientesUbicarSection warehouse={warehouse} />
      )}
    </div>
  )
}
