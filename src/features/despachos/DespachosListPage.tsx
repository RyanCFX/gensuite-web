// Listado de Despachos + cola de "Pendientes de despachar" (tab) — docs/tasks/
// PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §2.3-§2.4.

import { useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ChevronLeft, ChevronRight, Truck, ClipboardCheck } from 'lucide-react'
import { listDespachos, listDespachosPendientes, crearDespachoDesdeFactura, crearDespachoDesdePedido, listConfirmaciones } from '@/shared/api/despachos'
import { getFacturacionConfig } from '@/shared/api/config'
import type { DespachoStatus, SolicitudConfirmacionDespachoStatus } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Select, SelectItem } from '@/components/ui/select'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { DESPACHO_STATUS_BADGE, DESPACHO_STATUS_LABEL } from './lib'

const PAGE_SIZE = 20

export default function DespachosListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // /despachos/pendientes y /despachos/confirmaciones son rutas reales (registradas antes de
  // /despachos/:id en App.tsx) que abren esta misma pantalla directo en la pestaña
  // correspondiente — antes /despachos/pendientes caía en /despachos/:id con id="pendientes" y
  // renderizaba el detalle equivocado.
  const [tab, setTab] = useState<'despachos' | 'pendientes' | 'confirmaciones'>(
    location.pathname === '/despachos/pendientes'
      ? 'pendientes'
      : location.pathname === '/despachos/confirmaciones'
        ? 'confirmaciones'
        : 'despachos',
  )
  const puedeCrear = usePuede('despachos.crear')

  function selectTab(next: 'despachos' | 'pendientes' | 'confirmaciones') {
    setTab(next)
    navigate(
      next === 'pendientes' ? '/despachos/pendientes' : next === 'confirmaciones' ? '/despachos/confirmaciones' : '/despachos',
      { replace: true },
    )
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Despachos</>}
        description="Salida física de mercancía — separada de la factura cuando el despacho está activo."
        action={
          puedeCrear ? (
            <button className="btn btn-navy" onClick={() => navigate('/despachos/nuevo')}>
              <Plus size={16} /> Nuevo despacho
            </button>
          ) : undefined
        }
      />

      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn${tab === 'despachos' ? ' on' : ''}`} onClick={() => selectTab('despachos')}>
          Despachos
        </button>
        <button className={`tab-btn${tab === 'pendientes' ? ' on' : ''}`} onClick={() => selectTab('pendientes')}>
          Pendientes de despachar
        </button>
        <button className={`tab-btn${tab === 'confirmaciones' ? ' on' : ''}`} onClick={() => selectTab('confirmaciones')}>
          Confirmaciones de Pedido
        </button>
      </div>

      {tab === 'despachos' ? <DespachosTable /> : tab === 'pendientes' ? <PendientesTable /> : <ConfirmacionesTable />}
    </div>
  )
}

function DespachosTable() {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState('')
  const [status, setStatus] = useState<DespachoStatus | 'all'>('all')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['despachos', { customer, status, fechaDesde, fechaHasta, orderBy, offset }],
    queryFn: () => listDespachos({
      customer: customer || undefined,
      status,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      orderBy: orderBy || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Cliente">
                <input className="ff-input filter-select" placeholder="ID del cliente" value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(1) }} />
              </FilterField>
              <FilterField label="Estado">
                <Select value={status} onValueChange={(v) => { setStatus(v as DespachoStatus | 'all'); setPage(1) }} clearable={false}>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="submitted">Sometido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Desde">
                <DatePicker className="ff-input" value={fechaDesde} onChange={(v) => { setFechaDesde(v); setPage(1) }} clearable />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="ff-input" value={fechaHasta} onChange={(v) => { setFechaHasta(v); setPage(1) }} clearable />
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
                <SortableTh label="ID" sortKey="id" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
                <th>Origen</th>
                <th>Sucursal</th>
                <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>)}</tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            <p className="empty-title">Sin despachos</p>
                            <p className="empty-sub">Creá uno desde una factura, un pedido, o directo (venta mostrador).</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((d) => (
                      <tr key={d.id} className="data-table-row-link" onClick={() => navigate(`/despachos/${d.id}`)}>
                        <td>{d.id}</td>
                        <td>{d.customerName}</td>
                        <td className="td-muted">{formatDate(d.postingDate)}</td>
                        <td className="td-muted">{d.salesInvoice ?? d.salesOrder ?? '—'}</td>
                        <td className="td-muted">{d.branch ?? '—'}</td>
                        <td><span className={`badge ${DESPACHO_STATUS_BADGE[d.status]}`}>{DESPACHO_STATUS_LABEL[d.status]}</span></td>
                      </tr>
                    ))}
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
    </>
  )
}

// Cola de trabajo: líneas sueltas de todo lo pendiente de despachar, con acción directa "Despachar"
// que dispara desde-factura/desde-pedido según `origen` — el operador nunca busca el documento a mano.
function PendientesTable() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeCrear = usePuede('despachos.crear')
  const [searchParams] = useSearchParams()
  const [customer, setCustomer] = useState('')
  // Prellenado desde ?itemCode=... — atajo usado por el detalle de artículo (docs/tasks/
  // 76_disponibilidad_stock_detalle_item.md) para llevar directo a los pendientes de ESE artículo.
  const [itemCode, setItemCode] = useState(() => searchParams.get('itemCode') ?? '')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['despachos-pendientes', { customer, itemCode, offset }],
    queryFn: () => listDespachosPendientes({
      customer: customer || undefined,
      itemCode: itemCode || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  // docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md §5.2 — aviso informativo (no bloqueante): con
  // el switch apagado, una venta a futuro no reserva stock en firme, así que este pendiente puede
  // perder el stock frente a otro cliente antes de despacharse. Se lee una sola vez por pantalla,
  // no por despacho individual.
  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const stockNoReservado = facturacionConfig?.despachoFuturoBloqueaVenta === false

  const crearMutation = useMutation({
    mutationFn: (linea: { origen: 'factura' | 'pedido'; documentoId: string }) =>
      linea.origen === 'factura' ? crearDespachoDesdeFactura(linea.documentoId) : crearDespachoDesdePedido(linea.documentoId),
    onSuccess: (despacho) => {
      toast.success(`Despacho ${despacho.id} creado — revisa y somete`)
      queryClient.invalidateQueries({ queryKey: ['despachos-pendientes'] })
      navigate(`/despachos/${despacho.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el despacho'),
  })

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      {stockNoReservado && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          Este stock no está reservado — otro cliente podría comprarlo antes de que se despache (el
          despacho a futuro no bloquea venta en esta empresa).
        </div>
      )}

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Cliente">
                <input className="ff-input filter-select" placeholder="ID del cliente" value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(1) }} />
              </FilterField>
              <FilterField label="Artículo">
                <input className="ff-input filter-select" placeholder="Código del artículo" value={itemCode} onChange={(e) => { setItemCode(e.target.value); setPage(1) }} />
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
                <th>Origen</th>
                <th>Documento</th>
                <th>Cliente</th>
                <th>Artículo</th>
                <th>Almacén</th>
                <th style={{ textAlign: 'right' }}>Pendiente</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>)}</tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty-state">
                            <span className="empty-icon"><Truck size={20} /></span>
                            <p className="empty-title">Nada pendiente de despachar</p>
                            <p className="empty-sub">Todas las facturas y pedidos ya se despacharon por completo.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((l, i) => (
                      <tr key={`${l.documentoId}-${l.itemCode}-${i}`}>
                        <td><span className="badge badge-neutral">{l.origen === 'factura' ? 'Factura' : 'Pedido'}</span></td>
                        <td>{l.documentoId}</td>
                        <td>{l.customerName}</td>
                        <td>{l.itemName}{l.itemCode ? ` (${l.itemCode})` : ''}</td>
                        <td className="td-muted">{l.warehouse ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.qtyPendiente}</td>
                        <td style={{ textAlign: 'right' }}>
                          {puedeCrear && (
                            <button
                              className="btn btn-secondary btn-size-sm"
                              disabled={crearMutation.isPending}
                              onClick={() => crearMutation.mutate({ origen: l.origen, documentoId: l.documentoId })}
                            >
                              Despachar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
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

      <p className="ff-hint" style={{ marginTop: 8 }}>
        Si un pedido ya tiene factura, la línea de la factura es la que representa el pendiente exacto — la
        del pedido puede seguir apareciendo si todavía tiene algo sin facturar. No es un duplicado.
      </p>
    </>
  )
}

const CONFIRMACION_STATUS_BADGE: Record<SolicitudConfirmacionDespachoStatus, string> = {
  Pendiente: 'badge-warning',
  Confirmado: 'badge-success',
  Cancelado: 'badge-neutral',
}

function ConfirmacionesTable() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Prellenado desde ?search=... — atajo usado por el detalle de Pedido (docs/tasks/
  // 79_confirmacion_despacho_pedido.md §4.1) para llevar directo a la solicitud de ESE pedido.
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [status, setStatus] = useState<SolicitudConfirmacionDespachoStatus>('Pendiente')
  const [customer, setCustomer] = useState('')
  const [branch, setBranch] = useState('')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['despachos-confirmaciones', { search, status, customer, branch, offset }],
    queryFn: () => listConfirmaciones({
      search: search || undefined,
      status,
      customer: customer || undefined,
      branch: branch || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Estado">
                <Select value={status} onValueChange={(v) => { setStatus(v as SolicitudConfirmacionDespachoStatus); setPage(1) }} clearable={false}>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="Confirmado">Confirmado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Pedido / Cliente">
                <input className="ff-input filter-select" placeholder="SO-... o texto libre" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
              </FilterField>
              <FilterField label="Cliente (ID)">
                <input className="ff-input filter-select" placeholder="ID del cliente" value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(1) }} />
              </FilterField>
              <FilterField label="Sucursal">
                <input className="ff-input filter-select" placeholder="Sucursal" value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1) }} />
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
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Sucursal</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>)}</tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="empty-state">
                            <span className="empty-icon"><ClipboardCheck size={20} /></span>
                            <p className="empty-title">Nada pendiente de confirmar</p>
                            <p className="empty-sub">Los pedidos que requieren confirmación de despacho aparecen acá al crearse.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((s) => (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/despachos/confirmaciones/${s.id}`)}>
                        <td>{s.salesOrder}</td>
                        <td>{s.customerName}</td>
                        <td className="td-muted">{s.branch ?? '—'}</td>
                        <td><span className={`badge ${CONFIRMACION_STATUS_BADGE[s.status]}`}>{s.status}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-secondary btn-size-sm" onClick={(e) => { e.stopPropagation(); navigate(`/despachos/confirmaciones/${s.id}`) }}>
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
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
    </>
  )
}
