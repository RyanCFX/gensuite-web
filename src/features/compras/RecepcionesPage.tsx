import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listPurchaseReceipts } from '@/shared/api/purchase-receipt'
import { listSucursales } from '@/shared/api/sucursales'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/shared/ui/Badge'
import { formatDate } from '@/lib/formatters'
import { Plus, ChevronLeft, ChevronRight, Search, Truck, SlidersHorizontal } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'

const PAGE_SIZE = 20

function PerBilledBadge({ perBilled }: { perBilled: number }) {
  if (perBilled >= 100) return <Badge variant="success">100% facturado</Badge>
  if (perBilled <= 0) return <Badge variant="neutral">Pendiente de facturar</Badge>
  return <Badge variant="warning">{Math.round(perBilled)}% facturado</Badge>
}

export default function RecepcionesPage() {
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [billingStatus, setBillingStatus] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
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
    queryKey: ['purchase-receipts', { supplier, status, billingStatus, fromDate, toDate, branch, offset, orderBy }],
    queryFn: () =>
      listPurchaseReceipts({
        supplier: supplier || undefined,
        status: status !== 'all' ? (status as 'draft' | 'submitted' | 'cancelled') : undefined,
        billingStatus: billingStatus !== 'all' ? (billingStatus as 'pending' | 'billed') : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        branch: branch || undefined,
        orderBy: orderBy || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  const activeMoreFiltersCount = [fromDate, toDate].filter((v) => v !== '').length + (billingStatus !== 'all' ? 1 : 0)

  function clearMoreFilters() {
    setBillingStatus('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Recepción de Mercancía</>}
        description="Registra la mercancía recibida antes de que llegue la factura final del proveedor"
        action={
          <>
            <RecargarButton />
            <button className="btn btn-navy" onClick={() => navigate('/compras/recepciones/nueva')}>
              <Plus size={16} />
              Nueva Recepción
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
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="submitted">Sometido</SelectItem>
                    <SelectItem value="cancelled">Anulado</SelectItem>
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
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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

        <div className="card navy-table-card">
          <div className="table-scroll">
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Proveedor" sortKey="supplierName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Remisión</th>
                  <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Facturación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar las recepciones
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={7}>
                              <div className="empty-state">
                                <div className="empty-icon">
                                  <Truck size={20} />
                                </div>
                                <p className="empty-title">Sin recepciones</p>
                                <p className="empty-sub">No hay recepciones de mercancía registradas.</p>
                                <button className="btn btn-navy btn-size-sm" onClick={() => navigate('/compras/recepciones/nueva')}>
                                  <Plus size={14} />Nueva Recepción
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((r) => (
                          <tr key={r.id} className="table-row-clickable" onClick={() => navigate(`/compras/recepciones/${r.id}`)}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.id}</td>
                            <td style={{ fontWeight: 500 }}>{r.supplierName}</td>
                            <td>{formatDate(r.postingDate)}</td>
                            <td className="td-muted">{r.supplierDeliveryNote ?? '—'}</td>
                            <td><StatusBadge status={r.status} /></td>
                            <td><PerBilledBadge perBilled={r.perBilled} /></td>
                            <td>
                              {r.status === 'submitted' && r.perBilled < 100 ? (
                                <button
                                  className="btn btn-primary btn-size-xs"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/compras/recepciones/${r.id}`) }}
                                >
                                  Facturar
                                </button>
                              ) : (
                                <button
                                  className="btn btn-ghost btn-size-xs"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/compras/recepciones/${r.id}`) }}
                                >
                                  Ver
                                </button>
                              )}
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
        subtitle="Refina la búsqueda de recepciones"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Facturación</label>
          <Select
            value={billingStatus}
            onValueChange={(val) => { setBillingStatus(val); setPage(1) }}
          >
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending">Pendientes de facturar</SelectItem>
            <SelectItem value="billed">Facturadas</SelectItem>
          </Select>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Fecha</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
