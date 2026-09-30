import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldOff, Plus, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { useAccesoV2Activo } from '@/shared/permissions/useAcceso'
import { listRoles } from '@/shared/api/usuarios'
import { createRole, getPerfiles, createPerfil, updatePerfilRoles, deletePerfil } from '@/shared/api/roles'
import type { ApiError, CreateRoleDto, RolePerfil } from '@/shared/api/types'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

const ROLES_COLUMNS = [
  { key: 'rol', width: 260 },
  { key: 'actions', width: 48 },
]

const PERFILES_COLUMNS = [
  { key: 'perfil', width: 220 },
  { key: 'roles', width: 320 },
  { key: 'actions', width: 110 },
]

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

type TabKey = 'roles' | 'perfiles'

export default function RolesPage() {
  const isSystemManager = useIsSystemManager()
  // Permisos v2 activo: los Role Profiles/roles de ERPNext los deriva el backend desde los
  // perfiles de acceso — la gestión manual queda como avanzada (§7 del prompt v2).
  const v2Activo = useAccesoV2Activo()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>('roles')
  const [showCreate, setShowCreate] = useState(false)
  const [showCreatePerfil, setShowCreatePerfil] = useState(false)
  const [editingPerfil, setEditingPerfil] = useState<RolePerfil | null>(null)
  const [deletingPerfil, setDeletingPerfil] = useState<RolePerfil | null>(null)
  const { widths: colWidths, startResize } = useResizableColumns(ROLES_COLUMNS)
  const { widths: perfilColWidths, startResize: startPerfilResize } = useResizableColumns(PERFILES_COLUMNS)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['roles-admin'],
    queryFn: listRoles,
    enabled: isSystemManager,
    retry: false,
  })

  const {
    data: perfiles,
    isLoading: perfilesLoading,
    isError: perfilesError,
    error: perfilesQueryError,
  } = useQuery({
    queryKey: ['roles-perfiles'],
    queryFn: getPerfiles,
    enabled: isSystemManager,
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: (dto: CreateRoleDto) => createRole(dto),
    onSuccess: (_, dto) => {
      toast.success(`Rol "${dto.roleName}" creado`)
      queryClient.invalidateQueries({ queryKey: ['roles-admin'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setShowCreate(false)
      navigate(`/config/roles/${encodeURIComponent(dto.roleName)}`)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo crear el rol')),
  })

  const createPerfilMutation = useMutation({
    mutationFn: (dto: { nombre: string; roles: string[] }) => createPerfil(dto),
    onSuccess: (_, dto) => {
      toast.success(`Perfil "${dto.nombre}" creado`)
      queryClient.invalidateQueries({ queryKey: ['roles-perfiles'] })
      setShowCreatePerfil(false)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo crear el perfil')),
  })

  const updatePerfilMutation = useMutation({
    mutationFn: ({ name, roles }: { name: string; roles: string[] }) => updatePerfilRoles(name, { roles }),
    onSuccess: (_, vars) => {
      toast.success(`Perfil "${vars.name}" actualizado`)
      queryClient.invalidateQueries({ queryKey: ['roles-perfiles'] })
      setEditingPerfil(null)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo actualizar el perfil')),
  })

  const deletePerfilMutation = useMutation({
    mutationFn: (name: string) => deletePerfil(name),
    onSuccess: (_, name) => {
      toast.success(`Perfil "${name}" eliminado`)
      queryClient.invalidateQueries({ queryKey: ['roles-perfiles'] })
      setDeletingPerfil(null)
    },
    // El backend puede rechazar con 409/400 si el perfil sigue asignado a algún
    // usuario — el message ya viene en español, se muestra tal cual.
    onError: (err) => toast.error(apiMessage(err, 'No se pudo eliminar el perfil')),
  })

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader title="Roles" description="Roles del sistema y usuarios asignados" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Esta sección requiere el rol System Manager en el sistema.</p>
        </div>
      </div>
    )
  }

  const forbidden = (error as unknown as ApiError | null)?.statusCode === 403
  const perfilesForbidden = (perfilesQueryError as unknown as ApiError | null)?.statusCode === 403

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Roles</>}
        description="Roles del sistema y usuarios asignados"
        action={
          <>
            <RecargarButton />
            {activeTab === 'roles' ? (
              <button className="btn btn-navy" onClick={() => setShowCreate(true)}>
                <Plus size={16} /> Nuevo Rol
              </button>
            ) : (
              <button className="btn btn-navy" onClick={() => setShowCreatePerfil(true)}>
                <Plus size={16} /> Nuevo perfil
              </button>
            )}
          </>
        }
      />

      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`tab-btn${activeTab === 'roles' ? ' on' : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          Roles
        </button>
        {!v2Activo && (
          <button
            type="button"
            className={`tab-btn${activeTab === 'perfiles' ? ' on' : ''}`}
            onClick={() => setActiveTab('perfiles')}
          >
            Perfiles de rol
          </button>
        )}
      </div>

      {v2Activo && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          Los roles de ERPNext se asignan solos desde los perfiles de acceso
          (Configuración → Acceso). Esta pantalla queda como administración avanzada.
        </div>
      )}

      {activeTab === 'roles' || v2Activo ? (
      <div className="card navy-table-card">
      <div className="table-scroll">
        <table className="data-table navy-table items-table-resizable">
          <colgroup>
            {ROLES_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                Rol
                <span className="col-resize-handle" onMouseDown={startResize('rol')} />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="skeleton-box" style={{ height: 14, width: '40%' }} /></td>
                    <td />
                  </tr>
                ))
              : forbidden
                ? (
                    <tr>
                      <td colSpan={2}>
                        <div className="empty-state">
                          <p className="empty-title">Acceso restringido</p>
                          <p className="empty-sub">Tu usuario no tiene el rol System Manager en el sistema.</p>
                        </div>
                      </td>
                    </tr>
                  )
                : isError
                  ? (
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          {apiMessage(error, 'Error al cargar los roles')}
                        </td>
                      </tr>
                    )
                  : (data ?? []).map((role) => (
                      <tr
                        key={role.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/config/roles/${encodeURIComponent(role.id)}`)}
                      >
                        <td style={{ fontWeight: 500 }}>{role.label}</td>
                        <td className="td-muted" style={{ textAlign: 'center' }}>
                          <ChevronRight size={14} />
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>
      </div>
      ) : (
      <div className="card navy-table-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Perfiles de rol</h3>
            <p className="card-sub">Agrupan roles planos — forma recomendada de asignar permisos a usuarios</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
            <colgroup>
              {PERFILES_COLUMNS.map((c) => <col key={c.key} style={{ width: perfilColWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Perfil
                  <span className="col-resize-handle" onMouseDown={startPerfilResize('perfil')} />
                </th>
                <th>
                  Roles
                  <span className="col-resize-handle" onMouseDown={startPerfilResize('roles')} />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {perfilesLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td><div className="skeleton-box" style={{ height: 14, width: '40%' }} /></td>
                      <td><div className="skeleton-box" style={{ height: 14, width: '70%' }} /></td>
                      <td />
                    </tr>
                  ))
                : perfilesForbidden
                  ? (
                      <tr>
                        <td colSpan={3}>
                          <div className="empty-state">
                            <p className="empty-title">Acceso restringido</p>
                            <p className="empty-sub">Tu usuario no tiene el rol System Manager en el sistema.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : perfilesError
                    ? (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            {apiMessage(perfilesQueryError, 'Error al cargar los perfiles')}
                          </td>
                        </tr>
                      )
                    : (perfiles ?? []).length === 0
                      ? (
                          <tr>
                            <td colSpan={3}>
                              <div className="empty-state">
                                <p className="empty-title">Sin perfiles</p>
                                <p className="empty-sub">No hay perfiles de rol configurados.</p>
                              </div>
                            </td>
                          </tr>
                        )
                      : (perfiles ?? []).map((p) => (
                          <tr key={p.name}>
                            <td style={{ fontWeight: 500 }}>{p.name}</td>
                            <td className="td-muted" style={{ fontSize: 13 }} title={(p.rolesEs ?? p.roles).join(', ')}>
                              {p.roles.length === 0 ? 'Sin roles' : p.roles.join(', ')}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setEditingPerfil(p)}
                                title={`Editar roles de ${p.name}`}
                              >
                                <Pencil size={14} /> Editar roles
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--error-text)' }}
                                onClick={() => setDeletingPerfil(p)}
                                title={`Eliminar ${p.name}`}
                              >
                                <Trash2 size={14} /> Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onSubmit={(dto) => createMutation.mutate(dto)}
          isPending={createMutation.isPending}
        />
      )}

      {showCreatePerfil && (
        <PerfilFormModal
          mode="create"
          onClose={() => setShowCreatePerfil(false)}
          onSubmit={(nombre, roles) => createPerfilMutation.mutate({ nombre, roles })}
          isPending={createPerfilMutation.isPending}
        />
      )}

      {editingPerfil && (
        <PerfilFormModal
          key={editingPerfil.name}
          mode="edit"
          perfilName={editingPerfil.name}
          initialRoles={editingPerfil.roles}
          onClose={() => setEditingPerfil(null)}
          onSubmit={(_nombre, roles) => updatePerfilMutation.mutate({ name: editingPerfil.name, roles })}
          isPending={updatePerfilMutation.isPending}
        />
      )}

      <ConfirmModal
        open={deletingPerfil !== null}
        onClose={() => { if (!deletePerfilMutation.isPending) setDeletingPerfil(null) }}
        onConfirm={() => deletingPerfil && deletePerfilMutation.mutate(deletingPerfil.name)}
        title="¿Eliminar perfil?"
        description={deletingPerfil
          ? `Se eliminará el perfil "${deletingPerfil.name}". Si sigue asignado a algún usuario, el servidor lo rechazará.`
          : ''}
        confirmLabel={deletePerfilMutation.isPending ? 'Eliminando…' : 'Eliminar'}
        loading={deletePerfilMutation.isPending}
        variant="danger"
      />
    </div>
  )
}

function CreateRoleModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void
  onSubmit: (dto: CreateRoleDto) => void
  isPending: boolean
}) {
  const [roleName, setRoleName] = useState('')
  const [deskAccess, setDeskAccess] = useState(true)

  const isDirty = useDirtyCheck({ roleName, deskAccess }, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!roleName.trim()) return
    onSubmit({ roleName: roleName.trim(), deskAccess })
  }

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Nuevo Rol</h2>
          <button className="modal-close" onClick={requestClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="roleName">Nombre del rol</label>
              <input
                id="roleName"
                className="ff-input"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Ej. Supervisor de Caja"
                autoFocus
                required
              />
            </div>
            <label className="ff-check-wrap">
              <input
                type="checkbox"
                className="ff-check"
                checked={deskAccess}
                onChange={(e) => setDeskAccess(e.target.checked)}
              />
              Acceso al Desk
            </label>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!roleName.trim() || isPending}>
              Crear Rol
            </button>
          </div>
        </form>
      </div>
      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}

/** Selector múltiple de roles (mismo combo que la gestión de Role: GET /roles) + nombre. */
function PerfilFormModal({
  mode,
  perfilName,
  initialRoles,
  onClose,
  onSubmit,
  isPending,
}: {
  mode: 'create' | 'edit'
  perfilName?: string
  initialRoles?: string[]
  onClose: () => void
  onSubmit: (nombre: string, roles: string[]) => void
  isPending: boolean
}) {
  const [nombre, setNombre] = useState(perfilName ?? '')
  const [selected, setSelected] = useState<string[]>(initialRoles ?? [])

  const { data: allRoles, isError: rolesError } = useQuery({
    queryKey: ['roles-admin'],
    queryFn: listRoles,
    retry: false,
  })

  const isDirty = useDirtyCheck({ nombre, selected }, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  function toggle(role: string) {
    setSelected((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'create' && !nombre.trim()) return
    // PUT = reemplazo total: se manda el array completo (actuales ± cambios), nunca un delta.
    onSubmit(mode === 'create' ? nombre.trim() : (perfilName ?? ''), selected)
  }

  const allSelected = (allRoles ?? []).length > 0 && selected.length === (allRoles ?? []).length

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">{mode === 'create' ? 'Nuevo perfil' : `Editar roles — ${perfilName}`}</h2>
          <button className="modal-close" onClick={requestClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mode === 'create' && (
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="perfilNombre">Nombre del perfil</label>
                <input
                  id="perfilNombre"
                  className="ff-input"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Cajero POS"
                  autoFocus
                  required
                />
              </div>
            )}
            <div className="ff-wrap">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="ff-label">Roles del perfil</label>
                {(allRoles ?? []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(allSelected ? [] : (allRoles ?? []).map((r) => r.id))}
                    style={{ fontSize: 13, color: 'var(--color-navy)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    {allSelected ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                maxHeight: 240,
                overflowY: 'auto',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
              }}>
                {rolesError ? (
                  <p style={{ fontSize: 13, color: 'var(--error-text)', gridColumn: '1 / -1' }}>
                    No se pudieron cargar los roles. Verifica tu conexión o tus permisos e intenta de nuevo.
                  </p>
                ) : (allRoles ?? []).length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', gridColumn: '1 / -1' }}>
                    No hay roles disponibles.
                  </p>
                ) : (allRoles ?? []).map((r) => (
                  <label key={r.id} className="ff-check-wrap" title={r.label}>
                    <input type="checkbox" className="ff-check" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                    <span style={{ fontSize: 13 }}>{r.label}</span>
                  </label>
                ))}
              </div>
              <p className="ff-hint">
                {mode === 'edit'
                  ? 'Al guardar se reemplaza la lista completa de roles del perfil (PUT con el array entero).'
                  : 'El perfil puede crearse sin roles y agregarlos después.'}
              </p>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={(mode === 'create' && !nombre.trim()) || isPending}
            >
              {mode === 'create' ? 'Crear perfil' : 'Guardar roles'}
            </button>
          </div>
        </form>
      </div>
      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}
