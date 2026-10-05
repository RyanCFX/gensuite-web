import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listJournalEntries } from '@/shared/api/journal-entry'
import { formatDate, formatDOP } from '@/lib/formatters'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Plus, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { usePuede } from '@/shared/permissions/can'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { SearchInput } from '@/shared/ui/SearchInput'

const PAGE_SIZE = 25

const COLUMNS = [
  { key: 'id', width: 120 },
  { key: 'fecha', width: 100 },
  { key: 'tipo', width: 110 },
  { key: 'descripcion', width: 220 },
  { key: 'totalDebitos', width: 120 },
  { key: 'totalCreditos', width: 120 },
  { key: 'estado', width: 100 },
]

export default function JournalPage() {
  const puedeCrear = usePuede('contabilidad.asientos.crear')
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const { orderBy, sort } = useSortState()
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const debouncedSearch = search
  const offset = (page - 1) * PAGE_SIZE





  const { data, isLoading, isError } = useQuery({
    queryKey: ['journal-entries', { search: debouncedSearch, offset, orderBy, branch, department }],
    queryFn: () => listJournalEntries({
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset,
      orderBy: orderBy || undefined,
      branch: branch || undefined,
      department: department || undefined,
    }),
  })


  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Asientos Contables</h1>
          {data && <p className="page-sub">{data.meta.total} asientos en total</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          {puedeCrear && (
            <button className="btn btn-navy" onClick={() => navigate('/asientos/nuevo')}>
              <Plus size={16} />
              Nuevo Asiento
            </button>
          )}
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <SearchInput placeholder="Buscar por ID o descripción…" value={search} onChange={(v) => {
    setSearch(v)
    setPage(1)
  }} />
              <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }} recurso="sucursales" value={branch} onChange={(val) => { setBranch(val); setPage(1) }} placeholder="Todas las sucursales" />
              <OpcionesSelect hideOnForbidden filterLabel="Departamento" filterStyle={{ width: 200 }} recurso="departamentos" value={department} onChange={(val) => { setDepartment(val); setPage(1) }} placeholder="Todos los departamentos" />
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
              <SortableTh
                label="ID"
                sortKey="id"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('id')} />}
              />
              <SortableTh
                label="Fecha"
                sortKey="postingDate"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('fecha')} />}
              />
              <th>
                Tipo
                <span className="col-resize-handle" onMouseDown={startResize('tipo')} />
              </th>
              <th>
                Descripción
                <span className="col-resize-handle" onMouseDown={startResize('descripcion')} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Total Débitos
                <span className="col-resize-handle" onMouseDown={startResize('totalDebitos')} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Total Créditos
                <span className="col-resize-handle" onMouseDown={startResize('totalCreditos')} />
              </th>
              <th>
                Estado
                <span className="col-resize-handle" onMouseDown={startResize('estado')} />
              </th>
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
                        <td style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500 }}>{entry.id}</td>
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
