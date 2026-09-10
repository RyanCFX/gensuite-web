import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listLotesFarmacia } from '@/shared/api/farmacia'
import type { ListLotesFarmaciaParams } from '@/shared/api/farmacia'
import { listCustomers } from '@/shared/api/customers'
import { Plus, Eye } from 'lucide-react'
import { formatDOP, formatDate } from '@/lib/formatters'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { FilterField } from '@/shared/ui/FilterField'
import { Permitido } from '@/components/shared/Permitido'
import { LoteCreateModal } from './LoteCreateModal'
import type { LoteFarmaciaEstado } from '@/shared/api/types'

type EstadoFilter = LoteFarmaciaEstado | 'all'

const ESTADO_BADGE: Record<LoteFarmaciaEstado, string> = {
  Abierto: 'badge-draft',
  'En Revisión': 'badge-warning',
  Facturado: 'badge-info',
}

export default function LotesPage() {
  const navigate = useNavigate()
  const [aseguradoraId, setAseguradoraId] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  const [aseguradoraQuery, setAseguradoraQuery] = useState('')
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const [showCreate, setShowCreate] = useState(false)

  const { data: aseguradorasData, isLoading: aseguradorasLoading } = useQuery({
    queryKey: ['customerSearch-ars', aseguradoraQuery],
    queryFn: () => listCustomers({ search: aseguradoraQuery || undefined, limit: 15 }),
  })
  const aseguradoraOptions: SearchSelectOption[] = (aseguradorasData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
  }))

  const params: ListLotesFarmaciaParams = {
    aseguradora: aseguradoraId || undefined,
    estado: estado === 'all' ? undefined : estado,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-lotes', params],
    queryFn: () => listLotesFarmacia(params),
  })
  const lotes = data?.items ?? []

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lotes de Facturación ARS</h1>
          <p className="page-sub">Agrupa despachos ya cobrados de una misma ARS para facturarlos juntos</p>
        </div>
        <Permitido accion="farmacia.lotes.crear">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Nuevo Lote
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
          <FilterField label="Estado">
            <Select value={estado} onValueChange={(val) => setEstado(val as EstadoFilter)}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="Abierto">Abierto</SelectItem>
              <SelectItem value="En Revisión">En Revisión</SelectItem>
              <SelectItem value="Facturado">Facturado</SelectItem>
            </Select>
          </FilterField>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ARS</th>
              <th>Período</th>
              <th style={{ textAlign: 'right' }}>Despachos</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Estado</th>
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
            ) : lotes.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin lotes</div>
                    <p className="empty-sub">Crea un lote para empezar a agrupar despachos cobrados de una ARS.</p>
                  </div>
                </td>
              </tr>
            ) : (
              lotes.map((l) => (
                <tr key={l.id} className="table-row-clickable" onClick={() => navigate(`/farmacia/lotes/${l.id}`)}>
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.id}</td>
                  <td style={{ fontWeight: 500 }}>{l.aseguradoraName ?? l.aseguradora}</td>
                  <td>{formatDate(l.periodoInicio)} – {formatDate(l.periodoFin)}</td>
                  <td style={{ textAlign: 'right' }}>{l.cantidadDespachos}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(l.montoTotalLote)}</td>
                  <td><span className={`badge ${ESTADO_BADGE[l.estado] ?? 'badge-neutral'}`}>{l.estado}</span></td>
                  <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                    <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/farmacia/lotes/${l.id}`)}>
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
          <span className="pagination-info">Mostrando {lotes.length} de {data.meta.total} lotes</span>
        </div>
      )}

      {showCreate && (
        <LoteCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(lote) => { setShowCreate(false); navigate(`/farmacia/lotes/${lote.id}`) }}
        />
      )}
    </div>
  )
}
