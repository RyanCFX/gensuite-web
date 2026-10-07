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
import {
  listPerfilesAcceso, getUsuarioAcceso, putUsuarioAcceso, getAccesoCatalogo,
} from '@/shared/api/acceso'
import { useAccesoV2Activo } from '@/shared/permissions/useAcceso'
import { usePermissionsStore } from '@/stores/permissions.store'
import {
  estadoDesdeGrants, grantsDelArbol, type EstadoPantalla,
} from '@/shared/permissions/acceso'
import { AccesoUsuarioTab } from '@/features/acceso/AccesoUsuarioTab'
import type { ApiError, Usuario, InviteUsuarioDto, UpdateUsuarioDto, MembershipStatus, UsuarioLookupResult } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { ConfirmModal } from '@/shared/ui/Modal'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { formatDate } from '@/lib/formatters'
import { Plus, Ban, UserCheck, Pencil, X, ScanLine, Mail, ArrowLeft, Eye, EyeOff, Shield } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { useAuthStore } from '@/stores/auth.store'
import { useLimites } from '@/shared/features/can'
import { limiteUsuariosAlcanzado, textoContadorUsuarios } from '@/shared/features/catalog'
import { isApiErrorCode } from '@/shared/api/client'
import { Select, SelectItem } from '@/components/ui/select'
import { usePuede } from '@/shared/permissions/can'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

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
  // PUT /usuarios/:email (incluido `adminPin`) requiere `usuarios.editar` en el usuario logueado.
  const puedeEditarUsuarios = usePuede('usuarios.editar')
  // Límites del plan (§8): contador "X de Y" junto al botón de alta + botón deshabilitado al
  // llegar al límite. Es ayuda de UX, no la validación real (el submit igual puede intentar y el
  // backend responde LIMITE_USUARIOS_ALCANZADO — ver inviteMutation abajo).
  const limites = useLimites()
  const limiteAlcanzado = limiteUsuariosAlcanzado(limites)
  const contador = textoContadorUsuarios(limites)

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
  // PIN de administrador — campo de solo escritura: siempre arranca vacío, nunca se precarga
  // (el servidor lo hashea y ningún GET lo devuelve). Solo se manda en el PUT si se tocó.
  const [adminPin, setAdminPin] = useState('')
  const [adminPinConfirm, setAdminPinConfirm] = useState('')
  const [showAdminPin, setShowAdminPin] = useState(false)
  const [scanningAdminCode, setScanningAdminCode] = useState(false)
  const [selectedPerfiles, setSelectedPerfiles] = useState<string[]>([])
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [defaultBranch, setDefaultBranch] = useState('')
  const [defaultBranchSearch, setDefaultBranchSearch] = useState('')
  const [defaultPosProfile, setDefaultPosProfile] = useState('')
  const [defaultPosProfileSearch, setDefaultPosProfileSearch] = useState('')
  // Permisos v2 (§8): en modo `activo` el acceso va por perfiles de acceso, no por
  // Role Profiles de ERPNext. Tab "Acceso" del modal de editar.
  const v2Activo = useAccesoV2Activo()
  const [editTab, setEditTab] = useState<'datos' | 'acceso'>('datos')
  const [selectedPerfilesAcceso, setSelectedPerfilesAcceso] = useState<string[]>([])
  const [excepciones, setExcepciones] = useState<Record<string, EstadoPantalla> | null>(null)
  const [accesoSeededFor, setAccesoSeededFor] = useState<string | null>(null)
  const [excepcionesTocadas, setExcepcionesTocadas] = useState(false)
  const { orderBy, sort } = useSortState()

  const USUARIOS_COLUMNS = [
    { key: 'email', width: 220 },
    { key: 'fullName', width: 200 },
    { key: 'roles', width: 240 },
    { key: 'lastActive', width: 110 },
    { key: 'estado', width: 100 },
    { key: 'actions', width: 48 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(USUARIOS_COLUMNS)

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
  const { data: perfiles, isError: perfilesError } = useQuery({ queryKey: ['roles-perfiles'], queryFn: getPerfiles, enabled: showForm })

  const { data: perfilesAcceso, isError: perfilesAccesoError } = useQuery({
    queryKey: ['acceso-perfiles'],
    queryFn: listPerfilesAcceso,
    enabled: v2Activo && showForm,
    retry: false,
  })
  const { data: usuarioAcceso } = useQuery({
    queryKey: ['acceso-usuario', editingUser?.email],
    queryFn: () => getUsuarioAcceso(editingUser!.email),
    enabled: v2Activo && !!editingUser,
    retry: false,
  })
  const { data: catalogoAcceso } = useQuery({
    queryKey: ['acceso-catalogo'],
    queryFn: () => getAccesoCatalogo(true),
    enabled: v2Activo && !!editingUser,
    retry: false,
    staleTime: 60_000,
  })

  // Seed del tab Acceso al editar: perfiles asignados + excepciones (una vez por email).
  // Mismo patrón que los seeds vecinos de esta pantalla.
  useEffect(() => {
    if (v2Activo && editingUser && usuarioAcceso && catalogoAcceso && accesoSeededFor !== editingUser.email) {
      setSelectedPerfilesAcceso(usuarioAcceso.perfiles.map((p) => p.id))
      setExcepciones(estadoDesdeGrants(catalogoAcceso.modulos, usuarioAcceso.grants))
      setExcepcionesTocadas(false)
      setAccesoSeededFor(editingUser.email)
    }
  }, [v2Activo, editingUser, usuarioAcceso, catalogoAcceso, accesoSeededFor])

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    enabled: showForm,
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
    enabled: showForm,
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
    // §9 LIMITE_USUARIOS_ALCANZADO (400): mensaje con el límite exacto (details.limite) — mismo
    // texto que el tooltip del botón deshabilitado. El contador pudo quedar desactualizado
    // (alguien creó un usuario en otra pestaña un segundo antes).
    onError: (err) => {
      if (isApiErrorCode(err, 'LIMITE_USUARIOS_ALCANZADO')) {
        const limite = (err.details as { limite?: number } | undefined)?.limite
        toast.error(limite !== undefined
          ? `Se alcanzó el límite del plan (${limite} usuarios).`
          : apiMessage(err, 'Se alcanzó el límite de usuarios del plan.'))
        return
      }
      // §9 PERFIL_NO_CONTRATADO (400): no debería pasar si el selector usa GET /roles/perfiles
      // en vivo (ver PerfilesChecklist abajo — consume el endpoint sin filtro adicional, §7).
      // v2: PERFIL_INEXISTENTE (alguien eliminó un perfil) → recargar perfiles de acceso.
      if (isApiErrorCode(err, 'PERFIL_INEXISTENTE')) {
        queryClient.invalidateQueries({ queryKey: ['acceso-perfiles'] })
      }
      toast.error(apiMessage(err, 'Error al invitar al usuario'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ email, data }: { email: string; data: Partial<UpdateUsuarioDto> }) => updateUsuario(email, data),
    onSuccess: () => {
      toast.success('Usuario actualizado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      resetForm()
    },
    // §9 PERFIL_NO_CONTRATADO (400): no debería pasar si el selector usa GET /roles/perfiles
    // en vivo — mensaje genérico.
    onError: (err) => toast.error(apiMessage(err, 'Error al actualizar el usuario')),
  })

  // Guardado en modo `activo`: PATCH /usuarios/:email (sin roles/perfiles) y luego
  // PUT /acceso/usuarios/:email (perfiles + excepciones si se tocaron). Un solo toast.
  const saveV2Mutation = useMutation({
    mutationFn: async (vars: { email: string; userData: Partial<UpdateUsuarioDto>; perfiles: string[]; grants?: import('@/shared/api/types').Grant[] }) => {
      await updateUsuario(vars.email, vars.userData)
      await putUsuarioAcceso(vars.email, vars.grants ? { perfiles: vars.perfiles, grants: vars.grants } : { perfiles: vars.perfiles })
    },
    onSuccess: (_res, vars) => {
      toast.success('Usuario actualizado')
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      if (vars.email === authUser?.email) {
        usePermissionsStore.getState().refreshSilencioso()
      }
      resetForm()
    },
    onError: (err) => {
      if (isApiErrorCode(err, 'ULTIMO_ADMINISTRADOR')) {
        toast.error('Debe haber al menos un administrador de permisos.')
        return
      }
      toast.error(apiMessage(err, 'No se pudo guardar el usuario'))
    },
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
    { lookupEmail, firstName, lastName, mobileNo, maxDiscountPct, adminCode, adminPin, adminPinConfirm, selectedPerfiles, selectedPerfilesAcceso, excepcionesTocadas, selectedBranches, defaultBranch, defaultPosProfile },
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
    setEditTab('datos')
    setMobileNo(user.phone ?? '')
    setMaxDiscountPct(user.maxDiscountPct ?? 0)
    setAdminCode(user.adminCode ?? '')
    // adminPin/adminPinConfirm quedan vacíos a propósito — el PIN no se puede leer, solo reconfigurar.
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
    setAdminPin('')
    setAdminPinConfirm('')
    setShowAdminPin(false)
    setScanningAdminCode(false)
    setSelectedPerfiles([])
    setSelectedPerfilesAcceso([])
    setAccesoSeededFor(null)
    setExcepciones(null)
    setExcepcionesTocadas(false)
    setEditTab('datos')
    setSelectedBranches([])
    setDefaultBranch('')
    setDefaultPosProfile('')
    setEditingUser(null)
  }

  function togglePerfil(name: string) {
    setSelectedPerfiles((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]))
  }

  function togglePerfilAcceso(id: string) {
    setSelectedPerfilesAcceso((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lookupResult) return
    if (v2Activo) {
      // Modo `activo`: solo perfilesAcceso (al menos uno). Mandar roles/perfiles → 400.
      if (selectedPerfilesAcceso.length === 0) { toast.error('Selecciona al menos un perfil de acceso'); return }
      if (!lookupResult.exists && !firstName.trim()) { toast.error('El nombre es requerido'); return }
      inviteMutation.mutate({
        email: lookupEmail,
        ...(lookupResult.exists ? {} : { firstName: firstName.trim(), lastName: lastName.trim() || undefined, mobileNo: mobileNo || undefined }),
        perfilesAcceso: selectedPerfilesAcceso,
      })
      return
    }
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
    // PIN de administrador — solo se manda si se tocó (campo vacío = no cambiar). Debe ser
    // exactamente 6 dígitos y coincidir con la confirmación.
    const pin = adminPin.trim()
    const pinConfirm = adminPinConfirm.trim()
    if (pin !== '' || pinConfirm !== '') {
      if (!/^\d{6}$/.test(pin)) { toast.error('El PIN debe tener exactamente 6 dígitos'); return }
      if (pin !== pinConfirm) { toast.error('La confirmación del PIN no coincide'); return }
    }
    if (v2Activo) {
      // Modo `activo`: el acceso (perfiles + excepciones) va por /acceso/usuarios/:email;
      // PATCH /usuarios/:email NO lleva roles ni perfiles (400 ACCESO_V2_ACTIVO).
      const payload: Partial<UpdateUsuarioDto> = {
        mobileNo: mobileNo || undefined,
        maxDiscountPct: maxDiscountPct > 0 ? maxDiscountPct : 0,
        adminCode: adminCode || undefined,
        ...(pin !== '' ? { adminPin: pin } : {}),
        branches: selectedBranches,
        defaultBranch: defaultBranch || undefined,
        defaultPosProfile: defaultPosProfile || undefined,
      }
      const grants = excepcionesTocadas && excepciones && catalogoAcceso
        ? grantsDelArbol(catalogoAcceso.modulos, excepciones)
        : undefined
      // Acceso adicional (§6): si no se tocaron las excepciones se manda `grants: undefined` para
      // que el backend PRESERVE los roles del acceso adicional al guardar — nunca "limpiar" roles
      // o perfiles que el administrador no ve en el formulario.
      saveV2Mutation.mutate({ email: editingUser.email, userData: payload, perfiles: selectedPerfilesAcceso, grants })
      if (editingUser.email === authUser?.email && defaultBranch !== usuarioSucursales?.defaultBranch) {
        toast.success('Sucursal por defecto actualizada. Cierra sesión y vuelve a entrar para que los cambios tomen efecto.')
      }
      return
    }
    const payload: Partial<UpdateUsuarioDto> = {
      mobileNo: mobileNo || undefined,
      maxDiscountPct: maxDiscountPct > 0 ? maxDiscountPct : 0,
      adminCode: adminCode || undefined,
      ...(pin !== '' ? { adminPin: pin } : {}),
      // Acceso adicional (§6): si no se eligió ningún perfil no se manda `perfiles` — el backend
      // preserva los roles del acceso adicional al guardar. No intentar "limpiar" roles
      // desconocidos que el administrador no ve.
      ...(selectedPerfiles.length > 0 ? { perfiles: selectedPerfiles } : {}),
      branches: isSystemManager ? undefined : selectedBranches,
      defaultBranch: defaultBranch || undefined,
      defaultPosProfile: defaultPosProfile || undefined,
    }
    updateMutation.mutate({ email: editingUser.email, data: payload })
    if (editingUser.email === authUser?.email && defaultBranch !== usuarioSucursales?.defaultBranch) {
      toast.success('Sucursal por defecto actualizada. Cierra sesión y vuelve a entrar para que los cambios tomen efecto.')
    }
  }

  const isMutating = inviteMutation.isPending || updateMutation.isPending || saveV2Mutation.isPending

  return (
    <div className="page-container">
      <PageHeader
        title="Usuarios"
        description="Gestiona los usuarios del sistema — la alta ahora es por invitación, no se fija contraseña desde acá."
        action={
          <>
            <RecargarButton />
            {contador && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }} title={`${contador} — límite del plan`}>
                {contador}
              </span>
            )}
            <button
              className="btn btn-primary"
              onClick={openInvite}
              disabled={limiteAlcanzado}
              title={limiteAlcanzado ? `Se alcanzó el límite del plan (${contador}).` : undefined}
            >
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
            <table className="data-table items-table-resizable">
              <colgroup>
                {USUARIOS_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
              </colgroup>
              <thead>
                <tr>
                  <SortableTh
                    label="Email"
                    sortKey="email"
                    orderBy={orderBy}
                    onSort={sort}
                    resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('email')} />}
                  />
                  <SortableTh
                    label="Nombre"
                    sortKey="fullName"
                    orderBy={orderBy}
                    onSort={sort}
                    resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('fullName')} />}
                  />
                  <th>
                    Roles
                    <span className="col-resize-handle" onMouseDown={startResize('roles')} />
                  </th>
                  <th>
                    Último acceso
                    <span className="col-resize-handle" onMouseDown={startResize('lastActive')} />
                  </th>
                  <th>
                    Estado
                    <span className="col-resize-handle" onMouseDown={startResize('estado')} />
                  </th>
                  <th />
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
                            <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{u.email}</td>
                            <td style={{ fontWeight: 500 }}>
                              {u.fullName}
                              {u.isDefault && <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 10 }}>Por defecto</span>}
                              {/* Acceso adicional (docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md
                                  §6): GenSuite le dio a esta persona acceso a módulos que el tenant
                                  no contrata. Booleano sin detalle: solo indicador con tooltip. */}
                              {u.accesoAdicionalGestionado === true && (
                                <span
                                  className="badge badge-info"
                                  style={{ marginLeft: 6, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                  title="Este usuario tiene acceso a módulos adicionales gestionados por GenSuite."
                                  aria-label="Acceso adicional gestionado por GenSuite"
                                >
                                  <Shield size={11} aria-hidden="true" /> Adicional
                                </span>
                              )}
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

                  {v2Activo ? (
                    <div className="ff-wrap">
                      <label className="ff-label ff-required">Perfiles de acceso</label>
                      {perfilesAccesoError ? (
                        <p style={{ fontSize: 13, color: 'var(--error-text)' }}>No se pudieron cargar los perfiles de acceso.</p>
                      ) : (perfilesAcceso ?? []).length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No hay perfiles de acceso. Crealos en Configuración → Acceso.</p>
                      ) : (
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 192,
                          overflowY: 'auto', border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-md)', padding: 12,
                        }}>
                          {(perfilesAcceso ?? []).map((p) => (
                            <label key={p.id} className="ff-check-wrap" title={p.descripcion}>
                              <input
                                type="checkbox" className="ff-check"
                                checked={selectedPerfilesAcceso.includes(p.id)}
                                onChange={() => togglePerfilAcceso(p.id)}
                              />
                              <span style={{ fontSize: 13 }}>
                                {p.nombre}
                                {p.esSistema && <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 10 }}>Sistema</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      <p className="ff-hint">En modo activo el acceso va por perfiles, no por roles de ERPNext.</p>
                    </div>
                  ) : (
                    <PerfilesChecklist perfiles={perfiles ?? []} isError={perfilesError} selected={selectedPerfiles} onToggle={togglePerfil} onSelectAll={setSelectedPerfiles} />
                  )}
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
                <div className="tabs-bar" style={{ marginBottom: 16 }}>
                  <button type="button" className={`tab-btn${editTab === 'datos' ? ' on' : ''}`} onClick={() => setEditTab('datos')}>
                    Datos
                  </button>
                  <button type="button" className={`tab-btn${editTab === 'acceso' ? ' on' : ''}`} onClick={() => setEditTab('acceso')}>
                    Acceso
                  </button>
                </div>
                {editTab === 'datos' && (
                <>
                <div className="ff-wrap">
                  <label className="ff-label">Nombre</label>
                  <input className="ff-input" value={editingUser.fullName} disabled />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Correo electrónico</label>
                  <input type="email" className="ff-input" value={editingUser.email} disabled />
                </div>
                {/* Ficha: mismo indicador que en la lista (§6) — sin detalle ni gestión. */}
                {editingUser.accesoAdicionalGestionado === true && (
                  <div className="inline-alert inline-alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={15} aria-hidden="true" />
                    <span style={{ fontSize: 13 }}>Este usuario tiene acceso a módulos adicionales gestionados por GenSuite.</span>
                  </div>
                )}

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

                {puedeEditarUsuarios && (
                  <div className="ff-wrap">
                    <label className="ff-label">PIN de administrador</label>
                    <div className="form-row">
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          type={showAdminPin ? 'text' : 'password'}
                          className="ff-input"
                          value={adminPin}
                          onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Dejar en blanco para no cambiar"
                          inputMode="numeric"
                          maxLength={6}
                          autoComplete="new-password"
                          style={{ paddingRight: 36 }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminPin((v) => !v)}
                          title={showAdminPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}
                        >
                          {showAdminPin ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <input
                        type={showAdminPin ? 'text' : 'password'}
                        className="ff-input"
                        value={adminPinConfirm}
                        onChange={(e) => setAdminPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Confirmar PIN"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="new-password"
                        style={{ flex: 1 }}
                      />
                    </div>
                    <p className="ff-hint">6 dígitos — se usa para autorizar acciones sensibles (ej. overrides de descuento en ventas). Varios usuarios pueden compartir el mismo PIN. Solo se puede reconfigurar, no consultar.</p>
                  </div>
                )}

                </>
                )}
                {editTab === 'acceso' && (
                <>
                {v2Activo ? (
                  <AccesoUsuarioTab
                    email={editingUser.email}
                    perfilesAcceso={perfilesAcceso ?? []}
                    perfilesAccesoError={perfilesAccesoError}
                    selected={selectedPerfilesAcceso}
                    onToggle={togglePerfilAcceso}
                    catalogo={catalogoAcceso ?? null}
                    excepciones={excepciones}
                    onExcepciones={(e) => { setExcepciones(e); setExcepcionesTocadas(true) }}
                  />
                ) : (
                  <PerfilesChecklist
                    perfiles={perfiles ?? []}
                    isError={perfilesError}
                    selected={selectedPerfiles}
                    onToggle={togglePerfil}
                    onSelectAll={setSelectedPerfiles}
                    hint={selectedPerfiles.length === 0 ? `Roles actuales: ${roles && editingUserDetail ? editingUserDetail.roles.join(', ') || 'Ninguno' : '…'} — selecciona un perfil para reemplazarlos.` : undefined}
                  />
                )}
                </>
                )}
                {editTab === 'datos' && (
                <>

                {isSystemManager ? (
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Sucursales asignadas
                      <FieldTooltip>Este usuario tiene acceso a todas las sucursales (rol System Manager). No es necesario asignarle sucursales explícitas.</FieldTooltip>
                    </label>
                  </div>
                ) : (
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
                )}

                <div className="ff-wrap">
                  <label className="ff-label">
                    Sucursal por defecto
                    {isSystemManager && (
                      <FieldTooltip>Se preselecciona al crear documentos, pero se puede cambiar en cada documento.</FieldTooltip>
                    )}
                  </label>
                  <SearchSelect
                    value={defaultBranch}
                    onChange={setDefaultBranch}
                    options={(isSystemManager ? sucursales.map((s) => s.name) : selectedBranches)
                      .filter((b) => !defaultBranchSearch || b.toLowerCase().includes(defaultBranchSearch.toLowerCase()))
                      .map((b): SearchSelectOption => ({ value: b, label: b }))}
                    onSearch={setDefaultBranchSearch}
                    selectedLabel={defaultBranch}
                    placeholder="Sin sucursal por defecto"
                  />
                </div>

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
                </>
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
  // §7 — GET /roles/perfiles YA viene filtrado por el backend según los features del tenant: se
  // consume tal cual, sin ningún filtro adicional del lado del frontend (el backend puede tener
  // reglas más finas). No filtrar esta lista por `features` nunca.
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
