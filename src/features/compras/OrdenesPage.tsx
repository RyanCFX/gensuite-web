import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listOrdenesCompra } from '@/shared/api/ordenes-compra'
import { listSucursales } from '@/shared/api/sucursales'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/shared/ui/Badge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, ChevronLeft, ChevronRight, Search, ShoppingCart } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'

const PAGE_SIZE = 20

function PerBadge({ pct, doneLabel, pendingLabel, progressLabel }: { pct: number; doneLabel: string; pendingLabel: string; progressLabel: (n: number) => string }) {
  if (pct >= 100) return <Badge variant="success">{doneLabel}</Badge>
  if (pct <= 0) return <Badge variant="neutral">{pendingLabel}</Badge>
  return <Badge variant="warning">{progressLabel(Math.round(pct))}</Badge>
}

export default function OrdenesPage() {
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [receiptStatus, setReceiptStatus] = useState<string>('all')
  const [billingStatus, setBillingStatus] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
  const [page, setPage] = useState(1)
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

  return (
    <div className="page-container">
      <PageHeader
        title="Órdenes de Compra"
        description="El pedido formal a un proveedor específico, con precios — se genera desde una solicitud o se crea directa"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/compras/ordenes/nueva')}>
            <Plus size={16} />
            Nueva Orden
          </button>
        }
      />

      <div>
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
            <FilterField label="Recepción">
              <Select value={receiptStatus} onValueChange={(val) => { setReceiptStatus(val); setPage(1) }}>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="pending">Pendientes de recibir</SelectItem>
                <SelectItem value="received">Recibidas</SelectItem>
              </Select>
            </FilterField>
            <FilterField label="Facturación">
              <Select value={billingStatus} onValueChange={(val) => { setBillingStatus(val); setPage(1) }}>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="pending">Pendientes de facturar</SelectItem>
                <SelectItem value="billed">Facturadas</SelectItem>
              </Select>
            </FilterField>
            <FilterField label="Estado">
              <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1) }}>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="submitted">Sometida</SelectItem>
                <SelectItem value="cancelled">Anulada</SelectItem>
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
            <FilterField label="Desde">
              <DatePicker className="filter-select" value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
            </FilterField>
            <FilterField label="Hasta">
              <DatePicker className="filter-select" value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
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
                  <SortableTh label="Fecha" sortKey="transactionDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Recepción</th>
                  <th>Facturación</th>
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
                                <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/compras/ordenes/nueva')}>
                                  <Plus size={14} />Nueva Orden
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((o) => (
                          <tr key={o.id} className="table-row-clickable" onClick={() => navigate(`/compras/ordenes/${o.id}`)}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{o.id}</td>
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
    </div>
  )
}
