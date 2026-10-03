import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listLotesFarmacia } from '@/shared/api/farmacia'
import type { ListLotesFarmaciaParams } from '@/shared/api/farmacia'
import { Plus, Eye } from 'lucide-react'
import { formatDOP, formatDate } from '@/lib/formatters'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { Permitido } from '@/components/shared/Permitido'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { LoteCreateModal } from './LoteCreateModal'
import type { LoteFarmaciaEstado } from '@/shared/api/types'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'

type EstadoFilter = LoteFarmaciaEstado | 'all'

const ESTADO_BADGE: Record<LoteFarmaciaEstado, string> = {
  Abierto: 'badge-draft',
  'En Revisión': 'badge-warning',
  Facturado: 'badge-info',
}

const COLUMNS = [
  { key: 'id', width: 100 },
  { key: 'ars', width: 180 },
  { key: 'periodo', width: 180 },
  { key: 'facturas', width: 90 },
  { key: 'total', width: 120 },
  { key: 'ncf', width: 130 },
  { key: 'estado', width: 110 },
  { key: 'actions', width: 48 },
]

export default function LotesPage() {
  const navigate = useNavigate()
  const [aseguradoraId, setAseguradoraId] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  const [estado, setEstado] = useState<EstadoFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)


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
          <h1 className="page-title"><span className="page-title-dot" />Lotes de Facturación ARS</h1>
          <p className="page-sub">Agrupa la cobertura neta de facturas ya cobradas de una misma ARS para facturarlas juntas</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          <Permitido accion="farmacia.lotes.crear">
            <button className="btn btn-navy" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Nuevo Lote
            </button>
          </Permitido>
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <OpcionesSelect hideOnForbidden filterLabel="ARS" filterStyle={{ width: 220 }} recurso="aseguradoras" value={aseguradoraId} onChange={(val, opt) => { setAseguradoraId(val); setAseguradoraLabel(opt?.label ?? '') }} selectedLabel={aseguradoraLabel} placeholder="Filtrar por ARS…" />
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
        </div>
      </div>

      <div className="card navy-table-card">
      <div className="table-scroll">
        <table className="data-table navy-table items-table-resizable">
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                #
                <span className="col-resize-handle" onMouseDown={startResize('id')} />
              </th>
              <th>
                ARS
                <span className="col-resize-handle" onMouseDown={startResize('ars')} />
              </th>
              <th>
                Período
                <span className="col-resize-handle" onMouseDown={startResize('periodo')} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Facturas
                <span className="col-resize-handle" onMouseDown={startResize('facturas')} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Total
                <span className="col-resize-handle" onMouseDown={startResize('total')} />
              </th>
              <th>
                NCF consolidada
                <span className="col-resize-handle" onMouseDown={startResize('ncf')} />
              </th>
              <th>
                Estado
                <span className="col-resize-handle" onMouseDown={startResize('estado')} />
              </th>
              <th />
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
            ) : lotes.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-title">Sin lotes</div>
                    <p className="empty-sub">Crea un lote para empezar a agrupar facturas con cobertura de una ARS.</p>
                  </div>
                </td>
              </tr>
            ) : (
              lotes.map((l) => (
                <tr key={l.id} className="table-row-clickable" onClick={() => navigate(`/farmacia/lotes/${l.id}`)}>
                  <td className="td-muted" style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{l.id}</td>
                  <td style={{ fontWeight: 500 }}>{l.aseguradoraName ?? l.aseguradora}</td>
                  <td>{formatDate(l.periodoInicio)} – {formatDate(l.periodoFin)}</td>
                  <td style={{ textAlign: 'right' }}>{l.cantidadFacturas}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(l.montoTotalLote)}</td>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{l.ncfAsignado ?? <span className="td-dim">—</span>}</td>
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
