// Crear / editar (solo borrador) un viaje de delivery — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §4.2.
// Rutas: /delivery/viajes/nuevo (facturas desde `location.state.facturas`) y /delivery/viajes/:id/editar.

import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { createViaje, updateViaje, despacharViaje, getViaje, listDeliveryPendientes } from '@/shared/api/delivery'
import type { ApiError, DeliveryViaje } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDOP } from '@/lib/formatters'
import { codigoDelivery } from '@/lib/deliveryErrors'
import { PageHeader } from '@/components/shared/PageHeader'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { SearchInput } from '@/shared/ui/SearchInput'
import { Modal } from '@/shared/ui/Modal'
import { useDeliveryPuerta } from '@/shared/hooks/useDelivery'
import { DeliveryErrorAlert, ViajeEstadoBadge } from './viajeUi'
import {
  localInputToIso, isoToLocalInput, requisitosDesdeError, viajeDeError, viajeExistenteDeError,
  interpretarDespacho, type TrackingRequisito,
} from './viajeLib'
import { ViajeTrackingEditor } from './ViajeTrackingEditor'
import { buildTracking, trackingCompleto, type TrackingState } from './trackingLib'

interface FacturaRow {
  invoiceId: string
  ncf?: string
  customerName?: string
  direccion?: string
  grandTotal?: number
}

const INVALIDATE = ['delivery-pendientes', 'delivery-viajes', 'delivery-viaje', 'delivery-cobros']

export default function ViajeDeliveryForm() {
  const { id } = useParams<{ id: string }>()
  const editMode = !!id
  const navigate = useNavigate()
  const puerta = useDeliveryPuerta()
  const puedeCrear = usePuede('delivery.viajes.crear')
  const puedeEditar = usePuede('delivery.viajes.editar')

  const { data: viaje, isLoading: viajeLoading, isError: viajeError } = useQuery({
    queryKey: ['delivery-viaje', id],
    queryFn: () => getViaje(id!),
    enabled: editMode,
  })

  const permitido = editMode ? puedeEditar : puedeCrear
  const volver = (
    <a className="page-back-link" onClick={() => navigate(editMode ? `/delivery/viajes/${id}` : '/delivery/viajes')}>
      <ArrowLeft size={14} /> {editMode ? 'Viaje' : 'Viajes'}
    </a>
  )

  if (!permitido || (!puerta.cargando && !puerta.operativo)) {
    return (
      <div className="page-container">
        {volver}
        <div className="inline-alert inline-alert-warn" style={{ marginTop: 16 }}>
          {!permitido
            ? 'No tienes permiso para esta acción.'
            : 'Delivery no está disponible para crear o editar viajes en tu empresa.'}
        </div>
      </div>
    )
  }

  if (editMode) {
    if (viajeLoading) {
      return <div className="page-container"><span className="skeleton-box" style={{ height: 220, width: '100%', display: 'block' }} /></div>
    }
    if (viajeError || !viaje) {
      return <div className="page-container">{volver}<div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>No se encontró el viaje</div></div>
    }
    if (viaje.estado !== 'borrador') {
      return (
        <div className="page-container">
          {volver}
          <div className="inline-alert inline-alert-warn" style={{ marginTop: 16 }}>
            Solo se pueden editar viajes en borrador (este está <ViajeEstadoBadge estado={viaje.estado} />).
          </div>
        </div>
      )
    }
  }

  return <ViajeFormInner key={id ?? 'nuevo'} id={id} viaje={viaje} volver={volver} />
}

function ViajeFormInner({ id, viaje, volver }: { id?: string; viaje?: DeliveryViaje; volver: ReactNode }) {
  const editMode = !!id
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const puedeDespachar = usePuede('delivery.viajes.despachar')

  const stateFacturas = (location.state as { facturas?: FacturaRow[] } | null)?.facturas
  const [facturas, setFacturas] = useState<FacturaRow[]>(() =>
    viaje
      ? (viaje.paradas ?? []).slice().sort((a, b) => a.orden - b.orden).map((p) => ({
          invoiceId: p.invoiceId, ncf: p.ncf, customerName: p.customerName, direccion: p.direccion, grandTotal: p.grandTotal,
        }))
      : (stateFacturas ?? []))
  const [repartidor, setRepartidor] = useState(viaje?.repartidor ?? '')
  const [repartidorLabel, setRepartidorLabel] = useState(viaje?.repartidorNombre ?? viaje?.repartidor ?? '')
  const [vehiculo, setVehiculo] = useState(viaje?.vehiculo ?? '')
  const [salida, setSalida] = useState(isoToLocalInput(viaje?.salida))
  const [notas, setNotas] = useState(viaje?.notas ?? '')
  const [despachar, setDespachar] = useState(false)
  const [tracking, setTracking] = useState<TrackingState>({})
  const [reqsError, setReqsError] = useState<TrackingRequisito[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [viajeBorrador, setViajeBorrador] = useState<string | null>(null)
  // Viaje que quedó en borrador tras un `despachar:true` fallido al CREAR: los reintentos (p. ej. con
  // seriales ya capturados) deben actualizar/despachar ESE viaje, no crear otro (si no, el BFF
  // responde 409 DELIVERY_FACTURA_YA_DESPACHADA contra el borrador recién creado).
  const [borradorId, setBorradorId] = useState<string | null>(null)
  const [agregarOpen, setAgregarOpen] = useState(false)

  // Requisitos de tracking: del viaje (borrador ya con despachos) o del error DELIVERY_TRACKING_PENDIENTE.
  const reqs: TrackingRequisito[] = useMemo(() => {
    if (reqsError.length > 0) return reqsError
    return (viaje?.paradas ?? [])
      .filter((p) => facturas.some((f) => f.invoiceId === p.invoiceId))
      .flatMap((p) => (p.trackingPendiente ?? []).map((t) => ({ invoiceId: p.invoiceId, itemCode: t.itemCode, qty: t.qty, tipo: t.tipo })))
  }, [reqsError, viaje, facturas])

  const etiquetas = useMemo(
    () => Object.fromEntries(facturas.map((f) => [f.invoiceId, `${f.ncf ?? f.invoiceId}${f.customerName ? ` · ${f.customerName}` : ''}`])),
    [facturas],
  )

  function manejarError(err: ApiError) {
    setError(err)
    setViajeBorrador(null)
    const code = codigoDelivery(err)
    if (code === 'DELIVERY_TRACKING_PENDIENTE') {
      const r = requisitosDesdeError(err)
      if (r.length > 0) { setReqsError(r); setDespachar(true) }
    }
    // `despachar:true` falló: el viaje quedó en borrador → ofrecer ir a reintentar.
    const v = viajeDeError(err)
    if (v && code !== 'DELIVERY_FACTURA_YA_DESPACHADA') {
      setViajeBorrador(v)
      if (!editMode) setBorradorId(v)
    }
  }

  const guardar = useMutation({
    mutationFn: async (): Promise<{ viaje: DeliveryViaje; despachado: boolean }> => {
      const body = {
        repartidor,
        vehiculo: vehiculo || undefined,
        salida: localInputToIso(salida),
        notas: notas.trim() || undefined,
        facturas: facturas.map((f, i) => ({ invoiceId: f.invoiceId, orden: i + 1 })),
      }
      const trk = despachar ? buildTracking(reqs, tracking) : []
      const objetivo = id ?? borradorId
      if (!objetivo) {
        const v = await createViaje({ ...body, despachar: despachar || undefined, tracking: trk.length ? trk : undefined })
        return { viaje: v, despachado: despachar }
      }
      const v = await updateViaje(objetivo, body)
      if (!despachar) return { viaje: v, despachado: false }
      try {
        const d = await despacharViaje(objetivo, trk.length ? { tracking: trk } : undefined)
        return { viaje: d, despachado: true }
      } catch (e) {
        const err = e as ApiError
        throw Object.assign({}, err, { details: { ...(err.details ?? {}), viaje: objetivo } })
      }
    },
    onSuccess: ({ viaje: v, despachado }) => {
      INVALIDATE.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
      if (despachado) {
        const r = interpretarDespacho(v)
        if (r === 'dns_pendiente') toast.warning(v.advertencia ?? 'El stock salió pero el viaje no quedó sometido: reintenta despachar.', { duration: 10000 })
        else toast.success(r === 'ya_despachado' ? 'El viaje ya estaba despachado' : 'Viaje asignado y despachado')
      } else {
        toast.success(editMode ? 'Viaje actualizado' : 'Viaje creado en borrador')
      }
      navigate(`/delivery/viajes/${v.id}`, { replace: true })
    },
    onError: (err: ApiError) => manejarError(err),
  })

  function mover(i: number, d: -1 | 1) {
    setFacturas((prev) => {
      const j = i + d
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const total = facturas.reduce((s, f) => s + (f.grandTotal ?? 0), 0)
  const valido =
    !!repartidor && facturas.length > 0 && facturas.length <= 100 &&
    (!despachar || reqs.length === 0 || trackingCompleto(reqs, tracking))
  const existente = error && codigoDelivery(error) === 'DELIVERY_FACTURA_YA_DESPACHADA' ? viajeExistenteDeError(error) : null

  return (
    <div className="page-container">
      {volver}

      <PageHeader
        title={<><span className="page-title-dot" />{editMode ? `Editar viaje ${id}` : 'Nuevo viaje'}</>}
        description="Asigna facturas con delivery a un repartidor. Puedes dejarlo en borrador o despacharlo de una vez."
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header"><h2 className="card-title">Datos del viaje</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label ff-required">Repartidor</label>
              <OpcionesSelect recurso="repartidores" value={repartidor} onChange={(v, o) => { setRepartidor(v); setRepartidorLabel(o?.label ?? '') }} placeholder="Buscar repartidor…" error={!repartidor} selectedLabel={repartidorLabel} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Vehículo</label>
              <OpcionesSelect recurso="vehiculos" value={vehiculo} onChange={(v) => setVehiculo(v)} placeholder="Opcional — vehículo genérico por defecto" selectedLabel={vehiculo} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Salida prevista</label>
              <input type="datetime-local" className="ff-input" value={salida} onChange={(e) => setSalida(e.target.value)} />
            </div>
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Notas</label>
            <textarea className="ff-textarea" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Entregar antes de las 5 pm" />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card-title">Facturas del viaje ({facturas.length})</h2>
          <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setAgregarOpen(true)}>
            <Plus size={14} /> Agregar desde pendientes
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Orden</th>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Dirección</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state"><p className="empty-title">Sin facturas</p><p className="empty-sub">Agrega al menos una factura pendiente de entrega.</p></div></td></tr>
              ) : facturas.map((f, i) => (
                <tr key={f.invoiceId}>
                  <td style={{ fontWeight: 600 }}>{i + 1}</td>
                  <td>{f.ncf ?? f.invoiceId}{f.ncf && <div className="td-muted" style={{ fontSize: 12 }}>{f.invoiceId}</div>}</td>
                  <td>{f.customerName ?? '—'}</td>
                  <td className="td-muted">{f.direccion ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{f.grandTotal != null ? formatDOP(f.grandTotal) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-ghost btn-size-icon-sm" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp size={14} /></button>
                    <button type="button" className="btn btn-ghost btn-size-icon-sm" disabled={i === facturas.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar"><ArrowDown size={14} /></button>
                    <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => setFacturas((p) => p.filter((x) => x.invoiceId !== f.invoiceId))} aria-label="Quitar"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            {facturas.length > 0 && total > 0 && (
              <tfoot>
                <tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(total)}</td><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {puedeDespachar && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" className="ff-check" checked={despachar} onChange={(e) => setDespachar(e.target.checked)} />
              <span style={{ fontWeight: 600 }}>Asignar y despachar</span>
              <span className="td-muted" style={{ fontSize: 13 }}>— la mercancía sale del inventario al guardar.</span>
            </label>
            {despachar && reqs.length > 0 && (
              <>
                <div className="inline-alert inline-alert-info" style={{ margin: 0 }}>
                  Hay artículos con serial o lote: indica cuáles salen en este viaje antes de despachar.
                </div>
                <ViajeTrackingEditor requisitos={reqs} value={tracking} onChange={setTracking} etiquetas={etiquetas} />
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16 }}>
          <DeliveryErrorAlert err={error}>
            {existente && (existente.viaje || existente.despacho) && (
              <span style={{ fontSize: 13 }}>
                {existente.viaje
                  ? <>Esa factura ya está en el viaje <Link to={`/delivery/viajes/${existente.viaje}`}>{existente.viaje}</Link>.</>
                  : <>Despacho existente: {existente.despacho}.</>}
              </span>
            )}
            {viajeBorrador && (
              <span style={{ fontSize: 13 }}>
                El viaje <strong>{viajeBorrador}</strong> quedó en borrador.{' '}
                <Link to={`/delivery/viajes/${viajeBorrador}`}>Abrirlo para reintentar con Despachar</Link>.
              </span>
            )}
          </DeliveryErrorAlert>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} disabled={guardar.isPending}>Cancelar</button>
        <button type="button" className="btn btn-navy" disabled={!valido || guardar.isPending} onClick={() => { setError(null); setViajeBorrador(null); guardar.mutate() }}>
          {guardar.isPending
            ? <span className="spinner spinner-white spinner-sm" />
            : despachar ? 'Guardar y despachar' : editMode ? 'Guardar cambios' : 'Crear viaje'}
        </button>
      </div>

      <AgregarFacturasModal
        open={agregarOpen}
        onClose={() => setAgregarOpen(false)}
        yaAgregadas={facturas.map((f) => f.invoiceId)}
        onAgregar={(rows) => setFacturas((p) => [...p, ...rows])}
      />
    </div>
  )
}

function AgregarFacturasModal({ open, onClose, yaAgregadas, onAgregar }: {
  open: boolean
  onClose: () => void
  yaAgregadas: string[]
  onAgregar: (rows: FacturaRow[]) => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Map<string, FacturaRow>>(new Map())
  const { data, isLoading } = useQuery({
    queryKey: ['delivery-pendientes', { modalViaje: true, q }],
    queryFn: () => listDeliveryPendientes({ estado: 'pendiente', q: q || undefined, limit: 50 }),
    enabled: open,
  })
  // `no_entregado` no se reasigna y las que ya tienen viaje tampoco.
  const items = (data?.items ?? []).filter((i) => !i.viaje && !yaAgregadas.includes(i.invoiceId))

  function cerrar() { setSel(new Map()); setQ(''); onClose() }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Agregar facturas pendientes"
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={cerrar}>Cancelar</button>
          <button className="btn btn-primary" disabled={sel.size === 0} onClick={() => { onAgregar([...sel.values()]); cerrar() }}>
            Agregar{sel.size > 0 ? ` (${sel.size})` : ''}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SearchInput variant="field" placeholder="Factura, NCF, cliente…" value={q} onChange={setQ} />
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="data-table navy-table">
            <tbody>
              {isLoading ? (
                <tr><td><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td></tr>
              ) : items.length === 0 ? (
                <tr><td><div className="empty-state"><p className="empty-title">No hay facturas pendientes para agregar</p></div></td></tr>
              ) : items.map((r) => (
                <tr key={r.invoiceId}>
                  <td style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="ff-check"
                      checked={sel.has(r.invoiceId)}
                      onChange={() => setSel((prev) => {
                        const n = new Map(prev)
                        if (n.has(r.invoiceId)) n.delete(r.invoiceId)
                        else n.set(r.invoiceId, { invoiceId: r.invoiceId, ncf: r.ncf, customerName: r.customerName, direccion: r.direccion, grandTotal: r.grandTotal })
                        return n
                      })}
                    />
                  </td>
                  <td>{r.ncf ?? r.invoiceId}</td>
                  <td>{r.customerName ?? r.customer}</td>
                  <td className="td-muted">{r.direccion ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(r.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
