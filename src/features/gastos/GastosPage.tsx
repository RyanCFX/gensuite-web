import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listGastos, getGastoResumen } from '@/shared/api/compras-gastos'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { CATEGORIA_GASTO } from '@/lib/constants'
import { Plus, ChevronLeft, ChevronRight, Search, Receipt } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const PAGE_SIZE = 20

interface GastoResumen {
  totalDeducible?: number
  totalNoDeducible?: number
  total?: number
}

export default function GastosPage() {
  const navigate = useNavigate()

  const currentMonth = new Date().toISOString().substring(0, 7)
  const [month] = useState(currentMonth)
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [categoriaGasto, setCategoriaGasto] = useState<string>('all')
  const [esDeducible, setEsDeducible] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const offset = (page - 1) * PAGE_SIZE

  const { data: resumen, isLoading: resumenLoading } = useQuery({
    queryKey: ['gastos-resumen', month],
    queryFn: () => getGastoResumen(month),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gastos', { supplier, status, categoriaGasto, esDeducible, fromDate, toDate, offset, orderBy }],
    queryFn: () =>
      listGastos({
        supplier: supplier || undefined,
        status: status !== 'all' ? status : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        orderBy: orderBy || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1
  const resumenTyped = resumen as GastoResumen | undefined

  return (
    <div className="page-container">
      <PageHeader
        title="Gastos"
        description="Registro de gastos sin movimiento de inventario"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/gastos/nuevo')}>
            <Plus size={16} />
            Nuevo Gasto
          </button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Resumen del mes */}
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-card-top">
              <div>
                <p className="stat-label">Gastos Deducibles</p>
                {resumenLoading
                  ? <span className="skeleton-box" style={{ height: 28, width: 120, display: 'block' }} />
                  : <p className="stat-value">{formatDOP(resumenTyped?.totalDeducible ?? 0)}</p>
                }
              </div>
              <div className="stat-icon-badge" style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}>
                <Receipt size={16} />
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-top">
              <div>
                <p className="stat-label">Gastos No Deducibles</p>
                {resumenLoading
                  ? <span className="skeleton-box" style={{ height: 28, width: 120, display: 'block' }} />
                  : <p className="stat-value">{formatDOP(resumenTyped?.totalNoDeducible ?? 0)}</p>
                }
              </div>
              <div className="stat-icon-badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>
                <Receipt size={16} />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input-wrap">
              <Search size={14} className="search-input-icon" />
              <input
                className="search-input"
                placeholder="Buscar proveedor…"
                value={supplier}
                onChange={(e) => { setSupplier(e.target.value); setPage(1) }}
              />
            </div>
            <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              <option value="all">Todos</option>
              <option value="Draft">Borrador</option>
              <option value="Submitted">Sometido</option>
              <option value="Cancelled">Anulado</option>
            </select>
            <select className="filter-select" value={categoriaGasto} onChange={(e) => { setCategoriaGasto(e.target.value); setPage(1) }}>
              <option value="all">Todas las categorías</option>
              {CATEGORIA_GASTO.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select className="filter-select" value={esDeducible} onChange={(e) => { setEsDeducible(e.target.value); setPage(1) }}>
              <option value="all">Deducible: Todos</option>
              <option value="true">Deducibles</option>
              <option value="false">No deducibles</option>
            </select>
            <input type="date" className="filter-select" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1) }} />
            <input type="date" className="filter-select" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1) }} />
          </div>
        </div>

        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Proveedor" sortKey="supplierName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>NCF</th>
                  <th>Categoría</th>
                  <th>Deducible</th>
                  <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} align="right" />
                  <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar los gastos
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="empty-state">
                                <div className="empty-icon"><Plus size={20} /></div>
                                <p className="empty-title">Sin gastos</p>
                                <p className="empty-sub">No hay gastos registrados.</p>
                                <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/gastos/nuevo')}>
                                  <Plus size={14} />Nuevo Gasto
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((g) => (
                          <tr key={g.id} className="table-row-clickable" onClick={() => navigate(`/gastos/${g.id}`)}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{g.id}</td>
                            <td style={{ fontWeight: 500 }}>{g.supplierName}</td>
                            <td>{formatDate(g.postingDate)}</td>
                            <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{g.ncfProveedor ?? '—'}</td>
                            <td className="td-muted">{g.categoriaGasto ?? '—'}</td>
                            <td>
                              {g.esDeducible
                                ? <span className="badge badge-success">Sí</span>
                                : <span className="badge badge-default">No</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(g.grandTotal)}</td>
                            <td><StatusBadge status={g.status} /></td>
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
