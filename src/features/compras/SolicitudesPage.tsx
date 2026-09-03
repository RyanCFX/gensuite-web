import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listSolicitudesCompra } from '@/shared/api/solicitudes-compra'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/shared/ui/Badge'
import { formatDate } from '@/lib/formatters'
import { Plus, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'

const PAGE_SIZE = 20

function PerOrderedBadge({ perOrdered }: { perOrdered: number }) {
  if (perOrdered >= 100) return <Badge variant="success">100% ordenado</Badge>
  if (perOrdered <= 0) return <Badge variant="neutral">Sin ordenar</Badge>
  return <Badge variant="warning">{Math.round(perOrdered)}% ordenado</Badge>
}

export default function SolicitudesPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<string>('all')
  const [orderingStatus, setOrderingStatus] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['solicitudes-compra', { status, orderingStatus, fromDate, toDate, offset, orderBy }],
    queryFn: () =>
      listSolicitudesCompra({
        status: status !== 'all' ? (status as 'draft' | 'submitted' | 'cancelled') : undefined,
        orderingStatus: orderingStatus !== 'all' ? (orderingStatus as 'pending' | 'partial' | 'ordered') : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        orderBy: orderBy || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Solicitudes de Compra"
        description="Pedidos internos de intención — sin proveedor ni precio obligatorios. Se generan órdenes de compra a partir de ellas."
        action={
          <button className="btn btn-primary" onClick={() => navigate('/compras/solicitudes/nueva')}>
            <Plus size={16} />
            Nueva Solicitud
          </button>
        }
      />

      <div>
        <div className="filter-bar">
          <div className="filter-bar-left">
            <FilterField label="Estado">
              <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1) }}>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="submitted">Sometida</SelectItem>
                <SelectItem value="cancelled">Anulada</SelectItem>
              </Select>
            </FilterField>
            <FilterField label="Ordenamiento">
              <Select value={orderingStatus} onValueChange={(val) => { setOrderingStatus(val); setPage(1) }}>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Sin ordenar</SelectItem>
                <SelectItem value="partial">Parcialmente ordenadas</SelectItem>
                <SelectItem value="ordered">Completamente ordenadas</SelectItem>
              </Select>
            </FilterField>
            <FilterField label="Desde">
              <DatePicker className="filter-select" value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
            </FilterField>
            <FilterField label="Hasta">
              <DatePicker className="filter-select" value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
            </FilterField>
          </div>
        </div>

        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Fecha" sortKey="transactionDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Fecha Necesaria</th>
                  <th>Artículos</th>
                  <th>Estado</th>
                  <th>Ordenamiento</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar las solicitudes
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={7}>
                              <div className="empty-state">
                                <div className="empty-icon">
                                  <ClipboardList size={20} />
                                </div>
                                <p className="empty-title">Sin solicitudes</p>
                                <p className="empty-sub">No hay solicitudes de compra registradas.</p>
                                <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/compras/solicitudes/nueva')}>
                                  <Plus size={14} />Nueva Solicitud
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((s) => (
                          <tr key={s.id} className="table-row-clickable" onClick={() => navigate(`/compras/solicitudes/${s.id}`)}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.id}</td>
                            <td>{formatDate(s.transactionDate)}</td>
                            <td className="td-muted">{formatDate(s.scheduleDate)}</td>
                            <td className="td-muted">{s.items.length}</td>
                            <td><StatusBadge status={s.erpStatus} /></td>
                            <td><PerOrderedBadge perOrdered={s.perOrdered} /></td>
                            <td>
                              <button
                                className="btn btn-ghost btn-size-xs"
                                onClick={(e) => { e.stopPropagation(); navigate(`/compras/solicitudes/${s.id}`) }}
                              >
                                Ver
                              </button>
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>

          {data && data.meta.total > PAGE_SIZE && (
            <div className="pagination">
              <span className="pagination-info">
                Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
              </span>
              <div className="pagination-controls">
                <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                  {page} / {totalPages}
                </span>
                <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
