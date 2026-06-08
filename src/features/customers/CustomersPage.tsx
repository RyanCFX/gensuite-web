import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listCustomers, deleteCustomer } from '@/shared/api/customers'
import type { Customer } from '@/shared/api/types'
import { useDebounce } from '@/lib/useDebounce'
import { Plus, MoreHorizontal, Pencil, Ban, ChevronLeft, ChevronRight, Search } from 'lucide-react'

const PAGE_SIZE = 20

export default function CustomersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showDisabled, setShowDisabled] = useState(false)
  const [page, setPage] = useState(1)
  const [toDisable, setToDisable] = useState<Customer | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customers', { search: debouncedSearch, showDisabled, offset }],
    queryFn: () =>
      listCustomers({
        search: debouncedSearch || undefined,
        disabled: showDisabled || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      toast.success('Cliente desactivado correctamente')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setToDisable(null)
    },
    onError: () => {
      toast.error('Error al desactivar el cliente')
    },
  })

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value)
      setPage(1)
    },
    [],
  )

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  function getIdentifier(c: Customer) {
    if (c.rnc) return c.rnc
    if (c.cedula) return c.cedula
    return '—'
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          {data && <p className="page-sub">{data.meta.total} clientes en total</p>}
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/clientes/nuevo')}>
          <Plus size={16} />
          Nuevo Cliente
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por nombre, RNC, cédula…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={showDisabled}
              onChange={(e) => {
                setShowDisabled(e.target.checked)
                setPage(1)
              }}
            />
            Mostrar desactivados
          </label>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RNC / Cédula</th>
              <th>Tipo</th>
              <th>Tiene Crédito</th>
              <th>Estado</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : isError
                ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar los clientes
                      </td>
                    </tr>
                  )
                : data?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                          No se encontraron clientes
                        </td>
                      </tr>
                    )
                  : data?.items.map((customer) => (
                      <tr
                        key={customer.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/clientes/${customer.id}`)}
                      >
                        <td style={{ fontWeight: 500 }}>{customer.customerName}</td>
                        <td className="td-muted">{getIdentifier(customer)}</td>
                        <td>{customer.customerType === 'Company' ? 'Empresa' : 'Individual'}</td>
                        <td>
                          {customer.hasCredit
                            ? <span className="badge badge-success">Sí</span>
                            : <span className="badge badge-neutral">No</span>}
                        </td>
                        <td>
                          {customer.disabled
                            ? <span className="badge badge-error">Inactivo</span>
                            : <span className="badge badge-success">Activo</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                          <div style={{ position: 'relative' }}>
                            <button
                              className="actions-trigger"
                              onClick={() => setOpenMenuId(openMenuId === customer.id ? null : customer.id)}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {openMenuId === customer.id && (
                              <div className="actions-menu">
                                <button
                                  className="actions-item"
                                  onClick={() => {
                                    setOpenMenuId(null)
                                    navigate(`/clientes/${customer.id}/editar`)
                                  }}
                                >
                                  <Pencil size={14} />
                                  Editar
                                </button>
                                {!customer.disabled && (
                                  <button
                                    className="actions-item actions-item-danger"
                                    onClick={() => {
                                      setOpenMenuId(null)
                                      setToDisable(customer)
                                    }}
                                  >
                                    <Ban size={14} />
                                    Desactivar
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
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
              <h2 className="modal-title">¿Desactivar cliente?</h2>
              <button className="modal-close" onClick={() => setToDisable(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se desactivará a <strong>{toDisable.customerName}</strong>. Podrás reactivarlo más adelante.
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
