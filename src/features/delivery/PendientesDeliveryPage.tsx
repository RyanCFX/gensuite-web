// Pendientes por delivery — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §4.1 (`delivery.pendientes.listar`).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Truck, Ban } from 'lucide-react'
import { listDeliveryPendientes } from '@/shared/api/delivery'
import type { DeliveryPendiente } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatDOP } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchInput } from '@/shared/ui/SearchInput'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { useDeliveryPuerta, DrenajeAviso } from '@/shared/hooks/useDelivery'
import { DeliveryEntregaBadge, DeliveryCobroBadge } from './DeliveryBadges'
import { AnularDeliveryModal } from './AnularDeliveryModal'
import { DeliveryPagination } from './DeliveryPagination'

const COLUMNS = [
  { key: 'check', width: 40 },
  { key: 'factura', width: 150 },
  { key: 'cliente', width: 200 },
  { key: 'direccion', width: 260 },
  { key: 'total', width: 110 },
  { key: 'fecha', width: 100 },
  { key: 'entrega', width: 120 },
  { key: 'cobro', width: 120 },
  { key: 'actions', width: 140 },
]

const PAGE_SIZE = 20

export default function PendientesDeliveryPage() {
  const navigate = useNavigate()
  const puerta = useDeliveryPuerta()
  const puedeCrearViaje = usePuede('delivery.viajes.crear') && puerta.operativo
  const puedeAnular = usePuede('delivery.entregas.anular')

  const [estado, setEstado] = useState<'todos' | 'pendiente' | 'no_entregado'>('todos')
  const [customer, setCustomer] = useState('')
  const [branch, setBranch] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [seleccion, setSeleccion] = useState<Map<string, DeliveryPendiente>>(new Map())
  const [anular, setAnular] = useState<DeliveryPendiente | null>(null)
  const offset = (page - 1) * PAGE_SIZE
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-pendientes', { estado, customer, branch, fechaDesde, fechaHasta, q, offset }],
    queryFn: () => listDeliveryPendientes({
      estado: estado === 'todos' ? undefined : estado,
      customer: customer || undefined,
      branch: branch || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0

  // Solo las `pendiente` sin viaje se pueden asignar: una `no_entregado` NO se reasigna (se anula).
  const asignables = items.filter((i) => i.estadoEntrega === 'pendiente' && !i.viaje)
  const todasMarcadas = asignables.length > 0 && asignables.every((i) => seleccion.has(i.invoiceId))

  function filtro<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(1) }
  }

  function toggle(row: DeliveryPendiente) {
    setSeleccion((prev) => {
      const next = new Map(prev)
      if (next.has(row.invoiceId)) next.delete(row.invoiceId)
      else next.set(row.invoiceId, row)
      return next
    })
  }

  function toggleTodas() {
    setSeleccion((prev) => {
      const next = new Map(prev)
      if (todasMarcadas) asignables.forEach((i) => next.delete(i.invoiceId))
      else asignables.forEach((i) => next.set(i.invoiceId, i))
      return next
    })
  }

  function asignar() {
    const facturas = [...seleccion.values()].map((r) => ({
      invoiceId: r.invoiceId,
      ncf: r.ncf,
      customerName: r.customerName,
      direccion: r.direccion,
      grandTotal: r.grandTotal,
    }))
    navigate('/delivery/viajes/nuevo', { state: { facturas } })
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Pendientes por delivery</>}
        description="Ventas con delivery que aún no salieron en un viaje, y entregas fallidas por anular."
        action={
          <>
            <RecargarButton />
            {puedeCrearViaje && (
              <button className="btn btn-navy" disabled={seleccion.size === 0} onClick={asignar}>
                <Truck size={16} /> Asignar a repartidor{seleccion.size > 0 ? ` (${seleccion.size})` : ''}
              </button>
            )}
          </>
        }
      />

      {puerta.drenaje && <DrenajeAviso />}

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Estado">
                <Select value={estado} onValueChange={(v) => filtro(setEstado)(v as typeof estado)} clearable={false}>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="no_entregado">No entregado</SelectItem>
                </Select>
              </FilterField>
              <OpcionesSelect hideOnForbidden filterLabel="Cliente" filterStyle={{ width: 220 }} recurso="clientes" minChars={2} value={customer} onChange={(v) => filtro(setCustomer)(v)} placeholder="Todos los clientes" />
              <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }} recurso="sucursales" value={branch} onChange={(v) => filtro(setBranch)(v)} placeholder="Todas las sucursales" />
              <FilterField label="Desde">
                <DatePicker className="ff-input" value={fechaDesde} onChange={filtro(setFechaDesde)} clearable />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="ff-input" value={fechaHasta} onChange={filtro(setFechaHasta)} clearable />
              </FilterField>
              <FilterField label="Buscar">
                <SearchInput variant="field" placeholder="Factura, NCF, cliente…" value={q} onChange={filtro(setQ)} />
              </FilterField>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
            <colgroup>
              {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  {puedeCrearViaje && (
                    <input type="checkbox" className="ff-check" checked={todasMarcadas} disabled={asignables.length === 0} onChange={toggleTodas} aria-label="Seleccionar todas" />
                  )}
                </th>
                <th>Factura<span className="col-resize-handle" onMouseDown={startResize('factura')} /></th>
                <th>Cliente<span className="col-resize-handle" onMouseDown={startResize('cliente')} /></th>
                <th>Dirección<span className="col-resize-handle" onMouseDown={startResize('direccion')} /></th>
                <th style={{ textAlign: 'right' }}>Total<span className="col-resize-handle" onMouseDown={startResize('total')} /></th>
                <th>Fecha<span className="col-resize-handle" onMouseDown={startResize('fecha')} /></th>
                <th>Entrega<span className="col-resize-handle" onMouseDown={startResize('entrega')} /></th>
                <th>Cobro<span className="col-resize-handle" onMouseDown={startResize('cobro')} /></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{COLUMNS.map((c) => <td key={c.key}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>)}</tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={COLUMNS.length}>
                          <div className="empty-state">
                            <span className="empty-icon"><Truck size={20} /></span>
                            <p className="empty-title">Nada pendiente por delivery</p>
                            <p className="empty-sub">Las ventas con delivery aparecen aquí al emitirse.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((r) => {
                      const asignable = r.estadoEntrega === 'pendiente' && !r.viaje
                      const fallida = r.estadoEntrega === 'no_entregado'
                      return (
                        <tr key={r.invoiceId} style={fallida ? { background: 'var(--error-bg, rgba(220,38,38,0.06))' } : undefined}>
                          <td>
                            {puedeCrearViaje && asignable && (
                              <input type="checkbox" className="ff-check" checked={seleccion.has(r.invoiceId)} onChange={() => toggle(r)} aria-label={`Seleccionar ${r.invoiceId}`} />
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.ncf ?? r.invoiceId}</div>
                            {r.ncf && <div className="td-muted" style={{ fontSize: 12 }}>{r.invoiceId}</div>}
                          </td>
                          <td>
                            {r.customerName ?? r.customer}
                            {r.telefono && <div className="td-muted" style={{ fontSize: 12 }}>{r.telefono}</div>}
                          </td>
                          <td className="td-muted">
                            {r.direccion ?? '—'}
                            {r.referencia && <div style={{ fontSize: 12 }}>{r.referencia}</div>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(r.grandTotal)}</td>
                          <td className="td-muted">{formatDate(r.postingDate)}</td>
                          <td>
                            <DeliveryEntregaBadge estado={r.estadoEntrega} />
                            {r.viaje && <div className="td-muted" style={{ fontSize: 12 }}>{r.viaje}</div>}
                          </td>
                          <td><DeliveryCobroBadge estado={r.cobro?.estado} /></td>
                          <td style={{ textAlign: 'right' }}>
                            {fallida && puedeAnular && (
                              <button className="btn btn-danger btn-size-sm" onClick={() => setAnular(r)}>
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

      <DeliveryPagination page={page} pageSize={PAGE_SIZE} total={total} hasMore={data?.meta.hasMore} onPage={setPage} />

      <AnularDeliveryModal
        open={!!anular}
        invoiceId={anular?.invoiceId ?? null}
        descripcion={anular ? `${anular.ncf ?? anular.invoiceId} · ${anular.customerName ?? anular.customer}` : undefined}
        onClose={() => setAnular(null)}
      />
    </div>
  )
}
