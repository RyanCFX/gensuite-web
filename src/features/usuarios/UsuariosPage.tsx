import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listUsuarios, createUsuario, enableUsuario, deleteUsuario, resetPasswordUsuario, listRoles,
} from '@/shared/api/usuarios'
import type { Usuario, CreateUsuarioDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate } from '@/lib/formatters'
import { Plus, MoreHorizontal, Ban, KeyRound, UserCheck, X } from 'lucide-react'

type ConfirmType = { type: 'disable'; user: Usuario } | { type: 'enable'; user: Usuario } | null

export default function UsuariosPage() {
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmType>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => listUsuarios({ limit: 100 }),
  })

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
  })

  const createMutation = useMutation({
    mutationFn: (dto: CreateUsuarioDto) => createUsuario(dto),
    onSuccess: () => {
      toast.success('Usuario creado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      resetForm()
    },
    onError: () => toast.error('Error al crear el usuario'),
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

  function resetForm() {
    setEmail('')
    setFirstName('')
    setLastName('')
    setSelectedRoles([])
    setShowForm(false)
  }

  function toggleRole(roleName: string) {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName],
    )
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !firstName) { toast.error('Email y nombre son requeridos'); return }
    createMutation.mutate({ email, firstName, lastName: lastName || undefined, roles: selectedRoles })
  }

  return (
    <div>
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

      <div className="page-container">
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
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
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {u.roles.length > 0
                                  ? u.roles.map((r) => (
                                      <span key={r} className="badge badge-default">{r}</span>
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
                            <td
                              style={{ position: 'relative' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="actions-trigger"
                                onClick={() => setOpenMenu(openMenu === u.email ? null : u.email)}
                              >
                                <MoreHorizontal size={15} />
                              </button>
                              {openMenu === u.email && (
                                <div className="actions-menu" onMouseLeave={() => setOpenMenu(null)}>
                                  {u.enabled
                                    ? (
                                        <button
                                          className="actions-item actions-item-danger"
                                          onClick={() => { setConfirm({ type: 'disable', user: u }); setOpenMenu(null) }}
                                        >
                                          <Ban size={14} />Desactivar
                                        </button>
                                      )
                                    : (
                                        <button
                                          className="actions-item"
                                          onClick={() => { setConfirm({ type: 'enable', user: u }); setOpenMenu(null) }}
                                        >
                                          <UserCheck size={14} />Reactivar
                                        </button>
                                      )}
                                  <button
                                    className="actions-item"
                                    onClick={() => { resetPasswordMutation.mutate(u.email); setOpenMenu(null) }}
                                  >
                                    <KeyRound size={14} />Restablecer contraseña
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 className="modal-title">Nuevo Usuario</h2>
                <p className="modal-sub">Crea un nuevo usuario con acceso al sistema.</p>
              </div>
              <button className="modal-close" onClick={resetForm}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="ff-wrap">
                  <label className="ff-label">Email <span className="ff-required">*</span></label>
                  <input
                    type="email"
                    className="ff-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
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

                <div className="ff-wrap">
                  <label className="ff-label">Roles</label>
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
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creando…' : 'Crear Usuario'}
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
