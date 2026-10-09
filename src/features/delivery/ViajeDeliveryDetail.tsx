// Detalle de un viaje de delivery + despacho + confirmación de entregas —
// docs/tasks/PROMPT_DELIVERY_FRONTEND.md §4.2 y §5.

import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2, Send, Ban, Download, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import {
  getViaje, deleteViaje, despacharViaje, cancelarViaje, downloadViajePdf, confirmarDeliveryEntregas,
} from '@/shared/api/delivery'
import type { ApiError, DeliveryConfirmarResultItem, DeliveryParada, DeliveryViaje } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDOP, formatDateTime } from '@/lib/formatters'
import { codigoDelivery } from '@/lib/deliveryErrors'
import { Modal, ConfirmModal } from '@/shared/ui/Modal'
import { useDeliveryPuerta, DrenajeAviso } from '@/shared/hooks/useDelivery'
import { DeliveryEntregaBadge, DeliveryCobroBadge } from './DeliveryBadges'
import { AnularDeliveryModal } from './AnularDeliveryModal'
import { ViajeTrackingEditor } from './ViajeTrackingEditor'
import { buildTracking, trackingCompleto, type TrackingState } from './trackingLib'
import { DeliveryErrorAlert, ViajeEstadoBadge } from './viajeUi'
import { interpretarDespacho, requisitosDesdeError, type TrackingRequisito } from './viajeLib'

const DNS_PENDIENTE = 'dns_sometidos_trip_pendiente'
const INVALIDATE = ['delivery-pendientes', 'delivery-viajes', 'delivery-viaje', 'delivery-cobros']

const AUTO_MOTIVO: Record<string, string> = {
  SIN_PERMISO: 'no tienes permiso para conciliar cobros',
  COBRO_NO_PENDIENTE: 'el cobro ya no estaba pendiente',
  ERROR: 'ocurrió un error al conciliar',
}

interface ConfirmTarget { invoiceIds: string[]; resultado: 'entregado' | 'no_entregado' }
interface LineaResultado { invoiceId: string; etiqueta: string; ok: boolean; texto: string; aviso?: string }

const etiquetaParada = (p: DeliveryParada) => `${p.ncf ?? p.invoiceId}${p.customerName ? ` · ${p.customerName}` : ''}`

export default function ViajeDeliveryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puerta = useDeliveryPuerta()

  const puedeEditar = usePuede('delivery.viajes.editar') && puerta.operativo
  const puedeDespachar = usePuede('delivery.viajes.despachar')
  const puedeCancelar = usePuede('delivery.viajes.cancelar')
  const puedeImprimir = usePuede('delivery.viajes.imprimir')
  const puedeConfirmar = usePuede('delivery.entregas.confirmar')
  const puedeAnular = usePuede('delivery.entregas.anular')

  const [despacharOpen, setDespacharOpen] = useState(false)
  const [despachoError, setDespachoError] = useState<ApiError | null>(null)
  const [tracking, setTracking] = useState<TrackingState>({})
  const [reqsError, setReqsError] = useState<TrackingRequisito[]>([])
  const [advertencia, setAdvertencia] = useState<string | null>(null)

  const [cancelarOpen, setCancelarOpen] = useState(false)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [cancelError, setCancelError] = useState<ApiError | null>(null)
  const [eliminarOpen, setEliminarOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const [motivoNoEntrega, setMotivoNoEntrega] = useState('')
  const [resultados, setResultados] = useState<LineaResultado[] | null>(null)
  const [anular, setAnular] = useState<DeliveryParada | null>(null)

  const { data: viaje, isLoading, isError } = useQuery({
    queryKey: ['delivery-viaje', id],
    queryFn: () => getViaje(id!),
    enabled: !!id,
  })

  function invalidar() {
    INVALIDATE.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
  }

  const paradas = useMemo(() => (viaje?.paradas ?? []).slice().sort((a, b) => a.orden - b.orden), [viaje])
  const etiquetas = useMemo(() => Object.fromEntries(paradas.map((p) => [p.invoiceId, etiquetaParada(p)])), [paradas])

  const reqs: TrackingRequisito[] = useMemo(() => {
    if (reqsError.length > 0) return reqsError
    return paradas.flatMap((p) => (p.trackingPendiente ?? []).map((t) => ({ invoiceId: p.invoiceId, itemCode: t.itemCode, qty: t.qty, tipo: t.tipo })))
  }, [reqsError, paradas])

  // ─── Mutaciones ────────────────────────────────────────────────────────────

  const despacharMut = useMutation({
    mutationFn: () => {
      const trk = buildTracking(reqs, tracking)
      return despacharViaje(id!, trk.length ? { tracking: trk } : undefined)
    },
    onSuccess: (res: DeliveryViaje) => {
      const r = interpretarDespacho(res)
      queryClient.setQueryData(['delivery-viaje', id], res)
      invalidar()
      if (r === 'dns_pendiente') {
        const msg = res.advertencia ?? 'El stock salió pero el viaje no quedó sometido. Reintenta despachar.'
        setAdvertencia(msg)
        toast.warning(msg, { duration: 10000 })
      } else {
        setAdvertencia(null)
        toast[r === 'ya_despachado' ? 'info' : 'success'](r === 'ya_despachado' ? 'El viaje ya estaba despachado' : 'Viaje despachado')
      }
      setDespachoError(null)
      setReqsError([])
      setTracking({})
      setDespacharOpen(false)
    },
    onError: (err: ApiError) => {
      setDespachoError(err)
      if (codigoDelivery(err) === 'DELIVERY_TRACKING_PENDIENTE') {
        const r = requisitosDesdeError(err)
        if (r.length > 0) setReqsError(r)
        queryClient.invalidateQueries({ queryKey: ['delivery-viaje', id] })
      }
      // Un revertido parcial o stock insuficiente deja el viaje igual: refrescar por si cambió algo.
      invalidar()
    },
  })

  const cancelarMut = useMutation({
    mutationFn: () => cancelarViaje(id!, { motivo: cancelMotivo.trim() }),
    onSuccess: () => {
      toast.success('Viaje cancelado')
      invalidar()
      setCancelarOpen(false)
      setCancelMotivo('')
      setCancelError(null)
    },
    onError: (err: ApiError) => setCancelError(err),
  })

  const eliminarMut = useMutation({
    mutationFn: () => deleteViaje(id!),
    onSuccess: () => {
      toast.success('Viaje eliminado')
      invalidar()
      navigate('/delivery/viajes', { replace: true })
    },
    onError: (err: ApiError) => {
      setEliminarOpen(false)
      toast.error(err?.message ?? 'Error al eliminar el viaje', { duration: 8000 })
      if (codigoDelivery(err) === 'DELIVERY_VIAJE_NO_EDITABLE') invalidar()
    },
  })

  const confirmarMut = useMutation({
    mutationFn: (t: ConfirmTarget & { motivo?: string }) =>
      confirmarDeliveryEntregas(t.invoiceIds.map((invoiceId) => ({
        invoiceId,
        resultado: t.resultado,
        ...(t.resultado === 'no_entregado' ? { motivo: t.motivo } : {}),
      }))),
    onSuccess: (res: DeliveryConfirmarResultItem[]) => {
      // HTTP 200 aunque un ítem falle: se revisa cada resultado.
      const lineas: LineaResultado[] = res.map((r) => {
        const p = paradas.find((x) => x.invoiceId === r.invoiceId)
        const etiqueta = p ? etiquetaParada(p) : r.invoiceId
        if (!r.ok) {
          return { invoiceId: r.invoiceId, etiqueta, ok: false, texto: r.error?.message ?? r.error?.code ?? 'No se pudo confirmar' }
        }
        let texto = r.resultado === 'no_entregado' ? 'Marcada como no entregada' : 'Entrega confirmada'
        if (r.yaConfirmada) texto = 'Ya estaba confirmada'
        let aviso: string | undefined
        const ac = r.autoConciliacion
        if (ac) {
          if (!ac.omitida) texto += ' — cobro conciliado'
          else {
            // El `detalle` del BFF manda y se muestra solo; el texto local es respaldo.
            const motivo = ac.motivo ? AUTO_MOTIVO[ac.motivo] ?? ac.motivo : undefined
            aviso = ac.detalle?.trim()
              ? ac.detalle
              : `El cobro no se concilió automáticamente${motivo ? ` (${motivo})` : ''}. Sigue pendiente para caja.`
          }
        }
        return { invoiceId: r.invoiceId, etiqueta, ok: true, texto, aviso }
      })
      setResultados(lineas)
      const okCount = lineas.filter((l) => l.ok).length
      if (okCount === lineas.length) toast.success(okCount === 1 ? 'Entrega registrada' : `${okCount} entregas registradas`)
      else if (okCount > 0) toast.warning(`${okCount} de ${lineas.length} confirmadas — revisa los errores`)
      else toast.error('No se pudo confirmar ninguna entrega')
      setSeleccion(new Set())
      setConfirmTarget(null)
      setMotivoNoEntrega('')
      invalidar()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al confirmar las entregas', { duration: 8000 }),
  })

  async function handlePdf() {
    setDownloading(true)
    try {
      await downloadViajePdf(id!, `hoja-ruta-${id}.pdf`)
    } catch {
      toast.error('Error al descargar la hoja de ruta')
    } finally {
      setDownloading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 16 }} />
        <span className="skeleton-box" style={{ height: 220, width: '100%', display: 'block' }} />
      </div>
    )
  }
  if (isError || !viaje) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/delivery/viajes')}><ArrowLeft size={14} /> Viajes</a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>No se encontró el viaje</div>
      </div>
    )
  }

  const estado: string = viaje.estado
  const esBorrador = estado === 'borrador'
  const dnsPendiente = estado === DNS_PENDIENTE
  const puedeDespacharAhora = (esBorrador || dnsPendiente) && puedeDespachar
  const salio = estado === 'programado' || estado === 'en_ruta'
  const puedeCancelarAhora = (salio || dnsPendiente) && puedeCancelar
  // Si el refetch devuelve el viaje todavía como borrador tras un despacho `dns_sometidos_trip_pendiente`,
  // el aviso y el "Reintentar despachar" deben seguir visibles (no solo el toast de 10 s).
  const reintento = dnsPendiente || (esBorrador && !!advertencia)
  const avisoDns = dnsPendiente ? (viaje.advertencia ?? advertencia) : esBorrador ? advertencia : null

  const confirmables = paradas.filter((p) => salio && puedeConfirmar && (p.resultado ?? 'pendiente') === 'pendiente' && !['cancelado', 'entregado', 'no_entregado', 'retirado'].includes(p.estadoEntrega ?? ''))
  const todasMarcadas = confirmables.length > 0 && confirmables.every((p) => seleccion.has(p.invoiceId))
  const cancelValido = cancelMotivo.trim().length >= 10 && cancelMotivo.trim().length <= 500
  const motivoValido = motivoNoEntrega.trim().length > 0
  const requiereMotivo = confirmTarget?.resultado === 'no_entregado'
  const trackingOk = reqs.length === 0 || trackingCompleto(reqs, tracking)

  function toggleSel(invoiceId: string) {
    setSeleccion((prev) => {
      const n = new Set(prev)
      if (n.has(invoiceId)) n.delete(invoiceId)
      else n.add(invoiceId)
      return n
    })
  }

  function abrirDespachar() {
    setDespachoError(null)
    setDespacharOpen(true)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/delivery/viajes')}><ArrowLeft size={14} /> Viajes</a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="page-title-dot" />
            {viaje.id}
            <ViajeEstadoBadge estado={viaje.estado} />
          </h1>
          <p className="page-sub">
            {viaje.repartidorNombre ?? viaje.repartidor ?? 'Sin repartidor'}
            {viaje.vehiculo ? ` · ${viaje.vehiculo}` : ''}
            {viaje.salida ? ` · Salida ${formatDateTime(viaje.salida)}` : ''}
            {viaje.branch ? ` · ${viaje.branch}` : ''}
          </p>
        </div>
      </div>

      {puerta.drenaje && <DrenajeAviso />}

      {avisoDns && (
        <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>{avisoDns}</span>
            {puedeDespachar && (
              <div>
                <button className="btn btn-secondary btn-size-sm" onClick={abrirDespachar}>Reintentar despachar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {dnsPendiente && !avisoDns && (
        <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16 }}>
          El stock salió pero el viaje no quedó sometido. Reintenta despachar.
        </div>
      )}

      <div className="doc-actions-bar" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: 16 }}>
        {esBorrador && puedeEditar && (
          <button className="btn btn-ghost btn-size-md" onClick={() => navigate(`/delivery/viajes/${id}/editar`)}>
            <Pencil size={14} /> Editar
          </button>
        )}
        {puedeDespacharAhora && (
          <button className="btn btn-navy btn-size-md" onClick={abrirDespachar}>
            <Send size={14} /> {reintento ? 'Reintentar despachar' : 'Despachar'}
          </button>
        )}
        {/* Eliminar un borrador es una edición: se corta en modo drenaje (§1). */}
        {esBorrador && puedeCancelar && puerta.operativo && (
          <button className="btn btn-danger btn-size-md" onClick={() => setEliminarOpen(true)}>
            <Trash2 size={14} /> Eliminar
          </button>
        )}
        {puedeCancelarAhora && (
          <button className="btn btn-danger btn-size-md" onClick={() => { setCancelError(null); setCancelarOpen(true) }}>
            <Ban size={14} /> Cancelar viaje
          </button>
        )}
        {puedeImprimir && !esBorrador && (
          <button className="btn btn-ghost btn-size-md" onClick={handlePdf} disabled={downloading}>
            <Download size={14} /> {downloading ? 'Descargando…' : 'Hoja de ruta (PDF)'}
          </button>
        )}
      </div>

      {viaje.notas && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <Info size={16} /> <span>{viaje.notas}</span>
        </div>
      )}

      {resultados && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header navy-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title">Resultado de la confirmación</h2>
            <button className="btn btn-ghost btn-size-sm" onClick={() => setResultados(null)}>Cerrar</button>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {resultados.map((l) => (
              <div key={l.invoiceId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
                {l.ok
                  ? <CheckCircle2 size={16} style={{ color: 'var(--success-text, #15803d)', flexShrink: 0, marginTop: 2 }} />
                  : <XCircle size={16} style={{ color: 'var(--error-text, #b91c1c)', flexShrink: 0, marginTop: 2 }} />}
                <div>
                  <strong>{l.etiqueta}</strong> — {l.texto}
                  {l.aviso && <div className="td-muted" style={{ fontSize: 13 }}>{l.aviso}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card navy-table-card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 className="card-title">Paradas ({paradas.length})</h2>
          {confirmables.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary btn-size-sm"
                disabled={seleccion.size === 0}
                onClick={() => { setMotivoNoEntrega(''); setConfirmTarget({ invoiceIds: [...seleccion], resultado: 'entregado' }) }}
              >
                <CheckCircle2 size={14} /> Marcar entregadas{seleccion.size > 0 ? ` (${seleccion.size})` : ''}
              </button>
              <button
                className="btn btn-secondary btn-size-sm"
                disabled={seleccion.size === 0}
                onClick={() => { setMotivoNoEntrega(''); setConfirmTarget({ invoiceIds: [...seleccion], resultado: 'no_entregado' }) }}
              >
                <XCircle size={14} /> No entregadas{seleccion.size > 0 ? ` (${seleccion.size})` : ''}
              </button>
            </div>
          )}
        </div>
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  {confirmables.length > 0 && (
                    <input
                      type="checkbox"
                      className="ff-check"
                      checked={todasMarcadas}
                      onChange={() => setSeleccion(todasMarcadas ? new Set() : new Set(confirmables.map((p) => p.invoiceId)))}
                      aria-label="Seleccionar todas"
                    />
                  )}
                </th>
                <th style={{ width: 50 }}>#</th>
                <th>Factura / Cliente</th>
                <th>Dirección</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Entrega</th>
                <th>Cobro</th>
                <th>Resultado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paradas.length === 0 ? (
                <tr><td colSpan={9}><div className="empty-state"><p className="empty-title">Sin paradas</p></div></td></tr>
              ) : paradas.map((p) => {
                const pendiente = (p.resultado ?? 'pendiente') === 'pendiente'
                const confirmable = confirmables.some((c) => c.invoiceId === p.invoiceId)
                const fallida = p.resultado === 'no_entregado' || p.estadoEntrega === 'no_entregado'
                const anulable = fallida && puedeAnular && p.cobro?.estado !== 'revertido'
                const tienePend = (p.trackingPendiente?.length ?? 0) > 0
                return (
                  <tr key={p.invoiceId}>
                    <td>
                      {confirmable && (
                        <input type="checkbox" className="ff-check" checked={seleccion.has(p.invoiceId)} onChange={() => toggleSel(p.invoiceId)} aria-label={`Seleccionar ${p.invoiceId}`} />
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.orden}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.ncf ?? p.invoiceId}</div>
                      <div className="td-muted" style={{ fontSize: 12 }}>
                        {p.customerName ?? p.customer}{p.ncf ? ` · ${p.invoiceId}` : ''}
                      </div>
                      {p.telefono && <div className="td-muted" style={{ fontSize: 12 }}>{p.telefono}</div>}
                    </td>
                    <td className="td-muted">
                      {p.direccion ?? '—'}
                      {p.referencia && <div style={{ fontSize: 12 }}>{p.referencia}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.grandTotal != null ? formatDOP(p.grandTotal) : '—'}</td>
                    <td>
                      <DeliveryEntregaBadge estado={p.estadoEntrega} />
                      {tienePend && esBorrador && <div className="td-muted" style={{ fontSize: 12 }}>Requiere serial/lote</div>}
                    </td>
                    <td><DeliveryCobroBadge estado={p.cobro?.estado} /></td>
                    <td>
                      {pendiente ? <span className="td-muted">Pendiente</span> : (
                        <>
                          <span className={`badge ${p.resultado === 'entregado' ? 'badge-success' : 'badge-error'}`}>
                            {p.resultado === 'entregado' ? 'Entregado' : 'No entregado'}
                          </span>
                          {p.motivo && <div className="td-muted" style={{ fontSize: 12 }}>{p.motivo}</div>}
                          {p.confirmadoPor && (
                            <div className="td-muted" style={{ fontSize: 12 }}>
                              {p.confirmadoPor}{p.confirmadoEn ? ` · ${formatDateTime(p.confirmadoEn)}` : ''}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {confirmable && (
                        <>
                          <button className="btn btn-secondary btn-size-sm" onClick={() => { setMotivoNoEntrega(''); setConfirmTarget({ invoiceIds: [p.invoiceId], resultado: 'entregado' }) }}>
                            Entregado
                          </button>{' '}
                          <button className="btn btn-ghost btn-size-sm" onClick={() => { setMotivoNoEntrega(''); setConfirmTarget({ invoiceIds: [p.invoiceId], resultado: 'no_entregado' }) }}>
                            No entregado
                          </button>
                        </>
                      )}
                      {anulable && (
                        <button className="btn btn-danger btn-size-sm" onClick={() => setAnular(p)}>
                          <Ban size={14} /> Anular venta
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Despachar */}
      <Modal
        open={despacharOpen}
        onClose={() => !despacharMut.isPending && setDespacharOpen(false)}
        title={reintento ? 'Reintentar despachar' : 'Despachar viaje'}
        subtitle={viaje.id}
        size={reqs.length > 0 ? 'lg' : 'md'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDespacharOpen(false)} disabled={despacharMut.isPending}>Cancelar</button>
            <button className="btn btn-navy" disabled={despacharMut.isPending || !trackingOk} onClick={() => { setDespachoError(null); despacharMut.mutate() }}>
              {despacharMut.isPending ? <span className="spinner spinner-white spinner-sm" /> : reintento ? 'Reintentar despachar' : 'Despachar'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            La mercancía de {paradas.length} factura(s) sale del inventario y el viaje queda programado.
          </p>
          {reqs.length > 0 && (
            <>
              <div className="inline-alert inline-alert-info" style={{ margin: 0 }}>
                Hay artículos con serial o lote: indica cuáles salen antes de despachar.
              </div>
              <ViajeTrackingEditor requisitos={reqs} value={tracking} onChange={setTracking} etiquetas={etiquetas} />
            </>
          )}
          {despachoError && (
            <DeliveryErrorAlert err={despachoError}>
              {codigoDelivery(despachoError) === 'DELIVERY_DESPACHO_PARCIAL_REVERTIDO' && (
                <span style={{ fontSize: 13 }}>Se revirtió lo que ya se había sometido; puedes reintentar.</span>
              )}
            </DeliveryErrorAlert>
          )}
        </div>
      </Modal>

      {/* Cancelar */}
      <Modal
        open={cancelarOpen}
        onClose={() => !cancelarMut.isPending && setCancelarOpen(false)}
        title="Cancelar viaje"
        subtitle={viaje.id}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCancelarOpen(false)} disabled={cancelarMut.isPending}>Volver</button>
            <button className="btn btn-danger" disabled={!cancelValido || cancelarMut.isPending} onClick={() => { setCancelError(null); cancelarMut.mutate() }}>
              {cancelarMut.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Cancelar viaje'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="inline-alert inline-alert-info" style={{ margin: 0 }}>
            Solo se puede cancelar si ninguna parada fue visitada.
          </div>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Motivo (10 a 500 caracteres)</label>
            <textarea className="ff-textarea" rows={3} maxLength={500} value={cancelMotivo} onChange={(e) => setCancelMotivo(e.target.value)} />
            <span className="ff-hint">{cancelMotivo.trim().length}/500</span>
          </div>
          {cancelError && (
            <DeliveryErrorAlert err={cancelError}>
              {codigoDelivery(cancelError) === 'DELIVERY_VIAJE_CON_ENTREGAS' && (
                <span style={{ fontSize: 13 }}>Ya hay entregas confirmadas: no se puede cancelar el viaje completo.</span>
              )}
            </DeliveryErrorAlert>
          )}
        </div>
      </Modal>

      {/* Eliminar borrador */}
      <ConfirmModal
        open={eliminarOpen}
        onClose={() => setEliminarOpen(false)}
        onConfirm={() => eliminarMut.mutate()}
        title="Eliminar viaje"
        description="El borrador y sus despachos en borrador se eliminan. Las facturas vuelven a pendientes."
        confirmLabel="Eliminar"
        loading={eliminarMut.isPending}
      />

      {/* Confirmar entregas */}
      <Modal
        open={!!confirmTarget}
        onClose={() => !confirmarMut.isPending && setConfirmTarget(null)}
        title={confirmTarget?.resultado === 'entregado' ? 'Confirmar entrega' : 'Marcar como no entregada'}
        subtitle={confirmTarget ? `${confirmTarget.invoiceIds.length} factura(s)` : undefined}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmTarget(null)} disabled={confirmarMut.isPending}>Cancelar</button>
            <button
              className={`btn ${requiereMotivo ? 'btn-danger' : 'btn-navy'}`}
              disabled={confirmarMut.isPending || (requiereMotivo && !motivoValido)}
              onClick={() => confirmTarget && confirmarMut.mutate({ ...confirmTarget, motivo: motivoNoEntrega.trim() })}
            >
              {confirmarMut.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Confirmar'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {confirmTarget?.invoiceIds.map((iid) => <li key={iid}>{etiquetas[iid] ?? iid}</li>)}
          </ul>
          {requiereMotivo ? (
            <>
              <div className="inline-alert inline-alert-warn" style={{ margin: 0 }}>
                Una entrega fallida no se reprograma: la venta se anula después (nota de crédito y devolución del despacho).
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Motivo de la no entrega</label>
                <textarea className="ff-textarea" rows={3} value={motivoNoEntrega} onChange={(e) => setMotivoNoEntrega(e.target.value)} placeholder="Ej. Cliente ausente, dirección incorrecta…" />
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13 }} className="td-muted">
              Si tu empresa activó "confirmar entrega concilia el cobro", el cobro se concilia automáticamente.
            </p>
          )}
        </div>
      </Modal>

      <AnularDeliveryModal
        open={!!anular}
        invoiceId={anular?.invoiceId ?? null}
        descripcion={anular ? etiquetaParada(anular) : undefined}
        onClose={() => setAnular(null)}
      />

      <p className="ff-hint" style={{ marginTop: 8 }}>
        <Link to="/delivery/pendientes">Ver pendientes por delivery</Link>
      </p>
    </div>
  )
}
