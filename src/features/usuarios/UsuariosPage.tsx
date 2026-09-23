import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  listUsuarios, lookupUsuario, inviteUsuario, updateUsuario, revocarUsuario, suspenderUsuario,
  reactivarUsuario, reinvitarUsuario, listRoles,
  getUsuarioSucursales, getUsuarioAlmacenesPermitidos, getUsuario,
} from '@/shared/api/usuarios'
import { getPerfiles } from '@/shared/api/roles'
import { listSucursales } from '@/shared/api/sucursales'
import { listCajas } from '@/shared/api/cajas'
import type { ApiError, Usuario, InviteUsuarioDto, UpdateUsuarioDto, MembershipStatus, UsuarioLookupResult } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { ConfirmModal } from '@/shared/ui/Modal'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { formatDate } from '@/lib/formatters'
import { Plus, Ban, UserCheck, Pencil, X, ScanLine, Mail, ArrowLeft } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { useAuthStore } from '@/stores/auth.store'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

const SYSTEM_MANAGER_ROLE = 'System Manager'

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

// docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §6.1 — traducción/color únicos para toda la
// pantalla, coherente con lo que ya se usa para `estadoFlujo` de Pedidos en otro módulo.
const STATUS_LABEL: Record<MembershipStatus, string> = {
  invited: 'Invitado',
  accepted: 'Activo',
  rejected: 'Rechazó',
  revoked: 'Revocado',
  suspended: 'Suspendido',
}
const STATUS_BADGE: Record<MembershipStatus, string> = {
  invited: 'badge-info',
  accepted: 'badge-success',
  rejected: 'badge-neutral',
  revoked: 'badge-error',
  suspended: 'badge-warning',
}

type ConfirmType = { type: 'revocar' | 'suspender' | 'reactivar' | 'reinvitar'; user: Usuario } | null

export default function UsuariosPage() {
  const queryClient = useQueryClient()
  const authUser = useAuthStore((s) => s.user)

  const [statusFilter, setStatusFilter] = useState<MembershipStatus | 'all'>('all')

  // ─── Modal de invitar — dos pasos: lookup por email, luego el formulario según el caso (§6.2) ───
  const [inviteOpen, setInviteOpen] = useState(false)
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookupResult, setLookupResult] = useState<UsuarioLookupResult | null>(null)

  const [editingUser, setEditingUser] = useState<Usuario | null>(null)
  const [confirm, setConfirm] = useState<ConfirmType>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobileNo, setMobileNo] = useState('')
  const [maxDiscountPct, setMaxDiscountPct] = useState(0)
  const [adminCode, setAdminCode] = useState('')
  const [scanningAdminCode, setScanningAdminCode] = useState(false)
  const [selectedPerfiles, setSelectedPerfiles] = useState<string[]>([])
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [defaultBranch, setDefaultBranch] = useState('')
  const [defaultBranchSearch, setDefaultBranchSearch] = useState('')
  const [defaultPosProfile, setDefaultPosProfile] = useState('')
  const [defaultPosProfileSearch, setDefaultPosProfileSearch] = useState('')
  const { orderBy, sort } = useSortState()

  const showForm = inviteOpen || !!editingUser

  useBarcodeScanner({
    enabled: showForm && scanningAdminCode,
    onBarcode: (code) => { setAdminCode(code); setScanningAdminCode(false) },
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['usuarios', { orderBy, statusFilter }],
    queryFn: () => listUsuarios({ limit: 100, orderBy: orderBy || undefined, status: statusFilter === 'all' ? undefined : statusFilter }),
  })

  // `roles` sigue viviendo acá (nombres planos, para mostrar en la tabla) — lo que cambia es que
  // el FORMULARIO de invitar/editar ya no arma esa lista a mano, usa `perfiles` (§6.2/§6.3).
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: listRoles })
  const { data: perfiles, isError: perfilesError } = useQuery({ queryKey: ['roles-perfiles'], queryFn: getPerfiles })

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

  const { data: editingUserDetail } = useQuery({
    queryKey: ['usuario-detail', editingUser?.email],
    queryFn: () => getUsuario(editingUser!.email),
    enabled: !!editingUser,
  })

  const { data: cajas } = useQuery({
    queryKey: ['cajas'],
    queryFn: listCajas,
  })
  const cajasHabilitadas = (cajas ?? []).filter((c) => !c.disabled)

  useEffect(() => {
    if (usuarioSucursales) {
      setSelectedBranches(usuarioSucursales.branches)
      setDefaultBranch(usuarioSucursales.defaultBranch ?? '')
    }
  }, [usuarioSucursales])

  useEffect(() => {
    if (editingUserDetail) {
      setDefaultPosProfile(editingUserDetail.defaultPosProfile ?? '')
    }
  }, [editingUserDetail])

  // Preselecciona los perfiles que ya tiene el usuario (GET /usuarios/:email trae `roles` como
  // nombres de perfil, no roles planos de ERPNext) — sin esto el checklist siempre arrancaba
  // vacío al editar, aunque el usuario ya tuviera perfiles asignados. Filtra contra `perfiles`
  // por si `roles` trae algún nombre que ya no exista como Role Profile (perfil eliminado).
  const [perfilesSeededFor, setPerfilesSeededFor] = useState<string | null>(null)
  useEffect(() => {
    if (editingUserDetail && perfiles && perfilesSeededFor !== editingUserDetail.email) {
      setSelectedPerfiles(editingUserDetail.roles.filter((r) => perfiles.some((p) => p.name === r)))
      setPerfilesSeededFor(editingUserDetail.email)
    }
  }, [editingUserDetail, perfiles, perfilesSeededFor])

  const lookupMutation = useMutation({
    mutationFn: (email: string) => lookupUsuario(email),
    onSuccess: (result) => {
      setLookupResult(result)
      if (result.exists) {
        setFirstName(result.firstName ?? '')
        setLastName(result.lastName ?? '')
      }
    },
    onError: (err) => toast.error(apiMessage(err, 'Error al buscar el usuario')),
  })

  const inviteMutation = useMutation({
    mutationFn: (dto: InviteUsuarioDto) => inviteUsuario(dto),
    onSuccess: (result) => {
      toast.success(result.purpose === 'registration' ? 'Invitación enviada — la persona debe fijar su contraseña.' : 'Invitación enviada.')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      resetForm()
    },
    onError: (err) => toast.error(apiMessage(err, 'Error al invitar al usuario')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ email, data }: { email: string; data: Partial<UpdateUsuarioDto> }) => updateUsuario(email, data),
    onSuccess: () => {
      toast.success('Usuario actualizado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      resetForm()
    },
    onError: (err) => toast.error(apiMessage(err, 'Error al actualizar el usuario')),
  })

  const revocarMutation = useMutation({
    mutationFn: (email: string) => revocarUsuario(email),
    onSuccess: () => { toast.success('Acceso revocado'); queryClient.invalidateQueries({ queryKey: ['usuarios'] }); setConfirm(null) },
    onError: (err) => toast.error(apiMessage(err, 'Error al revocar el acceso')),
  })

  const suspenderMutation = useMutation({
    mutationFn: (email: string) => suspenderUsuario(email),
    onSuccess: () => { toast.success('Usuario suspendido'); queryClient.invalidateQueries({ queryKey: ['usuarios'] }); setConfirm(null) },
    onError: (err) => toast.error(apiMessage(err, 'Error al suspender el usuario')),
  })

  const reactivarMutation = useMutation({
    mutationFn: (email: string) => reactivarUsuario(email),
    onSuccess: () => { toast.success('Usuario reactivado'); queryClient.invalidateQueries({ queryKey: ['usuarios'] }); setConfirm(null) },
    onError: (err) => toast.error(apiMessage(err, 'Error al reactivar el usuario')),
  })

  const reinvitarMutation = useMutation({
    mutationFn: (email: string) => reinvitarUsuario(email),
    onSuccess: () => { toast.success('Invitación reenviada'); queryClient.invalidateQueries({ queryKey: ['usuarios'] }); setConfirm(null) },
    onError: (err) => toast.error(apiMessage(err, 'Error al reenviar la invitación')),
  })

  const isSystemManager = perfiles
    ? selectedPerfiles.some((p) => perfiles.find((rp) => rp.name === p)?.roles.includes(SYSTEM_MANAGER_ROLE))
    : false

  const formIsDirty = useDirtyCheck(
    { lookupEmail, firstName, lastName, mobileNo, maxDiscountPct, adminCode, selectedPerfiles, selectedBranches, defaultBranch, defaultPosProfile },
    showForm && (!editingUser || (!!usuarioSucursales && !!editingUserDetail)),
  )
  const formClose = useConfirmClose(formIsDirty, resetForm)

  function openInvite() {
    resetForm()
    setInviteOpen(true)
  }

  function openEdit(user: Usuario) {
    resetForm()
    setEditingUser(user)
    setMobileNo(user.phone ?? '')
    setMaxDiscountPct(user.maxDiscountPct ?? 0)
    setAdminCode(user.adminCode ?? '')
    setSelectedPerfiles([])
  }

  function resetForm() {
    setInviteOpen(false)
    setLookupEmail('')
    setLookupResult(null)
    setFirstName('')
    setLastName('')
    setMobileNo('')
    setMaxDiscountPct(0)
    setAdminCode('')
    setScanningAdminCode(false)
    setSelectedPerfiles([])
    setSelectedBranches([])
    setDefaultBranch('')
    setDefaultPosProfile('')
    setEditingUser(null)
  }

  function togglePerfil(name: string) {
    setSelectedPerfiles((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]))
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lookupResult) return
    if (selectedPerfiles.length === 0) { toast.error('Selecciona al menos un perfil de rol'); return }
    if (!lookupResult.exists && !firstName.trim()) { toast.error('El nombre es requerido'); return }
    inviteMutation.mutate({
      email: lookupEmail,
      ...(lookupResult.exists ? {} : { firstName: firstName.trim(), lastName: lastName.trim() || undefined, mobileNo: mobileNo || undefined }),
      perfiles: selectedPerfiles,
    })
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    const payload: Partial<UpdateUsuarioDto> = {
      mobileNo: mobileNo || undefined,
      maxDiscountPct: maxDiscountPct > 0 ? maxDiscountPct : 0,
      adminCode: adminCode || undefined,
      ...(selectedPerfiles.length > 0 ? { perfiles: selectedPerfiles } : {}),
      branches: isSystemManager ? undefined : selectedBranches,
      defaultBranch: isSystemManager ? undefined : (defaultBranch || undefined),
      defaultPosProfile: defaultPosProfile || undefined,
    }
    updateMutation.mutate({ email: editingUser.email, data: payload })
    if (editingUser.email === authUser?.email && defaultBranch !== usuarioSucursales?.defaultBranch) {
      toast.success('Sucursal por defecto actualizada. Cierra sesión y vuelve a entrar para que los cambios tomen efecto.')
    }
  }

  const isMutating = inviteMutation.isPending || updateMutation.isPending

  return (
    <div className="page-container">
      <PageHeader
        title="Usuarios"
        description="Gestiona los usuarios del sistema — la alta ahora es por invitación, no se fija contraseña desde acá."
        action={
          <>
            <RecargarButton />
            <button className="btn btn-primary" onClick={openInvite}>
              <Plus size={16} />
              Invitar Usuario
            </button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ minWidth: 200 }}>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MembershipStatus | 'all')} clearable={false}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="accepted">Activos</SelectItem>
              <SelectItem value="invited">Invitados (pendientes)</SelectItem>
              <SelectItem value="suspended">Suspendidos</SelectItem>
              <SelectItem value="revoked">Revocados</SelectItem>
              <SelectItem value="rejected">Rechazados</SelectItem>
            </Select>
          </div>
        </div>
      </div>

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
                                <p className="empty-sub">Invita al primer usuario al sistema.</p>
                                <button className="btn btn-primary btn-size-sm" onClick={openInvite}>
                                  <Plus size={14} />Invitar Usuario
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((u) => (
                          <tr key={u.email}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.email}</td>
                            <td style={{ fontWeight: 500 }}>
                              {u.fullName}
                              {u.isDefault && <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 10 }}>Por defecto</span>}
                            </td>
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
                              <span className={`badge ${STATUS_BADGE[u.status]}`}>{STATUS_LABEL[u.status]}</span>
                            </td>
                            <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                              <ActionsMenu>
                                <ActionsMenuItem onClick={() => openEdit(u)}>
                                  <Pencil size={14} /> Editar
                                </ActionsMenuItem>
                                {u.status === 'accepted' && (
                                  <>
                                    <ActionsMenuItem danger onClick={() => setConfirm({ type: 'revocar', user: u })}>
                                      <Ban size={14} /> Revocar acceso
                                    </ActionsMenuItem>
                                    <ActionsMenuItem onClick={() => setConfirm({ type: 'suspender', user: u })}>
                                      <Ban size={14} /> Suspender
                                    </ActionsMenuItem>
                                  </>
                                )}
                                {u.status === 'suspended' && (
                                  <ActionsMenuItem onClick={() => setConfirm({ type: 'reactivar', user: u })}>
                                    <UserCheck size={14} /> Reactivar
                                  </ActionsMenuItem>
                                )}
                                {(u.status === 'invited' || u.status === 'rejected' || u.status === 'revoked') && (
                                  <ActionsMenuItem onClick={() => setConfirm({ type: 'reinvitar', user: u })}>
                                    <Mail size={14} /> Reenviar invitación
                                  </ActionsMenuItem>
                                )}
                              </ActionsMenu>
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de invitar — paso 1: lookup por email (§6.2) */}
      {inviteOpen && (
        <div className="modal-overlay" onClick={formClose.requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 className="modal-title">Invitar Usuario</h2>
                <p className="modal-sub">La persona fija su propia contraseña al aceptar la invitación.</p>
              </div>
              <button className="modal-close" onClick={formClose.requestClose}><X size={16} /></button>
            </div>

            {!lookupResult ? (
              <>
                <div className="modal-body">
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Correo electrónico</label>
                    <input
                      type="email"
                      className="ff-input"
                      value={lookupEmail}
                      onChange={(e) => setLookupEmail(e.target.value)}
                      placeholder="usuario@empresa.com"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="modal-foot">
                  <button type="button" className="btn btn-secondary" onClick={formClose.requestClose}>Cancelar</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!lookupEmail.trim() || lookupMutation.isPending}
                    onClick={() => lookupMutation.mutate(lookupEmail.trim())}
                  >
                    {lookupMutation.isPending ? 'Buscando…' : 'Continuar'}
                  </button>
                </div>
              </>
            ) : lookupResult.alreadyMember ? (
              <>
                <div className="modal-body">
                  <div className="inline-alert inline-alert-warn">
                    {lookupEmail} ya es miembro activo de este tenant.
                  </div>
                </div>
                <div className="modal-foot">
                  <button type="button" className="btn btn-secondary" onClick={() => setLookupResult(null)}><ArrowLeft size={14} /> Volver</button>
                  <button type="button" className="btn btn-primary" onClick={formClose.requestClose}>Cerrar</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleInviteSubmit}>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  <div className="ff-wrap">
                    <label className="ff-label">Correo electrónico</label>
                    <input type="email" className="ff-input" value={lookupEmail} disabled />
                  </div>

                  {lookupResult.exists ? (
                    <div className="inline-alert inline-alert-info">
                      Esta persona ya existe en el sistema — su nombre no se edita acá.
                      {lookupResult.membershipStatus && (
                        <> Estado previo en este tenant: <strong>{STATUS_LABEL[lookupResult.membershipStatus]}</strong> — se le reenviará una invitación.</>
                      )}
                    </div>
                  ) : null}

                  <div className="form-row">
                    <div className="ff-wrap">
                      <label className="ff-label ff-required">Nombre</label>
                      <input className="ff-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={lookupResult.exists} required placeholder="Juan" />
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label">Apellido</label>
                      <input className="ff-input" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={lookupResult.exists} placeholder="Pérez" />
                    </div>
                  </div>

                  {!lookupResult.exists && (
                    <div className="ff-wrap">
                      <label className="ff-label">Teléfono</label>
                      <input className="ff-input" value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} placeholder="809-555-0100" />
                    </div>
                  )}

                  <PerfilesChecklist perfiles={perfiles ?? []} isError={perfilesError} selected={selectedPerfiles} onToggle={togglePerfil} onSelectAll={setSelectedPerfiles} />
                </div>
                <div className="modal-foot">
                  <button type="button" className="btn btn-secondary" onClick={() => setLookupResult(null)}><ArrowLeft size={14} /> Volver</button>
                  <button type="submit" className="btn btn-primary" disabled={isMutating}>
                    {isMutating ? 'Enviando…' : 'Enviar invitación'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de editar (§6.6 — sin firstName/lastName) */}
      {editingUser && (
        <div className="modal-overlay" onClick={formClose.requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 className="modal-title">Editar Usuario</h2>
                <p className="modal-sub">El nombre lo edita la propia persona desde su perfil — acá solo roles, sucursales, almacenes, PIN y descuento.</p>
              </div>
              <button className="modal-close" onClick={formClose.requestClose}><X size={16} /></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="ff-wrap">
                  <label className="ff-label">Nombre</label>
                  <input className="ff-input" value={editingUser.fullName} disabled />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Correo electrónico</label>
                  <input type="email" className="ff-input" value={editingUser.email} disabled />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Teléfono</label>
                  <input className="ff-input" value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} placeholder="809-555-0100" />
                </div>

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
                  <label className="ff-label">Código de carnet</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="ff-input"
                      value={adminCode}
                      onChange={(e) => { setAdminCode(e.target.value); setScanningAdminCode(false) }}
                      placeholder="EMP-00231"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className={`btn btn-size-sm ${scanningAdminCode ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setScanningAdminCode((v) => !v)}
                    >
                      <ScanLine size={14} />
                      {scanningAdminCode ? 'Escaneando…' : 'Escanear'}
                    </button>
                  </div>
                </div>

                <PerfilesChecklist
                  perfiles={perfiles ?? []}
                  isError={perfilesError}
                  selected={selectedPerfiles}
                  onToggle={togglePerfil}
                  onSelectAll={setSelectedPerfiles}
                  hint={selectedPerfiles.length === 0 ? `Roles actuales: ${roles && editingUserDetail ? editingUserDetail.roles.join(', ') || 'Ninguno' : '…'} — selecciona un perfil para reemplazarlos.` : undefined}
                />

                {isSystemManager ? (
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Sucursales asignadas
                      <FieldTooltip>Este usuario tiene acceso a todas las sucursales (rol System Manager). No es necesario asignarle sucursales explícitas.</FieldTooltip>
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="ff-wrap">
                      <label className="ff-label">
                        Sucursales asignadas
                        <FieldTooltip>El usuario solo podrá crear documentos desde estas sucursales.</FieldTooltip>
                      </label>
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
                    </div>

                    <div className="ff-wrap">
                      <label className="ff-label">Sucursal por defecto</label>
                      <SearchSelect
                        value={defaultBranch}
                        onChange={setDefaultBranch}
                        options={selectedBranches
                          .filter((b) => !defaultBranchSearch || b.toLowerCase().includes(defaultBranchSearch.toLowerCase()))
                          .map((b): SearchSelectOption => ({ value: b, label: b }))}
                        onSearch={setDefaultBranchSearch}
                        selectedLabel={defaultBranch}
                        placeholder="Sin sucursal por defecto"
                      />
                    </div>
                  </>
                )}

                <div className="ff-wrap">
                  <label className="ff-label">
                    Caja por defecto
                    <FieldTooltip>Se preseleccionará al abrir turno de caja.</FieldTooltip>
                  </label>
                  <SearchSelect
                    value={defaultPosProfile}
                    onChange={setDefaultPosProfile}
                    options={cajasHabilitadas
                      .filter((c) => !defaultPosProfileSearch || c.label.toLowerCase().includes(defaultPosProfileSearch.toLowerCase()))
                      .map((c): SearchSelectOption => ({ value: c.id, label: c.label }))}
                    onSearch={setDefaultPosProfileSearch}
                    selectedLabel={cajasHabilitadas.find((c) => c.id === defaultPosProfile)?.label ?? ''}
                    placeholder="Sin caja por defecto"
                  />
                </div>

                {almacenesPermitidos && almacenesPermitidos.warehouses.length > 0 && (
                  <div className="ff-wrap">
                    <label className="ff-label">Almacenes heredados</label>
                    <p className="ff-hint">
                      Según sus sucursales asignadas, este usuario tiene acceso a: {almacenesPermitidos.warehouses.join(', ')}.
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={formClose.requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isMutating}>
                  {isMutating ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={formClose.confirming}
        onClose={formClose.cancelDiscard}
        onConfirm={formClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {/* Confirmar revocar/suspender/reactivar/reinvitar (§6.7/§6.4) */}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">
                {confirm.type === 'revocar' && '¿Revocar acceso?'}
                {confirm.type === 'suspender' && '¿Suspender usuario?'}
                {confirm.type === 'reactivar' && '¿Reactivar usuario?'}
                {confirm.type === 'reinvitar' && '¿Reenviar invitación?'}
              </h2>
              <button className="modal-close" onClick={() => setConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {confirm.type === 'revocar' && `Se revocará el acceso de ${confirm.user.fullName} — definitivo hasta una nueva invitación.`}
                {confirm.type === 'suspender' && `Se suspenderá temporalmente el acceso de ${confirm.user.fullName}. Puede reactivarse después sin una nueva invitación.`}
                {confirm.type === 'reactivar' && `Se reactivará el acceso de ${confirm.user.fullName}.`}
                {confirm.type === 'reinvitar' && `Se reenviará la invitación a ${confirm.user.email} — el link anterior queda invalidado.`}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!confirm) return
                  if (confirm.type === 'revocar') revocarMutation.mutate(confirm.user.email)
                  else if (confirm.type === 'suspender') suspenderMutation.mutate(confirm.user.email)
                  else if (confirm.type === 'reactivar') reactivarMutation.mutate(confirm.user.email)
                  else reinvitarMutation.mutate(confirm.user.email)
                }}
                disabled={revocarMutation.isPending || suspenderMutation.isPending || reactivarMutation.isPending || reinvitarMutation.isPending}
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

function PerfilesChecklist({ perfiles, isError, selected, onToggle, onSelectAll, hint }: {
  perfiles: { name: string; roles: string[]; rolesEs?: string[] }[]
  isError?: boolean
  selected: string[]
  onToggle: (name: string) => void
  onSelectAll: (names: string[]) => void
  hint?: string
}) {
  const allSelected = perfiles.length > 0 && selected.length === perfiles.length

  return (
    <div className="ff-wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label className="ff-label ff-required">Perfiles de rol</label>
        {perfiles.length > 0 && !isError && (
          <button
            type="button"
            onClick={() => onSelectAll(allSelected ? [] : perfiles.map((p) => p.name))}
            style={{ fontSize: 13, color: 'var(--color-navy)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Seleccionar todo
          </button>
        )}
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
        {isError ? (
          <p style={{ fontSize: 13, color: 'var(--error-text)', gridColumn: '1 / -1' }}>No se pudieron cargar los perfiles de rol. Verifica tu conexión o tus permisos e intenta de nuevo.</p>
        ) : perfiles.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', gridColumn: '1 / -1' }}>No hay perfiles de rol configurados.</p>
        ) : perfiles.map((p) => (
          <label key={p.name} className="ff-check-wrap" title={(p.rolesEs ?? p.roles).join(', ')}>
            <input type="checkbox" className="ff-check" checked={selected.includes(p.name)} onChange={() => onToggle(p.name)} />
            <span style={{ fontSize: 13 }}>{p.name}</span>
          </label>
        ))}
      </div>
      <p className="ff-hint">{hint ?? 'Forma recomendada de asignar permisos — reemplaza por completo los roles del usuario según los perfiles elegidos.'}</p>
    </div>
  )
}
