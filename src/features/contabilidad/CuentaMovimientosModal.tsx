import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Search } from 'lucide-react'
import { getCuentaMovimientos, type CuentaMovimientosParams } from '@/shared/api/libroDiario'
import { formatDate, formatDOP } from '@/lib/formatters'
import { DatePicker } from '@/shared/ui/DatePicker'

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function voucherLink(voucherType: string, voucherNo: string): string | null {
  switch (voucherType) {
    case 'Sales Invoice':    return `/facturas/${voucherNo}`
    case 'Purchase Invoice': return `/compras/${voucherNo}`
    case 'Payment Entry':    return `/cobros/${voucherNo}`
    case 'Journal Entry':    return `/asientos/${voucherNo}`
    default:                 return null
  }
}

interface Props {
  accountId: string
  onClose: () => void
}

export function CuentaMovimientosModal({ accountId, onClose }: Props) {
  const navigate = useNavigate()

  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [queryParams, setQueryParams] = useState<CuentaMovimientosParams>({ fromDate: firstOfMonth(), toDate: today() })

  const { data, isLoading } = useQuery({
    queryKey: ['cuenta-movimientos', accountId, queryParams],
    queryFn: () => getCuentaMovimientos(accountId, queryParams),
  })

  const handleSearch = () => {
    setQueryParams({ fromDate, toDate })
  }

  const rows = data?.rows ?? []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 760 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title" style={{ fontSize: 14 }}>{accountId}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Date filters */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="ff-wrap">
              <label className="ff-label">Desde</label>
              <DatePicker
                className="ff-input"
                value={fromDate}
                onChange={setFromDate}
                clearable
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Hasta</label>
              <DatePicker
                className="ff-input"
                value={toDate}
                onChange={setToDate}
                clearable
              />
            </div>
            <button className="btn btn-primary btn-size-sm" onClick={handleSearch}>
              <Search size={13} />
              Buscar
            </button>
          </div>

          {/* Table */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Voucher</th>
                  <th style={{ textAlign: 'right' }}>Débito</th>
                  <th style={{ textAlign: 'right' }}>Crédito</th>
                  <th style={{ textAlign: 'right' }}>Saldo acumulado</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                        ))}
                      </tr>
                    ))
                  : data?.totalRows === 0 || rows.length === 0
                    ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="empty-state" style={{ padding: '24px 0' }}>
                              <p className="empty-title">Sin movimientos</p>
                              <p className="empty-sub">No se encontraron registros para el período</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : rows.map((row, i) => {
                        const link = voucherLink(row.voucherType, row.voucherNo)
                        const balanceColor = row.balance > 0
                          ? 'var(--success-text)'
                          : row.balance < 0
                            ? 'var(--error-text)'
                            : undefined
                        return (
                          <tr key={i}>
                            <td className="td-muted" style={{ fontSize: 12 }}>{formatDate(row.postingDate)}</td>
                            <td className="td-muted" style={{ fontSize: 12 }}>{row.voucherType}</td>
                            <td>
                              {link
                                ? (
                                    <button
                                      className="btn btn-ghost btn-size-sm"
                                      style={{ padding: '0 4px', fontSize: 12 }}
                                      onClick={() => { navigate(link); onClose() }}
                                    >
                                      {row.voucherNo}
                                    </button>
                                  )
                                : <span style={{ fontSize: 12 }}>{row.voucherNo}</span>}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                              {row.debit ? formatDOP(row.debit) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                              {row.credit ? formatDOP(row.credit) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: balanceColor }}>
                              {formatDOP(row.balance)}
                            </td>
                          </tr>
                        )
                      })}
              </tbody>
              {data && rows.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border-default)' }}>
                    <td colSpan={3} style={{ fontSize: 13 }}>Totales</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{formatDOP(data.totalDebit)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{formatDOP(data.totalCredit)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>
                      <span style={{ color: data.closingBalance >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>
                        {formatDOP(data.closingBalance)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
