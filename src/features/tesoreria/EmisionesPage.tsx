import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listEmisiones } from '@/shared/api/tesoreria'
import type { ListEmisionesParams } from '@/shared/api/tesoreria'
import { listTiposDocumento } from '@/shared/api/tesoreria'
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

export default function EmisionesPage() {
  const navigate = useNavigate()
  const [cuentaBancaria, setCuentaBancaria] = useState('')
  const [tipoDocumento, setTipoDocumento] = useState('')
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { orderBy, sort } = useSortState()

  const { data: tiposData } = useQuery({
    queryKey: ['tesoreria-tipos-documento-select', 'Cheque,Transferencia,Otro'],
    queryFn: () => listTiposDocumento({ enabled: true, limit: 100 }),
  })
  const tipos = tiposData?.items ?? []

  const params: ListEmisionesParams = {
    cuentaBancaria: cuentaBancaria || undefined,
    tipoDocumento: tipoDocumento || undefined,
    estado: estado === 'all' ? undefined : estado,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tesoreria-emisiones', params],
    queryFn: () => listEmisiones(params),
  })

  const emisiones = data?.items ?? []

  return (
    <div className="page-container">
      <PageHeader
        title="Emisiones"
        description="Cheques, transferencias salientes, pagos a proveedores y ajustes que reducen el saldo bancario"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/tesoreria/emisiones/nueva')}>
            <Plus size={16} />
            Nueva Emisión
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
                <th>Beneficiario</th>
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
                : emisiones.length === 0
                  ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            <p className="empty-title">Sin emisiones</p>
                            <p className="empty-sub">Registra la primera emisión (cheque, transferencia o pago).</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : emisiones.map((e) => (
                      <tr key={e.id} className="data-table-row-link" onClick={() => navigate(`/tesoreria/emisiones/${e.id}`)}>
                        <td className="td-muted">{formatDate(e.fecha)}</td>
                        <td className="td-muted">{e.tipoDocumento ?? '—'}</td>
                        <td className="td-muted">{e.cuentaBancaria ?? '—'}</td>
                        <td>{e.beneficiario?.nombre ?? e.beneficiarioNombre ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(e.monto)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[e.estado]}`}>{STATUS_LABEL[e.estado]}</span>
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
