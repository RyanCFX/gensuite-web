import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, BookOpen, Download, Loader2 } from 'lucide-react'
import { getLibroDiario, downloadLibroDiarioPdf, type LibroDiarioParams } from '@/shared/api/libroDiario'
import { formatDate, formatDOP } from '@/lib/formatters'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const VOUCHER_TYPES = [
  'Sales Invoice',
  'Purchase Invoice',
  'Payment Entry',
  'Journal Entry',
  'Delivery Note',
  'Purchase Receipt',
  'Stock Entry',
]

function voucherLink(voucherType: string, voucherNo: string): string | null {
  switch (voucherType) {
    case 'Sales Invoice':    return `/facturas/${voucherNo}`
    case 'Purchase Invoice': return `/compras/${voucherNo}`
    case 'Payment Entry':    return `/cobros/${voucherNo}`
    case 'Journal Entry':    return `/asientos/${voucherNo}`
    default:                 return null
  }
}

export default function LibroDiarioPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [account, setAccount] = useState('')
  const [voucherType, setVoucherType] = useState(searchParams.get('voucherType') ?? '')
  const [voucherNo, setVoucherNo] = useState(searchParams.get('voucherNo') ?? '')
  const [groupBy, setGroupBy] = useState('Group by Voucher (Consolidated)')

  const [queryParams, setQueryParams] = useState<LibroDiarioParams | null>(null)

  // ─── Read deep-link params from URL ─────────────────────────────────
  useEffect(() => {
    const initialVoucherNo = searchParams.get('voucherNo')
    const initialVoucherType = searchParams.get('voucherType')
    if (initialVoucherNo || initialVoucherType) {
      const params: LibroDiarioParams = {
        fromDate,
        toDate,
        account: account || undefined,
        voucherType: initialVoucherType || undefined,
        voucherNo: initialVoucherNo || undefined,
        groupBy: groupBy || undefined,
      }
      setQueryParams(params)
    }
    // Only run once on mount with initial URL params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['libro-diario', queryParams],
    queryFn: () => getLibroDiario(queryParams ?? {}),
    enabled: queryParams !== null,
  })

  function buildParams(): LibroDiarioParams {
    return {
      fromDate,
      toDate,
      account: account || undefined,
      voucherType: voucherType || undefined,
      voucherNo: voucherNo || undefined,
      groupBy: groupBy || undefined,
    }
  }

  const handleSearch = () => {
    setQueryParams(buildParams())
  }

  const downloadPdfMutation = useMutation({
    mutationFn: () => downloadLibroDiarioPdf(buildParams()),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const rows = data?.rows ?? []
  const totalDebit = data?.totalDebit ?? 0
  const totalCredit = data?.totalCredit ?? 0

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Libro Diario</h1>
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
                placeholder="Buscar cuenta…"
                ledgerOnly={false}
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Tipo de voucher</label>
              <Select value={voucherType} onValueChange={setVoucherType} placeholder="Todos">
                {VOUCHER_TYPES.map((vt) => (
                  <SelectItem key={vt} value={vt}>{vt}</SelectItem>
                ))}
              </Select>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">No. Voucher</label>
              <input
                className="ff-input"
                placeholder="Número de voucher…"
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
              />
            </div>
            <div className="ff-wrap" style={{ minWidth: 240 }}>
              <label className="ff-label">Agrupar por</label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectItem value="Group by Voucher (Consolidated)">Group by Voucher (Consolidated)</SelectItem>
                <SelectItem value="Group by Account">Group by Account</SelectItem>
                <SelectItem value="">Sin agrupar</SelectItem>
              </Select>
            </div>
            <button className="btn btn-primary" onClick={handleSearch}>
              <Search size={14} />
              Buscar
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => downloadPdfMutation.mutate()}
              disabled={downloadPdfMutation.isPending}
            >
              {downloadPdfMutation.isPending ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              Descargar PDF
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Identificador</th>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th>Voucher</th>
                <th style={{ textAlign: 'right' }}>Débito</th>
                <th style={{ textAlign: 'right' }}>Crédito</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th>Parte</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : queryParams === null
                  ? (
                      <tr>
                        <td colSpan={9}>
                          <div className="empty-state">
                            <div className="empty-icon"><BookOpen size={28} /></div>
                            <p className="empty-title">Selecciona un rango de fechas</p>
                            <p className="empty-sub">Define los filtros y presiona Buscar para ver el libro diario</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : rows.length === 0
                    ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="empty-state">
                              <div className="empty-icon"><BookOpen size={28} /></div>
                              <p className="empty-title">Sin movimientos</p>
                              <p className="empty-sub">No se encontraron registros para el período seleccionado</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : rows.map((row, i) => {
                        const link = voucherLink(row.voucherType, row.voucherNo)
                        return (
                          <tr key={i}>
                            <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.glEntryId}</td>
                            <td className="td-muted">{formatDate(row.postingDate)}</td>
                            <td style={{ fontSize: 12 }}>{row.account}</td>
                            <td className="td-muted" style={{ fontSize: 12 }}>{row.voucherType}</td>
                            <td>
                              {link
                                ? (
                                    <button
                                      className="btn btn-ghost btn-size-sm"
                                      style={{ padding: '0 4px', fontSize: 12 }}
                                      onClick={() => navigate(link)}
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
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                              {formatDOP(row.balance)}
                            </td>
                            <td className="td-muted" style={{ fontSize: 12 }}>
                              {row.party ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border-default)' }}>
                  <td colSpan={5} style={{ fontSize: 13 }}>Totales</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{formatDOP(totalDebit)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{formatDOP(totalCredit)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
