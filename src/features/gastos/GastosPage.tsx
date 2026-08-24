import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listGastos, getGastoResumen } from '@/shared/api/compras-gastos'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { getCatalogosFiscales } from '@/shared/api/config'
import { Plus, ChevronLeft, ChevronRight, Search, Receipt } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'

const PAGE_SIZE = 20

interface GastoResumenResponse {
  month: string
  total: number
  byDeducible: {
    'Deducible'?: number
    'No Deducible'?: number
  }
  count: number
}

function normalizeResumen(raw: unknown): { totalDeducible: number; totalNoDeducible: number; count: number } {
  const resumen = raw as GastoResumenResponse | undefined
  return {
    totalDeducible: resumen?.byDeducible?.['Deducible'] ?? 0,
    totalNoDeducible: resumen?.byDeducible?.['No Deducible'] ?? 0,
    count: resumen?.count ?? 0,
  }
}

export default function GastosPage() {
  const navigate = useNavigate()

  const currentMonth = new Date().toISOString().substring(0, 7)
  const [month] = useState(currentMonth)
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [tipoComprobante, setTipoComprobante] = useState<string>('all')
  const [esDeducible, setEsDeducible] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [ncfProveedor, setNcfProveedor] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const offset = (page - 1) * PAGE_SIZE

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [tipoComprobanteSearch, setTipoComprobanteSearch] = useState('')
  const tipoComprobanteOptions: SearchSelectOption[] = (catalogos?.ncfTypesCompra ?? [])
    .filter((t) => !tipoComprobanteSearch || t.label.toLowerCase().includes(tipoComprobanteSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const { data: resumen, isLoading: resumenLoading } = useQuery({
    queryKey: ['gastos-resumen', month],
    queryFn: () => getGastoResumen(month),
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gastos', { supplier, status, tipoComprobante, esDeducible, fromDate, toDate, ncfProveedor, grandTotalMin, grandTotalMax, offset, orderBy }],
    queryFn: () =>
      listGastos({
        supplier: supplier || undefined,
        status: status !== 'all' ? status : undefined,
        tipoComprobante: tipoComprobante !== 'all' ? tipoComprobante : undefined,
        esDeducible: esDeducible !== 'all' ? esDeducible === 'true' : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        ncfProveedor: ncfProveedor || undefined,
        grandTotalMin: grandTotalMin ? Number(grandTotalMin) : undefined,
        grandTotalMax: grandTotalMax ? Number(grandTotalMax) : undefined,
        orderBy: orderBy || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1
  const resumenTyped = normalizeResumen(resumen)

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
        <p className="td-muted" style={{ fontSize: 12, margin: '-12px 0 0' }}>
          Solo incluye gastos sometidos, no borradores.
        </p>

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
            <FilterField label="Estado">
              <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1) }}>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="submitted">Sometido</SelectItem>
                <SelectItem value="cancelled">Anulado</SelectItem>
              </Select>
            </FilterField>
            <FilterField label="Tipo NCF" style={{ width: 200 }}>
              <SearchSelect
                value={tipoComprobante === 'all' ? '' : tipoComprobante}
                onChange={(val) => { setTipoComprobante(val || 'all'); setPage(1) }}
                options={tipoComprobanteOptions}
                onSearch={setTipoComprobanteSearch}
                selectedLabel={catalogos?.ncfTypesCompra?.find((t) => t.value === tipoComprobante)?.label ?? ''}
                placeholder="Todos los NCF"
              />
            </FilterField>
            <FilterField label="Deducible">
              <Select value={esDeducible} onValueChange={(val) => { setEsDeducible(val); setPage(1) }}>
                <SelectItem value="all">Deducible: Todos</SelectItem>
                <SelectItem value="true">Deducibles</SelectItem>
                <SelectItem value="false">No deducibles</SelectItem>
              </Select>
            </FilterField>
            <FilterField label="Desde">
              <DatePicker className="filter-select" value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
            </FilterField>
            <FilterField label="Hasta">
              <DatePicker className="filter-select" value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
            </FilterField>
            <div className="search-input-wrap">
              <Search size={14} className="search-input-icon" />
              <input
                className="search-input"
                placeholder="Buscar NCF del proveedor…"
                value={ncfProveedor}
                onChange={(e) => { setNcfProveedor(e.target.value); setPage(1) }}
              />
            </div>
            <FilterField label="Total">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  className="ff-input ff-input-sm"
                  style={{ width: 100 }}
                  placeholder="Total min"
                  value={grandTotalMin}
                  onChange={(e) => { setGrandTotalMin(e.target.value); setPage(1) }}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
                <input
                  type="number"
                  className="ff-input ff-input-sm"
                  style={{ width: 100 }}
                  placeholder="Total max"
                  value={grandTotalMax}
                  onChange={(e) => { setGrandTotalMax(e.target.value); setPage(1) }}
                />
              </div>
            </FilterField>
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
                  <th>N° Factura</th>
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
                        {Array.from({ length: 9 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar los gastos
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={9}>
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
                            <td style={{ fontWeight: 500 }}>
                              {g.esProveedorOcasional
                                ? (
                                    <span>
                                      {g.proveedorOcasionalNombre ?? g.supplierName}
                                      {' '}<span className="badge badge-warning">Ocasional</span>
                                    </span>
                                  )
                                : g.supplierName}
                            </td>
                            <td>{formatDate(g.postingDate)}</td>
                            <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{g.ncfProveedor ?? '—'}</td>
                            <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{g.billNo ?? '—'}</td>
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
