import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Permitido } from '@/components/shared/Permitido'
import { usePuede } from '@/shared/permissions/can'
import { Badge } from '@/shared/ui/Badge'
import { Modal, ConfirmModal } from '@/shared/ui/Modal'
import { formatDate, formatDateTime } from '@/lib/formatters'
import {
  listRelacionesComerciales,
  listInvitacionesRelacion,
  getInvitacionRelacion,
  cancelarInvitacionRelacion,
  reenviarInvitacionRelacion,
  aceptarInvitacionRelacion,
  rechazarInvitacionRelacion,
  listBloqueosComerciales,
  levantarBloqueoComercial,
} from '@/shared/api/relaciones'
import type { TerminosComercialesDto } from '@/shared/api/types'
import { EstadoRelacionBadge, EstadoInvitacionBadge, AvisoAdopcionMaestros } from './shared'
import { TerminosComercialesFields } from './TerminosComercialesFields'
import { NuevaRelacionWizard } from './NuevaRelacionWizard'

const PAGE_SIZE = 20

type TabPrincipal = 'socios' | 'invitaciones' | 'bloqueadas'

export default function RelacionesComercialesPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabPrincipal>('socios')
  const [wizardOpen, setWizardOpen] = useState(false)

  const puedeInvitar = usePuede('relaciones.invitacion.crear')
  const puedeVerInvitaciones = usePuede('relaciones.invitacion.listar')
  const puedeVerBloqueos = usePuede('relaciones.bloqueo.listar')

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Relaciones Comerciales</>}
        description="Invita, gestiona y da seguimiento a tus socios comerciales B2B"
        action={
          puedeInvitar ? (
            <button className="btn btn-navy" onClick={() => setWizardOpen(true)}>
              <Plus size={16} />
              Nueva relación comercial
            </button>
          ) : undefined
        }
      />

      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        <button type="button" className={`tab-btn${activeTab === 'socios' ? ' on' : ''}`} onClick={() => setActiveTab('socios')}>
          Socios
        </button>
        {puedeVerInvitaciones && (
          <button type="button" className={`tab-btn${activeTab === 'invitaciones' ? ' on' : ''}`} onClick={() => setActiveTab('invitaciones')}>
            Invitaciones
          </button>
        )}
        {puedeVerBloqueos && (
          <button type="button" className={`tab-btn${activeTab === 'bloqueadas' ? ' on' : ''}`} onClick={() => setActiveTab('bloqueadas')}>
            Bloqueadas
          </button>
        )}
      </div>

      {activeTab === 'socios' && <SociosTab />}
      {activeTab === 'invitaciones' && puedeVerInvitaciones && <InvitacionesTab />}
      {activeTab === 'bloqueadas' && puedeVerBloqueos && <BloqueadasTab />}

      {wizardOpen && (
        <NuevaRelacionWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['relaciones-comerciales'] })}
        />
      )}
    </div>
  )
}

function EmptyPermiso({ texto }: { texto: string }) {
  return (
    <div className="card">
      <div className="empty-state">
        <p className="empty-title">Sin permiso</p>
        <p className="empty-sub">{texto}</p>
      </div>
    </div>
  )
}

// ─── Tab: Socios ─────────────────────────────────────────────────────────────

function SociosTab() {
  const navigate = useNavigate()
  const puedeListar = usePuede('relaciones.listar')
  const [offset, setOffset] = useState(0)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['relaciones-comerciales', offset],
    queryFn: () => listRelacionesComerciales({ limit: PAGE_SIZE, offset }),
    enabled: puedeListar,
    // Refresco automático razonable (no polling agresivo) SOLO mientras haya filas en un estado
    // transitorio visibles en esta página — si todo quedó resuelto, no hay nada que refrescar solo.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? []
      const hayPendientes = items.some((r) => r.status === 'activando' || r.status === 'invitada')
      return hayPendientes ? 15000 : false
    },
  })

  if (!puedeListar) {
    return <EmptyPermiso texto="No tienes permiso para ver los socios comerciales." />
  }

  const items = data?.items ?? []

  return (
    <div className="card navy-table-card">
      <div className="table-scroll">
        <table className="data-table navy-table">
          <thead>
            <tr>
              <th>Contraparte</th>
              <th>Estado</th>
              <th>Activada el</th>
              <th>Creada el</th>
              <th style={{ width: 90 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j}><span className="skeleton-box" style={{ height: 14, width: '100%', display: 'block' }} /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                  Error al cargar los socios comerciales
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <p className="empty-title">Sin socios comerciales</p>
                    <p className="empty-sub">Cuando invites o te inviten a formar una relación comercial, aparecerá aquí.</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="table-row-clickable" onClick={() => navigate(`/relaciones-comerciales/${r.id}`)}>
                  <td style={{ fontWeight: 500 }}>{r.contraparte.nombre}</td>
                  <td><EstadoRelacionBadge status={r.status} /></td>
                  <td>{formatDate(r.activatedAt)}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-size-xs"
                      onClick={(e) => { e.stopPropagation(); navigate(`/relaciones-comerciales/${r.id}`) }}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.meta.total > PAGE_SIZE && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
          </span>
          <div className="pagination-controls">
            <button className="btn btn-ghost btn-size-icon-sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
              <ChevronLeft size={14} />
            </button>
            <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Invitaciones (Enviadas / Recibidas) ───────────────────────────────

function InvitacionesTab() {
  const [direccion, setDireccion] = useState<'enviadas' | 'recibidas'>('enviadas')
  const queryClient = useQueryClient()
  const puedeCancelar = usePuede('relaciones.invitacion.cancelar')
  const puedeCrear = usePuede('relaciones.invitacion.crear')
  const puedeResponder = usePuede('relaciones.invitacion.responder')
  const puedeListarRelaciones = usePuede('relaciones.listar')

  const [cancelarId, setCancelarId] = useState<string | null>(null)
  const [aceptarId, setAceptarId] = useState<string | null>(null)
  const [rechazarId, setRechazarId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invitaciones-relacion', direccion],
    queryFn: () => listInvitacionesRelacion({ direccion }),
  })

  // `GET /relaciones/invitaciones` NO devuelve el nombre de la contraparte — solo
  // `fromTenantId`/`toTenantId` opacos (verificado contra la respuesta real del backend). El
  // detalle de una invitación (GET /relaciones/invitaciones/:id) tampoco lo trae. Como paliativo,
  // se cruza con `GET /relaciones` (que sí trae `contraparte.nombre`) — una invitación siempre
  // tiene, del lado de origen, una relación espejo en estado `invitada` con el mismo tenantId. Si
  // no aparece ahí (p. ej. una invitación ya cancelada/rechazada cuya relación nunca se creó), se
  // muestra el tenantId crudo en vez de nada, para no ocultar con qué empresa es cada fila.
  const { data: relacionesParaNombres } = useQuery({
    queryKey: ['relaciones-comerciales-nombres-lookup'],
    queryFn: () => listRelacionesComerciales({ limit: 100 }),
    enabled: puedeListarRelaciones,
    staleTime: 60_000,
  })
  const nombrePorTenantId = new Map(
    (relacionesParaNombres?.items ?? []).map((r) => [r.contraparte.tenantId, r.contraparte.nombre]),
  )
  function resolverNombreContraparte(inv: { fromTenantId: string; toTenantId: string }) {
    const tenantId = direccion === 'enviadas' ? inv.toTenantId : inv.fromTenantId
    return nombrePorTenantId.get(tenantId) ?? tenantId
  }

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['invitaciones-relacion'] })

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => cancelarInvitacionRelacion(id),
    onSuccess: () => { toast.success('Invitación cancelada'); invalidar(); setCancelarId(null) },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al cancelar la invitación'),
  })

  const reenviarMutation = useMutation({
    mutationFn: (id: string) => reenviarInvitacionRelacion(id),
    // Estos 4 códigos vienen en español desde el backend y ya nombran la situación con precisión
    // (RELACION_BLOQUEADA, RELACION_YA_EXISTE, INVITACION_PENDIENTE, TENANT_SIN_CUENTA_SERVICIO)
    // — se muestran tal cual, sin reescribirlos.
    onSuccess: () => { toast.success('Invitación reenviada'); invalidar() },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al reenviar la invitación'),
  })

  const items = data ?? []

  return (
    <>
      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab-btn${direccion === 'enviadas' ? ' on' : ''}`} onClick={() => setDireccion('enviadas')}>
          Enviadas
        </button>
        <button type="button" className={`tab-btn${direccion === 'recibidas' ? ' on' : ''}`} onClick={() => setDireccion('recibidas')}>
          Recibidas
        </button>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Contraparte</th>
                <th>Mensaje</th>
                <th>Estado</th>
                <th>Expira</th>
                <th style={{ width: 180 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j}><span className="skeleton-box" style={{ height: 14, width: '100%', display: 'block' }} /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                    Error al cargar las invitaciones
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p className="empty-title">Sin invitaciones {direccion === 'enviadas' ? 'enviadas' : 'recibidas'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 500 }}>{resolverNombreContraparte(inv)}</td>
                    <td className="td-muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inv.mensaje || '—'}
                    </td>
                    <td><EstadoInvitacionBadge status={inv.status} /></td>
                    <td style={{ fontSize: 12 }}>{formatDateTime(inv.expiresAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {direccion === 'enviadas' && inv.status === 'pendiente' && puedeCancelar && (
                          <button className="btn btn-ghost btn-size-xs" onClick={() => setCancelarId(inv.id)}>Cancelar</button>
                        )}
                        {direccion === 'enviadas' && inv.status !== 'pendiente' && puedeCrear && (
                          <button
                            className="btn btn-ghost btn-size-xs"
                            disabled={reenviarMutation.isPending}
                            onClick={() => reenviarMutation.mutate(inv.id)}
                          >
                            Reenviar
                          </button>
                        )}
                        {direccion === 'recibidas' && inv.status === 'pendiente' && puedeResponder && (
                          <>
                            <button className="btn btn-navy btn-size-xs" onClick={() => setAceptarId(inv.id)}>Aceptar</button>
                            <button className="btn btn-ghost btn-size-xs" onClick={() => setRechazarId(inv.id)}>Rechazar</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={!!cancelarId}
        onClose={() => setCancelarId(null)}
        onConfirm={() => cancelarId && cancelarMutation.mutate(cancelarId)}
        title="¿Cancelar invitación?"
        description="La empresa invitada ya no podrá aceptarla."
        confirmLabel="Cancelar invitación"
        variant="danger"
        loading={cancelarMutation.isPending}
      />

      {aceptarId && (
        <AceptarInvitacionModal
          invitacionId={aceptarId}
          nombreContraparte={(() => {
            const inv = items.find((i) => i.id === aceptarId)
            return inv ? resolverNombreContraparte(inv) : undefined
          })()}
          onClose={() => setAceptarId(null)}
          onSuccess={() => { invalidar(); setAceptarId(null) }}
        />
      )}

      {rechazarId && (
        <RechazarInvitacionModal
          invitacionId={rechazarId}
          onClose={() => setRechazarId(null)}
          onSuccess={() => { invalidar(); setRechazarId(null) }}
        />
      )}
    </>
  )
}

function AceptarInvitacionModal({
  invitacionId, nombreContraparte, onClose, onSuccess,
}: { invitacionId: string; nombreContraparte?: string; onClose: () => void; onSuccess: () => void }) {
  const [terminos, setTerminos] = useState<TerminosComercialesDto>({})

  const { data: detalle, isLoading } = useQuery({
    queryKey: ['invitacion-relacion', invitacionId],
    queryFn: () => getInvitacionRelacion(invitacionId),
  })

  const aceptarMutation = useMutation({
    mutationFn: () => aceptarInvitacionRelacion(invitacionId, { terminos }),
    onSuccess: () => { toast.success('Invitación aceptada'); onSuccess() },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al aceptar la invitación'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Aceptar invitación"
      subtitle={nombreContraparte}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary btn-size-sm" onClick={onClose} disabled={aceptarMutation.isPending}>Cancelar</button>
          <Permitido accion="relaciones.invitacion.responder">
            <button className="btn btn-navy btn-size-sm" onClick={() => aceptarMutation.mutate()} disabled={aceptarMutation.isPending || isLoading}>
              {aceptarMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Aceptar invitación'}
            </button>
          </Permitido>
        </>
      }
    >
      {isLoading ? (
        <p className="ff-hint">Cargando…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AvisoAdopcionMaestros maestrosLocales={detalle?.maestrosLocales} />
          <TerminosComercialesFields value={terminos} onChange={setTerminos} disabled={aceptarMutation.isPending} />
        </div>
      )}
    </Modal>
  )
}

function RechazarInvitacionModal({ invitacionId, onClose, onSuccess }: { invitacionId: string; onClose: () => void; onSuccess: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [bloquear, setBloquear] = useState(false)

  const rechazarMutation = useMutation({
    mutationFn: () => rechazarInvitacionRelacion(invitacionId, { motivo: motivo.trim() || undefined, bloquear }),
    onSuccess: () => { toast.success('Invitación rechazada'); onSuccess() },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al rechazar la invitación'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Rechazar invitación"
      size="md"
      footer={
        <>
          <button className="btn btn-secondary btn-size-sm" onClick={onClose} disabled={rechazarMutation.isPending}>Cancelar</button>
          <button className="btn btn-danger btn-size-sm" onClick={() => rechazarMutation.mutate()} disabled={rechazarMutation.isPending}>
            {rechazarMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Rechazar invitación'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="rechazo-motivo">Motivo (opcional)</label>
          <textarea
            id="rechazo-motivo"
            className="ff-textarea"
            rows={3}
            maxLength={500}
            placeholder="Cuéntale a la empresa por qué rechazas su invitación (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={rechazarMutation.isPending}
          />
        </div>
        <Permitido accion="relaciones.bloqueo.crear">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={bloquear}
              disabled={rechazarMutation.isPending}
              onChange={(e) => setBloquear(e.target.checked)}
            />
            Bloquear esta empresa
          </label>
        </Permitido>
      </div>
    </Modal>
  )
}

// ─── Tab: Bloqueadas ─────────────────────────────────────────────────────────
//
// IMPORTANTE: este tab NUNCA puede mostrar quién bloqueó a la empresa propia — `GET
// /relaciones/bloqueos` solo devuelve lo que ESTA empresa bloqueó (Fase 04 §3). No existe un
// endpoint para ver quién te bloqueó a ti, y esa información no debe simularse ni inferirse.

function BloqueadasTab() {
  const puedeListar = usePuede('relaciones.bloqueo.listar')
  const queryClient = useQueryClient()
  const [desbloquearId, setDesbloquearId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bloqueos-comerciales'],
    queryFn: () => listBloqueosComerciales(true),
    enabled: puedeListar,
  })

  const desbloquearMutation = useMutation({
    mutationFn: (id: string) => levantarBloqueoComercial(id),
    onSuccess: () => {
      toast.success('Bloqueo levantado')
      queryClient.invalidateQueries({ queryKey: ['bloqueos-comerciales'] })
      setDesbloquearId(null)
    },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al levantar el bloqueo'),
  })

  if (!puedeListar) {
    return <EmptyPermiso texto="No tienes permiso para ver las empresas bloqueadas." />
  }

  const bloqueos = data ?? []

  return (
    <>
      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>RNC</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>Creado</th>
                <th style={{ width: 110 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}><span className="skeleton-box" style={{ height: 14, width: '100%', display: 'block' }} /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                    Error al cargar las empresas bloqueadas
                  </td>
                </tr>
              ) : bloqueos.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p className="empty-title">Sin empresas bloqueadas</p>
                    </div>
                  </td>
                </tr>
              ) : (
                bloqueos.map((b) => (
                  <tr key={b.id} style={b.levantado ? { opacity: 0.55 } : undefined}>
                    <td style={{ fontWeight: 500 }}>{b.nombreBloqueado ?? '—'}</td>
                    <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{b.rncBloqueado ?? '—'}</td>
                    <td className="td-muted">{b.motivo ?? '—'}</td>
                    <td><Badge variant={b.levantado ? 'neutral' : 'error'}>{b.levantado ? 'Levantado' : 'Activo'}</Badge></td>
                    <td>{formatDate(b.createdAt)}</td>
                    <td>
                      {!b.levantado && (
                        <Permitido accion="relaciones.bloqueo.levantar">
                          <button className="btn btn-ghost btn-size-xs" onClick={() => setDesbloquearId(b.id)}>Desbloquear</button>
                        </Permitido>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={!!desbloquearId}
        onClose={() => setDesbloquearId(null)}
        onConfirm={() => desbloquearId && desbloquearMutation.mutate(desbloquearId)}
        title="¿Desbloquear empresa?"
        description="Esta empresa podrá volver a enviarte o recibir invitaciones de relación comercial."
        confirmLabel="Desbloquear"
        variant="default"
        loading={desbloquearMutation.isPending}
      />
    </>
  )
}
