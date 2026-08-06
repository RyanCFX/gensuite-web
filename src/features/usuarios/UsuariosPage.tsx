import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listUsuarios, createUsuario, updateUsuario, enableUsuario, deleteUsuario, resetPasswordUsuario, listRoles,
  getUsuarioSucursales, getUsuarioAlmacenesPermitidos,
} from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import type { Usuario, CreateUsuarioDto, UpdateUsuarioDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate } from '@/lib/formatters'
import { Plus, Ban, KeyRound, UserCheck, Pencil, X } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { useAuthStore } from '@/stores/auth.store'

const SYSTEM_MANAGER_ROLE = 'System Manager'

type ConfirmType = { type: 'disable'; user: Usuario } | { type: 'enable'; user: Usuario } | null

export default function UsuariosPage() {
  const queryClient = useQueryClient()
  const authUser = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)
  const [confirm, setConfirm] = useState<ConfirmType>(null)

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [maxDiscountPct, setMaxDiscountPct] = useState(0)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [defaultBranch, setDefaultBranch] = useState('')
  const { orderBy, sort } = useSortState()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['usuarios', { orderBy }],
    queryFn: () => listUsuarios({ limit: 100, orderBy: orderBy || undefined }),
  })

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
  })

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const sucursales = sucursalesData?.items ?? []

  const { data: usuarioSucursales } = useQuery({
    queryKey: ['usuarioSucursales', editingUser?.email],
    queryFn: () => getUsuarioSucursales(editingUser!.email),
    enabled: !!editingUser,
  })

  const { data: almacenesPermitidos } = useQuery({
    queryKey: ['usuarioAlmacenesPermitidos', editingUser?.email],
    queryFn: () => getUsuarioAlmacenesPermitidos(editingUser!.email),
    enabled: !!editingUser,
  })

  useEffect(() => {
    if (usuarioSucursales) {
      setSelectedBranches(usuarioSucursales.branches)
      setDefaultBranch(usuarioSucursales.defaultBranch ?? '')
    }
  }, [usuarioSucursales])

  const createMutation = useMutation({
    mutationFn: (dto: CreateUsuarioDto) => createUsuario(dto),
    onSuccess: () => {
      toast.success('Usuario creado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      resetForm()
    },
    onError: () => toast.error('Error al crear el usuario'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ email, data }: { email: string; data: Partial<UpdateUsuarioDto> }) => updateUsuario(email, data),
    onSuccess: () => {
      toast.success('Usuario actualizado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      resetForm()
    },
    onError: () => toast.error('Error al actualizar el usuario'),
  })

  const disableMutation = useMutation({
    mutationFn: (email: string) => deleteUsuario(email),
    onSuccess: () => {
      toast.success('Usuario desactivado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      setConfirm(null)
    },
    onError: () => toast.error('Error al desactivar el usuario'),
  })

  const enableMutation = useMutation({
    mutationFn: (email: string) => enableUsuario(email),
    onSuccess: () => {
      toast.success('Usuario reactivado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      setConfirm(null)
    },
    onError: () => toast.error('Error al reactivar el usuario'),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (email: string) => resetPasswordUsuario(email),
    onSuccess: () => toast.success('Email de restablecimiento enviado'),
    onError: () => toast.error('Error al enviar el email'),
  })

  const isSystemManager = selectedRoles.includes(SYSTEM_MANAGER_ROLE)

  function openEdit(user: Usuario) {
    setEditingUser(user)
    setEmail(user.email)
    setFirstName(user.firstName)
    setLastName(user.lastName ?? '')
    setMaxDiscountPct(user.maxDiscountPct ?? 0)
    setSelectedRoles(user.roles)
    setSelectedBranches([])
    setDefaultBranch('')
    setShowForm(true)
  }

  function resetForm() {
    setEmail('')
    setFirstName('')
    setLastName('')
    setMaxDiscountPct(0)
    setSelectedRoles([])
    setSelectedBranches([])
    setDefaultBranch('')
    setEditingUser(null)
    setShowForm(false)
  }

  function toggleRole(roleName: string) {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName],
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !firstName) { toast.error('Email y nombre son requeridos'); return }
    const maxDisc = maxDiscountPct > 0 ? maxDiscountPct : 0
    if (editingUser) {
      const payload: Partial<UpdateUsuarioDto> = {
        firstName,
        lastName: lastName || undefined,
        maxDiscountPct: maxDisc,
        roles: selectedRoles,
        branches: isSystemManager ? undefined : selectedBranches,
        defaultBranch: isSystemManager ? undefined : (defaultBranch || undefined),
      }
      updateMutation.mutate({ email, data: payload })
      if (email === authUser?.email && defaultBranch !== usuarioSucursales?.defaultBranch) {
        toast.success('Sucursal por defecto actualizada. Cierra sesión y vuelve a entrar para que los cambios tomen efecto.')
      }
    } else {
      createMutation.mutate({ email, firstName, lastName: lastName || undefined, maxDiscountPct: maxDisc, roles: selectedRoles })
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Usuarios"
        description="Gestiona los usuarios del sistema"
        action={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} />
            Nuevo Usuario
          </button>
        }
      />

      <div>
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Email" sortKey="email" orderBy={orderBy} onSort={sort} />
                  <SortableTh label="Nombre" sortKey="fullName" orderBy={orderBy} onSort={sort} />
                  <th>Roles</th>
                  <th>Último acceso</th>
                  <th>Estado</th>
                  <th style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar los usuarios
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty-state">
                                <div className="empty-icon"><Plus size={20} /></div>
                                <p className="empty-title">Sin usuarios</p>
                                <p className="empty-sub">Agrega el primer usuario al sistema.</p>
                                <button className="btn btn-primary btn-size-sm" onClick={() => setShowForm(true)}>
                                  <Plus size={14} />Nuevo Usuario
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((u) => (
                          <tr key={u.email}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.email}</td>
                            <td style={{ fontWeight: 500 }}>{u.fullName}</td>
                            <td style={{ maxWidth: 260 }}>
                              <div style={{ display: 'grid', gridTemplateRows: 'repeat(2, auto)', gridAutoFlow: 'column', gridAutoColumns: 'max-content', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                                {u.roles.length > 0
                                  ? u.roles.map((r) => (
                                      <span key={r} className="badge badge-default" style={{ whiteSpace: 'nowrap' }}>{r}</span>
                                    ))
                                  : <span className="td-muted">Sin roles</span>}
                              </div>
                            </td>
                            <td className="td-muted">{formatDate(u.lastActive)}</td>
                            <td>
                              {u.enabled
                                ? <span className="badge badge-success">Activo</span>
                                : <span className="badge badge-error">Inactivo</span>}
                            </td>
                            <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                              <ActionsMenu>
                                <ActionsMenuItem onClick={() => openEdit(u)}>
                                  <Pencil size={14} /> Editar
                                </ActionsMenuItem>
                                {u.enabled
                                  ? (
                                      <ActionsMenuItem danger onClick={() => setConfirm({ type: 'disable', user: u })}>
                                        <Ban size={14} /> Desactivar
                                      </ActionsMenuItem>
                                    )
                                  : (
                                      <ActionsMenuItem onClick={() => setConfirm({ type: 'enable', user: u })}>
                                        <UserCheck size={14} /> Reactivar
                                      </ActionsMenuItem>
                                    )}
                                <ActionsMenuItem onClick={() => resetPasswordMutation.mutate(u.email)}>
                                  <KeyRound size={14} /> Restablecer contraseña
                                </ActionsMenuItem>
                              </ActionsMenu>
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* User Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 className="modal-title">{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                <p className="modal-sub">{editingUser ? 'Actualiza los datos del usuario.' : 'Crea un nuevo usuario con acceso al sistema.'}</p>
              </div>
              <button className="modal-close" onClick={resetForm}><X size={16} /></button>
            </div>
              <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="ff-wrap">
                  <label className="ff-label">Email <span className="ff-required">*</span></label>
                  <input
                    type="email"
                    className="ff-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={!!editingUser}
                    placeholder="usuario@empresa.com"
                  />
                </div>
                <div className="form-row">
                  <div className="ff-wrap">
                    <label className="ff-label">Nombre <span className="ff-required">*</span></label>
                    <input className="ff-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="Juan" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Apellido</label>
                    <input className="ff-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Pérez" />
                  </div>
                </div>

                {/* Descuento máximo */}
                <div className="ff-wrap">
                  <label className="ff-label">Descuento máximo (%)</label>
                  <input
                    type="number"
                    className="ff-input"
                    min={0}
                    max={100}
                    value={maxDiscountPct}
                    onChange={(e) => setMaxDiscountPct(parseInt(e.target.value) || 0)}
                    style={{ maxWidth: 140 }}
                  />
                  <p className="ff-hint">{maxDiscountPct === 0 ? 'Sin restricción' : `El usuario no podrá aplicar descuentos mayores a ${maxDiscountPct}%`}</p>
                </div>

                <div className="ff-wrap">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="ff-label">Roles</label>
                    <button
                      type="button"
                      className="btn btn-link"
                      style={{ fontSize: 12 }}
                      onClick={() =>
                        setSelectedRoles((prev) =>
                          roles && prev.length === roles.length ? [] : (roles ?? []),
                        )
                      }
                    >
                      {roles && selectedRoles.length === roles.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    maxHeight: 192,
                    overflowY: 'auto',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                  }}>
                    {roles?.map((r) => (
                      <label key={r} className="ff-check-wrap">
                        <input
                          type="checkbox"
                          className="ff-check"
                          checked={selectedRoles.includes(r)}
                          onChange={() => toggleRole(r)}
                        />
                        <span style={{ fontSize: 13 }}>{r}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {editingUser && (
                  <>
                    {isSystemManager ? (
                      <div className="ff-wrap">
                        <label className="ff-label">Sucursales asignadas</label>
                        <p className="ff-hint" style={{ color: 'var(--color-brand)' }}>
                          Este usuario tiene acceso a todas las sucursales (rol System Manager). No es necesario asignarle sucursales explícitas.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="ff-wrap">
                          <label className="ff-label">Sucursales asignadas</label>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                            maxHeight: 160,
                            overflowY: 'auto',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            padding: 12,
                          }}>
                            {sucursales.length === 0 ? (
                              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', gridColumn: '1 / -1' }}>
                                No hay sucursales configuradas.
                              </p>
                            ) : (
                              sucursales.map((s) => (
                                <label key={s.id} className="ff-check-wrap">
                                  <input
                                    type="checkbox"
                                    className="ff-check"
                                    checked={selectedBranches.includes(s.name)}
                                    onChange={() =>
                                      setSelectedBranches((prev) =>
                                        prev.includes(s.name)
                                          ? prev.filter((x) => x !== s.name)
                                          : [...prev, s.name],
                                      )
                                    }
                                  />
                                  <span style={{ fontSize: 13 }}>{s.name}</span>
                                </label>
                              ))
                            )}
                          </div>
                          <p className="ff-hint">El usuario solo podrá crear documentos desde estas sucursales.</p>
                        </div>

                        <div className="ff-wrap">
                          <label className="ff-label">Sucursal por defecto</label>
                          <select className="ff-select" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)}>
                            <option value="">Sin sucursal por defecto</option>
                            {selectedBranches.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {almacenesPermitidos && almacenesPermitidos.warehouses.length > 0 && (
                      <div className="ff-wrap">
                        <label className="ff-label">Almacenes heredados</label>
                        <p className="ff-hint">
                          Según sus sucursales asignadas, este usuario tiene acceso a: {almacenesPermitidos.warehouses.join(', ')}.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) ? 'Guardando…' : (editingUser ? 'Guardar Cambios' : 'Crear Usuario')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm disable/enable */}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">
                {confirm.type === 'disable' ? '¿Desactivar usuario?' : '¿Reactivar usuario?'}
              </h2>
              <button className="modal-close" onClick={() => setConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {confirm.type === 'disable'
                  ? `Se desactivará el acceso de ${confirm.user.fullName} al sistema.`
                  : `Se reactivará el acceso de ${confirm.user.fullName} al sistema.`}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!confirm) return
                  if (confirm.type === 'disable') disableMutation.mutate(confirm.user.email)
                  else enableMutation.mutate(confirm.user.email)
                }}
                disabled={disableMutation.isPending || enableMutation.isPending}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
