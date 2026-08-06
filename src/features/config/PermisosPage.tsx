import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldOff, RotateCcw, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect, type SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import {
  getPermisosCatalogo, getPermisos, assignPermiso, deletePermiso, resetPermisos,
  PERMISO_PTYPES, PERMISO_PTYPE_LABELS,
} from '@/shared/api/permisos'
import type { PermisoRow, PermisoPtype, ApiError, AssignPermisoDto } from '@/shared/api/types'

function toOptions(names: string[]): SearchSelectOption[] {
  return names.map((n) => ({ value: n, label: n }))
}

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

export default function PermisosPage() {
  const isSystemManager = useIsSystemManager()
  const queryClient = useQueryClient()

  const [doctype, setDoctype] = useState('')
  const [doctypeSearch, setDoctypeSearch] = useState('')
  const [showAddRole, setShowAddRole] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<PermisoRow | null>(null)

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
      ? all.filter((d) => d.toLowerCase().includes(doctypeSearch.toLowerCase()))
      : all
    return toOptions(filtered.slice(0, 50))
  }, [catalogoQuery.data, doctypeSearch])

  const assignMutation = useMutation({
    mutationFn: (dto: AssignPermisoDto) => assignPermiso(dto),
    onSuccess: (row) => {
      queryClient.setQueryData<PermisoRow[]>(['permisos', doctype], (rows) => {
        if (!rows) return rows
        const idx = rows.findIndex((r) => r.role === row.role && r.permlevel === row.permlevel)
        if (idx === -1) return [...rows, row]
        const next = [...rows]
        next[idx] = row
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

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader title="Permisos" description="Control fino de permisos por DocType" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Esta sección requiere el rol System Manager en ERPNext.</p>
        </div>
      </div>
    )
  }

  const rows = permisosQuery.data ?? []
  const usedRoles = new Set(rows.map((r) => r.role))
  const availableRolesForAdd = (catalogoQuery.data?.roles ?? []).filter((r) => !usedRoles.has(r))
  const catalogoForbidden = (catalogoQuery.error as unknown as ApiError | null)?.statusCode === 403

  if (catalogoForbidden) {
    return (
      <div className="page-container">
        <PageHeader title="Permisos" description="Control fino de permisos por DocType" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Tu usuario no tiene el rol System Manager en ERPNext.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <PageHeader title="Permisos" description="Control fino de permisos por DocType y Rol" />

      <div className="filter-bar">
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

      {!doctype && (
        <div className="empty-state">
          <p className="empty-title">Elegí un DocType</p>
          <p className="empty-sub">Seleccioná un DocType arriba para ver y editar sus reglas de permiso.</p>
        </div>
      )}

      {doctype && (
        <div className="card">
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
              <table className="data-table permisos-matrix">
                <thead>
                  <tr>
                    <th>Rol</th>
                    <th style={{ textAlign: 'center' }}>Nivel</th>
                    {PERMISO_PTYPES.map((pt) => (
                      <th key={pt} style={{ textAlign: 'center' }}>{PERMISO_PTYPE_LABELS[pt]}</th>
                    ))}
                    <th style={{ width: 48 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.role}-${row.permlevel}`}>
                      <td style={{ fontWeight: 500 }}>{row.role}</td>
                      <td className="td-muted" style={{ textAlign: 'center' }}>{row.permlevel}</td>
                      {PERMISO_PTYPES.map((pt) => (
                        <td key={pt} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={row[pt]}
                            onChange={(e) => toggleFlag(row, pt, e.target.checked)}
                            disabled={assignMutation.isPending}
                          />
                        </td>
                      ))}
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
          onAssigned={(row) => {
            queryClient.setQueryData<PermisoRow[]>(['permisos', doctype], (existing) =>
              existing ? [...existing, row] : [row],
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
                restaurarán los permisos de fábrica de ERPNext para todos los roles. Esta acción
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
                Se eliminará la regla de permiso de <strong>{rowToDelete.role}</strong> (nivel{' '}
                {rowToDelete.permlevel}) sobre <strong>{doctype}</strong>. ERPNext puede rechazar
                esta acción si es la única regla de permiso del DocType.
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
  roles: string[]
  onClose: () => void
  onAssigned: (row: PermisoRow) => void
}) {
  const [role, setRole] = useState('')
  const [flags, setFlags] = useState<Record<PermisoPtype, boolean>>(() =>
    Object.fromEntries(PERMISO_PTYPES.map((pt) => [pt, pt === 'read'])) as Record<PermisoPtype, boolean>,
  )

  const mutation = useMutation({
    mutationFn: (dto: AssignPermisoDto) => assignPermiso(dto),
    onSuccess: (row) => {
      toast.success(`Rol ${row.role} agregado a ${doctype}`)
      onAssigned(row)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo agregar el rol')),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    mutation.mutate({ doctype, role, permlevel: 0, ...flags })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Agregar rol a {doctype}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label">Rol</label>
              <select
                className="filter-select"
                style={{ width: '100%' }}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
              >
                <option value="">Elegir rol…</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="ff-label" style={{ display: 'block', marginBottom: 8 }}>Permisos iniciales</label>
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
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!role || mutation.isPending}>
              Agregar rol
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
