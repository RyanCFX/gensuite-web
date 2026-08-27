import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Loader2, Info } from 'lucide-react'
import { getAging } from '@/shared/api/cobros'
import type { AgingGroupBy, AgingInvoiceEntry } from '@/shared/api/types'
import { listCustomers } from '@/shared/api/customers'
import { downloadCxcAgingPdf } from '@/shared/api/reportes'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

const DEFAULT_LABELS = ['Corriente', '0–30 días', '31–60 días', '61–90 días', '+90 días']

export default function AgingPage() {
  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [groupBy, setGroupBy] = useState<AgingGroupBy>('party')
  const [showCurrent, setShowCurrent] = useState(false)

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
  }))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['aging', customerId, groupBy],
    queryFn: () => getAging({ customer: customerId || undefined, groupBy }),
  })

  const downloadPdfMutation = useMutation({
    mutationFn: () => downloadCxcAgingPdf({ customer: customerId || undefined, groupBy }),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const AGING_THRESHOLD = 10_000
  const labels = data?.config?.rangos ?? DEFAULT_LABELS
  const rows = data?.rows ?? []
  const isInvoiceView = groupBy === 'invoice'
  const colCount = labels.length + (isInvoiceView ? 4 : 2) - (showCurrent ? 0 : 1)

  function agingStyle(amount: number): React.CSSProperties {
    return amount > AGING_THRESHOLD
      ? { color: 'var(--error-text)', fontWeight: 600 }
      : {}
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Antiguedad de saldos por Cobrar"
        description="Análisis de saldos vencidos por cliente, según fecha de vencimiento"
        action={
          <button
            className="btn btn-secondary btn-size-sm"
            onClick={() => downloadPdfMutation.mutate()}
            disabled={downloadPdfMutation.isPending}
          >
            {downloadPdfMutation.isPending ? <Loader2 size={13} className="spin" /> : <Download size={13} aria-hidden="true" />}
            {' '}Descargar PDF
          </button>
        }
      />

      {data?.note && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <Info size={15} />
          <span>{data.note}</span>
        </div>
      )}

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
              placeholder="Todos los clientes"
            />
          </div>
          <Select value={groupBy} onValueChange={(val) => setGroupBy(val as AgingGroupBy)} clearable={false}>
            <SelectItem value="party">Agrupar por Cliente</SelectItem>
            <SelectItem value="invoice">Agrupar por Factura</SelectItem>
          </Select>
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={showCurrent}
              onChange={(e) => setShowCurrent(e.target.checked)}
            />
            Mostrar balances sin vencer
          </label>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  {isInvoiceView && <th>Factura</th>}
                  {isInvoiceView && <th>Vencimiento</th>}
                  {isInvoiceView && <th style={{ textAlign: 'right' }}>Saldo</th>}
                  {(showCurrent ? labels : labels.slice(1)).map((label, i) => (
                    <th key={i} style={{ textAlign: 'right' }}>{label}</th>
                  ))}
                  {!isInvoiceView && <th style={{ textAlign: 'right', fontWeight: 700 }}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: colCount }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={colCount} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar el aging
                          </td>
                        </tr>
                      )
                    : !rows || rows.length === 0
                      ? (
                          <tr>
                            <td colSpan={colCount}>
                              <div className="empty-state">
                                <p className="empty-title">Sin cuentas por cobrar</p>
                                <p className="empty-sub">
                                  {customerId ? 'Este cliente no tiene saldos pendientes.' : 'No hay saldos pendientes de cobro.'}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )
                      : isInvoiceView
                        ? (rows as AgingInvoiceEntry[]).map((entry, i) => (
                            <tr key={`${entry.invoice}-${i}`}>
                              <td style={{ fontWeight: 500 }}>{entry.customerName ?? entry.customer}</td>
                              <td>{entry.invoice}</td>
                              <td>{entry.dueDate ? formatDate(entry.dueDate) : ''}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(entry.totalOutstanding)}</td>
                              {showCurrent && <td style={{ textAlign: 'right' }}>{formatDOP(entry.current)}</td>}
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range1) }}>{formatDOP(entry.range1)}</td>
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range2) }}>{formatDOP(entry.range2)}</td>
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range3) }}>{formatDOP(entry.range3)}</td>
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range4) }}>{formatDOP(entry.range4)}</td>
                            </tr>
                          ))
                        : rows.map((entry, i) => (
                            <tr key={'customer' in entry ? entry.customer : i}>
                              <td style={{ fontWeight: 500 }}>{entry.customerName ?? entry.customer}</td>
                              {showCurrent && <td style={{ textAlign: 'right' }}>{formatDOP(entry.current)}</td>}
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range1) }}>{formatDOP(entry.range1)}</td>
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range2) }}>{formatDOP(entry.range2)}</td>
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range3) }}>{formatDOP(entry.range3)}</td>
                              <td style={{ textAlign: 'right', ...agingStyle(entry.range4) }}>{formatDOP(entry.range4)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(entry.totalOutstanding)}</td>
                            </tr>
                          ))}
              </tbody>
            </table>
          </div>
        </div>

        {rows && rows.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Total por cobrar: {formatDOP(rows.reduce((sum, e) => sum + e.totalOutstanding, 0))}
          </div>
        )}
      </div>
    </div>
  )
}
