import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listInvoices } from '@/shared/api/invoices'
import type { ListInvoicesParams } from '@/shared/api/invoices'
import { listSucursales } from '@/shared/api/sucursales'
import { Plus, Eye, Search, GitBranch } from 'lucide-react'
import { formatDate, formatDOP, displayId } from '@/lib/formatters'
import { getCatalogosFiscales } from '@/shared/api/config'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'

type StatusFilter = 'draft' | 'submitted' | 'cancelled' | 'all'
type PaymentFilter = 'paid' | 'unpaid' | 'partly_paid' | 'all'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: 'badge-warning',
  partly_paid: 'badge-info',
  paid: 'badge-success',
  overdue: 'badge-error',
}
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Pendiente',
  partly_paid: 'Pago parcial',
  paid: 'Pagado',
  overdue: 'Vencido',
}

export default function InvoicesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>('all')
  const [ncfType, setNcfType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
  const [ncf, setNcf] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const { orderBy, sort } = useSortState()

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const sucursales = sucursalesData?.items ?? []
  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = sucursales
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const params: ListInvoicesParams = {
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    paymentStatus: paymentStatus === 'all' ? undefined : paymentStatus,
    ncfType: ncfType || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    branch: branch || undefined,
    ncf: ncf || undefined,
    grandTotalMin: grandTotalMin !== '' ? Number(grandTotalMin) : undefined,
    grandTotalMax: grandTotalMax !== '' ? Number(grandTotalMax) : undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', params],
    queryFn: () => listInvoices(params),
  })

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [ncfTypeSearch, setNcfTypeSearch] = useState('')
  const ncfTypeOptions: SearchSelectOption[] = (catalogos?.ncfTypes ?? [])
    .filter((t) => !ncfTypeSearch || t.label.toLowerCase().includes(ncfTypeSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const invoices = data?.items ?? []

  function statusBadge(inv: { status: string; paymentStatus?: string | null; isPos?: boolean | null }) {
    if (inv.status === 'submitted') {
      // isPos ya no implica pago completo (módulo POS permite turno + pago parcial) —
      // solo se etiqueta "Contado" cuando paymentStatus confirma que no queda saldo pendiente.
      if (inv.isPos && inv.paymentStatus === 'paid') {
        return <span className="badge badge-pos">Contado</span>
      }
      if (inv.paymentStatus) {
        return (
          <span className={`badge ${PAYMENT_BADGE[inv.paymentStatus] ?? 'badge-neutral'}`}>
            {PAYMENT_LABEL[inv.paymentStatus] ?? inv.paymentStatus}
          </span>
        )
      }
      return <span className="badge badge-submitted">Sometido</span>
    }
    return (
      <span className={`badge ${STATUS_BADGE[inv.status] ?? 'badge-neutral'}`}>
        {STATUS_LABEL[inv.status] ?? inv.status}
      </span>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Facturas</h1>
          <p className="page-sub">Gestiona tus facturas de venta y comprobantes fiscales</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/facturas/nueva')}>
          <Plus size={16} />
          Nueva Factura
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterField label="Estado">
            <Select value={status} onValueChange={(val) => setStatus(val as StatusFilter)}>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="submitted">Sometido</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </Select>
          </FilterField>
          <FilterField label="Estado de pago">
            <Select value={paymentStatus} onValueChange={(val) => setPaymentStatus(val as PaymentFilter)}>
              <SelectItem value="all">Todo estado pago</SelectItem>
              <SelectItem value="unpaid">Pendiente</SelectItem>
              <SelectItem value="partly_paid">Parcial</SelectItem>
              <SelectItem value="paid">Pagado</SelectItem>
            </Select>
          </FilterField>
          <FilterField label="Tipo NCF" style={{ width: 200 }}>
            <SearchSelect
              value={ncfType}
              onChange={setNcfType}
              options={ncfTypeOptions}
              onSearch={setNcfTypeSearch}
              selectedLabel={catalogos?.ncfTypes?.find((t) => t.value === ncfType)?.label ?? ''}
              placeholder="Todos los tipos NCF"
            />
          </FilterField>
          <FilterField label="Sucursal" style={{ width: 200 }}>
            <SearchSelect
              value={branch}
              onChange={setBranch}
              options={branchOptions}
              onSearch={setBranchSearch}
              selectedLabel={branch}
              placeholder="Todas las sucursales"
            />
          </FilterField>
          <FilterField label="Desde">
            <DatePicker
              className="ff-input ff-input-sm"
              value={fromDate}
              onChange={setFromDate}
              style={{ width: 144 }}
              clearable
            />
          </FilterField>
          <FilterField label="Hasta">
            <DatePicker
              className="ff-input ff-input-sm"
              value={toDate}
              onChange={setToDate}
              style={{ width: 144 }}
              clearable
            />
          </FilterField>
          <FilterField label="NCF">
            <input
              className="ff-input ff-input-sm"
              placeholder="Buscar NCF…"
              value={ncf}
              onChange={(e) => setNcf(e.target.value)}
            />
          </FilterField>
          <FilterField label="Total">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                className="ff-input ff-input-sm"
                style={{ width: 100 }}
                placeholder="Total mín."
                value={grandTotalMin}
                onChange={(e) => setGrandTotalMin(e.target.value)}
              />
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
              <input
                type="number"
                className="ff-input ff-input-sm"
                style={{ width: 100 }}
                placeholder="Total máx."
                value={grandTotalMax}
                onChange={(e) => setGrandTotalMax(e.target.value)}
              />
            </div>
          </FilterField>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
              <th>Vence</th>
              <th>NCF</th>
              <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={sort} align="right" />
              <th style={{ textAlign: 'right' }}>Pendiente</th>
              <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              <th style={{ textAlign: 'right', width: 64 }}>Ver</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-title">Sin facturas</div>
                    <p className="empty-sub">Crea tu primera factura para comenzar.</p>
                    <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/facturas/nueva')}>
                      <Plus size={14} /> Nueva Factura
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="table-row-clickable"
                  onClick={() => navigate(`/facturas/${inv.id}`)}
                >
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {inv.amendedFrom && <GitBranch size={12} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--text-tertiary)' }} />}
                    {displayId(inv.id, inv.sequence)}
                  </td>
                  <td style={{ fontWeight: 500 }}>{inv.customerName}</td>
                  <td>{formatDate(inv.postingDate)}</td>
                  <td>{formatDate(inv.dueDate)}</td>
                  <td>
                    {inv.ncf
                      ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.ncf}</span>
                      : inv.ncfType
                        ? <span className="badge badge-neutral" style={{ fontSize: 11 }}>{inv.ncfType}</span>
                        : <span className="td-dim">—</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(inv.grandTotal)}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(inv.outstandingAmount)}</td>
                  <td>{statusBadge(inv)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost btn-size-icon-sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/facturas/${inv.id}`) }}
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {invoices.length} de {data.meta.total} facturas
          </span>
        </div>
      )}
    </div>
  )
}
