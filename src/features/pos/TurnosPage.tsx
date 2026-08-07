import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { listTurnos, type ListTurnosParams } from '@/shared/api/pos'
import { formatDateTime, formatDOP } from '@/lib/formatters'
import { useDebounce } from '@/lib/useDebounce'
import { Select, SelectItem } from '@/components/ui/select'

const PAGE_SIZE = 20

const STATUS_BADGE: Record<string, string> = {
  Open: 'badge-success',
  Closed: 'badge-draft',
}
const STATUS_LABEL: Record<string, string> = {
  Open: 'Abierto',
  Closed: 'Cerrado',
}

type StatusFilter = 'Open' | 'Closed' | 'all'

export default function TurnosPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const params: ListTurnosParams = {
    search: debouncedSearch || undefined,
    status: status === 'all' ? undefined : status,
    from: fromDate || undefined,
    to: toDate || undefined,
    offset,
    limit: PAGE_SIZE,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['turnos', params],
    queryFn: () => listTurnos(params),
  })

  const turnos = data?.items ?? []
  const totalPages = data?.meta ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Turnos de Caja</h1>
          <p className="page-sub">
            Historial de turnos de caja (POS)
            {data?.meta ? ` — ${data.meta.total} turno(s)` : ''}
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por cajero…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <Select value={status} onValueChange={(val) => { setStatus(val as StatusFilter); setPage(1) }}>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="Open">Abiertos</SelectItem>
            <SelectItem value="Closed">Cerrados</SelectItem>
          </Select>
          <input
            type="date"
            className="filter-select"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            title="Desde"
          />
          <input
            type="date"
            className="filter-select"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            title="Hasta"
          />
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cajero</th>
                <th>Perfil POS</th>
                <th>Compañía</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Total</th>
                <th>Diferencia</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : turnos.length === 0
                  ? (
                      <tr>
                        <td colSpan={9}>
                          <div className="empty-state">
                            <p className="empty-title">Sin turnos</p>
                            <p className="empty-sub">No se encontraron turnos de caja con los filtros actuales.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : turnos.map((t) => (
                      <tr
                        key={t.id}
                        className="data-table-row-link"
                        onClick={() => navigate(`/turnos/${t.id}`)}
                      >
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                          {t.id}
                        </td>
                        <td>{t.cajero}</td>
                        <td className="td-muted">{t.posProfile}</td>
                        <td className="td-muted">{t.company}</td>
                        <td className="td-muted">{formatDateTime(t.periodStartDate)}</td>
                        <td className="td-muted">{t.periodEndDate ? formatDateTime(t.periodEndDate) : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                          {t.grandTotal != null ? formatDOP(t.grandTotal) : '—'}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 600,
                            color:
                              t.totalDifference != null
                                ? t.totalDifference < 0
                                  ? 'var(--error-text)'
                                  : t.totalDifference > 0
                                    ? 'var(--warning-text)'
                                    : 'var(--text-secondary)'
                                : 'var(--text-tertiary)',
                          }}
                        >
                          {t.totalDifference != null
                            ? `${t.totalDifference > 0 ? '+' : ''}${formatDOP(t.totalDifference)}`
                            : '—'}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[t.status] ?? 'badge-draft'}`}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {data?.meta && data.meta.total > PAGE_SIZE && (
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
  )
}
