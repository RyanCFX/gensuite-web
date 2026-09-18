import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listSuppliers, deleteSupplier } from '@/shared/api/suppliers'
import type { Supplier } from '@/shared/api/types'
import { formatDOP } from '@/lib/formatters'
import { useDebounce } from '@/lib/useDebounce'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Plus, ChevronLeft, ChevronRight, Search, Pencil, Ban, SlidersHorizontal } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'

const PAGE_SIZE = 20

export default function SuppliersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showExterior, setShowExterior] = useState(false)
  const [rnc, setRnc] = useState('')
  const [supplierType, setSupplierType] = useState<string>('all')
  const [diasCreditoMin, setDiasCreditoMin] = useState('')
  const [diasCreditoMax, setDiasCreditoMax] = useState('')
  const [page, setPage] = useState(1)
  const [toDisable, setToDisable] = useState<Supplier | null>(null)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const debouncedRnc = useDebounce(rnc, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['suppliers', { search: debouncedSearch, showExterior, rnc: debouncedRnc, supplierType, diasCreditoMin, diasCreditoMax, offset, orderBy }],
    queryFn: () =>
      listSuppliers({
        search: debouncedSearch || undefined,
        esProveedorExterior: showExterior ? true : undefined,
        rnc: debouncedRnc || undefined,
        supplierType: supplierType !== 'all' ? (supplierType as 'Company' | 'Individual') : undefined,
        diasCreditoMin: diasCreditoMin ? Number(diasCreditoMin) : undefined,
        diasCreditoMax: diasCreditoMax ? Number(diasCreditoMax) : undefined,
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

  const activeMoreFiltersCount = [diasCreditoMin, diasCreditoMax].filter((v) => v !== '').length

  function clearMoreFilters() {
    setDiasCreditoMin('')
    setDiasCreditoMax('')
    setPage(1)
  }

  function getIdentifier(s: Supplier) {
    if (s.rnc) return s.rnc
    if (s.cedula) return s.cedula
    return '—'
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Proveedores</>}
        description={data ? `${data.meta.total} proveedores en total` : ''}
        action={
          <>
            <RecargarButton />
            <button className="btn btn-navy" onClick={() => navigate('/proveedores/nuevo')}>
              <Plus size={16} />
              Nuevo Proveedor
            </button>
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card filter-card-navy">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="filter-bar" style={{ margin: 0 }}>
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
                <div className="search-input-wrap">
                  <Search size={14} className="search-input-icon" />
                  <input
                    className="search-input"
                    placeholder="Buscar RNC…"
                    value={rnc}
                    onChange={(e) => { setRnc(e.target.value); setPage(1) }}
                  />
                </div>
                <FilterField label="Tipo">
                  <Select value={supplierType} onValueChange={(val) => { setSupplierType(val); setPage(1) }}>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Company">Empresa</SelectItem>
                    <SelectItem value="Individual">Individual</SelectItem>
                  </Select>
                </FilterField>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <label className="ff-toggle-wrap">
                <span className="ff-toggle">
                  <input
                    type="checkbox"
                    checked={showExterior}
                    onChange={(e) => { setShowExterior(e.target.checked); setPage(1) }}
                  />
                  <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
                </span>
                Solo proveedores exterior
              </label>

              <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setMoreFiltersOpen(true)}>
                <SlidersHorizontal size={13} />
                Más filtros
                {activeMoreFiltersCount > 0 && (
                  <span className="badge badge-brand" style={{ marginLeft: 2 }}>{activeMoreFiltersCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="card navy-table-card">
          <div className="table-scroll">
            <table className="data-table navy-table">
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

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de proveedores"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Días de crédito</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Mín."
              value={diasCreditoMin}
              onChange={(e) => { setDiasCreditoMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Máx."
              value={diasCreditoMax}
              onChange={(e) => { setDiasCreditoMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>
      </Drawer>

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
