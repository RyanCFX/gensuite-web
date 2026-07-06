import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listQuotations } from '@/shared/api/quotations'
import type { ListQuotationsParams } from '@/shared/api/quotations'
import { Plus, Eye, Search, GitBranch } from 'lucide-react'
import { formatDate, formatDOP, displayId } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

type StatusFilter = 'draft' | 'submitted' | 'ordered' | 'lost' | 'cancelled' | 'all'

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Submitted: 'badge-submitted',
  Ordered: 'badge-info',
  Lost: 'badge-warning',
  Cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Ordered: 'Ordenado',
  Lost: 'Perdido',
  Cancelled: 'Cancelado',
}

export default function QuotationsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { orderBy, sort } = useSortState()

  const params: ListQuotationsParams = {
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', params],
    queryFn: () => listQuotations(params),
  })

  const quotations = data?.items ?? []

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cotizaciones</h1>
          <p className="page-sub">Gestiona tus cotizaciones y presupuestos</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cotizaciones/nueva')}>
          <Plus size={16} />
          Nueva Cotización
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="all">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="submitted">Sometido</option>
            <option value="ordered">Ordenado</option>
            <option value="lost">Perdido</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <input
            type="date"
            className="ff-input ff-input-sm"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: 144 }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="date"
            className="ff-input ff-input-sm"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ width: 144 }}
          />
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Fecha" sortKey="date" orderBy={orderBy} onSort={sort} />
              <th>Válida hasta</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              <th style={{ textAlign: 'right', width: 64 }}>Ver</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : quotations.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin cotizaciones</div>
                    <p className="empty-sub">Crea tu primera cotización para comenzar.</p>
                    <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/cotizaciones/nueva')}>
                      <Plus size={14} /> Nueva Cotización
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              quotations.map((q) => {
                const itemTotal = q.items.reduce((s, i) => s + i.amount, 0)
                return (
                  <tr
                    key={q.id}
                    className="table-row-clickable"
                    onClick={() => navigate(`/cotizaciones/${q.id}`)}
                  >
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {q.amendedFrom && <GitBranch size={11} style={{ marginRight: 4, color: 'var(--text-tertiary)', verticalAlign: 'middle' }} />}
                      {displayId(q.id, q.sequence)}
                    </td>
                    <td style={{ fontWeight: 500 }}>{q.customerName}</td>
                    <td>{formatDate(q.date)}</td>
                    <td>{formatDate(q.validTill)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(itemTotal)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[q.status] ?? 'badge-neutral'}`}>
                        {STATUS_LABEL[q.status] ?? q.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        onClick={(e) => { e.stopPropagation(); navigate(`/cotizaciones/${q.id}`) }}
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {quotations.length} de {data.meta.total} cotizaciones
          </span>
        </div>
      )}
    </div>
  )
}
