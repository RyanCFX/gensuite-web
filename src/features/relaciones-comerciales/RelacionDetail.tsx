import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Minus, Trash2, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Permitido } from '@/components/shared/Permitido'
import { usePuede } from '@/shared/permissions/can'
import { Modal, ConfirmModal } from '@/shared/ui/Modal'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { formatDate, formatDateTime } from '@/lib/formatters'
import { isApiErrorCode } from '@/shared/api/client'
import { listAlmacenes, getCatalogosFiscales } from '@/shared/api/config'
import {
  getRelacionComercial,
  actualizarConfiguracionRelacion,
  actualizarTerminosRelacion,
  getEstadoActivacionRelacion,
  reintentarActivacionRelacion,
  getMaestrosCandidatosRelacion,
  adoptarMaestrosRelacion,
  suspenderRelacion,
  reactivarRelacion,
  terminarRelacion,
  getMapeoAcumuladoRelacion,
  actualizarMapeoAcumuladoRelacion,
} from '@/shared/api/relaciones'
import type {
  ActualizarConfiguracionRelacionDto,
  EstadoActivacionOutboxEntry,
  FilaMapeoAcumulado,
  Item,
  MaestroCandidatoRelacion,
  TerminosComercialesDto,
} from '@/shared/api/types'
import { EstadoRelacionBadge } from './shared'
import { TerminosComercialesFields } from './TerminosComercialesFields'

const ESTADO_ACTIVANDO = new Set(['invitada', 'activando'])
// `revocada`/`rechazada` también dejan `configuracion: null` (nunca llegaron a activarse), pero no
// están "activando" — son terminales, nunca van a tener espejos. Sin esta distinción, el banner de
// "Activando…" se mostraba incorrectamente para una relación ya revocada (encontrado probando en
// vivo: terminar una relación que nunca se activó la deja en este estado).
const ESTADO_TERMINAL_SIN_ACTIVAR = new Set(['revocada', 'rechazada'])

const OUTBOX_ESTADO_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  done: 'Completado',
  failed: 'Falló',
}
const OUTBOX_ESTADO_BADGE: Record<string, string> = {
  pending: 'badge-neutral',
  processing: 'badge-info',
  done: 'badge-success',
  failed: 'badge-error',
}

/** Heurística de texto sobre `lastError` — el endpoint no expone un código estructurado (a
 *  diferencia de `reintentar-activacion`, que sí responde con `RNC_DUPLICADO_EN_SITE` como código
 *  de error), así que buscamos las mismas palabras clave en el mensaje libre para poder ofrecer el
 *  mismo flujo de "adoptar maestros" en vez de un simple reintento. Ajustar si el texto real del
 *  backend no calza (confirmar contra un caso real en vivo). */
function pareceConflictoDeMaestro(lastError: string | null): boolean {
  if (!lastError) return false
  const t = lastError.toLowerCase()
  return t.includes('rnc_duplicado_en_site') || (t.includes('rnc') && /duplicad|ambig|m[aá]s de un/.test(t))
}

/** `itemNameLocal` es un campo solo de UI (el DTO no lo tiene) — ver comentario junto a `filas`. */
type FilaMapeoAcumuladoUI = FilaMapeoAcumulado & { itemNameLocal?: string }

export default function RelacionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const puedeVer = usePuede('relaciones.ver')
  const puedeConfigurar = usePuede('relaciones.configurar')
  const puedeTerminar = usePuede('relaciones.terminar')
  const puedeVerTransacciones = usePuede('relaciones.transacciones.listar')

  const configRef = useRef<HTMLDivElement>(null)

  const { data: relacion, isLoading, isError } = useQuery({
    queryKey: ['relacion-comercial', id],
    queryFn: () => getRelacionComercial(id!),
    enabled: puedeVer && !!id,
  })

  const invalidarRelacion = () => queryClient.invalidateQueries({ queryKey: ['relacion-comercial', id] })

  // ─── Diagnóstico de activación (relación colgada en "activando") ────────────
  const [diagnosticoOpen, setDiagnosticoOpen] = useState(false)
  const diagnosticoQuery = useQuery({
    queryKey: ['estado-activacion-relacion', id],
    queryFn: () => getEstadoActivacionRelacion(id!),
    enabled: diagnosticoOpen && puedeVer && !!id && relacion?.status === 'activando',
  })
  const invalidarDiagnostico = () => queryClient.invalidateQueries({ queryKey: ['estado-activacion-relacion', id] })

  // ─── Candidatos (RNC_DUPLICADO_EN_SITE) / vinculado a otra relación (MAESTRO_YA_VINCULADO) ────
  const [candidatosOpen, setCandidatosOpen] = useState(false)
  const [vinculadoMensaje, setVinculadoMensaje] = useState<string | null>(null)

  const reintentarMutation = useMutation({
    mutationFn: () => reintentarActivacionRelacion(id!),
    onSuccess: () => { toast.success('Activación reintentada'); invalidarRelacion(); invalidarDiagnostico() },
    onError: (err) => {
      if (isApiErrorCode(err, 'RNC_DUPLICADO_EN_SITE')) {
        setCandidatosOpen(true)
        return
      }
      if (isApiErrorCode(err, 'MAESTRO_YA_VINCULADO')) {
        setVinculadoMensaje((err as { message?: string }).message ?? 'El candidato ya es el espejo de otra relación comercial.')
        return
      }
      toast.error((err as { message?: string })?.message ?? 'Error al reintentar la activación')
    },
  })

  // ─── Términos comerciales ───────────────────────────────────────────────────
  // `RelacionComercialDetalle` no trae los términos vigentes (el GET no los expone, solo el PUT
  // los recibe) — este formulario empieza en blanco y sobrescribe únicamente lo que el usuario
  // llene, nunca pretende mostrar un valor "actual" que el backend no entrega.
  const [terminosForm, setTerminosForm] = useState<TerminosComercialesDto>({})
  const terminosMutation = useMutation({
    mutationFn: (dto: TerminosComercialesDto) => actualizarTerminosRelacion(id!, dto),
    onSuccess: () => { toast.success('Términos actualizados'); invalidarRelacion() },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al guardar los términos'),
  })

  // ─── Configuración de automatización ────────────────────────────────────────
  const [configForm, setConfigForm] = useState<{
    almacenDestino: string
    tipoBienes606: string
    formaPago606: string
    autoEnviarVentas: boolean
    autoEnviarCompras: boolean
    mapeoEstricto: boolean
  }>({ almacenDestino: '', tipoBienes606: '', formaPago606: '', autoEnviarVentas: false, autoEnviarCompras: false, mapeoEstricto: false })

  useEffect(() => {
    if (relacion?.configuracion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- precarga el form al llegar la configuración del backend
      setConfigForm({
        almacenDestino: relacion.configuracion.almacenDestino ?? '',
        tipoBienes606: relacion.configuracion.tipoBienes606 ?? '',
        formaPago606: relacion.configuracion.formaPago606 ?? '',
        autoEnviarVentas: relacion.configuracion.autoEnviarVentas,
        autoEnviarCompras: relacion.configuracion.autoEnviarCompras,
        mapeoEstricto: relacion.configuracion.mapeoEstricto,
      })
    }
  }, [relacion?.configuracion])

  const configMutation = useMutation({
    mutationFn: (dto: ActualizarConfiguracionRelacionDto) => actualizarConfiguracionRelacion(id!, dto),
    onSuccess: () => { toast.success('Configuración actualizada'); invalidarRelacion() },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al guardar la configuración'),
  })

  // Catálogos para los selects de "Configuración de automatización" — no hay contexto de
  // sucursal en esta pantalla (es una configuración a nivel de relación, no de documento), así
  // que "Almacén destino" ofrece todos los almacenes del tenant en vez de filtrar por sucursal.
  const { data: almacenesData } = useQuery({
    queryKey: ['almacenes-todos'],
    queryFn: () => listAlmacenes(),
    staleTime: 60_000,
  })
  const almacenOptions: SearchSelectOption[] = (almacenesData ?? []).map((w) => ({ value: w.id, label: w.name }))

  const { data: catalogosFiscales } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [cfgTipoBienes606Search, setCfgTipoBienes606Search] = useState('')
  const cfgTipoBienes606Options: SearchSelectOption[] = (catalogosFiscales?.tipoBienes606 ?? [])
    .filter((t) => !cfgTipoBienes606Search || t.label.toLowerCase().includes(cfgTipoBienes606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))
  const [cfgFormaPago606Search, setCfgFormaPago606Search] = useState('')
  const cfgFormaPago606Options: SearchSelectOption[] = (catalogosFiscales?.formaPago606 ?? [])
    .filter((t) => !cfgFormaPago606Search || t.label.toLowerCase().includes(cfgFormaPago606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  // ─── Ciclo de vida ───────────────────────────────────────────────────────────
  const [confirmAccion, setConfirmAccion] = useState<'suspender' | 'reactivar' | 'terminar' | null>(null)

  const suspenderMutation = useMutation({
    mutationFn: () => suspenderRelacion(id!),
    onSuccess: () => { toast.success('Relación suspendida'); invalidarRelacion(); setConfirmAccion(null) },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al suspender la relación'),
  })
  const reactivarMutation = useMutation({
    mutationFn: () => reactivarRelacion(id!),
    onSuccess: () => { toast.success('Relación reactivada'); invalidarRelacion(); setConfirmAccion(null) },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al reactivar la relación'),
  })
  const terminarMutation = useMutation({
    mutationFn: () => terminarRelacion(id!),
    onSuccess: () => { toast.success('Relación terminada'); invalidarRelacion(); setConfirmAccion(null) },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al terminar la relación'),
  })

  // ─── Mapeo acumulado (Fase 07 §3) ────────────────────────────────────────────
  const relacionActiva = relacion?.status === 'activa'
  const { data: mapeoData } = useQuery({
    queryKey: ['mapeo-acumulado-relacion', id],
    queryFn: () => getMapeoAcumuladoRelacion(id!),
    enabled: relacionActiva && !!id,
  })
  // `itemNameLocal` es solo de UI (para que el ItemSelect muestre el nombre en vez del código
  // crudo) — nunca se manda al backend, se descarta al guardar.
  const [filas, setFilas] = useState<FilaMapeoAcumuladoUI[]>([])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- precarga la tabla editable al llegar el mapeo acumulado
    if (mapeoData) setFilas(mapeoData.filas)
  }, [mapeoData])

  const mapeoMutation = useMutation({
    mutationFn: (nuevasFilas: FilaMapeoAcumulado[]) => actualizarMapeoAcumuladoRelacion(id!, nuevasFilas),
    onSuccess: (res) => { toast.success('Mapeo guardado'); setFilas(res.filas) },
    onError: (err) => toast.error((err as { message?: string })?.message ?? 'Error al guardar el mapeo'),
  })

  if (!puedeVer) {
    return (
      <div className="page-container">
        <div className="card"><div className="empty-state">
          <p className="empty-title">Sin permiso</p>
          <p className="empty-sub">No tienes permiso para ver el detalle de esta relación comercial.</p>
        </div></div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="card"><div className="card-body">
          <div className="skeleton-box" style={{ height: 16, width: '40%', marginBottom: 12 }} />
          <div className="skeleton-box" style={{ height: 14, width: '60%' }} />
        </div></div>
      </div>
    )
  }

  if (isError || !relacion) {
    return (
      <div className="page-container">
        <div className="card"><div className="empty-state">
          <p className="empty-title">No se pudo cargar la relación</p>
        </div></div>
      </div>
    )
  }

  const terminalSinActivar = ESTADO_TERMINAL_SIN_ACTIVAR.has(relacion.status)
  const activando = !terminalSinActivar && (ESTADO_ACTIVANDO.has(relacion.status) || relacion.configuracion === null)
  const faltaAlmacen = relacion.status === 'activa' && relacion.configuracion !== null && !relacion.configuracion.almacenDestino

  function handleGuardarTerminos() {
    terminosMutation.mutate(terminosForm)
  }

  function handleGuardarConfiguracion() {
    configMutation.mutate({
      almacenDestino: configForm.almacenDestino.trim() || undefined,
      tipoBienes606: configForm.tipoBienes606.trim() || undefined,
      formaPago606: configForm.formaPago606.trim() || undefined,
      autoEnviarVentas: configForm.autoEnviarVentas,
      autoEnviarCompras: configForm.autoEnviarCompras,
      mapeoEstricto: configForm.mapeoEstricto,
    })
  }

  function addFila() {
    setFilas((f) => [...f, { itemCodeOrigen: '', itemCodeLocal: '' }])
  }
  function removeFila(index: number) {
    setFilas((f) => f.filter((_, i) => i !== index))
  }
  /** Descarta `itemNameLocal` (solo de UI) antes de mandar al backend. */
  function sinNombreLocal(fila: FilaMapeoAcumuladoUI): FilaMapeoAcumulado {
    return {
      itemCodeOrigen: fila.itemCodeOrigen,
      itemNameOrigen: fila.itemNameOrigen,
      barcodeOrigen: fila.barcodeOrigen,
      itemCodeLocal: fila.itemCodeLocal,
      uomOrigen: fila.uomOrigen,
      uomLocal: fila.uomLocal,
      factorConversion: fila.factorConversion,
    }
  }

  function updateFila(index: number, patch: Partial<FilaMapeoAcumuladoUI>) {
    setFilas((f) => f.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<>{relacion.contraparte.nombre} <EstadoRelacionBadge status={relacion.status} /></>}
        description={relacion.contraparte.rnc ? `RNC ${relacion.contraparte.rnc}` : undefined}
        action={
          <>
            <RecargarButton label="Actualizar" />
            <button className="btn btn-ghost btn-size-sm" onClick={() => navigate('/relaciones-comerciales')}>
              Volver
            </button>
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Datos de la contraparte ─────────────────────────────────────── */}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div className="detail-field">
              <span className="detail-label">Nombre</span>
              <span className="detail-value">{relacion.contraparte.nombre}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">RNC</span>
              <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{relacion.contraparte.rnc ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Estado</span>
              <EstadoRelacionBadge status={relacion.status} />
            </div>
            <div className="detail-field">
              <span className="detail-label">Creada el</span>
              <span className="detail-value">{formatDate(relacion.createdAt)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Activada el</span>
              <span className="detail-value">{formatDate(relacion.activatedAt)}</span>
            </div>
          </div>
        </div>

        {/* ── Registros vinculados ────────────────────────────────────────── */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Registros vinculados</h3>
            {terminalSinActivar ? (
              <div className="inline-alert inline-alert-warn">
                Esta relación nunca se activó (quedó <strong>{relacion.status}</strong>) — no hay
                registros de cliente ni proveedor vinculados.
              </div>
            ) : activando ? (
              <div className="inline-alert inline-alert-info">
                Activando… los registros de cliente y proveedor se están creando.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <div className="detail-field">
                  <span className="detail-label">Cliente</span>
                  {relacion.customer ? (
                    <Link to={`/clientes/${relacion.customer}`} className="detail-value" style={{ color: 'var(--brand-primary)' }}>
                      {relacion.customer}
                    </Link>
                  ) : (
                    <span className="detail-value-dim">— (esta empresa no le compra a usted)</span>
                  )}
                </div>
                <div className="detail-field">
                  <span className="detail-label">Proveedor</span>
                  {relacion.supplier ? (
                    <Link to={`/proveedores/${relacion.supplier}`} className="detail-value" style={{ color: 'var(--brand-primary)' }}>
                      {relacion.supplier}
                    </Link>
                  ) : (
                    <span className="detail-value-dim">— (esta empresa no le vende a usted)</span>
                  )}
                </div>
              </div>
            )}

            {relacion.status === 'invitada' && (
              <div style={{ marginTop: 12 }}>
                <Permitido accion="relaciones.configurar">
                  <button className="btn btn-secondary btn-size-sm" onClick={() => reintentarMutation.mutate()} disabled={reintentarMutation.isPending}>
                    {reintentarMutation.isPending ? <span className="spinner spinner-sm" /> : 'Reintentar activación'}
                  </button>
                </Permitido>
              </div>
            )}

            {faltaAlmacen && (
              <div className="inline-alert inline-alert-warn" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span>Es obligatorio configurar el almacén destino antes de poder aceptar una compra entrante con artículos de stock.</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-size-xs"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Configurar ahora <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Diagnóstico de activación ───────────────────────────────────── */}
        {relacion.status === 'activando' && (
          <div className="card">
            <div
              className="card-header navy-card-header"
              style={{ cursor: 'pointer' }}
              onClick={() => setDiagnosticoOpen((o) => !o)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 className="card-title">Diagnóstico de activación</h2>
                <button
                  type="button"
                  className="navy-header-toggle-btn icon-swap"
                  aria-expanded={diagnosticoOpen}
                  aria-label={diagnosticoOpen ? 'Ocultar diagnóstico' : 'Ver detalle'}
                  onClick={(e) => { e.stopPropagation(); setDiagnosticoOpen((o) => !o) }}
                >
                  {diagnosticoOpen ? <Minus size={13} /> : <Plus size={13} />}
                </button>
              </div>
              {!diagnosticoOpen && (
                <span className="navy-header-hint">Por qué esta relación no termina de activarse</span>
              )}
            </div>
            {diagnosticoOpen && (
              <div className="card-body">
                {diagnosticoQuery.isLoading ? (
                  <p className="ff-hint" style={{ margin: 0 }}>Cargando diagnóstico…</p>
                ) : diagnosticoQuery.isError ? (
                  <div className="inline-alert inline-alert-error">
                    No se pudo cargar el diagnóstico de activación.
                  </div>
                ) : !diagnosticoQuery.data || diagnosticoQuery.data.outbox.length === 0 ? (
                  <p className="ff-hint" style={{ margin: 0 }}>La activación no se ha iniciado todavía.</p>
                ) : (
                  (() => {
                    const outbox: EstadoActivacionOutboxEntry[] = diagnosticoQuery.data.outbox
                    const ultimo = [...outbox].sort(
                      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                    )[0]
                    const conflictoMaestro = pareceConflictoDeMaestro(ultimo.lastError)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                          <div className="detail-field">
                            <span className="detail-label">Operación</span>
                            <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{ultimo.op}</span>
                          </div>
                          <div className="detail-field">
                            <span className="detail-label">Estado</span>
                            <span className={`badge ${OUTBOX_ESTADO_BADGE[ultimo.state] ?? 'badge-neutral'}`}>
                              {OUTBOX_ESTADO_LABEL[ultimo.state] ?? ultimo.state}
                            </span>
                          </div>
                          <div className="detail-field">
                            <span className="detail-label">Intentos</span>
                            <span className="detail-value">{ultimo.attempts}</span>
                          </div>
                          <div className="detail-field">
                            <span className="detail-label">Próximo intento</span>
                            <span className="detail-value">
                              {ultimo.nextAttemptAt ? formatDateTime(ultimo.nextAttemptAt) : '—'}
                            </span>
                          </div>
                        </div>

                        {ultimo.lastError && (
                          <div className="inline-alert inline-alert-error" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                            <strong>Último error</strong>
                            <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                              {ultimo.lastError}
                            </p>
                          </div>
                        )}

                        {(ultimo.state === 'failed' || (ultimo.state === 'pending' && ultimo.lastError)) && (
                          <div>
                            {conflictoMaestro ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-size-sm"
                                onClick={() => setCandidatosOpen(true)}
                              >
                                Ver candidatos para adoptar
                              </button>
                            ) : (
                              <Permitido accion="relaciones.configurar">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-size-sm"
                                  onClick={() => reintentarMutation.mutate()}
                                  disabled={reintentarMutation.isPending}
                                >
                                  {reintentarMutation.isPending ? <span className="spinner spinner-sm" /> : 'Reintentar activación'}
                                </button>
                              </Permitido>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Términos vigentes (editables) ───────────────────────────────── */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Términos comerciales</h3>
            <p className="ff-hint" style={{ marginTop: 0, marginBottom: 16 }}>
              Se aplican sobre el cliente/proveedor local de este lado. Solo se guardan los campos que llenes.
            </p>
            {activando && (
              <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
                Esta relación todavía no tiene espejos de este lado — podrás guardar términos cuando
                termine de activarse.
              </div>
            )}
            <TerminosComercialesFields value={terminosForm} onChange={setTerminosForm} disabled={!puedeConfigurar || terminosMutation.isPending} />
            <Permitido accion="relaciones.configurar">
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-navy btn-size-sm" onClick={handleGuardarTerminos} disabled={terminosMutation.isPending}>
                  {terminosMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Guardar términos'}
                </button>
              </div>
            </Permitido>
          </div>
        </div>

        {/* ── Configuración de automatización ─────────────────────────────── */}
        <div className="card" ref={configRef}>
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Configuración de automatización</h3>
            {activando && (
              <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
                Esta relación todavía no tiene espejos de este lado — podrás guardar la configuración
                cuando termine de activarse.
              </div>
            )}
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="cfg-almacen">Almacén destino</label>
                <SearchSelect
                  id="cfg-almacen"
                  value={configForm.almacenDestino}
                  onChange={(v) => setConfigForm((f) => ({ ...f, almacenDestino: v }))}
                  options={almacenOptions}
                  onSearch={() => {}}
                  disabled={!puedeConfigurar}
                  placeholder="Buscar almacén…"
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="cfg-tipoBienes606">Tipo de bienes (606)</label>
                <SearchSelect
                  id="cfg-tipoBienes606"
                  value={configForm.tipoBienes606}
                  onChange={(v) => setConfigForm((f) => ({ ...f, tipoBienes606: v }))}
                  options={cfgTipoBienes606Options}
                  onSearch={setCfgTipoBienes606Search}
                  selectedLabel={catalogosFiscales?.tipoBienes606?.find((t) => t.value === configForm.tipoBienes606)?.label ?? ''}
                  disabled={!puedeConfigurar}
                  placeholder="Sin configurar"
                />
              </div>
            </div>
            <div className="ff-wrap" style={{ maxWidth: 280, marginBottom: 12 }}>
              <label className="ff-label" htmlFor="cfg-formaPago606">Forma de pago (606)</label>
              <SearchSelect
                id="cfg-formaPago606"
                value={configForm.formaPago606}
                onChange={(v) => setConfigForm((f) => ({ ...f, formaPago606: v }))}
                options={cfgFormaPago606Options}
                onSearch={setCfgFormaPago606Search}
                selectedLabel={catalogosFiscales?.formaPago606?.find((t) => t.value === configForm.formaPago606)?.label ?? ''}
                disabled={!puedeConfigurar}
                placeholder="Sin configurar"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  disabled={!puedeConfigurar}
                  checked={configForm.autoEnviarVentas}
                  onChange={(e) => setConfigForm((f) => ({ ...f, autoEnviarVentas: e.target.checked }))}
                />
                Enviar ventas automáticamente
              </label>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  disabled={!puedeConfigurar}
                  checked={configForm.autoEnviarCompras}
                  onChange={(e) => setConfigForm((f) => ({ ...f, autoEnviarCompras: e.target.checked }))}
                />
                Enviar compras automáticamente
              </label>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  disabled={!puedeConfigurar}
                  checked={configForm.mapeoEstricto}
                  onChange={(e) => setConfigForm((f) => ({ ...f, mapeoEstricto: e.target.checked }))}
                />
                Mapeo estricto
              </label>
            </div>
            <Permitido accion="relaciones.configurar">
              <button className="btn btn-navy btn-size-sm" onClick={handleGuardarConfiguracion} disabled={configMutation.isPending}>
                {configMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Guardar configuración'}
              </button>
            </Permitido>
          </div>
        </div>

        {/* ── Acciones de ciclo de vida ────────────────────────────────────── */}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {relacion.status === 'activa' && (
              <Permitido accion="relaciones.configurar">
                <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAccion('suspender')}>Suspender</button>
              </Permitido>
            )}
            {relacion.status === 'suspendida' && (
              <Permitido accion="relaciones.configurar">
                <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAccion('reactivar')}>Reactivar</button>
              </Permitido>
            )}
            {puedeTerminar && relacion.status !== 'revocada' && (
              <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAccion('terminar')}>Terminar relación</button>
            )}
            {puedeVerTransacciones && (
              <button
                className="btn btn-ghost btn-size-sm"
                onClick={() => navigate(`/relaciones-comerciales/transacciones?relacionId=${relacion.id}`)}
                style={{ marginLeft: 'auto' }}
              >
                Ver transacciones de este socio
              </button>
            )}
          </div>
        </div>

        {/* ── Mapeo de artículos acumulado ─────────────────────────────────── */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Mapeo de artículos acumulado</h3>
            {!relacionActiva ? (
              <p className="ff-hint">Próximamente — disponible cuando la relación esté activa.</p>
            ) : (
              <>
                <p className="ff-hint" style={{ marginTop: 0 }}>
                  Al guardar se reemplaza la lista COMPLETA de mapeos de esta relación — no es un ajuste incremental.
                </p>
                <div className="table-scroll" style={{ marginBottom: 12 }}>
                  <table className="data-table navy-table">
                    <thead>
                      <tr>
                        <th>Código origen</th>
                        <th>Nombre origen</th>
                        <th>Barcode origen</th>
                        <th>Código local</th>
                        <th>UOM origen</th>
                        <th>UOM local</th>
                        <th>Factor</th>
                        <th style={{ width: 40 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filas.length === 0 ? (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: 16, color: 'var(--text-tertiary)', fontSize: 13 }}>Sin filas de mapeo</td></tr>
                      ) : (
                        filas.map((fila, index) => (
                          <tr key={index}>
                            <td><input className="ff-input" style={{ minWidth: 110 }} value={fila.itemCodeOrigen} onChange={(e) => updateFila(index, { itemCodeOrigen: e.target.value })} /></td>
                            <td><input className="ff-input" style={{ minWidth: 130 }} value={fila.itemNameOrigen ?? ''} onChange={(e) => updateFila(index, { itemNameOrigen: e.target.value || undefined })} /></td>
                            <td><input className="ff-input" style={{ minWidth: 110 }} value={fila.barcodeOrigen ?? ''} onChange={(e) => updateFila(index, { barcodeOrigen: e.target.value || undefined })} /></td>
                            <td style={{ minWidth: 160 }}>
                              <ItemSelect
                                value={fila.itemCodeLocal}
                                selectedLabel={fila.itemNameLocal}
                                onSelect={(item: Item) => updateFila(index, { itemCodeLocal: item.id, itemNameLocal: item.itemName })}
                                onClear={() => updateFila(index, { itemCodeLocal: '', itemNameLocal: undefined })}
                                placeholder="Buscar artículo…"
                              />
                            </td>
                            <td><input className="ff-input" style={{ minWidth: 80 }} value={fila.uomOrigen ?? ''} onChange={(e) => updateFila(index, { uomOrigen: e.target.value || undefined })} /></td>
                            <td style={{ minWidth: 110 }}>
                              <UomSelect
                                value={fila.uomLocal ?? ''}
                                onChange={(v) => updateFila(index, { uomLocal: v || undefined })}
                                itemCode={fila.itemCodeLocal || undefined}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ff-input"
                                style={{ minWidth: 70 }}
                                value={fila.factorConversion ?? ''}
                                onChange={(e) => updateFila(index, { factorConversion: e.target.value === '' ? undefined : Number(e.target.value) })}
                              />
                            </td>
                            <td>
                              <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeFila(index)}>
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-ghost btn-size-sm" onClick={addFila}>
                    <Plus size={14} /> Agregar fila
                  </button>
                  <Permitido accion="relaciones.mapeo.guardar">
                    <button
                      type="button"
                      className="btn btn-navy btn-size-sm"
                      onClick={() => mapeoMutation.mutate(filas.map(sinNombreLocal))}
                      disabled={mapeoMutation.isPending}
                    >
                      {mapeoMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Guardar'}
                    </button>
                  </Permitido>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirmaciones de ciclo de vida ─────────────────────────────────── */}
      <ConfirmModal
        open={confirmAccion === 'suspender'}
        onClose={() => setConfirmAccion(null)}
        onConfirm={() => suspenderMutation.mutate()}
        title="¿Suspender relación?"
        description="No se enviarán ni aceptarán transacciones nuevas mientras esté suspendida."
        confirmLabel="Suspender"
        variant="danger"
        loading={suspenderMutation.isPending}
      />
      <ConfirmModal
        open={confirmAccion === 'reactivar'}
        onClose={() => setConfirmAccion(null)}
        onConfirm={() => reactivarMutation.mutate()}
        title="¿Reactivar relación?"
        description="Se volverán a permitir transacciones nuevas con este socio."
        confirmLabel="Reactivar"
        variant="default"
        loading={reactivarMutation.isPending}
      />
      <ConfirmModal
        open={confirmAccion === 'terminar'}
        onClose={() => setConfirmAccion(null)}
        onConfirm={() => terminarMutation.mutate()}
        title="¿Terminar relación comercial?"
        description="Esta acción desvincula la relación de forma permanente. Los registros de cliente y proveedor NO se borran, solo se desvinculan."
        confirmLabel="Terminar relación"
        variant="danger"
        loading={terminarMutation.isPending}
      />

      {/* ── RNC_DUPLICADO_EN_SITE — candidatos ──────────────────────────────── */}
      {candidatosOpen && (
        <CandidatosModal
          relacionId={id!}
          onClose={() => setCandidatosOpen(false)}
          onVinculado={(mensaje) => { setCandidatosOpen(false); setVinculadoMensaje(mensaje) }}
          onAdoptado={() => { invalidarRelacion(); invalidarDiagnostico() }}
        />
      )}

      {/* ── MAESTRO_YA_VINCULADO — explicación sin acción ───────────────────── */}
      <Modal
        open={!!vinculadoMensaje}
        onClose={() => setVinculadoMensaje(null)}
        title="Candidato ya vinculado a otra relación"
        footer={<button className="btn btn-navy btn-size-sm" onClick={() => setVinculadoMensaje(null)}>Entendido</button>}
      >
        <p style={{ margin: 0 }}>
          {vinculadoMensaje ?? 'Este candidato ya es el espejo de otra relación comercial (normalmente, dos tenants con el mismo RNC).'}
          {' '}No hay autoservicio para desvincularlo — contacta a soporte si necesitas cambiarlo.
        </p>
      </Modal>
    </div>
  )
}

// ─── Modal de candidatos (RNC_DUPLICADO_EN_SITE) ──────────────────────────────

function CandidatosModal({
  relacionId, onClose, onAdoptado, onVinculado,
}: {
  relacionId: string
  onClose: () => void
  onAdoptado: () => void
  onVinculado: (mensaje: string) => void
}) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['maestros-candidatos-relacion', relacionId],
    queryFn: () => getMaestrosCandidatosRelacion(relacionId),
  })

  const adoptarMutation = useMutation({
    mutationFn: (dto: { customer?: string; supplier?: string }) => adoptarMaestrosRelacion(relacionId, dto),
    onSuccess: () => {
      toast.success('Vínculo actualizado — reintentando activación')
      queryClient.invalidateQueries({ queryKey: ['maestros-candidatos-relacion', relacionId] })
      onAdoptado()
    },
    onError: (err) => {
      if (isApiErrorCode(err, 'MAESTRO_YA_VINCULADO')) {
        onVinculado((err as { message?: string }).message ?? 'Este candidato ya es el espejo de otra relación comercial.')
        return
      }
      toast.error((err as { message?: string })?.message ?? 'Error al adoptar el registro elegido')
    },
  })

  function renderCandidatos(candidatos: MaestroCandidatoRelacion[], tipo: 'customer' | 'supplier') {
    if (candidatos.length === 0) {
      return <p className="ff-hint">Sin ambigüedad de este lado (0 o 1 candidato) — no hace falta elegir.</p>
    }
    return (
      <div className="table-scroll">
        <table className="data-table navy-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Deshabilitado</th>
              <th>Documentos</th>
              <th>Saldo</th>
              <th style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {candidatos.map((c) => (
              <tr key={c.name}>
                <td>
                  {c.nombre}
                  {c.yaVinculadoAOtraRelacion && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Ya vinculado</span>}
                </td>
                <td>{c.disabled ? 'Sí' : 'No'}</td>
                <td>{c.documentos}</td>
                <td style={{ fontWeight: 600 }}>{c.saldo}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-navy btn-size-xs"
                    disabled={adoptarMutation.isPending}
                    onClick={() => adoptarMutation.mutate(tipo === 'customer' ? { customer: c.name } : { supplier: c.name })}
                  >
                    Usar este
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Elegir cliente/proveedor local"
      subtitle="El RNC del socio coincide con más de un registro local — el saldo es obligatorio, elegir mal tiene consecuencias contables."
      size="lg"
      footer={<button className="btn btn-secondary btn-size-sm" onClick={onClose}>Cerrar</button>}
    >
      {isLoading ? (
        <p className="ff-hint">Cargando candidatos…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Clientes candidatos</h4>
            {renderCandidatos(data?.customers ?? [], 'customer')}
          </div>
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Proveedores candidatos</h4>
            {renderCandidatos(data?.suppliers ?? [], 'supplier')}
          </div>
        </div>
      )}
    </Modal>
  )
}
