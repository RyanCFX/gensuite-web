import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listCompras } from '@/shared/api/compras-gastos'
import { listSucursales } from '@/shared/api/sucursales'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'

const PAGE_SIZE = 20

export default function ComprasPage() {
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
  const [ncf, setNcf] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const [page, setPage] = useState(1)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  const offset = (page - 1) * PAGE_SIZE

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const sucursales = sucursalesData?.items ?? []

  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = sucursales
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['compras', { supplier, status, fromDate, toDate, branch, ncf, grandTotalMin, grandTotalMax, offset, orderBy }],
    queryFn: () =>
      listCompras({
        supplier: supplier || undefined,
        status: status !== 'all' ? status : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        branch: branch || undefined,
        ncf: ncf || undefined,
        grandTotalMin: grandTotalMin ? Number(grandTotalMin) : undefined,
        grandTotalMax: grandTotalMax ? Number(grandTotalMax) : undefined,
        orderBy: orderBy || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  const activeMoreFiltersCount = [fromDate, toDate, ncf, grandTotalMin, grandTotalMax].filter((v) => v !== '').length

  function clearMoreFilters() {
    setFromDate('')
    setToDate('')
    setNcf('')
    setGrandTotalMin('')
    setGrandTotalMax('')
    setPage(1)
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Compras</>}
        description="Registro de compras con actualización de inventario"
        action={
          <>
            <RecargarButton />
            <button className="btn btn-navy" onClick={() => navigate('/compras/nueva')}>
              <Plus size={16} />
              Nueva Compra
            </button>
          </>
        }
      />

      <div>
        <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="filter-bar" style={{ margin: 0 }}>
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
                  <Select
                    value={status}
                    onValueChange={(val) => { setStatus(val); setPage(1) }}
                  >
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Draft">Borrador</SelectItem>
                    <SelectItem value="Submitted">Sometido</SelectItem>
                    <SelectItem value="Cancelled">Anulado</SelectItem>
                  </Select>
                </FilterField>
                <FilterField label="Sucursal" style={{ width: 200 }}>
                  <SearchSelect
                    value={branch}
                    onChange={(val) => { setBranch(val); setPage(1) }}
                    options={branchOptions}
                    onSearch={setBranchSearch}
                    selectedLabel={branch}
                    placeholder="Todas las sucursales"
                  />
                </FilterField>

                <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setMoreFiltersOpen(true)}>
                  <SlidersHorizontal size={13} />
                  Más filtros
                  {activeMoreFiltersCount > 0 && (
                    <span className="badge badge-brand" style={{ marginLeft: 2 }}>{activeMoreFiltersCount}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card navy-table-card">
          <div className="table-scroll">
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Proveedor" sortKey="supplierName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>NCF Proveedor</th>
                  <th>N° Factura</th>
                  <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} align="right" />
                  <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Acciones</th>
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
                            Error al cargar las compras
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="empty-state">
                                <div className="empty-icon">
                                  <Plus size={20} />
                                </div>
                                <p className="empty-title">Sin compras</p>
                                <p className="empty-sub">No hay compras registradas.</p>
                                <button className="btn btn-navy btn-size-sm" onClick={() => navigate('/compras/nueva')}>
                                  <Plus size={14} />Nueva Compra
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((c) => (
                          <tr key={c.id} className="table-row-clickable" onClick={() => navigate(`/compras/${c.id}`)}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.id}</td>
                            <td style={{ fontWeight: 500 }}>
                              {c.esProveedorOcasional
                                ? (
                                    <span>
                                      {c.proveedorOcasionalNombre ?? c.supplierName}
                                      {' '}<span className="badge badge-warning">Ocasional</span>
                                    </span>
                                  )
                                : c.supplierName}
                            </td>
                            <td>{formatDate(c.postingDate)}</td>
                            <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{c.ncfProveedor ?? '—'}</td>
                            <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{c.billNo ?? '—'}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(c.grandTotal)}</td>
                            <td><StatusBadge status={c.status} /></td>
                            <td>
                              <button
                                className="btn btn-ghost btn-size-xs"
                                onClick={(e) => { e.stopPropagation(); navigate(`/compras/${c.id}`) }}
                              >
                                Ver
                              </button>
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
                  className="btn btn-ghost btn-size-icon-sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                  {page} / {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-size-icon-sm"
                  disabled={!data.meta.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de compras"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Fecha</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">NCF</label>
          <input
            className="ff-input"
            placeholder="Buscar NCF…"
            value={ncf}
            onChange={(e) => { setNcf(e.target.value); setPage(1) }}
          />
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Total</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Total mín."
              value={grandTotalMin}
              onChange={(e) => { setGrandTotalMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Total máx."
              value={grandTotalMax}
              onChange={(e) => { setGrandTotalMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
