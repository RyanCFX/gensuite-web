import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listCobros } from '@/shared/api/cobros'
import type { ListCobrosParams } from '@/shared/api/cobros'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Drawer } from '@/shared/ui/Drawer'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { useOpcionesLista } from '@/shared/hooks/useOpciones'

// ─── Badges ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Submitted: 'badge-submitted',
  Cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Cancelled: 'Cancelado',
}

type StatusFilter = 'Draft' | 'Submitted' | 'Cancelled' | 'all'

// ─────────────────────────────────────────────────────────────────────────────

export default function CobrosPage() {
  const navigate = useNavigate()

  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountSearch, setBankAccountSearch] = useState('')
  const [paidAmountMin, setPaidAmountMin] = useState('')
  const [paidAmountMax, setPaidAmountMax] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  const COLUMNS = [
    { key: 'id', width: 110 },
    { key: 'cliente', width: 220 },
    { key: 'fecha', width: 100 },
    { key: 'metodo', width: 150 },
    { key: 'tipo', width: 140 },
    { key: 'monto', width: 120 },
    { key: 'estado', width: 110 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)



  const { data: cuentasBancarias } = useOpcionesLista('cuentas-bancarias', { limit: 100 })
  const bankAccountOptions: SearchSelectOption[] = (cuentasBancarias?.items ?? [])
    .filter((c) => !bankAccountSearch || c.accountName.toLowerCase().includes(bankAccountSearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.accountName, sublabel: c.bank }))

  const params: ListCobrosParams = {
    customer: customerId || undefined,
    status: status === 'all' ? undefined : status,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    modeOfPayment: modeOfPayment || undefined,
    bankAccount: bankAccount || undefined,
    paidAmountMin: paidAmountMin !== '' ? Number(paidAmountMin) : undefined,
    paidAmountMax: paidAmountMax !== '' ? Number(paidAmountMax) : undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['cobros', params],
    queryFn: () => listCobros(params),
  })

  const cobros = data?.items ?? []

  const activeMoreFiltersCount = [fromDate, toDate, bankAccount, paidAmountMin, paidAmountMax].filter((v) => v !== '').length

  function clearMoreFilters() {
    setFromDate('')
    setToDate('')
    setBankAccount('')
    setPaidAmountMin('')
    setPaidAmountMax('')
  }

  return (
    <div className="page-container">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Cobros</h1>
          <p className="page-sub">Historial de pagos recibidos de clientes</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          <button className="btn btn-navy" onClick={() => navigate('/cobros/pago')}>
            <Plus size={16} />
            Registrar Cobro
          </button>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <OpcionesSelect hideOnForbidden filterLabel="Cliente" filterStyle={{ width: 260 }} recurso="clientes" value={customerId} onChange={(val, opt) => { setCustomerId(val); setCustomerLabel(opt?.label ?? '') }} selectedLabel={customerLabel} placeholder="Filtrar por cliente…" minChars={2} />

              <FilterField label="Estado">
                <Select value={status} onValueChange={(val) => setStatus(val as StatusFilter)}>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Draft">Borrador</SelectItem>
                  <SelectItem value="Submitted">Sometido</SelectItem>
                  <SelectItem value="Cancelled">Cancelado</SelectItem>
                </Select>
              </FilterField>

              <OpcionesSelect hideOnForbidden filterLabel="Método de pago" filterStyle={{ width: 200 }} recurso="metodos-pago" value={modeOfPayment} onChange={(val) => setModeOfPayment(val)} placeholder="Todos los métodos de pago" />

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

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
            <colgroup>
              {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <SortableTh label="ID" sortKey="id" orderBy={orderBy} onSort={sort} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('id')} />} />
                <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('cliente')} />} />
                <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('fecha')} />} />
                <th>
                  Método de Pago
                  <span className="col-resize-handle" onMouseDown={startResize('metodo')} />
                </th>
                <th>
                  Tipo
                  <span className="col-resize-handle" onMouseDown={startResize('tipo')} />
                </th>
                <SortableTh label="Monto" sortKey="paidAmount" orderBy={orderBy} onSort={sort} align="right" resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('monto')} />} />
                <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('estado')} />} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}>
                          <span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : cobros.length === 0
                ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        No se encontraron cobros
                      </td>
                    </tr>
                  )
                : cobros.map((cobro) => (
                    <tr
                      key={cobro.id}
                      className="data-table-row-link"
                      onClick={() => navigate(cobro.isPosSale ? `/facturas/${cobro.id}` : `/cobros/${cobro.id}`)}
                    >
                      <td>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500 }}>
                          {cobro.id}
                        </span>
                      </td>
                      <td>{cobro.customerName}</td>
                      <td>{formatDate(cobro.postingDate)}</td>
                      <td>
                        {cobro.esDeliveryPorConciliar ? 'Delivery por conciliar' : cobro.modeOfPayment}
                        {cobro.esDeliveryPorConciliar && (
                          <span className="badge badge-warning" style={{ marginLeft: 6 }}>Por conciliar</span>
                        )}
                      </td>
                      <td>
                        {cobro.isPosSale ? (
                          <span className="badge badge-info">Venta al contado</span>
                        ) : (
                          <span className="badge badge-neutral">Cobro factura</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(cobro.paidAmount)}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[cobro.status] ?? 'badge-draft'}`}>
                          {STATUS_LABEL[cobro.status] ?? cobro.status}
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
              {cobros.length} de {data.meta.total} cobros
            </span>
          </div>
        )}
      </div>

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de cobros"
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
          <label className="ff-label">Cuenta bancaria</label>
          <SearchSelect
            value={bankAccount}
            onChange={(val) => setBankAccount(val)}
            options={bankAccountOptions}
            onSearch={setBankAccountSearch}
            placeholder="Todas las cuentas bancarias"
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
