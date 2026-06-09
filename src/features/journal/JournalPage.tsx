import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listJournalEntries } from '@/shared/api/journal-entry'
import { formatDate, formatDOP } from '@/lib/formatters'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Plus, Search, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { useDebounce } from '@/lib/useDebounce'

const PAGE_SIZE = 25

export default function JournalPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['journal-entries', { search: debouncedSearch, offset }],
    queryFn: () => listJournalEntries({
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Asientos Contables</h1>
          {data && <p className="page-sub">{data.meta.total} asientos en total</p>}
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/asientos/nuevo')}>
          <Plus size={16} />
          Nuevo Asiento
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por ID o descripción…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th style={{ textAlign: 'right' }}>Total Débitos</th>
              <th style={{ textAlign: 'right' }}>Total Créditos</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : isError
                ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar los asientos
                      </td>
                    </tr>
                  )
                : data?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty-state">
                            <div className="empty-icon"><BookOpen size={28} /></div>
                            <p className="empty-title">Sin asientos contables</p>
                            <p className="empty-sub">Crea tu primer asiento de diario</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : data?.items.map((entry) => (
                      <tr
                        key={entry.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/asientos/${encodeURIComponent(entry.id)}`)}
                      >
                        <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500 }}>{entry.id}</td>
                        <td className="td-muted">{formatDate(entry.postingDate)}</td>
                        <td className="td-muted">{entry.voucherType ?? '—'}</td>
                        <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.remarks ?? '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatDOP(entry.totalDebit)}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatDOP(entry.totalCredit)}
                        </td>
                        <td>
                          <StatusBadge status={entry.status} />
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
            <button
              className="btn btn-ghost btn-size-sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button
              className="btn btn-ghost btn-size-sm"
              disabled={!data.meta.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
