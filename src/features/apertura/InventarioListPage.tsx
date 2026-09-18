// Listado de aperturas de inventario — docs/tasks/PROMPT_APERTURA_INVENTARIO_FRONTEND.md §8.1.
// A diferencia de Ventas/Compras, el listado NO acepta `search` — solo branch/fromDate/toDate.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ChevronLeft, ChevronRight, Ban } from 'lucide-react'
import { listAperturaInventario, cancelarAperturaInventario } from '@/shared/api/apertura'
import { listSucursales } from '@/shared/api/sucursales'
import type { AperturaInventarioListItem } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ConfirmModal } from '@/shared/ui/Modal'

const PAGE_SIZE = 20
const ESTADO_BADGE: Record<string, string> = { submitted: 'badge-submitted', cancelled: 'badge-cancelled' }
const ESTADO_LABEL: Record<string, string> = { submitted: 'Confirmada', cancelled: 'Anulada' }

export default function InventarioListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeCrear = usePuede('apertura.inventario.crear')
  const puedeAnular = usePuede('apertura.inventario.anular')

  const [branch, setBranch] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [toCancel, setToCancel] = useState<AperturaInventarioListItem | null>(null)

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
    queryKey: ['apertura-inventario', { branch, fromDate, toDate, offset }],
    queryFn: () => listAperturaInventario({
      branch: branch || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelarAperturaInventario(id),
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['apertura-inventario'] })
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
        title={<><span className="page-title-dot" />Inventario — Migración de Saldos</>}
        description="Saldo físico inicial (stock por artículo/almacén) migrado del sistema anterior."
        action={
          <>
            <RecargarButton />
            {puedeCrear && (
              <button className="btn btn-navy" onClick={() => navigate('/apertura/inventario/nueva')}>
                <Plus size={16} /> Cargar inventario inicial
              </button>
            )}
          </>
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
              <FilterField label="Desde">
                <DatePicker className="ff-input" value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker className="ff-input" value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
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
                <th>Cuenta de apertura</th>
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
                            <p className="empty-title">Sin aperturas de inventario</p>
                            <p className="empty-sub">Carga el primer saldo físico inicial de un artículo/almacén.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((v) => (
                      <tr key={v.id} className="data-table-row-link" onClick={() => navigate(`/apertura/inventario/${v.id}`)}>
                        <td className="td-muted">{formatDate(v.fechaApertura)}</td>
                        <td>{v.branch ?? '—'}</td>
                        <td>{v.department ?? '—'}</td>
                        <td className="td-muted">{v.cuentaApertura}</td>
                        <td><span className={`badge ${ESTADO_BADGE[v.estado]}`}>{ESTADO_LABEL[v.estado]}</span></td>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {v.estado === 'submitted' && puedeAnular && (
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
        title="Anular apertura de inventario"
        description={`¿Anular ${toCancel?.id}? A diferencia de anular una factura, esto SÍ revertirá el stock de los artículos/almacenes incluidos en este documento. Si ya se vendió o movió stock de estos artículos después de cargar esta apertura, verifica el inventario resultante antes de continuar. Esta acción no se puede deshacer directamente — para corregir, deberás cargar un nuevo documento con la cantidad correcta.`}
        confirmLabel="Anular"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
