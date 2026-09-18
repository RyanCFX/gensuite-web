import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listPagos } from '@/shared/api/pagos'
import type { ListPagosParams } from '@/shared/api/pagos'
import { listSuppliers } from '@/shared/api/suppliers'
import { listMetodosPago } from '@/shared/api/config'
import { listSucursales } from '@/shared/api/sucursales'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'

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

type StatusFilter = 'draft' | 'submitted' | 'cancelled' | 'all'

export default function PagosPage() {
  const navigate = useNavigate()

  const [supplierId, setSupplierId] = useState('')
  const [supplierLabel, setSupplierLabel] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [modeOfPaymentSearch, setModeOfPaymentSearch] = useState('')
  const [branch, setBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [paidAmountMin, setPaidAmountMin] = useState('')
  const [paidAmountMax, setPaidAmountMax] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
  })
  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
    sublabel: s.rnc,
  }))

  const { data: metodos } = useQuery({ queryKey: ['metodos-pago'], queryFn: listMetodosPago })
  const modeOfPaymentOptions: SearchSelectOption[] = (metodos ?? [])
    .filter((m) => !m.disabled)
    .filter((m) => !modeOfPaymentSearch || m.name.toLowerCase().includes(modeOfPaymentSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))

  const { data: sucursalesData } = useQuery({ queryKey: ['sucursales-all'], queryFn: () => listSucursales({ limit: 100 }) })
  const sucursales = sucursalesData?.items ?? []
  const branchOptions: SearchSelectOption[] = sucursales
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const params: ListPagosParams = {
    supplier: supplierId || undefined,
    status: status === 'all' ? undefined : status,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    modeOfPayment: modeOfPayment || undefined,
    branch: branch || undefined,
    paidAmountMin: paidAmountMin !== '' ? Number(paidAmountMin) : undefined,
    paidAmountMax: paidAmountMax !== '' ? Number(paidAmountMax) : undefined,
    referenceNo: referenceNo || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['pagos', params],
    queryFn: () => listPagos(params),
  })

  const pagos = data?.items ?? []

  const activeMoreFiltersCount = [fromDate, toDate, branch, referenceNo, paidAmountMin, paidAmountMax].filter((v) => v !== '').length

  function clearMoreFilters() {
    setFromDate('')
    setToDate('')
    setBranch('')
    setReferenceNo('')
    setPaidAmountMin('')
    setPaidAmountMax('')
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Pagos a Proveedores</h1>
          <p className="page-sub">Historial de pagos registrados a proveedores</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          <button className="btn btn-navy" onClick={() => navigate('/pagos/nuevo')}>
            <Plus size={16} />
            Registrar Pago
          </button>
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Proveedor" style={{ width: 260 }}>
                <SearchSelect
                  value={supplierId}
                  selectedLabel={supplierLabel}
                  onChange={(val, opt) => { setSupplierId(val); setSupplierLabel(opt?.label ?? '') }}
                  options={supplierOptions}
                  onSearch={setSupplierQuery}
                  loading={suppliersLoading}
                  placeholder="Filtrar por proveedor…"
                />
              </FilterField>

              <FilterField label="Estado">
                <Select value={status} onValueChange={(val) => setStatus(val as StatusFilter)}>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="submitted">Sometido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </Select>
              </FilterField>

              <FilterField label="Método de pago" style={{ width: 200 }}>
                <SearchSelect
                  value={modeOfPayment}
                  onChange={(val) => setModeOfPayment(val)}
                  options={modeOfPaymentOptions}
                  onSearch={setModeOfPaymentSearch}
                  placeholder="Todos los métodos de pago"
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
                <SortableTh label="ID" sortKey="id" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Proveedor" sortKey="supplierName" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
                <th>Método de Pago</th>
                <SortableTh label="Monto" sortKey="paidAmount" orderBy={orderBy} onSort={sort} align="right" />
                <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}>
                          <span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : pagos.length === 0
                ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        No se encontraron pagos
                      </td>
                    </tr>
                  )
                : pagos.map((pago) => (
                    <tr
                      key={pago.id}
                      className="data-table-row-link"
                      onClick={() => navigate(`/pagos/${pago.id}`)}
                    >
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                          {pago.id}
                        </span>
                      </td>
                      <td>{pago.supplierName}</td>
                      <td>{formatDate(pago.postingDate)}</td>
                      <td>{pago.modeOfPayment}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(pago.paidAmount)}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[pago.status] ?? 'badge-draft'}`}>
                          {STATUS_LABEL[pago.status] ?? pago.status}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && data?.meta && (
          <div className="table-footer">
            <span className="table-footer-count">
              {pagos.length} de {data.meta.total} pagos
            </span>
          </div>
        )}
      </div>

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de pagos"
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
            <DatePicker className="ff-input" value={fromDate} onChange={setFromDate} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={toDate} onChange={setToDate} clearable />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Sucursal</label>
          <SearchSelect
            value={branch}
            onChange={(val) => setBranch(val)}
            options={branchOptions}
            onSearch={setBranchSearch}
            selectedLabel={branch}
            placeholder="Todas las sucursales"
          />
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Referencia</label>
          <input
            className="ff-input"
            placeholder="Número de referencia…"
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
          />
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Monto pagado</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Mín."
              value={paidAmountMin}
              onChange={(e) => setPaidAmountMin(e.target.value)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Máx."
              value={paidAmountMax}
              onChange={(e) => setPaidAmountMax(e.target.value)}
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
