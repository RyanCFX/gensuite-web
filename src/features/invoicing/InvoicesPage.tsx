import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listInvoices } from '@/shared/api/invoices'
import type { ListInvoicesParams } from '@/shared/api/invoices'
import { listSucursales } from '@/shared/api/sucursales'
import { Plus, Eye, Search, GitBranch, SlidersHorizontal } from 'lucide-react'
import { formatDate, formatDOP, displayId } from '@/lib/formatters'
import { getCatalogosFiscales } from '@/shared/api/config'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'
import { usePermissionsStore } from '@/stores/permissions.store'
import { listAseguradoras, nombreAseguradora } from '@/shared/api/aseguradoras'
import { EstadoArsBadge } from './EstadoArsBadge'
import type { EstadoArs } from '@/shared/api/types'

type StatusFilter = 'draft' | 'submitted' | 'cancelled' | 'all'
type EstadoArsFilter = EstadoArs | 'all' | 'sinLote'
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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  // ── Filtros del vertical farmacia (docs/PROMPT_FARMACIA_V2_FRONTEND.md §3.8) ────────────────
  const esFarmacia = usePermissionsStore((s) => s.vertical) === 'farmacia'
  const [aseguradora, setAseguradora] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  const [aseguradoraSearch, setAseguradoraSearch] = useState('')
  const [estadoArs, setEstadoArs] = useState<EstadoArsFilter>('all')

  const { data: aseguradorasData, isLoading: aseguradorasLoading } = useQuery({
    queryKey: ['aseguradoras-filtro-facturas', aseguradoraSearch],
    queryFn: () => listAseguradoras({ nombre: aseguradoraSearch || undefined, limit: 15 }),
    enabled: esFarmacia,
  })
  const aseguradoraOptions: SearchSelectOption[] = (aseguradorasData?.items ?? []).map((a) => ({
    value: a.id,
    label: nombreAseguradora(a),
  }))

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
    // `sinLote` y `estadoArs` son mutuamente excluyentes en la UI: "Sin lote" ya implica
    // "con cobertura y todavía sin lote", así que no se manda también un estadoArs.
    ...(esFarmacia
      ? {
          aseguradora: aseguradora || undefined,
          estadoArs: estadoArs !== 'all' && estadoArs !== 'sinLote' ? estadoArs : undefined,
          sinLote: estadoArs === 'sinLote' ? true : undefined,
        }
      : {}),
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
  /** 9 columnas base + "Estado ARS" en tenants de farmacia. */
  const columnCount = esFarmacia ? 10 : 9

  const activeMoreFiltersCount = [ncfType, fromDate, toDate, ncf, grandTotalMin, grandTotalMax].filter((v) => v !== '').length

  function clearMoreFilters() {
    setNcfType('')
    setFromDate('')
    setToDate('')
    setNcf('')
    setGrandTotalMin('')
    setGrandTotalMax('')
  }

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
          <h1 className="page-title"><span className="page-title-dot" />Facturas</h1>
          <p className="page-sub">Gestiona tus facturas de venta y comprobantes fiscales</p>
        </div>
        <button className="btn btn-navy" onClick={() => navigate('/facturas/nueva')}>
          <Plus size={16} />
          Nueva Factura
        </button>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
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
              {esFarmacia && (
                <>
                  <FilterField label="Aseguradora" style={{ width: 200 }}>
                    <SearchSelect
                      value={aseguradora}
                      selectedLabel={aseguradoraLabel}
                      onChange={(val, opt) => { setAseguradora(val); setAseguradoraLabel(opt?.label ?? '') }}
                      options={aseguradoraOptions}
                      onSearch={setAseguradoraSearch}
                      loading={aseguradorasLoading}
                      placeholder="Todas las ARS"
                    />
                  </FilterField>
                  <FilterField label="Estado ARS">
                    <Select value={estadoArs} onValueChange={(val) => setEstadoArs(val as EstadoArsFilter)}>
                      <SelectItem value="all">Todo estado ARS</SelectItem>
                      <SelectItem value="Pendiente">Pendiente</SelectItem>
                      <SelectItem value="En Lote">En Lote</SelectItem>
                      <SelectItem value="Facturado">Facturado</SelectItem>
                      <SelectItem value="Anulada">Anulada</SelectItem>
                      <SelectItem value="sinLote">Con cobertura, sin lote</SelectItem>
                    </Select>
                  </FilterField>
                </>
              )}
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
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
              <th>Vence</th>
              <th>NCF</th>
              <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={sort} align="right" />
              <th style={{ textAlign: 'right' }}>Pendiente</th>
              <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              {esFarmacia && <th>Estado ARS</th>}
              <th style={{ textAlign: 'right', width: 64 }}>Ver</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: columnCount }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <div className="empty-state">
                    <div className="empty-title">Sin facturas</div>
                    <p className="empty-sub">Crea tu primera factura para comenzar.</p>
                    <button className="btn btn-navy btn-size-sm" onClick={() => navigate('/facturas/nueva')}>
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
                  {esFarmacia && (
                    <td>
                      {inv.aseguradora?.estadoArs
                        ? <EstadoArsBadge estado={inv.aseguradora.estadoArs} />
                        : <span className="td-dim">—</span>}
                    </td>
                  )}
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
      </div>

      {data?.meta && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {invoices.length} de {data.meta.total} facturas
          </span>
        </div>
      )}

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de facturas"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Tipo NCF</label>
          <SearchSelect
            value={ncfType}
            onChange={setNcfType}
            options={ncfTypeOptions}
            onSearch={setNcfTypeSearch}
            selectedLabel={catalogos?.ncfTypes?.find((t) => t.value === ncfType)?.label ?? ''}
            placeholder="Todos los tipos NCF"
          />
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Fecha</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={fromDate} onChange={setFromDate} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={toDate} onChange={setToDate} clearable />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">NCF</label>
          <input
            className="ff-input"
            placeholder="Buscar NCF…"
            value={ncf}
            onChange={(e) => setNcf(e.target.value)}
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
              onChange={(e) => setGrandTotalMin(e.target.value)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Total máx."
              value={grandTotalMax}
              onChange={(e) => setGrandTotalMax(e.target.value)}
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
