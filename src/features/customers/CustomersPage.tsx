import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listCustomers, deleteCustomer } from '@/shared/api/customers'
import { downloadEstadoCuentaPdf } from '@/shared/api/cobros'
import type { Customer, ApiError } from '@/shared/api/types'
import { useDebounce } from '@/lib/useDebounce'
import { Plus, Pencil, Ban, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { TIPO_IDENTIFICACION } from '@/lib/constants'

const PAGE_SIZE = 20

export default function CustomersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showDisabled, setShowDisabled] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerType, setCustomerType] = useState('all')
  const [tipoIdentificacion, setTipoIdentificacion] = useState('all')
  const [identificacion, setIdentificacion] = useState('')
  const [hasCredit, setHasCredit] = useState('all')
  const [createdAtFrom, setCreatedAtFrom] = useState('')
  const [createdAtTo, setCreatedAtTo] = useState('')
  const [creditLimitMin, setCreditLimitMin] = useState('')
  const [creditLimitMax, setCreditLimitMax] = useState('')
  const [creditDaysMin, setCreditDaysMin] = useState('')
  const [creditDaysMax, setCreditDaysMax] = useState('')
  const [page, setPage] = useState(1)
  const [toDisable, setToDisable] = useState<Customer | null>(null)
  const { orderBy, sort } = useSortState()

  const debouncedCustomerName = useDebounce(customerName, 300)
  const debouncedIdentificacion = useDebounce(identificacion, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customers', {
      showDisabled,
      customerName: debouncedCustomerName,
      customerType,
      tipoIdentificacion,
      identificacion: debouncedIdentificacion,
      hasCredit,
      createdAtFrom,
      createdAtTo,
      creditLimitMin,
      creditLimitMax,
      creditDaysMin,
      creditDaysMax,
      offset,
      orderBy,
    }],
    queryFn: () =>
      listCustomers({
        disabled: showDisabled || undefined,
        customerName: debouncedCustomerName || undefined,
        customerType: customerType === 'all' ? undefined : (customerType as 'Company' | 'Individual'),
        tipoIdentificacion: tipoIdentificacion === 'all' ? undefined : tipoIdentificacion,
        identificacion: debouncedIdentificacion || undefined,
        hasCredit: hasCredit === 'all' ? undefined : hasCredit === 'true',
        createdAtFrom: createdAtFrom || undefined,
        createdAtTo: createdAtTo || undefined,
        creditLimitMin: creditLimitMin !== '' ? Number(creditLimitMin) : undefined,
        creditLimitMax: creditLimitMax !== '' ? Number(creditLimitMax) : undefined,
        creditDaysMin: creditDaysMin !== '' ? Number(creditDaysMin) : undefined,
        creditDaysMax: creditDaysMax !== '' ? Number(creditDaysMax) : undefined,
        limit: PAGE_SIZE,
        offset,
        orderBy: orderBy || undefined,
      }),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      toast.success('Cliente desactivado correctamente')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setToDisable(null)
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al desactivar el cliente')
    },
  })

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
          <FilterField label="Cliente" style={{ width: 200 }}>
            <input
              className="ff-input ff-input-sm"
              placeholder="Nombre del cliente…"
              value={customerName}
              onChange={(e) => { setCustomerName(e.target.value); setPage(1) }}
            />
          </FilterField>
          <FilterField label="Tipo">
            <Select value={customerType} onValueChange={(val) => { setCustomerType(val); setPage(1) }}>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="Company">Empresa</SelectItem>
              <SelectItem value="Individual">Individual</SelectItem>
            </Select>
          </FilterField>
          <FilterField label="Identificación">
            <Select value={tipoIdentificacion} onValueChange={(val) => { setTipoIdentificacion(val); setPage(1) }}>
              <SelectItem value="all">Todas las identificaciones</SelectItem>
              {TIPO_IDENTIFICACION.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </Select>
          </FilterField>
          <FilterField label="RNC/Cédula" style={{ width: 180 }}>
            <input
              className="ff-input ff-input-sm"
              placeholder="RNC o Cédula…"
              value={identificacion}
              onChange={(e) => { setIdentificacion(e.target.value); setPage(1) }}
            />
          </FilterField>
          <FilterField label="Crédito">
            <Select value={hasCredit} onValueChange={(val) => { setHasCredit(val); setPage(1) }}>
              <SelectItem value="all">Crédito: Todos</SelectItem>
              <SelectItem value="true">Con crédito</SelectItem>
              <SelectItem value="false">Sin crédito</SelectItem>
            </Select>
          </FilterField>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
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

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="td-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Fecha creación</span>
            <DatePicker
              className="ff-input ff-input-sm"
              value={createdAtFrom}
              onChange={(val) => { setCreatedAtFrom(val); setPage(1) }}
              style={{ width: 140 }}
              clearable
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker
              className="ff-input ff-input-sm"
              value={createdAtTo}
              onChange={(val) => { setCreatedAtTo(val); setPage(1) }}
              style={{ width: 140 }}
              clearable
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="td-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Límite de crédito</span>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 96 }}
              placeholder="Mín."
              value={creditLimitMin}
              onChange={(e) => { setCreditLimitMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 96 }}
              placeholder="Máx."
              value={creditLimitMax}
              onChange={(e) => { setCreditLimitMax(e.target.value); setPage(1) }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="td-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Días de crédito</span>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 80 }}
              placeholder="Mín."
              value={creditDaysMin}
              onChange={(e) => { setCreditDaysMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 80 }}
              placeholder="Máx."
              value={creditDaysMax}
              onChange={(e) => { setCreditDaysMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Nombre" sortKey="customerName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <th>RNC / Cédula</th>
              <th>Tipo</th>
              <th>Grupo</th>
              <th>Tiene Crédito</th>
              <th>Estado</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : isError
                ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar los clientes
                      </td>
                    </tr>
                  )
                : data?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
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
                        <td style={{ fontWeight: 500 }}>
                          {customer.customerName}
                          {customer.isSystemManaged && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Sistema</span>}
                        </td>
                        <td className="td-muted">{getIdentifier(customer)}</td>
                        <td>{customer.customerType === 'Company' ? 'Empresa' : 'Individual'}</td>
                        <td className="td-muted">{customer.customerGroup ?? '—'}</td>
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
                          <ActionsMenu>
                            {!customer.isSystemManaged && (
                              <ActionsMenuItem onClick={() => navigate(`/clientes/${customer.id}/editar`)}>
                                <Pencil size={14} /> Editar
                              </ActionsMenuItem>
                            )}
                            <ActionsMenuItem onClick={() => downloadEstadoCuentaPdf(customer.id, `estado-cuenta-${customer.customerName}.pdf`)}>
                              <Download size={14} /> Estado de Cuenta PDF
                            </ActionsMenuItem>
                            {!customer.disabled && !customer.isSystemManaged && (
                              <ActionsMenuItem danger onClick={() => setToDisable(customer)}>
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
