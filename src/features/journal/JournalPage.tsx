import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listJournalEntries } from '@/shared/api/journal-entry'
import { listSucursales } from '@/shared/api/sucursales'
import { listDepartamentos } from '@/shared/api/departamentos'
import { formatDate, formatDOP } from '@/lib/formatters'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Plus, Search, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { useDebounce } from '@/lib/useDebounce'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { FilterField } from '@/shared/ui/FilterField'

const PAGE_SIZE = 25

export default function JournalPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })

  const { data: departamentos } = useQuery({
    queryKey: ['departamentos-all'],
    queryFn: () => listDepartamentos({ limit: 100 }),
  })

  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = (sucursales?.items ?? [])
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.id, label: s.name }))

  const [departmentSearch, setDepartmentSearch] = useState('')
  const departmentOptions: SearchSelectOption[] = (departamentos?.items ?? [])
    .filter((d) => !departmentSearch || d.name.toLowerCase().includes(departmentSearch.toLowerCase()))
    .map((d) => ({ value: d.id, label: d.name }))

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
          <FilterField label="Sucursal" style={{ width: 200 }}>
            <SearchSelect
              value={branch}
              onChange={(val) => { setBranch(val); setPage(1) }}
              options={branchOptions}
              onSearch={setBranchSearch}
              selectedLabel={sucursales?.items.find((s) => s.id === branch)?.name ?? ''}
              placeholder="Todas las sucursales"
            />
          </FilterField>
          <FilterField label="Departamento" style={{ width: 200 }}>
            <SearchSelect
              value={department}
              onChange={(val) => { setDepartment(val); setPage(1) }}
              options={departmentOptions}
              onSearch={setDepartmentSearch}
              selectedLabel={departamentos?.items.find((d) => d.id === department)?.name ?? ''}
              placeholder="Todos los departamentos"
            />
          </FilterField>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="ID" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
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
