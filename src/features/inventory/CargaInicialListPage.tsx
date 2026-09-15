// Listado de Carga Inicial de Inventario — docs/tasks/PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md §7.1.
// `search`/`orderBy` NO están implementados en este endpoint — no se exponen acá.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ChevronLeft, ChevronRight, Ban } from 'lucide-react'
import { listCargaInicial, cancelarCargaInicial } from '@/shared/api/cargaInicial'
import { listSucursales } from '@/shared/api/sucursales'
import type { CargaInicialListItem, CargaInicialStatus } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterField } from '@/shared/ui/FilterField'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ConfirmModal } from '@/shared/ui/Modal'

const PAGE_SIZE = 20
const ESTADO_BADGE: Record<string, string> = { submitted: 'badge-submitted', cancelled: 'badge-cancelled' }
const ESTADO_LABEL: Record<string, string> = { submitted: 'Confirmada', cancelled: 'Anulada' }

export default function CargaInicialListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeCrear = usePuede('inventario.carga-inicial.crear')
  const puedeAnular = usePuede('inventario.carga-inicial.anular')

  const [branch, setBranch] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [status, setStatus] = useState<CargaInicialStatus | ''>('')
  const [page, setPage] = useState(1)
  const [toCancel, setToCancel] = useState<CargaInicialListItem | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchQuery || s.name.toLowerCase().includes(branchQuery.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const { data, isLoading } = useQuery({
    queryKey: ['carga-inicial', { branch, status, offset }],
    queryFn: () => listCargaInicial({
      branch: branch || undefined,
      status: status || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelarCargaInicial(id),
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['carga-inicial'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setToCancel(null)
    },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al anular'); setToCancel(null) },
  })

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Carga Inicial de Inventario</>}
        description="Existencias agregadas a un almacén sin compra de por medio — hallazgos, donaciones, ajustes."
        action={
          puedeCrear ? (
            <button className="btn btn-navy" onClick={() => navigate('/inventario/carga-inicial/nueva')}>
              <Plus size={16} /> Registrar entrada
            </button>
          ) : undefined
        }
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Sucursal" style={{ width: 220 }}>
                <SearchSelect
                  value={branch}
                  onChange={(v) => { setBranch(v); setPage(1) }}
                  options={branchOptions}
                  onSearch={setBranchQuery}
                  selectedLabel={branch}
                  placeholder="Todas las sucursales"
                />
              </FilterField>
              <FilterField label="Estado">
                <Select value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : (v as CargaInicialStatus)); setPage(1) }}>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="submitted">Confirmada</SelectItem>
                  <SelectItem value="cancelled">Anulada</SelectItem>
                </Select>
              </FilterField>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sucursal</th>
                <th>Departamento</th>
                <th>Notas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>)}</tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            <p className="empty-title">Sin cargas iniciales</p>
                            <p className="empty-sub">Registra la primera entrada de inventario sin compra de por medio.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((v) => (
                      <tr key={v.id} className="data-table-row-link" onClick={() => navigate(`/inventario/carga-inicial/${v.id}`)}>
                        <td className="td-muted">{formatDate(v.postingDate)}</td>
                        <td>{v.branch ?? '—'}</td>
                        <td>{v.department ?? '—'}</td>
                        <td className="td-muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.remarks || '—'}</td>
                        <td><span className={`badge ${ESTADO_BADGE[v.status]}`}>{ESTADO_LABEL[v.status]}</span></td>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {v.status === 'submitted' && puedeAnular && (
                            <button className="btn btn-ghost btn-size-icon-sm" title="Anular" onClick={() => setToCancel(v)}>
                              <Ban size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div className="pagination">
          <span className="pagination-info">Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}</span>
          <div className="pagination-controls">
            <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button className="btn btn-ghost btn-size-icon-sm" disabled={!data?.meta.hasMore} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!toCancel}
        onClose={() => setToCancel(null)}
        onConfirm={() => toCancel && cancelMutation.mutate(toCancel.id)}
        title="Anular carga inicial"
        description="¿Anular esta carga inicial? El inventario que este documento agregó será revertido. Esta acción no se puede deshacer directamente — para volver a registrar la entrada, cree un nuevo documento."
        confirmLabel="Anular"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
