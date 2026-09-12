import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listAseguradoras, deleteAseguradora, nombreAseguradora } from '@/shared/api/aseguradoras'
import type { Aseguradora, ApiError } from '@/shared/api/types'
import { useDebounce } from '@/lib/useDebounce'
import { Plus, Pencil, Ban, ChevronLeft, ChevronRight } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { Permitido } from '@/components/shared/Permitido'

const PAGE_SIZE = 20

export default function AseguradorasPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showDisabled, setShowDisabled] = useState(false)
  const [nombre, setNombre] = useState('')
  const [hasCredit, setHasCredit] = useState('all')
  const [page, setPage] = useState(1)
  const [toDisable, setToDisable] = useState<Aseguradora | null>(null)
  const { orderBy, sort } = useSortState()

  const debouncedNombre = useDebounce(nombre, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['aseguradoras', { showDisabled, nombre: debouncedNombre, hasCredit, offset, orderBy }],
    queryFn: () =>
      listAseguradoras({
        disabled: showDisabled || undefined,
        nombre: debouncedNombre || undefined,
        hasCredit: hasCredit === 'all' ? undefined : hasCredit === 'true',
        limit: PAGE_SIZE,
        offset,
        orderBy: orderBy || undefined,
      }),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => deleteAseguradora(id),
    onSuccess: () => {
      toast.success('Aseguradora desactivada correctamente')
      queryClient.invalidateQueries({ queryKey: ['aseguradoras'] })
      setToDisable(null)
    },
    onError: (err: ApiError) => {
      // 409 = la ARS ya tiene lotes o facturas con cobertura. El mensaje del backend ya viene en
      // español y explica el motivo — se muestra tal cual.
      toast.error(err?.message ?? 'Error al desactivar la aseguradora')
    },
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Aseguradoras</h1>
          {data && <p className="page-sub">{data.meta.total} aseguradoras en total</p>}
        </div>
        <Permitido accion="aseguradoras.crear">
          <button className="btn btn-navy" onClick={() => navigate('/farmacia/aseguradoras/nueva')}>
            <Plus size={16} />
            Nueva Aseguradora
          </button>
        </Permitido>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Nombre" style={{ width: 220 }}>
                <input
                  className="ff-input ff-input-sm"
                  placeholder="Nombre de la aseguradora…"
                  value={nombre}
                  onChange={(e) => { setNombre(e.target.value); setPage(1) }}
                />
              </FilterField>
              <FilterField label="Crédito">
                <Select value={hasCredit} onValueChange={(val) => { setHasCredit(val); setPage(1) }}>
                  <SelectItem value="all">Crédito: Todos</SelectItem>
                  <SelectItem value="true">Con crédito</SelectItem>
                  <SelectItem value="false">Sin crédito</SelectItem>
                </Select>
              </FilterField>
            </div>
          </div>

          <label className="ff-toggle-wrap">
            <span className="ff-toggle">
              <input
                type="checkbox"
                checked={showDisabled}
                onChange={(e) => { setShowDisabled(e.target.checked); setPage(1) }}
              />
              <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
            </span>
            Mostrar desactivadas
          </label>
        </div>
      </div>

      <div className="card navy-table-card">
      <div className="table-scroll">
        <table className="data-table navy-table">
          <thead>
            <tr>
              <SortableTh label="Nombre" sortKey="nombre" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <th>RNC</th>
              <th>Tiene Crédito</th>
              <th>Estado</th>
              <th style={{ width: 48 }} />
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
              : isError
                ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar las aseguradoras
                      </td>
                    </tr>
                  )
                : data?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                          No se encontraron aseguradoras
                        </td>
                      </tr>
                    )
                  : data?.items.map((aseguradora) => (
                      <tr
                        key={aseguradora.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/farmacia/aseguradoras/${aseguradora.id}`)}
                      >
                        <td style={{ fontWeight: 500 }}>{nombreAseguradora(aseguradora)}</td>
                        <td className="td-muted">{aseguradora.rnc ?? '—'}</td>
                        <td>
                          {aseguradora.hasCredit
                            ? <span className="badge badge-success">Sí</span>
                            : <span className="badge badge-neutral">No</span>}
                        </td>
                        <td>
                          {aseguradora.disabled
                            ? <span className="badge badge-error">Inactiva</span>
                            : <span className="badge badge-success">Activa</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                          <ActionsMenu>
                            <Permitido accion="aseguradoras.editar">
                              <ActionsMenuItem onClick={() => navigate(`/farmacia/aseguradoras/${aseguradora.id}/editar`)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                            </Permitido>
                            {!aseguradora.disabled && (
                              <Permitido accion="aseguradoras.eliminar">
                                <ActionsMenuItem danger onClick={() => setToDisable(aseguradora)}>
                                  <Ban size={14} /> Desactivar
                                </ActionsMenuItem>
                              </Permitido>
                            )}
                          </ActionsMenu>
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>
      </div>

      {data && data.meta.total > PAGE_SIZE && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
          </span>
          <div className="pagination-controls">
            <button
              className="btn btn-ghost btn-size-icon-sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button
              className="btn btn-ghost btn-size-icon-sm"
              disabled={!data.meta.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {toDisable && (
        <div className="modal-overlay" onClick={() => setToDisable(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar aseguradora?</h2>
              <button className="modal-close" onClick={() => setToDisable(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se desactivará a <strong>{nombreAseguradora(toDisable)}</strong>. Podrás reactivarla más adelante.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setToDisable(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => disableMutation.mutate(toDisable.id)}
                disabled={disableMutation.isPending}
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
