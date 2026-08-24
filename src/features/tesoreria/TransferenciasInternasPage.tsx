import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { listTransferenciasInternas } from '@/shared/api/tesoreria'
import type { ListTransferenciasInternasParams } from '@/shared/api/tesoreria'
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

export default function TransferenciasInternasPage() {
  const navigate = useNavigate()
  const [cuentaBancaria, setCuentaBancaria] = useState('')
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { orderBy, sort } = useSortState()

  const params: ListTransferenciasInternasParams = {
    cuentaBancaria: cuentaBancaria || undefined,
    estado: estado === 'all' ? undefined : estado,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tesoreria-transferencias-internas', params],
    queryFn: () => listTransferenciasInternas(params),
  })

  const transferencias = data?.items ?? []

  return (
    <div className="page-container">
      <PageHeader
        title="Transferencias Internas"
        description="Traspasos de dinero entre cuentas bancarias propias de la empresa"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/tesoreria/transferencias/nueva')}>
            <Plus size={16} />
            Nueva Transferencia
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
          <FilterField label="Cuenta bancaria (origen)" style={{ width: 220 }}>
            <CuentaBancariaSelect value={cuentaBancaria} onChange={setCuentaBancaria} placeholder="Todas las cuentas" />
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
                <th>Cuenta Origen</th>
                <th>Cuenta Destino</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : transferencias.length === 0
                  ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="empty-state">
                            <p className="empty-title">Sin transferencias internas</p>
                            <p className="empty-sub">Registra el primer traspaso entre cuentas propias.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : transferencias.map((t) => {
                      // Las 2 (o 3, si hay comisión) líneas del asiento: la de crédito es el origen,
                      // la de débito es el destino — no hay campos separados cuentaOrigen/cuentaDestino
                      // en el shape normalizado de respuesta, se leen de `lineas`.
                      const origenLinea = t.lineas.find((l) => l.credito > 0)
                      const destinoLinea = t.lineas.find((l) => l.debito > 0 && l.cuenta !== origenLinea?.cuenta)
                      return (
                        <tr key={t.id} className="data-table-row-link" onClick={() => navigate(`/tesoreria/transferencias/${t.id}`)}>
                          <td className="td-muted">{formatDate(t.fecha)}</td>
                          <td className="td-muted">{t.cuentaBancaria ?? origenLinea?.cuenta ?? '—'}</td>
                          <td className="td-muted">{destinoLinea?.cuenta ?? '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(t.monto)}</td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[t.estado]}`}>{STATUS_LABEL[t.estado]}</span>
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
