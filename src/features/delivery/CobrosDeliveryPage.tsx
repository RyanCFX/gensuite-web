// Cobros delivery por conciliar — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §3.3 y §5 (anular).

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Banknote, ChevronLeft, ChevronRight, Plus, Trash2, XCircle } from 'lucide-react'
import {
  anularFacturaDelivery,
  conciliarDeliveryCobros,
  getDeliveryCobrosResumen,
  listDeliveryCobros,
} from '@/shared/api/delivery'
import type {
  DeliveryCobroFila,
  DeliveryConciliacionItem,
  DeliveryConciliacionResultItem,
} from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { useDeliveryPuerta, DrenajeAviso } from '@/shared/hooks/useDelivery'
import { codigoDelivery } from '@/lib/deliveryErrors'
import { formatDate, formatMoney } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchInput } from '@/shared/ui/SearchInput'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { Modal } from '@/shared/ui/Modal'
import { Select, SelectItem } from '@/components/ui/select'
import { useOpcionesArray } from '@/shared/hooks/useOpciones'
import { DeliveryCobroBadge, DeliveryEntregaBadge } from './DeliveryBadges'

const PAGE_SIZE = 20
const TOL = 0.01

interface LineaDraft {
  modeOfPayment: string
  amount: string
}

interface ConciliacionDraft {
  fila: DeliveryCobroFila
  lineas: LineaDraft[]
  faltante: boolean
  motivo: string
}

function pendienteDe(f: DeliveryCobroFila): number {
  return f.cobro.montoPorConciliar
}

function sumaLineas(lineas: LineaDraft[]): number {
  return lineas.reduce((s, l) => s + (Number(l.amount) || 0), 0)
}

function draftDe(fila: DeliveryCobroFila): ConciliacionDraft {
  const previsto = fila.cobro.previsto ?? []
  return {
    fila,
    lineas: previsto.length
      ? previsto.map((p) => ({ modeOfPayment: p.modeOfPayment, amount: String(p.amount) }))
      : [{ modeOfPayment: '', amount: String(pendienteDe(fila)) }],
    faltante: false,
    motivo: '',
  }
}

/** Mensaje de un ítem fallido (§3.3). El `message` del BFF manda y se muestra solo; el texto
 *  local por código es únicamente respaldo cuando el BFF no trae mensaje (evita duplicados). */
const MENSAJE_RESPALDO: Record<string, string> = {
  DELIVERY_COBRO_NO_PENDIENTE: 'Este cobro ya fue conciliado por otro usuario; refresca la lista.',
  TURNO_NO_ABIERTO: 'Abre turno primero: el dinero entra a la gaveta de quien concilia.',
  DELIVERY_ENTREGA_NO_DESPACHADA: 'La factura aún no salió en un viaje.',
}

function mensajeError(e?: { code?: string; message?: string }): string {
  if (e?.message?.trim()) return e.message
  return (e?.code && MENSAJE_RESPALDO[e.code]) || 'Error al conciliar'
}

export default function CobrosDeliveryPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const puerta = useDeliveryPuerta()
  const puedeConciliar = usePuede('delivery.cobros.conciliar')
  const puedeConDiferencia = usePuede('delivery.cobros.conciliar-con-diferencia')
  const puedeAnular = usePuede('delivery.entregas.anular')

  const [estado, setEstado] = useState('por_conciliar')
  const [repartidor, setRepartidor] = useState('')
  const [viaje, setViaje] = useState('')
  const [turno, setTurno] = useState('')
  const [estadoEntrega, setEstadoEntrega] = useState('all')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  const [seleccion, setSeleccion] = useState<Map<string, DeliveryCobroFila>>(new Map())
  const [drafts, setDrafts] = useState<ConciliacionDraft[] | null>(null)
  const [resultados, setResultados] = useState<Record<string, DeliveryConciliacionResultItem>>({})
  const [anulando, setAnulando] = useState<DeliveryCobroFila | null>(null)
  const [anulMotivo, setAnulMotivo] = useState('')
  const [anulCodigo, setAnulCodigo] = useState('1')
  const [anulError, setAnulError] = useState<{ code?: string; message?: string } | null>(null)

  const permiteDiferencias = puerta.operativa?.deliveryPermiteDiferencias === true
  const { data: metodos } = useOpcionesArray('metodos-pago', { limit: 100 })
  const metodosActivos = (metodos ?? []).filter((m) => !m.disabled)

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-cobros', { estado, repartidor, viaje, turno, estadoEntrega, fechaDesde, fechaHasta, q, offset }],
    queryFn: () =>
      listDeliveryCobros({
        estado,
        repartidor: repartidor || undefined,
        viaje: viaje || undefined,
        turno: turno || undefined,
        estadoEntrega: estadoEntrega === 'all' ? undefined : estadoEntrega,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
        q: q || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const { data: resumen } = useQuery({
    queryKey: ['delivery-cobros', 'resumen'],
    queryFn: getDeliveryCobrosResumen,
    retry: false,
  })

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['delivery-cobros'] })
    queryClient.invalidateQueries({ queryKey: ['delivery-pendientes'] })
    queryClient.invalidateQueries({ queryKey: ['turno-actual'] })
    queryClient.invalidateQueries({ queryKey: ['turno-preview-cierre'] })
    queryClient.invalidateQueries({ queryKey: ['caja-por-cobrar'] })
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  // Solo se concilia lo que ya salió en un viaje (si no: 409 DELIVERY_ENTREGA_NO_DESPACHADA).
  const yaDespachada = (f: DeliveryCobroFila) => f.estadoEntrega !== 'pendiente' && f.estadoEntrega !== 'asignado'
  const seleccionables = items.filter((f) => f.cobro.estado === 'por_conciliar' && yaDespachada(f))
  const todosMarcados = seleccionables.length > 0 && seleccionables.every((f) => seleccion.has(f.invoiceId))

  function toggleFila(f: DeliveryCobroFila) {
    setSeleccion((prev) => {
      const next = new Map(prev)
      if (next.has(f.invoiceId)) next.delete(f.invoiceId)
      else next.set(f.invoiceId, f)
      return next
    })
  }

  function toggleTodos() {
    setSeleccion((prev) => {
      const next = new Map(prev)
      if (todosMarcados) seleccionables.forEach((f) => next.delete(f.invoiceId))
      else seleccionables.forEach((f) => next.set(f.invoiceId, f))
      return next
    })
  }

  function abrirConciliar(filas: DeliveryCobroFila[]) {
    setResultados({})
    setDrafts(filas.map(draftDe))
  }

  function updateDraft(id: string, fn: (d: ConciliacionDraft) => ConciliacionDraft) {
    setDrafts((prev) => prev?.map((d) => (d.fila.invoiceId === id ? fn(d) : d)) ?? null)
  }

  // Validación local por factura: suma > pendiente → error; suma < pendiente solo con faltante.
  function errorLocal(d: ConciliacionDraft): string | null {
    const pend = pendienteDe(d.fila)
    const suma = sumaLineas(d.lineas)
    if (d.lineas.some((l) => !l.modeOfPayment || !(Number(l.amount) > 0))) {
      return 'Cada línea necesita método y monto mayor a cero.'
    }
    if (suma > pend + TOL) {
      return `Lo recibido (${formatMoney(suma)}) supera el pendiente (${formatMoney(pend)}).`
    }
    if (suma < pend - TOL) {
      if (!d.faltante) return `Falta ${formatMoney(pend - suma)} para cuadrar con el pendiente.`
      if (d.motivo.trim().length === 0) return 'Indica el motivo del faltante.'
    }
    return null
  }

  const conciliarMutation = useMutation({
    mutationFn: (items: DeliveryConciliacionItem[]) => conciliarDeliveryCobros(items),
    onSuccess: (res) => {
      const mapa: Record<string, DeliveryConciliacionResultItem> = {}
      res.forEach((r) => {
        mapa[r.invoiceId] = r
      })
      setResultados((prev) => ({ ...prev, ...mapa }))
      const oks = res.filter((r) => r.ok)
      const fallos = res.filter((r) => !r.ok)
      if (oks.length) toast.success(`${oks.length} cobro(s) conciliado(s)`)
      if (fallos.length) toast.error(`${fallos.length} cobro(s) no se pudieron conciliar — revisa el detalle`)
      // Los conciliados salen de la selección y del modal; los fallidos quedan para reintentar.
      const okIds = new Set(oks.map((r) => r.invoiceId))
      setSeleccion((prev) => {
        const next = new Map(prev)
        okIds.forEach((id) => next.delete(id))
        return next
      })
      setDrafts((prev) => {
        const rest = prev?.filter((d) => !okIds.has(d.fila.invoiceId)) ?? null
        return rest && rest.length ? rest : fallos.length ? rest : null
      })
      if (fallos.length === 0) setResultados({})
      invalidar()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al conciliar'),
  })

  function confirmarConciliacion() {
    if (!drafts) return
    for (const d of drafts) {
      const e = errorLocal(d)
      if (e) {
        toast.error(`${d.fila.invoiceId}: ${e}`)
        return
      }
    }
    const payload: DeliveryConciliacionItem[] = drafts.map((d) => {
      const suma = sumaLineas(d.lineas)
      const falta = suma < pendienteDe(d.fila) - TOL
      return {
        invoiceId: d.fila.invoiceId,
        recibido: d.lineas.map((l) => ({ modeOfPayment: l.modeOfPayment, amount: Number(l.amount) })),
        ...(falta && d.faltante ? { diferencia: { motivo: d.motivo.trim() } } : {}),
      }
    })
    conciliarMutation.mutate(payload)
  }

  const anularMutation = useMutation({
    mutationFn: () =>
      anularFacturaDelivery(anulando!.invoiceId, {
        motivo: anulMotivo.trim(),
        motivoAnulacion: Number(anulCodigo) as 1 | 2 | 3 | 4 | 5,
      }),
    onSuccess: (res) => {
      toast.success(
        res.yaAnulada
          ? 'La venta ya estaba anulada'
          : `Venta anulada${res.notaCredito ? ` — nota de crédito ${res.notaCredito}` : ''}`,
      )
      res.advertencias?.forEach((a) => toast.warning(a, { duration: 8000 }))
      setAnulando(null)
      setAnulMotivo('')
      setAnulError(null)
      invalidar()
    },
    onError: (err: { message?: string; code?: string }) => {
      setAnulError({ code: codigoDelivery(err), message: err?.message })
      if (codigoDelivery(err) !== 'DELIVERY_ANULACION_NO_PERMITIDA') {
        toast.error(err?.message ?? 'Error al anular la venta')
      }
    },
  })

  const resumenTexto = useMemo(() => {
    if (!resumen) return null
    const reps = resumen.porRepartidor.length
    return `${formatMoney(resumen.total.monto)} por conciliar con ${reps} repartidor${reps === 1 ? '' : 'es'}`
  }, [resumen])

  const seleccionadas = Array.from(seleccion.values())
  const mostrarAcciones = puedeConciliar || puedeAnular
  const ncols = 9

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Cobros delivery por conciliar</>}
        description={resumenTexto ?? 'Dinero que cobran los repartidores al entregar y aún no entra a caja.'}
        action={
          <>
            <RecargarButton />
            {puedeConciliar && (
              <button
                className="btn btn-navy"
                disabled={seleccionadas.length === 0}
                onClick={() => abrirConciliar(seleccionadas)}
              >
                <Banknote size={16} /> Conciliar{seleccionadas.length ? ` (${seleccionadas.length})` : ''}
              </button>
            )}
          </>
        }
      />

      {puerta.drenaje && <DrenajeAviso />}

      {resumen?.cuentaPuente && resumen.cuentaPuente.cuadra === false && (
        <div className="inline-alert inline-alert-warning" style={{ marginBottom: 16 }}>
          La cuenta puente de delivery ({resumen.cuentaPuente.cuenta}) no cuadra con los cobros por conciliar:
          saldo {formatMoney(resumen.cuentaPuente.saldo)}, diferencia {formatMoney(resumen.cuentaPuente.diferencia)}.
          Avisa a contabilidad.
        </div>
      )}

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Buscar">
                <SearchInput variant="field" placeholder="Factura, NCF o cliente" value={q} onChange={resetPage(setQ)} />
              </FilterField>
              <FilterField label="Estado del cobro">
                <Select value={estado} onValueChange={resetPage(setEstado)} clearable={false}>
                  <SelectItem value="por_conciliar">Por conciliar</SelectItem>
                  <SelectItem value="conciliado">Conciliado</SelectItem>
                  <SelectItem value="revertido">Revertido</SelectItem>
                  <SelectItem value="no_aplica">No aplica</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Estado de entrega">
                <Select value={estadoEntrega} onValueChange={resetPage(setEstadoEntrega)} clearable={false}>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="asignado">Asignado</SelectItem>
                  <SelectItem value="en_ruta">En ruta</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="no_entregado">No entregado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </Select>
              </FilterField>
              <OpcionesSelect
                recurso="repartidores"
                filterLabel="Repartidor"
                value={repartidor}
                onChange={(v) => { setRepartidor(v); setPage(1) }}
                placeholder="Todos"
                hideOnForbidden
              />
              <FilterField label="Viaje">
                <SearchInput variant="field" placeholder="ID del viaje" value={viaje} onChange={resetPage(setViaje)} />
              </FilterField>
              <FilterField label="Turno">
                <SearchInput variant="field" placeholder="ID del turno" value={turno} onChange={resetPage(setTurno)} />
              </FilterField>
              <FilterField label="Desde">
                <DatePicker className="ff-input" value={fechaDesde} onChange={resetPage(setFechaDesde)} clearable />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="ff-input" value={fechaHasta} onChange={resetPage(setFechaHasta)} clearable />
              </FilterField>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  {puedeConciliar && (
                    <input
                      type="checkbox"
                      className="ff-check"
                      aria-label="Seleccionar todos"
                      checked={todosMarcados}
                      disabled={seleccionables.length === 0}
                      onChange={toggleTodos}
                    />
                  )}
                </th>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Repartidor / viaje</th>
                <th>Entrega</th>
                <th>Cobro</th>
                <th style={{ textAlign: 'right' }}>Por conciliar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: ncols }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={ncols}>
                          <div className="empty-state">
                            <span className="empty-icon"><Banknote size={20} /></span>
                            <p className="empty-title">Sin cobros delivery</p>
                            <p className="empty-sub">No hay cobros que coincidan con los filtros.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((f) => {
                      const porConciliar = f.cobro.estado === 'por_conciliar'
                      return (
                        <tr key={f.invoiceId}>
                          <td>
                            {puedeConciliar && porConciliar && yaDespachada(f) && (
                              <input
                                type="checkbox"
                                className="ff-check"
                                aria-label={`Seleccionar ${f.invoiceId}`}
                                checked={seleccion.has(f.invoiceId)}
                                onChange={() => toggleFila(f)}
                              />
                            )}
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            {f.invoiceId}
                            {f.ncf && <div className="td-muted" style={{ fontSize: 11 }}>{f.ncf}</div>}
                          </td>
                          <td>
                            {f.customerName ?? f.customer}
                            {f.direccion && <div className="td-muted" style={{ fontSize: 11 }}>{f.direccion}</div>}
                          </td>
                          <td className="td-muted">{formatDate(f.postingDate)}</td>
                          <td className="td-muted">
                            {f.repartidor?.nombre ?? '—'}
                            {f.viaje && <div style={{ fontSize: 11 }}>{f.viaje}</div>}
                          </td>
                          <td><DeliveryEntregaBadge estado={f.estadoEntrega} /></td>
                          <td><DeliveryCobroBadge estado={f.cobro.estado} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(f.cobro.montoPorConciliar)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {mostrarAcciones && (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                {puedeConciliar && porConciliar && !yaDespachada(f) && (
                                  <span className="td-muted" style={{ fontSize: 12 }}>Aún no despachada</span>
                                )}
                                {puedeConciliar && porConciliar && yaDespachada(f) && (
                                  <button className="btn btn-secondary btn-size-xs" onClick={() => abrirConciliar([f])}>
                                    Conciliar
                                  </button>
                                )}
                                {puedeAnular && f.estadoEntrega === 'no_entregado' && (
                                  <button
                                    className="btn btn-danger btn-size-xs"
                                    onClick={() => {
                                      setAnulando(f)
                                      setAnulMotivo('')
                                      setAnulCodigo('1')
                                      setAnulError(null)
                                    }}
                                  >
                                    <XCircle size={13} /> Anular venta
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
            </tbody>
          </table>
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div className="pagination">
          <span className="pagination-info">Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}</span>
          <div className="pagination-controls">
            <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button className="btn btn-ghost btn-size-icon-sm" disabled={!data?.meta.hasMore} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* ── Modal: conciliar ─────────────────────────────────────── */}
      <Modal
        open={!!drafts}
        onClose={() => { if (!conciliarMutation.isPending) { setDrafts(null); setResultados({}) } }}
        title={`Conciliar cobro${drafts && drafts.length > 1 ? 's' : ''} delivery`}
        subtitle="Registra lo que el repartidor realmente trajo, por método de pago."
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setDrafts(null); setResultados({}) }} disabled={conciliarMutation.isPending}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={confirmarConciliacion} disabled={conciliarMutation.isPending || !drafts?.length}>
              {conciliarMutation.isPending ? 'Conciliando…' : 'Confirmar conciliación'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {drafts?.map((d) => {
            const id = d.fila.invoiceId
            const pend = pendienteDe(d.fila)
            const suma = sumaLineas(d.lineas)
            const res = resultados[id]
            const falta = suma < pend - TOL
            const puedeFaltante = puedeConDiferencia && permiteDiferencias && falta
            const err = errorLocal(d)
            return (
              <div key={id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div>
                    <strong>{id}</strong>{' '}
                    <span className="td-muted">{d.fila.customerName ?? d.fila.customer}</span>
                  </div>
                  <div style={{ fontWeight: 600 }}>Pendiente: {formatMoney(pend)}</div>
                </div>

                {res && !res.ok && (
                  <div className="inline-alert inline-alert-error" style={{ marginBottom: 8 }}>
                    <span>
                      {mensajeError(res.error)}
                      {res.error?.code && <span className="td-muted"> ({res.error.code})</span>}
                      {res.error?.code === 'TURNO_NO_ABIERTO' && (
                        <> — <Link to="/turnos">Abrir turno</Link> o <Link to="/caja/por-cobrar">ir a Caja</Link></>
                      )}
                    </span>
                  </div>
                )}

                {d.lineas.map((l, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                    <div className="ff-wrap" style={{ flex: 2 }}>
                      {idx === 0 && <label className="ff-label">Método</label>}
                      <Select
                        value={l.modeOfPayment}
                        onValueChange={(v) =>
                          updateDraft(id, (x) => ({ ...x, lineas: x.lineas.map((y, i) => (i === idx ? { ...y, modeOfPayment: v } : y)) }))
                        }
                        clearable={false}
                        placeholder="Método de pago"
                      >
                        {[
                          ...(l.modeOfPayment && !metodosActivos.some((m) => m.name === l.modeOfPayment)
                            ? [{ name: l.modeOfPayment }]
                            : []),
                          ...metodosActivos,
                        ].map((m) => (
                          <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div className="ff-wrap" style={{ flex: 1 }}>
                      {idx === 0 && <label className="ff-label">Monto</label>}
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="ff-input"
                        value={l.amount}
                        onChange={(e) =>
                          updateDraft(id, (x) => ({ ...x, lineas: x.lineas.map((y, i) => (i === idx ? { ...y, amount: e.target.value } : y)) }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-icon-sm"
                      aria-label="Quitar línea"
                      disabled={d.lineas.length === 1}
                      onClick={() => updateDraft(id, (x) => ({ ...x, lineas: x.lineas.filter((_, i) => i !== idx) }))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-size-xs"
                  onClick={() => updateDraft(id, (x) => ({ ...x, lineas: [...x.lineas, { modeOfPayment: '', amount: '' }] }))}
                >
                  <Plus size={13} /> Agregar método
                </button>

                <div style={{ marginTop: 8, fontSize: 13 }}>
                  Recibido: <strong>{formatMoney(suma)}</strong>
                </div>

                {puedeFaltante && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="ff-check-wrap" style={{ alignSelf: 'flex-start' }}>
                      <input
                        type="checkbox"
                        className="ff-check"
                        checked={d.faltante}
                        onChange={(e) => updateDraft(id, (x) => ({ ...x, faltante: e.target.checked }))}
                      />
                      <span style={{ fontSize: 13 }}>Conciliar con faltante ({formatMoney(pend - suma)})</span>
                    </label>
                    {d.faltante && (
                      <div className="ff-wrap">
                        <label className="ff-label ff-required">Motivo del faltante</label>
                        <input
                          className="ff-input"
                          value={d.motivo}
                          onChange={(e) => updateDraft(id, (x) => ({ ...x, motivo: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                )}

                {err && <p className="ff-hint" style={{ color: 'var(--color-error)', marginTop: 8 }}>{err}</p>}
              </div>
            )
          })}

          {/* Resultados de ítems ya conciliados en este intento (con autoConfirmación). */}
          {Object.values(resultados).some((r) => r.ok) && (
            <div className="inline-alert inline-alert-success">
              <span>
                {Object.values(resultados)
                  .filter((r) => r.ok)
                  .map((r) => `${r.invoiceId}: conciliado${r.reutilizado ? ' (ya estaba registrado)' : ''}${
                    r.autoConfirmacion
                      ? r.autoConfirmacion.omitida
                        ? ` — entrega no confirmada automáticamente${r.autoConfirmacion.detalle ? ` (${r.autoConfirmacion.detalle})` : r.autoConfirmacion.motivo ? ` (${r.autoConfirmacion.motivo})` : ''}`
                        : ' — entrega confirmada automáticamente'
                      : ''
                  }`)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Modal: anular venta ──────────────────────────────────── */}
      <Modal
        open={!!anulando}
        onClose={() => { if (!anularMutation.isPending) setAnulando(null) }}
        title="Anular venta con entrega fallida"
        subtitle={anulando ? `${anulando.invoiceId} — ${anulando.customerName ?? anulando.customer}` : undefined}
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAnulando(null)} disabled={anularMutation.isPending}>Volver</button>
            <button
              className="btn btn-danger"
              disabled={anularMutation.isPending || anulMotivo.trim().length < 10 || anulMotivo.trim().length > 500}
              onClick={() => anularMutation.mutate()}
            >
              {anularMutation.isPending ? 'Anulando…' : 'Anular venta'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Devuelve la mercancía al inventario, emite una nota de crédito total contra el cobro pendiente y
            libera la reserva. Es reintentable.
          </p>
          <div className="ff-wrap">
            <label className="ff-label ff-required" htmlFor="anulMotivo">Motivo (10 a 500 caracteres)</label>
            <textarea
              id="anulMotivo"
              className="ff-input"
              rows={3}
              maxLength={500}
              value={anulMotivo}
              onChange={(e) => setAnulMotivo(e.target.value)}
            />
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Código DGII de la nota de crédito</label>
            <Select value={anulCodigo} onValueChange={setAnulCodigo} clearable={false}>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="5">5</SelectItem>
            </Select>
          </div>
          {anulError?.code === 'DELIVERY_ANULACION_NO_PERMITIDA' && (
            <div className="inline-alert inline-alert-warning">
              <span>
                {anulError.message} El cobro ya está conciliado: usa el flujo normal de{' '}
                <Link to="/devoluciones">Devoluciones</Link>.
              </span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
