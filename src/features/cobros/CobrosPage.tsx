import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listCobros } from '@/shared/api/cobros'
import type { ListCobrosParams } from '@/shared/api/cobros'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, Search } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

// ─── Badges ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Submitted: 'badge-submitted',
  Cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Cancelled: 'Cancelado',
}

type StatusFilter = 'Draft' | 'Submitted' | 'Cancelled' | 'all'

// ─────────────────────────────────────────────────────────────────────────────

export default function CobrosPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { orderBy, sort } = useSortState()

  const params: ListCobrosParams = {
    customer: search || undefined,
    status: status === 'all' ? undefined : status,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['cobros', params],
    queryFn: () => listCobros(params),
  })

  const cobros = data?.items ?? []

  return (
    <div className="page-container">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cobros</h1>
          <p className="page-sub">Historial de pagos recibidos de clientes</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cobros/pago')}>
          <Plus size={16} />
          Registrar Cobro
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por cliente…"
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
            <option value="Draft">Borrador</option>
            <option value="Submitted">Sometido</option>
            <option value="Cancelled">Cancelado</option>
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

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="ID" sortKey="id" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
                <th>Método de Pago</th>
                <th>Tipo</th>
                <SortableTh label="Monto" sortKey="paidAmount" orderBy={orderBy} onSort={sort} align="right" />
                <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}>
                          <span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : cobros.length === 0
                ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        No se encontraron cobros
                      </td>
                    </tr>
                  )
                : cobros.map((cobro) => (
                    <tr
                      key={cobro.id}
                      className="data-table-row-link"
                      onClick={() => navigate(cobro.isPosSale ? `/facturas/${cobro.id}` : `/cobros/${cobro.id}`)}
                    >
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                          {cobro.id}
                        </span>
                      </td>
                      <td>{cobro.customerName}</td>
                      <td>{formatDate(cobro.postingDate)}</td>
                      <td>{cobro.modeOfPayment}</td>
                      <td>
                        {cobro.isPosSale ? (
                          <span className="badge badge-submitted" style={{ background: 'var(--color-info-bg, #e0f2fe)', color: 'var(--color-info-text, #0369a1)', border: '1px solid var(--color-info-border, #bae6fd)' }}>
                            Venta al contado
                          </span>
                        ) : (
                          <span className="badge badge-draft" style={{ background: 'var(--color-neutral-bg, #f5f5f5)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                            Cobro factura
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(cobro.paidAmount)}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[cobro.status] ?? 'badge-draft'}`}>
                          {STATUS_LABEL[cobro.status] ?? cobro.status}
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
              {cobros.length} de {data.meta.total} cobros
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
