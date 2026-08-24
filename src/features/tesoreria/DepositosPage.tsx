import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listDepositos, listTiposDocumento } from '@/shared/api/tesoreria'
import type { ListDepositosParams } from '@/shared/api/tesoreria'
import type { TesoreriaEstado } from '@/shared/api/types'
import { CuentaBancariaSelect } from './components/CuentaBancariaSelect'
import { formatDate, formatDOP } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const STATUS_BADGE: Record<TesoreriaEstado, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<TesoreriaEstado, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

type EstadoFilter = TesoreriaEstado | 'all'

export default function DepositosPage() {
  const navigate = useNavigate()
  const [cuentaBancaria, setCuentaBancaria] = useState('')
  const [tipoDocumento, setTipoDocumento] = useState('')
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { orderBy, sort } = useSortState()

  const { data: tiposData } = useQuery({
    queryKey: ['tesoreria-tipos-documento-select-deposito'],
    queryFn: () => listTiposDocumento({ enabled: true, limit: 100 }),
  })
  // Convención (no filtro estricto): los tipos de naturaleza Débito son los típicos para Depósitos —
  // se muestran primero, pero no se ocultan los demás.
  const tipos = [...(tiposData?.items ?? [])].sort((a, b) => {
    const aDeb = a.transactionType === 'Débito' ? 0 : 1
    const bDeb = b.transactionType === 'Débito' ? 0 : 1
    return aDeb - bDeb
  })

  const params: ListDepositosParams = {
    cuentaBancaria: cuentaBancaria || undefined,
    tipoDocumento: tipoDocumento || undefined,
    estado: estado === 'all' ? undefined : estado,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tesoreria-depositos', params],
    queryFn: () => listDepositos(params),
  })

  const depositos = data?.items ?? []

  return (
    <div className="page-container">
      <PageHeader
        title="Depósitos"
        description="Depósitos bancarios, cobros de clientes, liquidaciones de tarjeta y reembolsos de proveedores"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/tesoreria/depositos/nuevo')}>
            <Plus size={16} />
            Nuevo Depósito
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
          <FilterField label="Cuenta bancaria" style={{ width: 220 }}>
            <CuentaBancariaSelect value={cuentaBancaria} onChange={setCuentaBancaria} placeholder="Todas las cuentas" />
          </FilterField>
          <FilterField label="Tipo de documento">
            <Select value={tipoDocumento} onValueChange={setTipoDocumento} placeholder="Todos los tipos">
              {tipos.map((t) => (
                <SelectItem key={t.id} value={t.code}>{t.code} — {t.description}</SelectItem>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Estado">
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoFilter)} clearable={false}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="submitted">Sometido</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
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
                <th>Tipo</th>
                <th>Cuenta Bancaria</th>
                <th>Origen</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : depositos.length === 0
                  ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            <p className="empty-title">Sin depósitos</p>
                            <p className="empty-sub">Registra el primer depósito o cobro de tesorería.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : depositos.map((d) => (
                      <tr key={d.id} className="data-table-row-link" onClick={() => navigate(`/tesoreria/depositos/${d.id}`)}>
                        <td className="td-muted">{formatDate(d.fecha)}</td>
                        <td className="td-muted">{d.tipoDocumento ?? '—'}</td>
                        <td className="td-muted">{d.cuentaBancaria ?? '—'}</td>
                        <td>{d.beneficiario?.nombre ?? d.beneficiarioNombre ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success-text)' }}>{formatDOP(d.monto)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[d.estado]}`}>{STATUS_LABEL[d.estado]}</span>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
