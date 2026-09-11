import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listPreaprobaciones } from '@/shared/api/farmacia'
import type { ListPreaprobacionesParams } from '@/shared/api/farmacia'
import { listCustomers } from '@/shared/api/customers'
import { listAseguradoras, nombreAseguradora } from '@/shared/api/aseguradoras'
import { Plus, Eye } from 'lucide-react'
import { formatDOP } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { FilterField } from '@/shared/ui/FilterField'
import { Permitido } from '@/components/shared/Permitido'
import type { PreaprobacionEstado } from '@/shared/api/types'

type EstadoFilter = PreaprobacionEstado | 'all'

const ESTADO_BADGE: Record<PreaprobacionEstado, string> = {
  Borrador: 'badge-draft',
  Confirmada: 'badge-submitted',
  Despachado: 'badge-info',
}

export default function PreaprobacionesPage() {
  const navigate = useNavigate()
  const [aseguradoraId, setAseguradoraId] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  const [aseguradoraQuery, setAseguradoraQuery] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [clienteLabel, setClienteLabel] = useState('')
  const [clienteQuery, setClienteQuery] = useState('')
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const { orderBy, sort } = useSortState()

  const { data: aseguradorasData, isLoading: aseguradorasLoading } = useQuery({
    queryKey: ['aseguradoraSearch', aseguradoraQuery],
    queryFn: () => listAseguradoras({ search: aseguradoraQuery || undefined, limit: 15 }),
  })
  const aseguradoraOptions: SearchSelectOption[] = (aseguradorasData?.items ?? []).map((a) => ({
    value: a.id,
    label: nombreAseguradora(a),
  }))

  const { data: clientesData, isLoading: clientesLoading } = useQuery({
    queryKey: ['customerSearch', clienteQuery],
    queryFn: () => listCustomers({ search: clienteQuery || undefined, limit: 15 }),
  })
  const clienteOptions: SearchSelectOption[] = (clientesData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  const params: ListPreaprobacionesParams = {
    aseguradora: aseguradoraId || undefined,
    cliente: clienteId || undefined,
    estado: estado === 'all' ? undefined : estado,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-preaprobaciones', params],
    queryFn: () => listPreaprobaciones(params),
  })

  const preaprobaciones = data?.items ?? []

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Preaprobaciones ARS</h1>
          <p className="page-sub">Registra la cobertura que la ARS aprobó antes de despachar</p>
        </div>
        <Permitido accion="farmacia.preaprobaciones.crear">
          <button className="btn btn-primary" onClick={() => navigate('/farmacia/preaprobaciones/nueva')}>
            <Plus size={16} />
            Nueva Preaprobación
          </button>
        </Permitido>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <FilterField label="ARS" style={{ width: 220 }}>
            <SearchSelect
              value={aseguradoraId}
              selectedLabel={aseguradoraLabel}
              onChange={(val, opt) => { setAseguradoraId(val); setAseguradoraLabel(opt?.label ?? '') }}
              options={aseguradoraOptions}
              onSearch={setAseguradoraQuery}
              loading={aseguradorasLoading}
              placeholder="Filtrar por ARS…"
            />
          </FilterField>
          <FilterField label="Paciente" style={{ width: 220 }}>
            <SearchSelect
              value={clienteId}
              selectedLabel={clienteLabel}
              onChange={(val, opt) => { setClienteId(val); setClienteLabel(opt?.label ?? '') }}
              options={clienteOptions}
              onSearch={setClienteQuery}
              loading={clientesLoading}
              placeholder="Filtrar por paciente…"
            />
          </FilterField>
          <FilterField label="Estado">
            <Select value={estado} onValueChange={(val) => setEstado(val as EstadoFilter)}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="Borrador">Borrador</SelectItem>
              <SelectItem value="Confirmada">Confirmada</SelectItem>
              <SelectItem value="Despachado">Despachado</SelectItem>
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
              <th style={{ textAlign: 'right' }}>Cobertura ARS</th>
              <SortableTh label="Estado" sortKey="estado" orderBy={orderBy} onSort={sort} />
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : preaprobaciones.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin preaprobaciones</div>
                    <p className="empty-sub">Registra la primera preaprobación de una ARS para comenzar.</p>
                  </div>
                </td>
              </tr>
            ) : (
              preaprobaciones.map((p) => (
                <tr
                  key={p.id}
                  className="table-row-clickable"
                  onClick={() => navigate(`/farmacia/preaprobaciones/${p.id}`)}
                >
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id}</td>
                  <td style={{ fontWeight: 500 }}>{p.aseguradoraName ?? p.aseguradora}</td>
                  <td>{p.clienteName ?? p.cliente}</td>
                  <td>{p.numeroAprobacion}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(p.valorCoberturaArs)}</td>
                  <td>
                    <span className={`badge ${ESTADO_BADGE[p.estado] ?? 'badge-neutral'}`}>{p.estado}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                    <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/farmacia/preaprobaciones/${p.id}`)}>
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
            Mostrando {preaprobaciones.length} de {data.meta.total} preaprobaciones
          </span>
        </div>
      )}
    </div>
  )
}
