import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, BookOpen, Download, Loader2 } from 'lucide-react'
import { getLibroDiario, downloadLibroDiarioPdf, type LibroDiarioParams } from '@/shared/api/libroDiario'
import { listCustomers } from '@/shared/api/customers'
import { listSuppliers } from '@/shared/api/suppliers'
import { listSucursales } from '@/shared/api/sucursales'
import { formatDate, formatDOP } from '@/lib/formatters'
import { classifyGlRow } from '@/shared/lib/glLedger'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'

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

type GroupBy = NonNullable<LibroDiarioParams['groupBy']>

export default function LibroDiarioPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [fromDate, setFromDate] = useState(searchParams.get('fromDate') ?? firstOfMonth())
  const [toDate, setToDate] = useState(searchParams.get('toDate') ?? today())
  const [account, setAccount] = useState('')
  const [voucherType, setVoucherType] = useState(searchParams.get('voucherType') ?? '')
  const [voucherNo, setVoucherNo] = useState(searchParams.get('voucherNo') ?? '')
  const [groupBy, setGroupBy] = useState<GroupBy>('Group by Voucher (Consolidated)')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')

  const [branchQuery, setBranchQuery] = useState('')
  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-libro-diario', branchQuery],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchQuery || s.name.toLowerCase().includes(branchQuery.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  // Filtro de Tercero (§3): el reporte nativo exige valor exacto + saber si es Cliente o
  // Proveedor — reemplaza el viejo input de texto libre por tipo + autocompletar.
  const [partyType, setPartyType] = useState<'' | 'Customer' | 'Supplier'>('')
  const [party, setParty] = useState('')
  const [partyLabel, setPartyLabel] = useState('')
  const [partyQuery, setPartyQuery] = useState('')

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', partyQuery],
    queryFn: () => listCustomers({ search: partyQuery || undefined, limit: 15 }),
    enabled: partyType === 'Customer',
  })
  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', partyQuery],
    queryFn: () => listSuppliers({ search: partyQuery || undefined, limit: 15 }),
    enabled: partyType === 'Supplier',
  })
  const partyOptions: SearchSelectOption[] = partyType === 'Customer'
    ? (customersData?.items ?? []).map((c) => ({ value: c.id, label: c.customerName }))
    : partyType === 'Supplier'
      ? (suppliersData?.items ?? []).map((s) => ({ value: s.id, label: s.supplierName }))
      : []

  function handlePartyTypeChange(val: string) {
    setPartyType(val === 'all' ? '' : (val as 'Customer' | 'Supplier'))
    setParty('')
    setPartyLabel('')
    setPartyQuery('')
  }

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
        groupBy,
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
      branch: branch || undefined,
      department: department || undefined,
      account: account || undefined,
      voucherType: voucherType || undefined,
      voucherNo: voucherNo || undefined,
      groupBy,
      partyType: partyType || undefined,
      party: partyType && party ? party : undefined,
    }
  }

  const handleSearch = () => {
    setQueryParams(buildParams())
  }

  const downloadPdfMutation = useMutation({
    mutationFn: () => downloadLibroDiarioPdf(buildParams()),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  // Filas separadoras (todos los campos null) no aplican a Libro Diario (§2.1 — un solo trío
  // global, no una por cuenta), pero se filtran igual por si el backend las llegara a incluir.
  const rows = (data?.rows ?? []).filter((r) => classifyGlRow(r) !== 'separator')

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Libro Diario</h1>
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
                placeholder="Buscar cuenta…"
                ledgerOnly={false}
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
              <Select value={groupBy} onValueChange={(val) => setGroupBy(val as GroupBy)}>
                <SelectItem value="Group by Voucher">Agrupar por Voucher</SelectItem>
                <SelectItem value="Group by Voucher (Consolidated)">Agrupar por Voucher (Consolidado)</SelectItem>
                <SelectItem value="Group by Account">Agrupar por Cuenta</SelectItem>
                <SelectItem value="Group by Sucursal">Agrupar por Sucursal</SelectItem>
                <SelectItem value="Group by Departamento">Agrupar por Departamento</SelectItem>
              </Select>
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Tercero</label>
              <Select value={partyType || 'all'} onValueChange={handlePartyTypeChange}>
                <SelectItem value="all">Sin filtro</SelectItem>
                <SelectItem value="Customer">Cliente</SelectItem>
                <SelectItem value="Supplier">Proveedor</SelectItem>
              </Select>
            </div>
            {partyType && (
              <div className="ff-wrap" style={{ minWidth: 220 }}>
                <label className="ff-label">{partyType === 'Customer' ? 'Cliente' : 'Proveedor'}</label>
                <SearchSelect
                  value={party}
                  selectedLabel={partyLabel}
                  onChange={(val, opt) => { setParty(val); setPartyLabel(opt?.label ?? '') }}
                  options={partyOptions}
                  onSearch={setPartyQuery}
                  loading={partyType === 'Customer' ? customersLoading : suppliersLoading}
                  placeholder={partyType === 'Customer' ? 'Todos los clientes' : 'Todos los proveedores'}
                />
              </div>
            )}
            <button className="btn btn-navy" onClick={handleSearch}>
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
      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
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
                        const isSubtotal = classifyGlRow(row) === 'subtotal'
                        const debit = row.debit != null ? Number(row.debit) : null
                        const credit = row.credit != null ? Number(row.credit) : null
                        const balance = row.balance != null ? Number(row.balance) : null

                        if (isSubtotal) {
                          return (
                            <tr key={i} style={{ fontWeight: 700, background: 'var(--surface-sunken)' }}>
                              <td colSpan={5} style={{ fontSize: 13 }}>{String(row.account)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{debit ? formatDOP(debit) : '—'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{credit ? formatDOP(credit) : '—'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{balance != null ? formatDOP(balance) : '—'}</td>
                              <td />
                            </tr>
                          )
                        }

                        const rowVoucherType = String(row.voucher_type ?? '')
                        const rowVoucherNo = String(row.voucher_no ?? '')
                        const link = voucherLink(rowVoucherType, rowVoucherNo)
                        return (
                          <tr key={i}>
                            <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(row.gl_entry ?? '—')}</td>
                            <td className="td-muted">{row.posting_date ? formatDate(String(row.posting_date)) : '—'}</td>
                            <td style={{ fontSize: 12 }}>{String(row.account ?? '—')}</td>
                            <td className="td-muted" style={{ fontSize: 12 }}>{String(row.voucher_subtype ?? rowVoucherType ?? '—')}</td>
                            <td>
                              {link
                                ? (
                                    <button
                                      className="btn btn-ghost btn-size-sm"
                                      style={{ padding: '0 4px', fontSize: 12 }}
                                      onClick={() => navigate(link)}
                                    >
                                      {rowVoucherNo}
                                    </button>
                                  )
                                : <span style={{ fontSize: 12 }}>{rowVoucherNo || '—'}</span>}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                              {debit ? formatDOP(debit) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                              {credit ? formatDOP(credit) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                              {balance != null ? formatDOP(balance) : '—'}
                            </td>
                            <td className="td-muted" style={{ fontSize: 12 }}>
                              {(row.party as string | null) ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
