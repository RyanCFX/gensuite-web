import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listOrdenesCompra } from '@/shared/api/ordenes-compra'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/shared/ui/Badge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, ChevronLeft, ChevronRight, ShoppingCart, SlidersHorizontal } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { usePuede } from '@/shared/permissions/can'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { SearchInput } from '@/shared/ui/SearchInput'

const PAGE_SIZE = 20

const COLUMNS = [
  { key: 'id', width: 100 },
  { key: 'proveedor', width: 200 },
  { key: 'fecha', width: 100 },
  { key: 'total', width: 120 },
  { key: 'estado', width: 110 },
  { key: 'recepcion', width: 130 },
  { key: 'facturacion', width: 130 },
  { key: 'acciones', width: 70 },
]

function PerBadge({ pct, doneLabel, pendingLabel, progressLabel }: { pct: number; doneLabel: string; pendingLabel: string; progressLabel: (n: number) => string }) {
  if (pct >= 100) return <Badge variant="success">{doneLabel}</Badge>
  if (pct <= 0) return <Badge variant="neutral">{pendingLabel}</Badge>
  return <Badge variant="warning">{progressLabel(Math.round(pct))}</Badge>
}

export default function OrdenesPage() {
  const puedeCrear = usePuede('compras.orden.crear')
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [receiptStatus, setReceiptStatus] = useState<string>('all')
  const [billingStatus, setBillingStatus] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
  const [page, setPage] = useState(1)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const offset = (page - 1) * PAGE_SIZE



  const { data, isLoading, isError } = useQuery({
    queryKey: ['ordenes-compra', { supplier, status, receiptStatus, billingStatus, fromDate, toDate, branch, offset, orderBy }],
    queryFn: () =>
      listOrdenesCompra({
        supplier: supplier || undefined,
        status: status !== 'all' ? (status as 'draft' | 'submitted' | 'cancelled') : undefined,
        receiptStatus: receiptStatus !== 'all' ? (receiptStatus as 'pending' | 'received') : undefined,
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

  const activeMoreFiltersCount = [fromDate, toDate].filter((v) => v !== '').length
    + (receiptStatus !== 'all' ? 1 : 0)
    + (billingStatus !== 'all' ? 1 : 0)

  function clearMoreFilters() {
    setReceiptStatus('all')
    setBillingStatus('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Órdenes de Compra</>}
        description="El pedido formal a un proveedor específico, con precios — se genera desde una solicitud o se crea directa"
        action={
          <>
            <RecargarButton />
            {puedeCrear && (
              <button className="btn btn-navy" onClick={() => navigate('/compras/ordenes/nueva')}>
                <Plus size={16} />
                Nueva Orden
              </button>
            )}
          </>
        }
      />

      <div>
        <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="filter-bar" style={{ margin: 0 }}>
              <div className="filter-bar-left">
                <SearchInput placeholder="Buscar proveedor…" value={supplier} onChange={(v) => { setSupplier(v); setPage(1) }} />
                <FilterField label="Estado">
                  <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1) }}>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="submitted">Sometida</SelectItem>
                    <SelectItem value="cancelled">Anulada</SelectItem>
                  </Select>
                </FilterField>
                <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }} recurso="sucursales" value={branch} onChange={(val) => { setBranch(val); setPage(1) }} selectedLabel={branch} placeholder="Todas las sucursales" />

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
            <table className="data-table navy-table items-table-resizable">
              <colgroup>
                {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
              </colgroup>
              <thead>
                <tr>
                  <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('id')} />} />
                  <SortableTh label="Proveedor" sortKey="supplierName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('proveedor')} />} />
                  <SortableTh label="Fecha" sortKey="transactionDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('fecha')} />} />
                  <th style={{ textAlign: 'right' }}>
                    Total
                    <span className="col-resize-handle" onMouseDown={startResize('total')} />
                  </th>
                  <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('estado')} />} />
                  <th>
                    Recepción
                    <span className="col-resize-handle" onMouseDown={startResize('recepcion')} />
                  </th>
                  <th>
                    Facturación
                    <span className="col-resize-handle" onMouseDown={startResize('facturacion')} />
                  </th>
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
                            Error al cargar las órdenes de compra
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="empty-state">
                                <div className="empty-icon">
                                  <ShoppingCart size={20} />
                                </div>
                                <p className="empty-title">Sin órdenes de compra</p>
                                <p className="empty-sub">No hay órdenes de compra registradas.</p>
                                {puedeCrear && (
                                  <button className="btn btn-navy btn-size-sm" onClick={() => navigate('/compras/ordenes/nueva')}>
                                    <Plus size={14} />Nueva Orden
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((o) => (
                          <tr key={o.id} className="table-row-clickable" onClick={() => navigate(`/compras/ordenes/${o.id}`)}>
                            <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{o.id}</td>
                            <td style={{ fontWeight: 500 }}>{o.supplierName}</td>
                            <td>{formatDate(o.transactionDate)}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(o.grandTotal)}</td>
                            <td><StatusBadge status={o.erpStatus} /></td>
                            <td><PerBadge pct={o.perReceived} doneLabel="100% recibida" pendingLabel="Pendiente" progressLabel={(n) => `${n}% recibida`} /></td>
                            <td><PerBadge pct={o.perBilled} doneLabel="100% facturada" pendingLabel="Pendiente" progressLabel={(n) => `${n}% facturada`} /></td>
                            <td>
                              <button
                                className="btn btn-ghost btn-size-xs"
                                onClick={(e) => { e.stopPropagation(); navigate(`/compras/ordenes/${o.id}`) }}
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

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de órdenes de compra"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Recepción</label>
          <Select value={receiptStatus} onValueChange={(val) => { setReceiptStatus(val); setPage(1) }}>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending">Pendientes de recibir</SelectItem>
            <SelectItem value="received">Recibidas</SelectItem>
          </Select>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Facturación</label>
          <Select value={billingStatus} onValueChange={(val) => { setBillingStatus(val); setPage(1) }}>
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
