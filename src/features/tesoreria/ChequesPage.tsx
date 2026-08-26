import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listCheques } from '@/shared/api/tesoreria'
import type { ListChequesParams } from '@/shared/api/tesoreria'
import { listSuppliers } from '@/shared/api/suppliers'
import type { ChequeEstado } from '@/shared/api/types'
import { CuentaBancariaSelect } from './components/CuentaBancariaSelect'
import { formatDate, formatDOP } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Printer } from 'lucide-react'

const STATUS_BADGE: Record<ChequeEstado, string> = {
  Reservado: 'badge-draft',
  Emitido: 'badge-submitted',
  Cobrado: 'badge-success',
  Anulado: 'badge-cancelled',
}

type EstadoFilter = ChequeEstado | 'all'

export default function ChequesPage() {
  const navigate = useNavigate()
  const [cuentaBancaria, setCuentaBancaria] = useState('')
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const [chequeNo, setChequeNo] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [beneficiario, setBeneficiario] = useState('')
  const [beneficiarioLabel, setBeneficiarioLabel] = useState('')
  const [beneficiarioQuery, setBeneficiarioQuery] = useState('')
  const [impreso, setImpreso] = useState<'all' | 'yes' | 'no'>('all')
  const { orderBy, sort } = useSortState()

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['cheques-beneficiario-search', beneficiarioQuery],
    queryFn: () => listSuppliers({ search: beneficiarioQuery || undefined, limit: 15 }),
  })
  const beneficiarioOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
  }))

  const params: ListChequesParams = {
    cuentaBancaria: cuentaBancaria || undefined,
    estado: estado === 'all' ? undefined : estado,
    chequeNo: chequeNo || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    beneficiario: beneficiario || undefined,
    impreso: impreso === 'all' ? undefined : impreso === 'yes',
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tesoreria-cheques', params],
    queryFn: () => listCheques(params),
  })

  const cheques = data?.items ?? []

  return (
    <div className="page-container">
      <PageHeader
        title="Cheques"
        description="Historial de cheques emitidos a proveedores desde Emisiones o Pagos"
      />

      <div className="filter-bar">
        <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
          <FilterField label="Cuenta bancaria" style={{ width: 220 }}>
            <CuentaBancariaSelect value={cuentaBancaria} onChange={setCuentaBancaria} placeholder="Todas las cuentas" />
          </FilterField>
          <FilterField label="Número de cheque">
            <input
              className="ff-input"
              style={{ width: 140 }}
              placeholder="Buscar número…"
              value={chequeNo}
              onChange={(e) => setChequeNo(e.target.value)}
            />
          </FilterField>
          <FilterField label="Beneficiario" style={{ width: 220 }}>
            <SearchSelect
              value={beneficiario}
              selectedLabel={beneficiarioLabel}
              onChange={(val, opt) => { setBeneficiario(val); setBeneficiarioLabel(opt?.label ?? '') }}
              options={beneficiarioOptions}
              onSearch={setBeneficiarioQuery}
              loading={suppliersLoading}
              placeholder="Filtrar por proveedor…"
            />
          </FilterField>
          <FilterField label="Estado">
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoFilter)} clearable={false}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="Reservado">Reservado</SelectItem>
              <SelectItem value="Emitido">Emitido</SelectItem>
              <SelectItem value="Cobrado">Cobrado</SelectItem>
              <SelectItem value="Anulado">Anulado</SelectItem>
            </Select>
          </FilterField>
          <FilterField label="Impreso">
            <Select value={impreso} onValueChange={(v) => setImpreso(v as typeof impreso)} clearable={false}>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="yes">Impresos</SelectItem>
              <SelectItem value="no">Sin imprimir</SelectItem>
            </Select>
          </FilterField>
          <FilterField label="Desde">
            <DatePicker className="ff-input" value={fromDate} onChange={setFromDate} clearable />
          </FilterField>
          <FilterField label="Hasta">
            <DatePicker className="ff-input" value={toDate} onChange={setToDate} clearable />
          </FilterField>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Fecha" sortKey="fecha" orderBy={orderBy} onSort={sort} />
                <th>Número</th>
                <th>Cuenta Bancaria</th>
                <th>Beneficiario</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Estado</th>
                <th>Impreso</th>
                <th>Documento origen</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : cheques.length === 0
                  ? (
                      <tr>
                        <td colSpan={8}>
                          <div className="empty-state">
                            <p className="empty-title">Sin cheques</p>
                            <p className="empty-sub">Los cheques emitidos desde Emisiones o Pagos aparecerán aquí.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : cheques.map((c) => (
                      <tr key={c.id} className="data-table-row-link" onClick={() => navigate(`/tesoreria/cheques/${c.id}`)}>
                        <td className="td-muted">{formatDate(c.fecha)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{c.chequeNo}</td>
                        <td className="td-muted">{c.cuentaBancariaNombre ?? c.cuentaBancaria}</td>
                        <td>{c.beneficiario?.nombre ?? c.beneficiarioNombre ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(c.monto)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[c.estado]}`}>{c.estado}</span>
                        </td>
                        <td>
                          {c.impreso
                            ? <span className="badge badge-neutral"><Printer size={12} /> {c.vecesImpreso ? `×${c.vecesImpreso}` : 'Sí'}</span>
                            : <span className="td-muted">No</span>}
                        </td>
                        <td className="td-muted">{c.documentoOrigen ? `${c.documentoOrigen.doctype} — ${c.documentoOrigen.name}` : '—'}</td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {!isLoading && data?.meta && (
          <div className="table-footer">
            <span className="table-footer-count">
              {cheques.length} de {data.meta.total} cheques
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
