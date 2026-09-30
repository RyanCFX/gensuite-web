import { useState, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldOff, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { useAcceso } from '@/shared/permissions/useAcceso'
import { usePermissionsStore } from '@/stores/permissions.store'
import {
  listPerfilesAcceso, listPlantillasAcceso, createPerfilAcceso, deletePerfilAcceso,
  getAuditoriaAcceso, migrarAcceso, sincronizarRolesAcceso,
} from '@/shared/api/acceso'
import type { ApiError, PerfilAcceso } from '@/shared/api/types'
import { ConfirmModal } from '@/shared/ui/Modal'
import { PerfilDetail } from './PerfilDetail'

// Administración de acceso — Permisos v2
// (docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §7).
// Gate: rol System Manager. Cuando el backend exponga la acción `config.acceso.gestionar`
// en /me/permissions, migrar este gate a `acciones['config.acceso.gestionar']` (§4.1).

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

type TabKey = 'perfiles' | 'auditoria' | 'herramientas'

function BannerModo({ modo }: { modo: string }) {
  if (modo === 'activo') return null
  return (
    <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
      {modo === 'sombra'
        ? 'Modo de prueba: estos permisos se están evaluando pero todavía no se aplican.'
        : 'Los permisos por pantalla todavía no están activos en su empresa. Puede prepararlos; se aplicarán cuando se activen.'}
    </div>
  )
}

export default function AccesoPage() {
  const isSystemManager = useIsSystemManager()
  const modo = useAcceso().modo
  const [tab, setTab] = useState<TabKey>('perfiles')
  const [perfilId, setPerfilId] = useState<string | null>(null)

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader title="Permisos" description="Perfiles de acceso por pantalla" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Esta sección requiere el rol System Manager en el sistema.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Permisos</>}
        description="Perfiles de acceso por pantalla, componente y filtro"
        action={<RecargarButton />}
      />
      <BannerModo modo={modo} />

      {perfilId === null ? (
        <>
          <div className="tabs-bar" style={{ marginBottom: 20 }}>
            <button type="button" className={`tab-btn${tab === 'perfiles' ? ' on' : ''}`} onClick={() => setTab('perfiles')}>
              Perfiles
            </button>
            <button type="button" className={`tab-btn${tab === 'auditoria' ? ' on' : ''}`} onClick={() => setTab('auditoria')}>
              Auditoría
            </button>
            <button type="button" className={`tab-btn${tab === 'herramientas' ? ' on' : ''}`} onClick={() => setTab('herramientas')}>
              Herramientas
            </button>
          </div>
          {tab === 'perfiles' && <PerfilesTab onOpen={setPerfilId} />}
          {tab === 'auditoria' && <AuditoriaTab />}
          {tab === 'herramientas' && <HerramientasTab />}
        </>
      ) : (
        <PerfilDetail perfilId={perfilId} onBack={() => setPerfilId(null)} />
      )}
    </div>
  )
}

// ─── Perfiles ────────────────────────────────────────────────────────────────

function PerfilesTab({ onOpen }: { onOpen: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [duplicar, setDuplicar] = useState<PerfilAcceso | null>(null)
  const [eliminar, setEliminar] = useState<PerfilAcceso | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['acceso-perfiles'],
    queryFn: listPerfilesAcceso,
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePerfilAcceso(id),
    onSuccess: () => {
      toast.success('Perfil eliminado')
      queryClient.invalidateQueries({ queryKey: ['acceso-perfiles'] })
      setEliminar(null)
    },
    // 409 PERFIL_EN_USO: el message del backend lista qué hacer (reasignar primero).
    onError: (err) => toast.error(apiMessage(err, 'No se pudo eliminar el perfil')),
  })

  const duplicateMutation = useMutation({
    mutationFn: (p: PerfilAcceso) =>
      createPerfilAcceso({ nombre: `${p.nombre} (copia)`, descripcion: p.descripcion, grants: p.grants }),
    onSuccess: (creado) => {
      toast.success(`Perfil "${creado.nombre}" creado`)
      queryClient.invalidateQueries({ queryKey: ['acceso-perfiles'] })
      setDuplicar(null)
      onOpen(creado.id)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo duplicar el perfil')),
  })

  return (
    <div className="card navy-table-card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 className="card-title">Perfiles de acceso</h3>
          <p className="card-sub">El acceso de un usuario es la unión de sus perfiles (con las excepciones de cada perfil)</p>
        </div>
        <button className="btn btn-navy" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Nuevo perfil
        </button>
      </div>
      {isLoading ? (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="skeleton-box" style={{ height: 40, width: '100%' }} />
          ))}
        </div>
      ) : isError ? (
        <div className="inline-alert inline-alert-error" style={{ margin: 16 }}>
          {apiMessage(error, 'No se pudieron cargar los perfiles. Si el backend aún no expone Permisos v2, esta pantalla no está disponible.')}
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Sin perfiles</p>
          <p className="empty-sub">Creá el primero o importalo desde los perfiles actuales (Herramientas).</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Perfil</th>
                <th style={{ textAlign: 'center' }}>Usuarios</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="table-row-clickable" onClick={() => onOpen(p.id)}>
                  <td>
                    <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                    {p.esSistema && <span className="badge badge-info" style={{ marginLeft: 8 }}>Sistema</span>}
                    {p.descripcion && <div className="td-muted" style={{ fontSize: 12 }}>{p.descripcion}</div>}
                  </td>
                  <td style={{ textAlign: 'center' }}>{p.totalUsuarios}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDuplicar(p)} disabled={duplicateMutation.isPending}>
                      Duplicar
                    </button>
                    {!p.esSistema && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--error-text)' }}
                        onClick={() => setEliminar(p)}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CrearPerfilModal onClose={() => setShowCreate(false)} onCreated={onOpen} />}

      <ConfirmModal
        open={duplicar !== null}
        onClose={() => setDuplicar(null)}
        onConfirm={() => duplicar && duplicateMutation.mutate(duplicar)}
        title="¿Duplicar perfil?"
        description={duplicar ? `Se creará "${duplicar.nombre} (copia)" con los mismos permisos.` : ''}
        confirmLabel="Duplicar"
        variant="default"
        loading={duplicateMutation.isPending}
      />
      <ConfirmModal
        open={eliminar !== null}
        onClose={() => setEliminar(null)}
        onConfirm={() => eliminar && deleteMutation.mutate(eliminar.id)}
        title="¿Eliminar perfil?"
        description={eliminar
          ? `Se eliminará "${eliminar.nombre}". Si tiene usuarios asignados, el servidor lo rechazará: reasignelos primero.`
          : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

function CrearPerfilModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [plantilla, setPlantilla] = useState('')

  const { data: plantillas } = useQuery({
    queryKey: ['acceso-plantillas'],
    queryFn: listPlantillasAcceso,
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: () => createPerfilAcceso({
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      plantilla: plantilla || undefined,
    }),
    onSuccess: (creado) => {
      toast.success(`Perfil "${creado.nombre}" creado`)
      queryClient.invalidateQueries({ queryKey: ['acceso-perfiles'] })
      onCreated(creado.id)
    },
    // 409 PERFIL_DUPLICADO → error en el campo nombre; 400 PLANTILLA_INEXISTENTE → recargar.
    onError: (err) => toast.error(apiMessage(err, 'No se pudo crear el perfil')),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || nombre.trim().length > 150) return
    createMutation.mutate()
  }

  // Portal a document.body: renderizado inline (como estaba antes) queda anidado dentro del
  // <div className="card"> de PerfilesPanel, cuya animación de entrada anima `translate`
  // (_fade-up en index.css) y por eso ese `.card` se vuelve el containing block de este
  // `position: fixed` — el overlay terminaba encerrado en la tarjeta en vez de cubrir la
  // pantalla. Mismo patrón ya documentado en shared/ui/Modal.tsx.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Nuevo perfil de acceso</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label ff-required" htmlFor="perfil-nombre">Nombre</label>
              <input
                id="perfil-nombre"
                className="ff-input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={150}
                autoFocus
                required
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="perfil-desc">Descripción</label>
              <input
                id="perfil-desc"
                className="ff-input"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="perfil-plantilla">Partir de una plantilla</label>
              <select
                id="perfil-plantilla"
                className="ff-input"
                value={plantilla}
                onChange={(e) => setPlantilla(e.target.value)}
              >
                <option value="">Vacío (sin permisos)</option>
                {(plantillas ?? []).map((t) => (
                  <option key={t.key} value={t.key}>{t.nombre}</option>
                ))}
              </select>
              <p className="ff-hint">El backend copia los permisos de la plantilla; después se editan en el árbol.</p>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!nombre.trim() || createMutation.isPending}>
              Crear y editar permisos
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

// ─── Auditoría ───────────────────────────────────────────────────────────────

const AUDITORIA_ACCION_LABEL: Record<string, string> = {
  'perfil.crear': 'Perfil creado',
  'perfil.actualizar': 'Perfil actualizado',
  'perfil.grants': 'Permisos del perfil',
  'perfil.eliminar': 'Perfil eliminado',
  'usuario.acceso': 'Acceso de usuario',
  'usuario.administrador': 'Administrador',
}

function AuditoriaTab() {
  const PAGE = 20
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<import('@/shared/api/types').AuditoriaAccesoEntry[]>([])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['acceso-auditoria', offset],
    queryFn: () => getAuditoriaAcceso({ limit: PAGE, offset }),
    retry: false,
  })

  const [expandido, setExpandido] = useState<string | null>(null)
  const lista = offset === 0 ? (data?.items ?? []) : items.concat(data?.items ?? [])

  function cargarMas() {
    setItems(lista)
    setOffset((o) => o + PAGE)
  }

  return (
    <div className="card navy-table-card">
      <div className="card-header">
        <div>
          <h3 className="card-title">Auditoría</h3>
          <p className="card-sub">Quién cambió qué, con motivo y detalle antes/después</p>
        </div>
      </div>
      {isLoading && offset === 0 ? (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="skeleton-box" style={{ height: 32, width: '100%' }} />
          ))}
        </div>
      ) : isError ? (
        <div className="inline-alert inline-alert-error" style={{ margin: 16 }}>
          {apiMessage(error, 'No se pudo cargar la auditoría.')}
        </div>
      ) : lista.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Sin movimientos</p>
          <p className="empty-sub">Todavía no hay cambios de acceso registrados.</p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Actor</th>
                  <th>Acción</th>
                  <th>Sujeto</th>
                  <th>Motivo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td className="td-muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(a.createdAt).toLocaleString()}
                      </td>
                      <td style={{ fontSize: 13 }}>{a.actorEmail}</td>
                      <td style={{ fontSize: 13 }}>{AUDITORIA_ACCION_LABEL[a.accion] ?? a.accion}</td>
                      <td className="td-muted" style={{ fontSize: 12 }}>{a.sujetoTipo}: {String(a.sujetoId).slice(0, 8)}</td>
                      <td style={{ fontSize: 13 }}>{a.motivo ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setExpandido(expandido === a.id ? null : a.id)}>
                          {expandido === a.id ? 'Ocultar' : 'Detalle'}
                        </button>
                      </td>
                    </tr>
                    {expandido === a.id && (
                      <tr>
                        <td colSpan={6}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <p className="ff-label">Antes</p>
                              <pre style={{ fontSize: 12, background: 'var(--surface-page)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 300 }}>
                                {JSON.stringify(a.antes, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="ff-label">Después</p>
                              <pre style={{ fontSize: 12, background: 'var(--surface-page)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 300 }}>
                                {JSON.stringify(a.despues, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {data?.meta.hasMore && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button className="btn btn-secondary btn-size-sm" onClick={cargarMas}>Cargar más</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Herramientas ────────────────────────────────────────────────────────────

function HerramientasTab() {
  const [reemplazar, setReemplazar] = useState(false)
  const [confirmMigrar, setConfirmMigrar] = useState(false)
  const [confirmSinc, setConfirmSinc] = useState(false)
  const [resultadoMig, setResultadoMig] = useState<{ perfiles: string[]; usuarios: number; personalizados: number } | null>(null)
  const [resultadoSinc, setResultadoSinc] = useState<Record<string, unknown> | null>(null)

  const migrarMutation = useMutation({
    mutationFn: () => migrarAcceso(reemplazar),
    onSuccess: (res) => {
      setResultadoMig(res)
      toast.success(`Migración completa: ${res.perfiles.length} perfiles, ${res.usuarios} usuarios`)
      setConfirmMigrar(false)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo migrar')),
  })

  const sincMutation = useMutation({
    mutationFn: sincronizarRolesAcceso,
    onSuccess: (res) => {
      setResultadoSinc(res)
      toast.success('Roles de ERPNext re-derivados')
      setConfirmSinc(false)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo sincronizar')),
  })

  // Si se editó el propio acceso, la UI tiene que reflejarlo al instante (§2.1).
  function refrescarMiAcceso() {
    usePermissionsStore.getState().refreshSilencioso()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Importar desde los perfiles actuales</h3>
            <p className="card-sub">Crea perfiles v2 equivalentes a los Role Profiles de ERPNext y los asigna (reproduce el acceso actual). Idempotente.</p>
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="ff-check-wrap">
            <input type="checkbox" className="ff-check" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
            Sobrescribir perfiles con el mismo nombre
          </label>
          <div>
            <button className="btn btn-secondary" onClick={() => setConfirmMigrar(true)}>Importar</button>
          </div>
          {resultadoMig && (
            <div className="inline-alert inline-alert-info">
              Perfiles: {resultadoMig.perfiles.join(', ') || '—'} · Usuarios asignados: {resultadoMig.usuarios} · Personalizados: {resultadoMig.personalizados}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Avanzado — Sincronizar con ERPNext</h3>
            <p className="card-sub">Re-deriva los roles de ERPNext de todos los usuarios (solo tiene efecto en modo activo).</p>
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <button className="btn btn-secondary" onClick={() => setConfirmSinc(true)}>Sincronizar</button>
          </div>
          {resultadoSinc && (
            <pre style={{ fontSize: 12, background: 'var(--surface-page)', padding: 12, borderRadius: 8, overflow: 'auto' }}>
              {JSON.stringify(resultadoSinc, null, 2)}
            </pre>
          )}
          <div>
            <button className="btn btn-ghost btn-size-sm" onClick={refrescarMiAcceso}>Recargar mi acceso</button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmMigrar}
        onClose={() => setConfirmMigrar(false)}
        onConfirm={() => migrarMutation.mutate()}
        title="¿Importar perfiles actuales?"
        description="Se crearán perfiles v2 a partir de los Role Profiles de ERPNext y se asignarán a los usuarios."
        confirmLabel="Importar"
        variant="default"
        loading={migrarMutation.isPending}
      />
      <ConfirmModal
        open={confirmSinc}
        onClose={() => setConfirmSinc(false)}
        onConfirm={() => sincMutation.mutate()}
        title="¿Sincronizar con ERPNext?"
        description="Se re-derivarán los roles de ERPNext de todos los usuarios según sus perfiles v2."
        confirmLabel="Sincronizar"
        variant="default"
        loading={sincMutation.isPending}
      />
    </div>
  )
}
