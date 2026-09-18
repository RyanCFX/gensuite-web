import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookText, Download, Loader2 } from 'lucide-react'
import { getLibroMayor, downloadLibroMayorPdf, type LibroMayorParams, type GlReportRow } from '@/shared/api/libroMayor'
import { listSucursales } from '@/shared/api/sucursales'
import { formatDate, formatDOP } from '@/lib/formatters'
import { classifyGlRow } from '@/shared/lib/glLedger'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { RecargarButton } from '@/components/shared/RecargarButton'

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

interface CuentaGroup {
  account: string
  openingBalance: number
  periodDebit: number
  periodCredit: number
  closingBalance: number
  movements: GlReportRow[]
}

/** Reconstruye las tarjetas por cuenta a partir del flat `{columns, rows}` del reporte nativo:
 * cada cuenta trae una fila de Apertura, sus movimientos, una fila de Total y una de Cierre,
 * separada de la siguiente cuenta por una fila 100% null
 * (docs/tasks/61_migracion_libro_diario_mayor_general_ledger.md §2.2). */
function groupLibroMayorRows(rows: GlReportRow[]): CuentaGroup[] {
  const groups: CuentaGroup[] = []
  let current: CuentaGroup | null = null

  function ensureCurrent(): CuentaGroup {
    if (!current) {
      current = { account: '', openingBalance: 0, periodDebit: 0, periodCredit: 0, closingBalance: 0, movements: [] }
    }
    return current
  }

  for (const row of rows) {
    const kind = classifyGlRow(row)

    if (kind === 'separator') {
      if (current) { groups.push(current); current = null }
      continue
    }

    const account = row.account
    if (kind === 'subtotal' && typeof account === 'string') {
      const g = ensureCurrent()
      if (account.includes('Apertura')) g.openingBalance = Number(row.balance ?? 0)
      else if (account.includes('Total')) { g.periodDebit = Number(row.debit ?? 0); g.periodCredit = Number(row.credit ?? 0) }
      else if (account.includes('Cierre')) g.closingBalance = Number(row.balance ?? 0)
      continue
    }

    // Fila de movimiento normal
    const g = ensureCurrent()
    if (!g.account && typeof account === 'string') g.account = account
    g.movements.push(row)
  }
  if (current) groups.push(current)
  return groups
}

export default function LibroMayorPage() {
  const navigate = useNavigate()

  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [account, setAccount] = useState('')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')

  const [branchQuery, setBranchQuery] = useState('')
  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-libro-mayor', branchQuery],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchQuery || s.name.toLowerCase().includes(branchQuery.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const [queryParams, setQueryParams] = useState<LibroMayorParams | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['libro-mayor', queryParams],
    queryFn: () => getLibroMayor(queryParams ?? {}),
    enabled: queryParams !== null,
    staleTime: 5 * 60 * 1000,
  })

  function buildParams(): LibroMayorParams {
    return {
      fromDate,
      toDate,
      branch: branch || undefined,
      department: department || undefined,
      account: account || undefined,
    }
  }

  const handleGenerar = () => {
    setQueryParams(buildParams())
  }

  const downloadPdfMutation = useMutation({
    mutationFn: () => downloadLibroMayorPdf(buildParams()),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const groups = data ? groupLibroMayorRows(data.rows) : []

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Libro Mayor</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
        </div>
      </div>

      {/* Filters */}
      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
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
            <div className="ff-wrap" style={{ minWidth: 240 }}>
              <label className="ff-label">Cuenta contable</label>
              <AccountSelect
                value={account}
                onChange={setAccount}
                ledgerOnly={false}
                placeholder="Filtrar por cuenta…"
              />
            </div>
            <div className="ff-wrap" style={{ minWidth: 200 }}>
              <label className="ff-label">Sucursal</label>
              <SearchSelect
                value={branch}
                selectedLabel={branch}
                onChange={setBranch}
                options={branchOptions}
                onSearch={setBranchQuery}
                placeholder="Todas las sucursales"
              />
            </div>
            <div className="ff-wrap" style={{ minWidth: 220 }}>
              <label className="ff-label">Departamento</label>
              <DepartmentSelect
                value={department}
                onChange={setDepartment}
                placeholder="Todos los departamentos"
              />
            </div>
            <button className="btn btn-navy btn-size-sm" onClick={handleGenerar}>
              <BookText size={14} />
              Generar
            </button>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => downloadPdfMutation.mutate()}
              disabled={downloadPdfMutation.isPending}
            >
              {downloadPdfMutation.isPending ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              Descargar PDF
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
      {!isLoading && queryParams !== null && groups.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><BookText size={32} /></div>
          <p className="empty-title">Sin movimientos</p>
          <p className="empty-sub">No hay movimientos contables en el período seleccionado. Intente ampliar el rango de fechas.</p>
        </div>
      )}

      {/* Account cards */}
      {!isLoading && groups.length > 0 && (
        <>
          {groups.map((cuenta, gi) => (
            <div key={gi} className="card navy-table-card" style={{ marginBottom: 16 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title" style={{ fontWeight: 700 }}>{cuenta.account || '—'}</span>
                <span className="td-muted" style={{ fontSize: 13 }}>
                  Saldo inicial: {formatDOP(cuenta.openingBalance)}
                </span>
              </div>
              <div className="table-scroll">
                <table className="data-table navy-table">
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
                          const voucherType = String(mov.voucher_type ?? '')
                          const voucherNo = String(mov.voucher_no ?? '')
                          const link = voucherLink(voucherType, voucherNo)
                          const debit = mov.debit != null ? Number(mov.debit) : 0
                          const credit = mov.credit != null ? Number(mov.credit) : 0
                          const balance = mov.balance != null ? Number(mov.balance) : 0
                          const party = mov.party as string | null | undefined
                          return (
                            <tr key={i}>
                              <td className="td-muted">{mov.posting_date ? formatDate(String(mov.posting_date)) : '—'}</td>
                              <td>
                                {link
                                  ? (
                                      <button
                                        className="btn btn-ghost btn-size-sm"
                                        style={{ padding: '0 4px', fontSize: 12 }}
                                        onClick={() => navigate(link)}
                                      >
                                        {voucherNo}
                                      </button>
                                    )
                                  : <span style={{ fontSize: 12 }}>{voucherNo || '—'}</span>}
                                {party && (
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{party}</div>
                                )}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                {debit > 0 ? formatDOP(debit) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                {credit > 0 ? formatDOP(credit) : '—'}
                              </td>
                              <td style={{
                                textAlign: 'right',
                                fontFamily: 'monospace',
                                fontSize: 12,
                                color: balance > 0
                                  ? 'var(--success-text)'
                                  : balance < 0
                                    ? 'var(--error-text)'
                                    : undefined,
                              }}>
                                {formatDOP(balance)}
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
              {groups.length} cuenta{groups.length !== 1 ? 's' : ''} con actividad en el período
            </span>
          </div>
        </>
      )}
    </div>
  )
}
