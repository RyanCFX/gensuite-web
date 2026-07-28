import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listDevoluciones } from '@/shared/api/devoluciones'
import { listSucursales } from '@/shared/api/sucursales'
import { listDepartamentos } from '@/shared/api/departamentos'
import { useDebounce } from '@/lib/useDebounce'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { formatDate, formatDOP } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const PAGE_SIZE = 20

// El shape real de la API (igual que /credit-notes) usa `returnAgainst`, no `originalInvoice`
// como dice el tipo genérico `DevolucionListItem` — ver el mismo comentario en CreditNotesPage.tsx.
interface DevolucionRow {
  id: string
  returnAgainst: string
  customerName?: string
  postingDate?: string
  grandTotal?: number
  status: string
  /** Solo viene presente tras someter la nota — en Draft llega vacío/undefined */
  ncf?: string
  /** NCF de la factura original devuelta — distinto de `ncf`, que es el propio de la nota */
  ncfAfectado?: string | null
}

// El backend devuelve el status en minúscula. Una vez Sometida, `status` deja de ser "submitted"
// y pasa a ser el resumen de uso (available/partially_used/fully_used) — mismo patrón que Notas de Crédito.
const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
  available: 'badge-success',
  partially_used: 'badge-warning',
  fully_used: 'badge-neutral',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
  available: 'Disponible',
  partially_used: 'Parcialmente usada',
  fully_used: 'Agotada',
}

export default function DevolucionesPage() {
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['devoluciones', { search: debouncedSearch, offset, orderBy, branch, department }],
    queryFn: () =>
      listDevoluciones({
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
          <h1 className="page-title">Devoluciones</h1>
          {data && <p className="page-sub">{data.meta.total} devoluciones en total</p>}
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por cliente, NCF…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <select className="filter-select" value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1) }}>
            <option value="">Todas las sucursales</option>
            {sucursales?.items.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="filter-select" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1) }}>
            <option value="">Todos los departamentos</option>
            {departamentos?.items.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <th>NCF</th>
              <th>NCF Afectado</th>
              <th>Factura Original</th>
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} align="right" />
              <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                  Error al cargar las devoluciones
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-title">Sin devoluciones</div>
                    <p className="empty-sub">Las devoluciones se crean desde el detalle de una factura sometida.</p>
                  </div>
                </td>
              </tr>
            ) : (
              (data?.items as unknown as DevolucionRow[] | undefined)?.map((devolucion) => {
                const statusLower = (devolucion.status ?? '').toLowerCase()
                return (
                  <tr
                    key={devolucion.id}
                    className="table-row-clickable"
                    onClick={() => navigate(`/devoluciones/${devolucion.id}`)}
                  >
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {devolucion.id}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {devolucion.ncf ?? <span className="td-dim">Pendiente</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {devolucion.ncfAfectado ?? <span className="td-dim">—</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{devolucion.returnAgainst}</td>
                    <td>{devolucion.customerName ?? '—'}</td>
                    <td>{formatDate(devolucion.postingDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(Math.abs(devolucion.grandTotal ?? 0))}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[statusLower] ?? 'badge-neutral'}`}>
                        {STATUS_LABEL[statusLower] ?? devolucion.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
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
              className="btn btn-ghost btn-size-icon-sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button
              className="btn btn-ghost btn-size-icon-sm"
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
