// Viajes de delivery — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §4.2 (`delivery.viajes.listar`).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Route } from 'lucide-react'
import { listViajes } from '@/shared/api/delivery'
import { usePuede } from '@/shared/permissions/can'
import { formatDateTime } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { useDeliveryPuerta, DrenajeAviso } from '@/shared/hooks/useDelivery'
import { ViajeEstadoBadge } from './viajeUi'
import { DeliveryPagination } from './DeliveryPagination'

const COLUMNS = [
  { key: 'id', width: 150 },
  { key: 'repartidor', width: 200 },
  { key: 'vehiculo', width: 120 },
  { key: 'salida', width: 160 },
  { key: 'sucursal', width: 140 },
  { key: 'paradas', width: 90 },
  { key: 'estado', width: 120 },
]

const PAGE_SIZE = 20

export default function ViajesDeliveryPage() {
  const navigate = useNavigate()
  const puerta = useDeliveryPuerta()
  const puedeCrear = usePuede('delivery.viajes.crear') && puerta.operativo

  const [estado, setEstado] = useState('todos')
  const [repartidor, setRepartidor] = useState('')
  const [branch, setBranch] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-viajes', { estado, repartidor, branch, fechaDesde, fechaHasta, offset }],
    queryFn: () => listViajes({
      estado: estado === 'todos' ? undefined : estado,
      repartidor: repartidor || undefined,
      branch: branch || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0

  function filtro<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(1) }
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Viajes de delivery</>}
        description="Rutas de entrega asignadas a repartidores."
        action={
          <>
            <RecargarButton />
            {puedeCrear && (
              <button className="btn btn-navy" onClick={() => navigate('/delivery/viajes/nuevo')}>
                <Plus size={16} /> Nuevo viaje
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
                <Select value={estado} onValueChange={filtro(setEstado)} clearable={false}>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="programado">Programado</SelectItem>
                  <SelectItem value="en_ruta">En ruta</SelectItem>
                  <SelectItem value="completado">Completado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </Select>
              </FilterField>
              <OpcionesSelect hideOnForbidden filterLabel="Repartidor" filterStyle={{ width: 220 }} recurso="repartidores" value={repartidor} onChange={(v) => filtro(setRepartidor)(v)} placeholder="Todos los repartidores" />
              <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }} recurso="sucursales" value={branch} onChange={(v) => filtro(setBranch)(v)} placeholder="Todas las sucursales" />
              <FilterField label="Desde">
                <DatePicker className="ff-input" value={fechaDesde} onChange={filtro(setFechaDesde)} clearable />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="ff-input" value={fechaHasta} onChange={filtro(setFechaHasta)} clearable />
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
                <th>Viaje<span className="col-resize-handle" onMouseDown={startResize('id')} /></th>
                <th>Repartidor<span className="col-resize-handle" onMouseDown={startResize('repartidor')} /></th>
                <th>Vehículo<span className="col-resize-handle" onMouseDown={startResize('vehiculo')} /></th>
                <th>Salida<span className="col-resize-handle" onMouseDown={startResize('salida')} /></th>
                <th>Sucursal<span className="col-resize-handle" onMouseDown={startResize('sucursal')} /></th>
                <th style={{ textAlign: 'right' }}>Paradas<span className="col-resize-handle" onMouseDown={startResize('paradas')} /></th>
                <th>Estado<span className="col-resize-handle" onMouseDown={startResize('estado')} /></th>
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
                            <span className="empty-icon"><Route size={20} /></span>
                            <p className="empty-title">Sin viajes</p>
                            <p className="empty-sub">Crea un viaje desde los pendientes por delivery.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((v) => (
                      <tr key={v.id} className="data-table-row-link" onClick={() => navigate(`/delivery/viajes/${v.id}`)}>
                        <td style={{ fontWeight: 600 }}>{v.id}</td>
                        <td>{v.repartidorNombre ?? v.repartidor ?? '—'}</td>
                        <td className="td-muted">{v.vehiculo ?? '—'}</td>
                        <td className="td-muted">{v.salida ? formatDateTime(v.salida) : '—'}</td>
                        <td className="td-muted">{v.branch ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>{v.paradas?.length ?? '—'}</td>
                        <td><ViajeEstadoBadge estado={v.estado} /></td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeliveryPagination page={page} pageSize={PAGE_SIZE} total={total} hasMore={data?.meta.hasMore} onPage={setPage} />
    </div>
  )
}
