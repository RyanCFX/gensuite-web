import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listPagos } from '@/shared/api/pagos'
import type { ListPagosParams } from '@/shared/api/pagos'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, Search } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

type StatusFilter = 'draft' | 'submitted' | 'cancelled' | 'all'

export default function PagosPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { orderBy, sort } = useSortState()

  const params: ListPagosParams = {
    supplier: search || undefined,
    status: status === 'all' ? undefined : status,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['pagos', params],
    queryFn: () => listPagos(params),
  })

  const pagos = data?.items ?? []

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pagos a Proveedores</h1>
          <p className="page-sub">Historial de pagos registrados a proveedores</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/pagos/nuevo')}>
          <Plus size={16} />
          Registrar Pago
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por proveedor…"
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
            <option value="cancelled">Cancelado</option>
          </select>

          <input
            type="date"
            className="filter-select"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            title="Desde"
          />
          <input
            type="date"
            className="filter-select"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            title="Hasta"
          />
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="ID" sortKey="id" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Proveedor" sortKey="supplierName" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
                <th>Método de Pago</th>
                <SortableTh label="Monto" sortKey="paidAmount" orderBy={orderBy} onSort={sort} align="right" />
                <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}>
                          <span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : pagos.length === 0
                ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        No se encontraron pagos
                      </td>
                    </tr>
                  )
                : pagos.map((pago) => (
                    <tr
                      key={pago.id}
                      className="data-table-row-link"
                      onClick={() => navigate(`/pagos/${pago.id}`)}
                    >
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                          {pago.id}
                        </span>
                      </td>
                      <td>{pago.supplierName}</td>
                      <td>{formatDate(pago.postingDate)}</td>
                      <td>{pago.modeOfPayment}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(pago.paidAmount)}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[pago.status] ?? 'badge-draft'}`}>
                          {STATUS_LABEL[pago.status] ?? pago.status}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && data?.meta && (
          <div className="table-footer">
            <span className="table-footer-count">
              {pagos.length} de {data.meta.total} pagos
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
