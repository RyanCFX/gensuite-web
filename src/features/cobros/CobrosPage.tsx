import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listCobros } from '@/shared/api/cobros'
import type { ListCobrosParams } from '@/shared/api/cobros'
import { listCustomers } from '@/shared/api/customers'
import { listMetodosPago } from '@/shared/api/config'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

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
  const [customerQuery, setCustomerQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [modeOfPaymentSearch, setModeOfPaymentSearch] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountSearch, setBankAccountSearch] = useState('')
  const [paidAmountMin, setPaidAmountMin] = useState('')
  const [paidAmountMax, setPaidAmountMax] = useState('')
  const { orderBy, sort } = useSortState()

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
  }))

  const { data: metodos } = useQuery({ queryKey: ['metodos-pago'], queryFn: listMetodosPago })
  const modeOfPaymentOptions: SearchSelectOption[] = (metodos ?? [])
    .filter((m) => !m.disabled)
    .filter((m) => !modeOfPaymentSearch || m.name.toLowerCase().includes(modeOfPaymentSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))

  const { data: cuentasBancarias } = useQuery({
    queryKey: ['cuentas-bancarias-activas'],
    queryFn: () => listCuentasBancarias({ estado: 'Activa', limit: 100 }),
  })
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

  return (
    <div className="page-container">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cobros</h1>
          <p className="page-sub">Historial de pagos recibidos de clientes</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cobros/pago')}>
          <Plus size={16} />
          Registrar Cobro
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 260 }}>
            <SearchSelect
              value={customerId}
              selectedLabel={customerLabel}
              onChange={(val, opt) => { setCustomerId(val); setCustomerLabel(opt?.label ?? '') }}
              options={customerOptions}
              onSearch={setCustomerQuery}
              loading={customersLoading}
              placeholder="Filtrar por cliente…"
            />
          </div>

          <Select value={status} onValueChange={(val) => setStatus(val as StatusFilter)}>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="Draft">Borrador</SelectItem>
            <SelectItem value="Submitted">Sometido</SelectItem>
            <SelectItem value="Cancelled">Cancelado</SelectItem>
          </Select>

          <DatePicker
            className="filter-select"
            value={fromDate}
            onChange={setFromDate}
            clearable
          />
          <DatePicker
            className="filter-select"
            value={toDate}
            onChange={setToDate}
            clearable
          />

          <div style={{ width: 200 }}>
            <SearchSelect
              value={modeOfPayment}
              onChange={(val) => setModeOfPayment(val)}
              options={modeOfPaymentOptions}
              onSearch={setModeOfPaymentSearch}
              placeholder="Todos los métodos de pago"
            />
          </div>

          <div style={{ width: 220 }}>
            <SearchSelect
              value={bankAccount}
              onChange={(val) => setBankAccount(val)}
              options={bankAccountOptions}
              onSearch={setBankAccountSearch}
              placeholder="Todas las cuentas bancarias"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 100 }}
              placeholder="Mín."
              value={paidAmountMin}
              onChange={(e) => setPaidAmountMin(e.target.value)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 100 }}
              placeholder="Máx."
              value={paidAmountMax}
              onChange={(e) => setPaidAmountMax(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="ID" sortKey="id" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={sort} />
                <th>Método de Pago</th>
                <th>Tipo</th>
                <SortableTh label="Monto" sortKey="paidAmount" orderBy={orderBy} onSort={sort} align="right" />
                <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
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
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                          {cobro.id}
                        </span>
                      </td>
                      <td>{cobro.customerName}</td>
                      <td>{formatDate(cobro.postingDate)}</td>
                      <td>{cobro.modeOfPayment}</td>
                      <td>
                        {cobro.isPosSale ? (
                          <span className="badge badge-submitted" style={{ background: 'var(--color-info-bg, #e0f2fe)', color: 'var(--color-info-text, #0369a1)', border: '1px solid var(--color-info-border, #bae6fd)' }}>
                            Venta al contado
                          </span>
                        ) : (
                          <span className="badge badge-draft" style={{ background: 'var(--color-neutral-bg, #f5f5f5)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                            Cobro factura
                          </span>
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
    </div>
  )
}
