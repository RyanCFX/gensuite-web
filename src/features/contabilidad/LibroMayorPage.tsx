import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookText } from 'lucide-react'
import { getLibroMayor, type LibroMayorParams } from '@/shared/api/libroMayor'
import { formatDate, formatDOP } from '@/lib/formatters'
import { AccountSelect } from '@/components/shared/AccountSelect'

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

export default function LibroMayorPage() {
  const navigate = useNavigate()

  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [account, setAccount] = useState('')

  const [queryParams, setQueryParams] = useState<LibroMayorParams | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['libro-mayor', queryParams],
    queryFn: () => getLibroMayor(queryParams ?? {}),
    enabled: queryParams !== null,
    staleTime: 5 * 60 * 1000,
  })

  const handleGenerar = () => {
    setQueryParams({
      fromDate,
      toDate,
      account: account || undefined,
    })
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Libro Mayor</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div className="ff-wrap">
              <label className="ff-label">Desde</label>
              <input
                type="date"
                className="ff-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Hasta</label>
              <input
                type="date"
                className="ff-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="ff-wrap" style={{ minWidth: 240 }}>
              <label className="ff-label">Cuenta contable</label>
              <AccountSelect
                value={account}
                onChange={setAccount}
                ledgerOnly={false}
                placeholder="Filtrar por cuenta…"
              />
            </div>
            <button className="btn btn-primary btn-size-sm" onClick={handleGenerar}>
              <BookText size={14} />
              Generar
            </button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ marginBottom: 12 }}>
              <div className="card-body">
                <div className="skeleton-box" style={{ height: 120, borderRadius: 6 }} />
              </div>
            </div>
          ))}
          <p className="td-muted" style={{ textAlign: 'center', marginTop: 8, fontSize: 13 }}>
            Calculando saldos…
          </p>
        </div>
      )}

      {/* Prompt state */}
      {!isLoading && queryParams === null && (
        <div className="empty-state">
          <div className="empty-icon"><BookText size={32} /></div>
          <p className="empty-title">Selecciona un rango de fechas y presiona Generar</p>
        </div>
      )}

      {/* Empty results */}
      {!isLoading && queryParams !== null && data?.accounts.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><BookText size={32} /></div>
          <p className="empty-title">Sin movimientos</p>
          <p className="empty-sub">No hay movimientos contables en el período seleccionado. Intente ampliar el rango de fechas.</p>
        </div>
      )}

      {/* Account cards */}
      {!isLoading && data && data.accounts.length > 0 && (
        <>
          {data.accounts.map((cuenta) => (
            <div key={cuenta.account} className="card" style={{ marginBottom: 16 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title" style={{ fontWeight: 700 }}>{cuenta.account}</span>
                <span className="td-muted" style={{ fontSize: 13 }}>
                  Saldo inicial: {formatDOP(cuenta.openingBalance)}
                </span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Documento</th>
                      <th style={{ textAlign: 'right' }}>Débito</th>
                      <th style={{ textAlign: 'right' }}>Crédito</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.movements.length === 0
                      ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                              Sin movimientos en el período
                            </td>
                          </tr>
                        )
                      : cuenta.movements.map((mov, i) => {
                          const link = voucherLink(mov.voucherType, mov.voucherNo)
                          return (
                            <tr key={i}>
                              <td className="td-muted">{formatDate(mov.postingDate)}</td>
                              <td>
                                {link
                                  ? (
                                      <button
                                        className="btn btn-ghost btn-size-sm"
                                        style={{ padding: '0 4px', fontSize: 12 }}
                                        onClick={() => navigate(link)}
                                      >
                                        {mov.voucherNo}
                                      </button>
                                    )
                                  : <span style={{ fontSize: 12 }}>{mov.voucherNo}</span>}
                                {mov.party && (
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{mov.party}</div>
                                )}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                {mov.debit > 0 ? formatDOP(mov.debit) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                {mov.credit > 0 ? formatDOP(mov.credit) : '—'}
                              </td>
                              <td style={{
                                textAlign: 'right',
                                fontFamily: 'monospace',
                                fontSize: 12,
                                color: mov.balance > 0
                                  ? 'var(--success-text)'
                                  : mov.balance < 0
                                    ? 'var(--error-text)'
                                    : undefined,
                              }}>
                                {formatDOP(mov.balance)}
                              </td>
                            </tr>
                          )
                        })}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border-strong)' }}>
                      <td colSpan={2} style={{ fontSize: 13 }}>Total período</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{formatDOP(cuenta.periodDebit)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{formatDOP(cuenta.periodCredit)}</td>
                      <td style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: 13,
                        color: cuenta.closingBalance > 0
                          ? 'var(--success-text)'
                          : cuenta.closingBalance < 0
                            ? 'var(--error-text)'
                            : undefined,
                      }}>
                        {formatDOP(cuenta.closingBalance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}

          {/* Global footer */}
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--surface-card)', borderRadius: 8, border: '1px solid var(--border-default)' }}>
            <span className="td-muted" style={{ fontSize: 13 }}>
              {data.totalAccounts} cuenta{data.totalAccounts !== 1 ? 's' : ''} con actividad en el período
            </span>
          </div>
        </>
      )}
    </div>
  )
}
