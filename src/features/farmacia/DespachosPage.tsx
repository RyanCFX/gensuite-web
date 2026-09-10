import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listDespachos } from '@/shared/api/farmacia'
import type { ListDespachosParams } from '@/shared/api/farmacia'
import { Eye } from 'lucide-react'
import { formatDOP } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import type { DespachoEstado } from '@/shared/api/types'

type EstadoFilter = DespachoEstado | 'all'

const ESTADO_BADGE: Record<DespachoEstado, string> = {
  Confirmado: 'badge-draft',
  Cobrado: 'badge-submitted',
  Facturado: 'badge-info',
}

export default function DespachosPage() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const { orderBy, sort } = useSortState()

  const params: ListDespachosParams = {
    estado: estado === 'all' ? undefined : estado,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-despachos', params],
    queryFn: () => listDespachos(params),
  })

  const despachos = data?.items ?? []

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Despachos ARS</h1>
          <p className="page-sub">Entregas de medicamentos ya con los montos fijados desde la preaprobación</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <FilterField label="Estado">
            <Select value={estado} onValueChange={(val) => setEstado(val as EstadoFilter)}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="Confirmado">Confirmado</SelectItem>
              <SelectItem value="Cobrado">Cobrado</SelectItem>
              <SelectItem value="Facturado">Facturado</SelectItem>
            </Select>
          </FilterField>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <th>ARS</th>
              <th>Paciente</th>
              <th>N.º autorización</th>
              <th style={{ textAlign: 'right' }}>Monto ARS</th>
              <th style={{ textAlign: 'right' }}>Monto Paciente</th>
              <SortableTh label="Estado" sortKey="estado" orderBy={orderBy} onSort={sort} />
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : despachos.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-title">Sin despachos</div>
                    <p className="empty-sub">Los despachos se crean desde una preaprobación confirmada.</p>
                  </div>
                </td>
              </tr>
            ) : (
              despachos.map((d) => (
                <tr
                  key={d.id}
                  className="table-row-clickable"
                  onClick={() => navigate(`/farmacia/despachos/${d.id}`)}
                >
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.id}</td>
                  <td style={{ fontWeight: 500 }}>{d.aseguradoraName ?? d.aseguradora ?? '—'}</td>
                  <td>{d.clienteName ?? d.cliente ?? '—'}</td>
                  <td>{d.numeroAprobacion ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(d.montoArs)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(d.montoPaciente)}</td>
                  <td>
                    <span className={`badge ${ESTADO_BADGE[d.estado] ?? 'badge-neutral'}`}>{d.estado}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                    <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/farmacia/despachos/${d.id}`)}>
                      <Eye size={14} /> Ver
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {despachos.length} de {data.meta.total} despachos
          </span>
        </div>
      )}
    </div>
  )
}
