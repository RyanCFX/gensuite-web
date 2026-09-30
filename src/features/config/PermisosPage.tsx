import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissionsStore } from '@/stores/permissions.store'
import { toast } from 'sonner'
import { ShieldOff, RotateCcw, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { SearchSelect, type SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { useAccesoV2Activo } from '@/shared/permissions/useAcceso'
import {
  getPermisosCatalogo, getPermisos, assignPermiso, deletePermiso, resetPermisos,
  PERMISO_PTYPES, PERMISO_PTYPE_LABELS,
} from '@/shared/api/permisos'
import type { PermisoRow, PermisoPtype, PermisoCatalogoItem, ApiError, AssignPermisoDto } from '@/shared/api/types'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

function toOptions(items: PermisoCatalogoItem[]): SearchSelectOption[] {
  return items.map((it) => ({ value: it.value, label: it.label_es ?? it.value }))
}

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

/** Clave de la celda (rol-nivel-ptype) cuyo toggle está en vuelo. El DTO de un
 *  toggle trae exactamente un flag booleano (el del modal "Agregar rol" trae
 *  varios) — solo en ese caso se marca la celda para el spinner puntual. */
function pendingCellKey(dto: AssignPermisoDto): string | null {
  const pts = PERMISO_PTYPES.filter((pt) => typeof dto[pt] === 'boolean')
  if (pts.length !== 1) return null
  return `${dto.role}-${dto.permlevel ?? 0}-${pts[0]}`
}

export default function PermisosPage() {
  const isSystemManager = useIsSystemManager()
  // Permisos v2 activo: esta matriz DocPerm la deriva el backend desde los perfiles de
  // acceso — queda como vista avanzada (§7 del prompt v2).
  const v2Activo = useAccesoV2Activo()
  const queryClient = useQueryClient()

  // Al salir de la pantalla de administración de permisos, refrescar los permisos de la sesión
  // (docs/PROMPT_PERMISOS_FRONTEND.md §5.2 / §12.2): el administrador pudo haberse cambiado sus
  // propios permisos y la UI debe reflejarlo sin recargar.
  useEffect(() => {
    return () => {
      usePermissionsStore.getState().refreshSilencioso()
    }
  }, [])

  const [doctype, setDoctype] = useState('')
  const [doctypeSearch, setDoctypeSearch] = useState('')
  const [showAddRole, setShowAddRole] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<PermisoRow | null>(null)
  const [pendingCell, setPendingCell] = useState<string | null>(null)

  const catalogoQuery = useQuery({
    queryKey: ['permisos-catalogo'],
    queryFn: getPermisosCatalogo,
    enabled: isSystemManager,
    retry: false,
  })

  const permisosQuery = useQuery({
    queryKey: ['permisos', doctype],
    queryFn: () => getPermisos({ doctype }),
    enabled: isSystemManager && !!doctype,
    retry: false,
  })

  const doctypeOptions = useMemo(() => {
    const all = catalogoQuery.data?.doctypes ?? []
    const filtered = doctypeSearch
      ? all.filter((d) => (d.label_es ?? d.value).toLowerCase().includes(doctypeSearch.toLowerCase()))
      : all
    return toOptions(filtered.slice(0, 50))
  }, [catalogoQuery.data, doctypeSearch])

  const assignMutation = useMutation({
    mutationFn: (dto: AssignPermisoDto) => assignPermiso(dto),
    onMutate: (dto) => setPendingCell(pendingCellKey(dto)),
    onSettled: (_data, _err, dto) =>
      setPendingCell((cur) => {
        const key = pendingCellKey(dto)
        return key !== null && cur === key ? null : cur
      }),
    onSuccess: (rows) => {
      queryClient.setQueryData<PermisoRow[]>(['permisos', doctype], (existing) => {
        if (!existing) return rows
        const next = [...existing]
        for (const row of rows) {
          const idx = next.findIndex((r) => r.role === row.role && r.permlevel === row.permlevel)
          if (idx === -1) next.push(row)
          else next[idx] = row
        }
        return next
      })
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo actualizar el permiso')),
  })

  const deleteMutation = useMutation({
    mutationFn: deletePermiso,
    onSuccess: () => {
      toast.success('Regla de permiso eliminada')
      queryClient.invalidateQueries({ queryKey: ['permisos', doctype] })
      setRowToDelete(null)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo eliminar la regla')),
  })

  const resetMutation = useMutation({
    mutationFn: () => resetPermisos(doctype),
    onSuccess: () => {
      toast.success('Permisos restablecidos a los valores estándar')
      queryClient.invalidateQueries({ queryKey: ['permisos', doctype] })
      setConfirmReset(false)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo restablecer')),
  })

  function toggleFlag(row: PermisoRow, ptype: PermisoPtype, value: boolean) {
    assignMutation.mutate({ doctype, role: row.role, permlevel: row.permlevel, [ptype]: value } as AssignPermisoDto)
  }

  const PERMISOS_MATRIX_COLUMNS = [
    { key: 'rol', width: 200 },
    { key: 'nivel', width: 90 },
    ...PERMISO_PTYPES.map((pt) => ({ key: pt, width: 100 })),
    { key: 'actions', width: 48 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(PERMISOS_MATRIX_COLUMNS)

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader title="Permisos" description="Control fino de permisos por DocType" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Esta sección requiere el rol System Manager.</p>
        </div>
      </div>
    )
  }

  const rows = permisosQuery.data ?? []
  const usedRoles = new Set(rows.map((r) => r.role))
  const availableRolesForAdd = (catalogoQuery.data?.roles ?? []).filter((r) => !usedRoles.has(r.value))
  const catalogoForbidden = (catalogoQuery.error as unknown as ApiError | null)?.statusCode === 403

  if (catalogoForbidden) {
    return (
      <div className="page-container">
        <PageHeader title="Permisos" description="Control fino de permisos por DocType" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Tu usuario no tiene el rol System Manager.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Permisos</>}
        description="Control fino de permisos por DocType y Rol"
        action={<RecargarButton />}
      />

      {v2Activo && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          Vista avanzada: los permisos se asignan desde los perfiles de acceso
          (Configuración → Acceso) y el sistema los refleja acá solo.
        </div>
      )}

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ minWidth: 340 }}>
              <SearchSelect
                value={doctype}
                onChange={(v) => setDoctype(v)}
                options={doctypeOptions}
                onSearch={setDoctypeSearch}
                loading={catalogoQuery.isLoading}
                placeholder="Elegir DocType…"
              />
            </div>
            {doctype && (
              <div className="filter-bar-right">
                <button className="btn btn-secondary btn-size-sm" onClick={() => setShowAddRole(true)}>
                  <Plus size={14} /> Agregar rol
                </button>
                <button className="btn btn-ghost btn-size-sm" onClick={() => setConfirmReset(true)}>
                  <RotateCcw size={14} /> Restablecer a estándar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!doctype && (
        <div className="empty-state">
          <p className="empty-title">Elegí un DocType</p>
          <p className="empty-sub">Seleccioná un DocType arriba para ver y editar sus reglas de permiso.</p>
        </div>
      )}

      {doctype && (
        <div className="card navy-table-card">
          {permisosQuery.isLoading && (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="skeleton-box" style={{ height: 32, width: '100%' }} />
              ))}
            </div>
          )}
          {permisosQuery.isError && (
            <div className="inline-alert inline-alert-error" style={{ margin: 16 }}>
              {apiMessage(permisosQuery.error, 'Error al cargar los permisos')}
            </div>
          )}
          {!permisosQuery.isLoading && !permisosQuery.isError && rows.length === 0 && (
            <div className="empty-state">
              <p className="empty-title">Sin reglas de permiso</p>
              <p className="empty-sub">Este DocType no tiene roles asignados todavía. Usá "Agregar rol" para crear la primera regla.</p>
            </div>
          )}
          {!permisosQuery.isLoading && !permisosQuery.isError && rows.length > 0 && (
            <div className="table-scroll">
              <table className="data-table navy-table permisos-matrix items-table-resizable">
                <colgroup>
                  {PERMISOS_MATRIX_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      Rol
                      <span className="col-resize-handle" onMouseDown={startResize('rol')} />
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      Nivel
                      <span className="col-resize-handle" onMouseDown={startResize('nivel')} />
                    </th>
                    {PERMISO_PTYPES.map((pt) => (
                      <th key={pt} style={{ textAlign: 'center' }}>
                        {PERMISO_PTYPE_LABELS[pt]}
                        <span className="col-resize-handle" onMouseDown={startResize(pt)} />
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.role}-${row.permlevel}`}>
                      <td style={{ fontWeight: 500 }}>{row.role_label_es ?? row.role}</td>
                      <td className="td-muted" style={{ textAlign: 'center' }}>{row.permlevel}</td>
                      {PERMISO_PTYPES.map((pt) => {
                        const cellKey = `${row.role}-${row.permlevel}-${pt}`
                        const cellPending = pendingCell === cellKey
                        return (
                          <td key={pt} style={{ textAlign: 'center' }}>
                            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
                              <input
                                type="checkbox"
                                checked={row[pt]}
                                onChange={(e) => toggleFlag(row, pt, e.target.checked)}
                                disabled={cellPending}
                                style={cellPending ? { opacity: 0.35 } : undefined}
                                aria-busy={cellPending || undefined}
                              />
                              {cellPending && (
                                <span className="spinner spinner-brand spinner-sm" role="status" aria-label="Guardando…" style={{ position: 'absolute' }} />
                              )}
                            </span>
                          </td>
                        )
                      })}
                      <td className="actions-cell">
                        <button
                          className="btn btn-ghost btn-size-icon-sm"
                          onClick={() => setRowToDelete(row)}
                          title="Eliminar regla"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddRole && (
        <AddRoleModal
          doctype={doctype}
          roles={availableRolesForAdd}
          onClose={() => setShowAddRole(false)}
          onAssigned={(rows) => {
            queryClient.setQueryData<PermisoRow[]>(['permisos', doctype], (existing) =>
              existing ? [...existing, ...rows] : rows,
            )
            setShowAddRole(false)
          }}
        />
      )}

      {confirmReset && (
        <div className="modal-overlay" onClick={() => setConfirmReset(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Restablecer permisos?</h2>
              <button className="modal-close" onClick={() => setConfirmReset(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se borrarán TODAS las reglas personalizadas de <strong>{doctype}</strong> y se
                restaurarán los permisos de fábrica para todos los roles. Esta acción
                afecta a todos los roles de golpe y no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                Restablecer
              </button>
            </div>
          </div>
        </div>
      )}

      {rowToDelete && (
        <div className="modal-overlay" onClick={() => setRowToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar regla?</h2>
              <button className="modal-close" onClick={() => setRowToDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará la regla de permiso de <strong>{rowToDelete.role_label_es ?? rowToDelete.role}</strong> (nivel{' '}
                {rowToDelete.permlevel}) sobre <strong>{doctype}</strong>. Esta acción puede
                rechazarse si es la única regla de permiso del DocType.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setRowToDelete(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate({ doctype, role: rowToDelete.role, permlevel: rowToDelete.permlevel })}
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

function AddRoleModal({
  doctype,
  roles,
  onClose,
  onAssigned,
}: {
  doctype: string
  roles: PermisoCatalogoItem[]
  onClose: () => void
  onAssigned: (rows: PermisoRow[]) => void
}) {
  const [role, setRole] = useState('')
  const [roleSearch, setRoleSearch] = useState('')
  const roleOptions = toOptions(
    roles.filter((r) => !roleSearch || (r.label_es ?? r.value).toLowerCase().includes(roleSearch.toLowerCase())),
  )
  const [flags, setFlags] = useState<Record<PermisoPtype, boolean>>(() =>
    Object.fromEntries(PERMISO_PTYPES.map((pt) => [pt, pt === 'read'])) as Record<PermisoPtype, boolean>,
  )

  const isDirty = useDirtyCheck({ role, flags }, true)
  const closeModal = useConfirmClose(isDirty, onClose)

  const mutation = useMutation({
    mutationFn: (dto: AssignPermisoDto) => assignPermiso(dto),
    onSuccess: (rows) => {
      const first = rows[0]
      toast.success(`Rol ${first?.role ?? role} agregado a ${doctype}`)
      onAssigned(rows)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo agregar el rol')),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    mutation.mutate({ doctype, role, permlevel: 0, ...flags })
  }

  return (
    <div className="modal-overlay" onClick={closeModal.requestClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Agregar rol a {doctype}</h2>
          <button className="modal-close" onClick={closeModal.requestClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label">Rol</label>
              <SearchSelect
                value={role}
                onChange={setRole}
                options={roleOptions}
                onSearch={setRoleSearch}
                selectedLabel={role}
                placeholder="Elegir rol…"
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="ff-label" style={{ margin: 0 }}>Permisos iniciales</label>
                {(() => {
                  const todosSeleccionados = PERMISO_PTYPES.every((pt) => flags[pt])
                  return (
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-sm"
                      onClick={() =>
                        setFlags(() =>
                          Object.fromEntries(
                            PERMISO_PTYPES.map((pt) => [pt, !todosSeleccionados]),
                          ) as Record<PermisoPtype, boolean>,
                        )
                      }
                    >
                      {todosSeleccionados ? 'Quitar todos' : 'Seleccionar todos'}
                    </button>
                  )
                })()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {PERMISO_PTYPES.map((pt) => (
                  <label key={pt} className="ff-check-wrap" style={{ fontSize: 13 }}>
                    <input
                      type="checkbox"
                      className="ff-check"
                      checked={flags[pt]}
                      onChange={(e) => setFlags((f) => ({ ...f, [pt]: e.target.checked }))}
                    />
                    {PERMISO_PTYPE_LABELS[pt]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={closeModal.requestClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!role || mutation.isPending}>
              Agregar rol
            </button>
          </div>
        </form>
      </div>
      <ConfirmModal
        open={closeModal.confirming}
        onClose={closeModal.cancelDiscard}
        onConfirm={closeModal.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}
