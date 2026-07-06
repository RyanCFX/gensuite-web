import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listSuppliers, deleteSupplier } from '@/shared/api/suppliers'
import type { Supplier } from '@/shared/api/types'
import { formatDOP } from '@/lib/formatters'
import { useDebounce } from '@/lib/useDebounce'
import { PageHeader } from '@/components/shared/PageHeader'
import { Plus, ChevronLeft, ChevronRight, Search, Pencil, Ban } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

const PAGE_SIZE = 20

export default function SuppliersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showExterior, setShowExterior] = useState(false)
  const [page, setPage] = useState(1)
  const [toDisable, setToDisable] = useState<Supplier | null>(null)
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['suppliers', { search: debouncedSearch, showExterior, offset, orderBy }],
    queryFn: () =>
      listSuppliers({
        search: debouncedSearch || undefined,
        esProveedorExterior: showExterior ? true : undefined,
        limit: PAGE_SIZE,
        offset,
        orderBy: orderBy || undefined,
      }),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      toast.success('Proveedor desactivado correctamente')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setToDisable(null)
    },
    onError: () => {
      toast.error('Error al desactivar el proveedor')
    },
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  function getIdentifier(s: Supplier) {
    if (s.rnc) return s.rnc
    if (s.cedula) return s.cedula
    return '—'
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Proveedores"
        description={data ? `${data.meta.total} proveedores en total` : ''}
        action={
          <button className="btn btn-primary" onClick={() => navigate('/proveedores/nuevo')}>
            <Plus size={16} />
            Nuevo Proveedor
          </button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input-wrap">
              <Search size={14} className="search-input-icon" />
              <input
                className="search-input"
                placeholder="Buscar por nombre, RNC…"
                value={search}
                onChange={handleSearchChange}
              />
            </div>
            <label className="ff-check-wrap">
              <input
                type="checkbox"
                className="ff-check"
                checked={showExterior}
                onChange={(e) => { setShowExterior(e.target.checked); setPage(1) }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Solo proveedores exterior</span>
            </label>
          </div>
        </div>

        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Nombre" sortKey="supplierName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>RNC / Cédula</th>
                  <th>Tipo</th>
                  <th>Exterior</th>
                  <th>Balance</th>
                  <th style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar los proveedores
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)' }}>
                              No se encontraron proveedores
                            </td>
                          </tr>
                        )
                      : data?.items.map((supplier) => (
                          <tr
                            key={supplier.id}
                            className="table-row-clickable"
                            onClick={() => navigate(`/proveedores/${supplier.id}`)}
                          >
                            <td style={{ fontWeight: 500 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {supplier.supplierName}
                                {supplier.disabled && (
                                  <span className="badge badge-error">Inactivo</span>
                                )}
                              </span>
                            </td>
                            <td className="td-muted">{getIdentifier(supplier)}</td>
                            <td>{supplier.supplierType === 'Company' ? 'Empresa' : 'Individual'}</td>
                            <td>
                              {supplier.esProveedorExterior
                                ? <span className="badge badge-info">Exterior</span>
                                : <span className="td-muted">Local</span>}
                            </td>
                            <td>
                              {supplier.balance > 0
                                ? <span style={{ fontWeight: 500, color: 'var(--error-text)' }}>{formatDOP(supplier.balance)}</span>
                                : <span className="td-muted">{formatDOP(0)}</span>}
                            </td>
                            <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                              <ActionsMenu>
                                <ActionsMenuItem onClick={() => navigate(`/proveedores/${supplier.id}/editar`)}>
                                  <Pencil size={14} /> Editar
                                </ActionsMenuItem>
                                {!supplier.disabled && (
                                  <ActionsMenuItem danger onClick={() => setToDisable(supplier)}>
                                    <Ban size={14} /> Desactivar
                                  </ActionsMenuItem>
                                )}
                              </ActionsMenu>
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>

          {data && data.meta.total > PAGE_SIZE && (
            <div className="pagination">
              <span className="pagination-info">
                Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
              </span>
              <div className="pagination-controls">
                <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>{page} / {totalPages}</span>
                <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disable confirm modal */}
      {toDisable && (
        <div className="modal-overlay" onClick={() => setToDisable(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar proveedor?</h2>
              <button className="modal-close" onClick={() => setToDisable(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se desactivará a <strong>{toDisable.supplierName}</strong>. Podrás reactivarlo más adelante.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDisable(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => disableMutation.mutate(toDisable.id)}
                disabled={disableMutation.isPending}
              >
                {disableMutation.isPending ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
