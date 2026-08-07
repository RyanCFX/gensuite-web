import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Mail, Plus, Trash2, AlertTriangle, Clock, CheckCircle2, XCircle, AlertCircle, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import {
  listNotificacionTipos,
  getNotificacionTipo,
  updateNotificacionTipo,
  getNotificacionCanalEmail,
  updateNotificacionCanalEmail,
  listNotificacionLogs,
  getNotificacionLogResumen,
  probarNotificacionTipo,
} from '@/shared/api/notificaciones'
import type { NotificacionCategoria, NotificacionDestinatario, NotificacionLogEntry, ListNotificacionLogsParams, ProbarNotificacionDto } from '@/shared/api/types'

const CATEGORIAS: NotificacionCategoria[] = [
  'Contabilidad',
  'Cuentas por Cobrar',
  'Cuentas por Pagar',
  'Inventario',
  'Compras',
  'Ventas',
  'Logística',
  'Seguridad',
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function NotificacionesPage() {
  const [activeTab, setActiveTab] = useState<'catalogo' | 'smtp' | 'historial'>('catalogo')

  return (
    <div className="page-container">
      <PageHeader
        title="Notificaciones"
        description="Configura qué eventos notifican por correo y quién los recibe"
      />

      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`tab-btn${activeTab === 'catalogo' ? ' on' : ''}`}
          onClick={() => setActiveTab('catalogo')}
        >
          Catálogo
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'smtp' ? ' on' : ''}`}
          onClick={() => setActiveTab('smtp')}
        >
          Canal de Email
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'historial' ? ' on' : ''}`}
          onClick={() => setActiveTab('historial')}
        >
          Historial
        </button>
      </div>

      {activeTab === 'catalogo' ? <CatalogoTab /> : activeTab === 'smtp' ? <SmtpTab /> : <HistorialTab />}
    </div>
  )
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

function CatalogoTab() {
  const queryClient = useQueryClient()
  const [categoriaTab, setCategoriaTab] = useState<NotificacionCategoria>('Contabilidad')
  const [destinatariosCodigo, setDestinatariosCodigo] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notificaciones', 'tipos'],
    queryFn: listNotificacionTipos,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ codigo, activo, canalEmail }: { codigo: string; activo: boolean; canalEmail: boolean }) =>
      updateNotificacionTipo(codigo, { activo, canalEmail }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones', 'tipos'] })
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la notificación'),
  })

  const tipos = data ?? []
  const porCategoria = useMemo(() => {
    const map = new Map<NotificacionCategoria, typeof tipos>()
    for (const cat of CATEGORIAS) map.set(cat, [])
    for (const t of tipos) {
      map.get(t.categoria)?.push(t)
    }
    return map
  }, [tipos])

  return (
    <>
      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`tab-btn${categoriaTab === cat ? ' on' : ''}`}
            onClick={() => setCategoriaTab(cat)}
          >
            {cat} {porCategoria.get(cat) && ` (${porCategoria.get(cat)!.length})`}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Notificación</th>
                <th style={{ width: 110 }}>Activo</th>
                <th style={{ width: 130 }}>Canal Email</th>
                <th style={{ width: 140 }}>Destinatarios</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                    Error al cargar el catálogo de notificaciones
                  </td>
                </tr>
              ) : (porCategoria.get(categoriaTab) ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      <p className="empty-title">Sin tipos en esta categoría</p>
                    </div>
                  </td>
                </tr>
              ) : (
                (porCategoria.get(categoriaTab) ?? []).map((tipo) => {
                  const activoSinDestinatarios = tipo.activo && tipo.destinatarios.length === 0
                  return (
                    <tr key={tipo.codigo}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{tipo.nombre}</div>
                        {tipo.descripcion && <div className="td-muted" style={{ fontSize: 12 }}>{tipo.descripcion}</div>}
                        {activoSinDestinatarios && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, color: 'var(--color-warning, #b45309)' }}>
                            <AlertTriangle size={12} />
                            Activo pero sin destinatarios — no se enviará nada
                          </div>
                        )}
                      </td>
                      <td>
                        <label className="ff-check-wrap">
                          <input
                            type="checkbox"
                            className="ff-check"
                            checked={tipo.activo}
                            disabled={toggleMutation.isPending}
                            onChange={(e) =>
                              toggleMutation.mutate({
                                codigo: tipo.codigo,
                                activo: e.target.checked,
                                canalEmail: e.target.checked,
                              })
                            }
                          />
                        </label>
                      </td>
                      <td>
                        <label className="ff-check-wrap">
                          <input
                            type="checkbox"
                            className="ff-check"
                            checked={tipo.canalEmail}
                            disabled={toggleMutation.isPending}
                            onChange={(e) =>
                              toggleMutation.mutate({
                                codigo: tipo.codigo,
                                activo: tipo.activo,
                                canalEmail: e.target.checked,
                              })
                            }
                          />
                        </label>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-sm"
                          onClick={() => setDestinatariosCodigo(tipo.codigo)}
                        >
                          <Mail size={14} /> Destinatarios
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {destinatariosCodigo && (
        <DestinatariosModal codigo={destinatariosCodigo} onClose={() => setDestinatariosCodigo(null)} />
      )}
    </>
  )
}

function DestinatariosModal({ codigo, onClose }: { codigo: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<NotificacionDestinatario[]>([])
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [testEmail, setTestEmail] = useState('')
  const [testNombre, setTestNombre] = useState('')
  const [testError, setTestError] = useState('')

  const { data: detalle, isLoading } = useQuery({
    queryKey: ['notificaciones', 'tipo', codigo],
    queryFn: () => getNotificacionTipo(codigo),
  })

  useEffect(() => {
    if (detalle) setRows(detalle.destinatarios.length > 0 ? detalle.destinatarios : [])
  }, [detalle])

  const saveMutation = useMutation({
    mutationFn: (destinatarios: NotificacionDestinatario[]) => updateNotificacionTipo(codigo, { destinatarios }),
    onSuccess: () => {
      toast.success('Destinatarios actualizados')
      queryClient.invalidateQueries({ queryKey: ['notificaciones', 'tipos'] })
      queryClient.invalidateQueries({ queryKey: ['notificaciones', 'tipo', codigo] })
      onClose()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al guardar los destinatarios'),
  })

  const probarMutation = useMutation({
    mutationFn: (data: ProbarNotificacionDto) => probarNotificacionTipo(codigo, data),
    onSuccess: (res) => {
      toast.success(res.message)
      setTestEmail('')
      setTestNombre('')
      setTestError('')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al enviar el correo de prueba')
    },
  })

  function addRow() {
    setRows((r) => [...r, { email: '', nombre: '' }])
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index))
    setErrors((e) => {
      const next = { ...e }
      delete next[index]
      return next
    })
  }

  function updateRow(index: number, field: 'email' | 'nombre', value: string) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function handleSave() {
    const nextErrors: Record<number, string> = {}
    rows.forEach((row, i) => {
      if (!row.email.trim()) nextErrors[i] = 'El email es requerido'
      else if (!EMAIL_RE.test(row.email.trim())) nextErrors[i] = 'Email inválido'
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload = rows.map((r) => ({
      email: r.email.trim(),
      ...(r.nombre?.trim() ? { nombre: r.nombre.trim() } : {}),
    }))
    saveMutation.mutate(payload)
  }

  function handleProbar() {
    setTestError('')
    if (!testEmail.trim()) { setTestError('El email es requerido'); return }
    if (!EMAIL_RE.test(testEmail.trim())) { setTestError('Email inválido'); return }
    probarMutation.mutate({
      email: testEmail.trim(),
      ...(testNombre.trim() ? { nombre: testNombre.trim() } : {}),
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Destinatarios — {detalle?.nombre ?? codigo}</h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isLoading ? (
            <p className="ff-hint">Cargando destinatarios…</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="ff-label" style={{ margin: 0 }}>Correos que recibirán esta notificación</span>
                <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}>
                  <Plus size={14} /> Agregar
                </button>
              </div>

              {rows.length === 0 && (
                <div className="empty-state">
                  <p className="empty-title">Sin destinatarios</p>
                  <p className="empty-sub">Agrega al menos un correo para que esta notificación se envíe.</p>
                </div>
              )}

              {rows.map((row, index) => (
                <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div className="ff-wrap" style={{ flex: 2 }}>
                    <input
                      type="email"
                      className={`ff-input${errors[index] ? ' ff-input-error' : ''}`}
                      placeholder="correo@empresa.com"
                      value={row.email}
                      onChange={(e) => updateRow(index, 'email', e.target.value)}
                    />
                    {errors[index] && <p className="ff-error">{errors[index]}</p>}
                  </div>
                  <div className="ff-wrap" style={{ flex: 1 }}>
                    <input
                      type="text"
                      className="ff-input"
                      placeholder="Nombre (opcional)"
                      value={row.nombre ?? ''}
                      onChange={(e) => updateRow(index, 'nombre', e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeRow(index)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* ── Enviar correo de prueba ───────────────────────────────── */}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '8px 0' }} />

              <span className="ff-label" style={{ margin: 0 }}>Enviar correo de prueba</span>
              <p className="ff-hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                Envía un email de prueba con datos ficticios a cualquier dirección para verificar la plantilla y el canal SMTP.
              </p>

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div className="ff-wrap" style={{ flex: 2 }}>
                  <input
                    type="email"
                    className={`ff-input${testError ? ' ff-input-error' : ''}`}
                    placeholder="correo@empresa.com"
                    value={testEmail}
                    onChange={(e) => { setTestEmail(e.target.value); setTestError('') }}
                    disabled={probarMutation.isPending}
                  />
                  {testError && <p className="ff-error">{testError}</p>}
                </div>
                <div className="ff-wrap" style={{ flex: 1 }}>
                  <input
                    type="text"
                    className="ff-input"
                    placeholder="Nombre (opcional)"
                    value={testNombre}
                    onChange={(e) => setTestNombre(e.target.value)}
                    disabled={probarMutation.isPending}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-size-sm"
                  style={{ whiteSpace: 'nowrap', marginTop: 0 }}
                  onClick={handleProbar}
                  disabled={probarMutation.isPending}
                >
                  {probarMutation.isPending ? <span className="spinner" /> : <Send size={14} />}
                  {' '}Enviar
                </button>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isLoading || saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Canal de Email (SMTP) ──────────────────────────────────────────────────

type SmtpMode = 'tls' | 'ssl' | 'none'

interface SmtpFormState {
  email: string
  host: string
  puerto: string
  mode: SmtpMode
  habilitado: boolean
  usuario: string
  password: string
}

const EMPTY_SMTP_FORM: SmtpFormState = {
  email: '',
  host: '',
  puerto: '587',
  mode: 'tls',
  habilitado: true,
  usuario: '',
  password: '',
}

function SmtpTab() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<SmtpFormState>(EMPTY_SMTP_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['notificaciones', 'canal-email'],
    queryFn: getNotificacionCanalEmail,
  })

  useEffect(() => {
    if (data?.configurado) {
      setForm({
        email: data.email ?? '',
        host: data.host ?? '',
        puerto: String(data.puerto ?? 587),
        mode: data.ssl ? 'ssl' : data.tls === false ? 'none' : 'tls',
        habilitado: data.habilitado ?? true,
        usuario: data.email ?? '',
        password: '',
      })
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: updateNotificacionCanalEmail,
    onSuccess: () => {
      toast.success('Canal de email actualizado')
      queryClient.invalidateQueries({ queryKey: ['notificaciones', 'canal-email'] })
      setForm((f) => ({ ...f, password: '' }))
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al guardar el canal de email'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!form.email.trim() || !EMAIL_RE.test(form.email.trim())) nextErrors.email = 'Email inválido'
    if (!form.host.trim()) nextErrors.host = 'El host es requerido'
    const puertoNum = Number(form.puerto)
    if (!Number.isInteger(puertoNum) || puertoNum < 1 || puertoNum > 65535) nextErrors.puerto = 'Puerto inválido (1–65535)'
    if (!form.usuario.trim()) nextErrors.usuario = 'El usuario es requerido'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    saveMutation.mutate({
      email: form.email.trim(),
      host: form.host.trim(),
      puerto: puertoNum,
      tls: form.mode === 'tls',
      ssl: form.mode === 'ssl',
      habilitado: form.habilitado,
      usuario: form.usuario.trim(),
      ...(form.password ? { password: form.password } : {}),
    })
  }

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="skeleton-box" style={{ height: 14, width: '60%', marginBottom: 12 }} />
          <div className="skeleton-box" style={{ height: 14, width: '40%' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      {!data?.configurado && (
        <div className="inline-alert inline-alert-info" style={{ margin: 16 }}>
          SMTP no configurado — configúralo para poder recibir notificaciones por correo.
        </div>
      )}
      <form onSubmit={handleSubmit} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ff-wrap">
          <label className="ff-label ff-required" htmlFor="smtpEmail">Correo remitente</label>
          <input
            id="smtpEmail"
            type="email"
            className={`ff-input${errors.email ? ' ff-input-error' : ''}`}
            placeholder="notificaciones@empresa.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          {errors.email && <p className="ff-error">{errors.email}</p>}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="ff-wrap" style={{ flex: 2 }}>
            <label className="ff-label ff-required" htmlFor="smtpHost">Host SMTP</label>
            <input
              id="smtpHost"
              type="text"
              className={`ff-input${errors.host ? ' ff-input-error' : ''}`}
              placeholder="smtp.gmail.com"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
            />
            {errors.host && <p className="ff-error">{errors.host}</p>}
          </div>
          <div className="ff-wrap" style={{ flex: 1 }}>
            <label className="ff-label ff-required" htmlFor="smtpPuerto">Puerto</label>
            <input
              id="smtpPuerto"
              type="number"
              className={`ff-input${errors.puerto ? ' ff-input-error' : ''}`}
              value={form.puerto}
              onChange={(e) => setForm((f) => ({ ...f, puerto: e.target.value }))}
            />
            {errors.puerto && <p className="ff-error">{errors.puerto}</p>}
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Seguridad</label>
          <div style={{ display: 'flex', gap: 16 }}>
            <label className="ff-check-wrap" style={{ gap: 6 }}>
              <input
                type="radio"
                name="smtpMode"
                className="ff-check"
                checked={form.mode === 'tls'}
                onChange={() => setForm((f) => ({ ...f, mode: 'tls', puerto: f.puerto || '587' }))}
              />
              TLS (587)
            </label>
            <label className="ff-check-wrap" style={{ gap: 6 }}>
              <input
                type="radio"
                name="smtpMode"
                className="ff-check"
                checked={form.mode === 'ssl'}
                onChange={() => setForm((f) => ({ ...f, mode: 'ssl', puerto: f.puerto || '465' }))}
              />
              SSL (465)
            </label>
            <label className="ff-check-wrap" style={{ gap: 6 }}>
              <input
                type="radio"
                name="smtpMode"
                className="ff-check"
                checked={form.mode === 'none'}
                onChange={() => setForm((f) => ({ ...f, mode: 'none' }))}
              />
              Ninguno
            </label>
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label ff-required" htmlFor="smtpUsuario">Usuario de autenticación</label>
          <input
            id="smtpUsuario"
            type="text"
            className={`ff-input${errors.usuario ? ' ff-input-error' : ''}`}
            value={form.usuario}
            onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))}
          />
          {errors.usuario && <p className="ff-error">{errors.usuario}</p>}
        </div>

        <div className="ff-wrap">
          <label className="ff-label" htmlFor="smtpPassword">Contraseña</label>
          <input
            id="smtpPassword"
            type="password"
            className="ff-input"
            placeholder="•••••••• (dejar en blanco para no cambiar)"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            autoComplete="new-password"
          />
        </div>

        <label className="ff-check-wrap">
          <input
            type="checkbox"
            className="ff-check"
            checked={form.habilitado}
            onChange={(e) => setForm((f) => ({ ...f, habilitado: e.target.checked }))}
          />
          Canal habilitado
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Historial de envíos ─────────────────────────────────────────────────────

const ESTADOS = ['Todos', 'Enviado', 'Fallido'] as const

function formatLogDate(iso?: string | null): string {
  if (!iso) return '—'
  try {
    return format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: es })
  } catch {
    return iso
  }
}

function HistorialTab() {
  // Filters
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('Todos')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  // Fetch tipos for dropdown
  const { data: tiposData } = useQuery({
    queryKey: ['notificaciones', 'tipos'],
    queryFn: listNotificacionTipos,
  })
  const [filtroTipoSearch, setFiltroTipoSearch] = useState('')
  const filtroTipoOptions: SearchSelectOption[] = (tiposData ?? [])
    .filter((t) => !filtroTipoSearch || t.nombre.toLowerCase().includes(filtroTipoSearch.toLowerCase()))
    .map((t) => ({ value: t.codigo, label: t.nombre }))

  // Fetch resumen
  const { data: resumen } = useQuery({
    queryKey: ['notificaciones', 'logs-resumen'],
    queryFn: () => getNotificacionLogResumen(7),
    refetchInterval: 30_000,
  })

  // Fetch logs
  const logsParams: ListNotificacionLogsParams = {
    limit,
    offset,
    ...(filtroTipo ? { tipo: filtroTipo } : {}),
    ...(filtroEstado !== 'Todos' ? { estado: filtroEstado as "Enviado" | "Fallido" } : {}),
    ...(filtroDesde ? { desde: filtroDesde } : {}),
    ...(filtroHasta ? { hasta: filtroHasta } : {}),
  }
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['notificaciones', 'logs', logsParams],
    queryFn: () => listNotificacionLogs(logsParams),
  })

  const logs = logsData?.items ?? []
  const meta = logsData?.meta

  function resetPage() { setOffset(0) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Resumen Widget ──────────────────────────────────────────────── */}
      {resumen && <ResumenWidget data={resumen} />}

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 200 }}>
            <SearchSelect
              value={filtroTipo}
              onChange={(val) => { setFiltroTipo(val); resetPage() }}
              options={filtroTipoOptions}
              onSearch={setFiltroTipoSearch}
              selectedLabel={tiposData?.find((t) => t.codigo === filtroTipo)?.nombre ?? ''}
              placeholder="Todos los tipos"
            />
          </div>

          <Select value={filtroEstado} onValueChange={(val) => { setFiltroEstado(val); resetPage() }}>
            {ESTADOS.map((e) => (
              <SelectItem key={e} value={e}>{e === 'Todos' ? 'Todos los estados' : e}</SelectItem>
            ))}
          </Select>

          <input
            type="date"
            className="filter-select"
            title="Desde"
            value={filtroDesde}
            onChange={(e) => { setFiltroDesde(e.target.value); resetPage() }}
          />
          <input
            type="date"
            className="filter-select"
            title="Hasta"
            value={filtroHasta}
            onChange={(e) => { setFiltroHasta(e.target.value); resetPage() }}
          />
        </div>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Referencia</th>
                <th>Destinatarios</th>
                <th style={{ width: 80 }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}><span className="skeleton-box" style={{ height: 14, width: '100%', display: 'block' }} /></td>
                      ))}
                    </tr>
                  ))
                : logs.length === 0
                ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        No se encontraron envíos
                      </td>
                    </tr>
                  )
                : logs.map((entry) => (
                    <LogRow key={entry.id} entry={entry} tipos={tiposData ?? []} />
                  ))}
            </tbody>
          </table>
        </div>

        {/* ── Paginación ────────────────────────────────────────────────── */}
        {meta && meta.total > 0 && (
          <div className="table-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="table-footer-count">
              {Math.min(offset + 1, meta.total)}–{Math.min(offset + limit, meta.total)} de {meta.total} envíos
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost btn-size-sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                className="btn btn-ghost btn-size-sm"
                disabled={!meta.hasMore}
                onClick={() => setOffset((o) => o + limit)}
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Row con celda de error expandible ──────────────────────────────────────

function LogRow({ entry, tipos }: { entry: NotificacionLogEntry; tipos: { codigo: string; nombre: string }[] }) {
  const [showError, setShowError] = useState(false)
  const tipoNombre = tipos.find((t) => t.codigo === entry.tipo)?.nombre ?? entry.tipo
  const esFallido = entry.estado === 'Fallido'

  return (
    <>
      <tr className="data-table-row-link" onClick={() => esFallido && setShowError(true)}>
        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatLogDate(entry.fecha)}</td>
        <td>
          <span title={entry.tipo} style={{ fontWeight: 500 }}>{tipoNombre}</span>
        </td>
        <td>
          <span className={`badge ${esFallido ? 'badge-cancelled' : 'badge-submitted'}`}>
            {esFallido ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
            {' '}{entry.estado}
          </span>
        </td>
        <td>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {entry.referencia ?? '—'}
          </span>
        </td>
        <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.destinatarios.join(', ')}
        </td>
        <td>
          {esFallido && (
            <button
              type="button"
              className="btn btn-ghost btn-size-icon-sm"
              title="Ver error"
              onClick={(e) => { e.stopPropagation(); setShowError(true) }}
            >
              <AlertCircle size={14} style={{ color: 'var(--color-danger, #e53e3e)' }} />
            </button>
          )}
        </td>
      </tr>

      {showError && (
        <ErrorModal entry={entry} tipoNombre={tipoNombre} onClose={() => setShowError(false)} />
      )}
    </>
  )
}

// ─── Modal de detalle de error ──────────────────────────────────────────────

function ErrorModal({ entry, tipoNombre, onClose }: { entry: NotificacionLogEntry; tipoNombre: string; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Error de envío</h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="detail-field">
            <span className="detail-label">Tipo</span>
            <span className="detail-value">{tipoNombre}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Referencia</span>
            <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{entry.referencia ?? '—'}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Destinatarios</span>
            <span className="detail-value">{entry.destinatarios.join(', ')}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Fecha</span>
            <span className="detail-value">{formatLogDate(entry.fecha)}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">Mensaje de error</span>
            <div style={{
              marginTop: 4,
              padding: 12,
              background: 'var(--color-danger-bg, #fef2f2)',
              border: '1px solid var(--color-danger-border, #fecaca)',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-danger-text, #b91c1c)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}>
              {entry.error}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Widget de resumen (3 stat-tiles) ───────────────────────────────────────

function ResumenWidget({ data }: { data: { total: number; enviados: number; fallidos: number; ultimoIntento: { tipo: string; estado: string; fecha: string } | null } }) {
  const cards = [
    { label: 'Total', value: String(data.total), icon: <Clock size={16} />, danger: false },
    { label: 'Enviados', value: String(data.enviados), icon: <CheckCircle2 size={16} />, danger: false, accent: 'var(--success-text, #16a34a)' },
    { label: 'Fallidos', value: String(data.fallidos), icon: <XCircle size={16} />, danger: data.fallidos > 0, accent: data.fallidos > 0 ? 'var(--color-danger, #e53e3e)' : undefined },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {cards.map((card) => (
          <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: card.accent ?? 'var(--text-tertiary)' }}>{card.icon}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.danger ? 'var(--color-danger, #e53e3e)' : 'var(--text-primary)' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {data.ultimoIntento && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', paddingLeft: 4 }}>
          Último intento: <strong>{data.ultimoIntento.tipo}</strong> · {data.ultimoIntento.estado} · {formatLogDate(data.ultimoIntento.fecha)}
        </div>
      )}
    </div>
  )
}
