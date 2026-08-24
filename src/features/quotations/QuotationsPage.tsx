import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listQuotations, cancelQuotation } from '@/shared/api/quotations'
import type { ListQuotationsParams } from '@/shared/api/quotations'
import type { Quotation } from '@/shared/api/types'
import { listSucursales } from '@/shared/api/sucursales'
import { listCustomers } from '@/shared/api/customers'
import { Plus, Eye, GitBranch, Copy, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDOP, displayId } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'

type StatusFilter = 'draft' | 'submitted' | 'ordered' | 'lost' | 'cancelled' | 'all'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  ordered: 'badge-info',
  lost: 'badge-warning',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  ordered: 'Ordenado',
  lost: 'Perdido',
  cancelled: 'Cancelado',
}

export default function QuotationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
  const [toCancel, setToCancel] = useState<Quotation | null>(null)
  const { orderBy, sort } = useSortState()

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const sucursales = sucursalesData?.items ?? []
  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = sucursales
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  const params: ListQuotationsParams = {
    customer: customerId || undefined,
    status: status === 'all' ? undefined : status,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    branch: branch || undefined,
    orderBy: orderBy || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', params],
    queryFn: () => listQuotations(params),
  })

  const quotations = data?.items ?? []

  const cancelMutation = useMutation({
    mutationFn: () => cancelQuotation(toCancel!.id),
    onSuccess: () => { toast.success('Cotización cancelada'); queryClient.invalidateQueries({ queryKey: ['quotations'] }); setToCancel(null) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al cancelar la cotización'),
  })

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cotizaciones</h1>
          <p className="page-sub">Gestiona tus cotizaciones y presupuestos</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cotizaciones/nueva')}>
          <Plus size={16} />
          Nueva Cotización
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <FilterField label="Cliente" style={{ width: 260 }}>
            <SearchSelect
              value={customerId}
              selectedLabel={customerLabel}
              onChange={(val, opt) => { setCustomerId(val); setCustomerLabel(opt?.label ?? '') }}
              options={customerOptions}
              onSearch={setCustomerQuery}
              loading={customersLoading}
              placeholder="Filtrar por cliente…"
            />
          </FilterField>
          <FilterField label="Estado">
            <Select value={status} onValueChange={(val) => setStatus(val as StatusFilter)}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="submitted">Sometido</SelectItem>
              <SelectItem value="ordered">Ordenado</SelectItem>
              <SelectItem value="lost">Perdido</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </Select>
          </FilterField>
          <FilterField label="Sucursal" style={{ width: 200 }}>
            <SearchSelect
              value={branch}
              onChange={setBranch}
              options={branchOptions}
              onSearch={setBranchSearch}
              selectedLabel={branch}
              placeholder="Todas las sucursales"
            />
          </FilterField>
          <FilterField label="Desde">
            <DatePicker
              className="ff-input ff-input-sm"
              value={fromDate}
              onChange={setFromDate}
              style={{ width: 144 }}
              clearable
            />
          </FilterField>
          <FilterField label="Hasta">
            <DatePicker
              className="ff-input ff-input-sm"
              value={toDate}
              onChange={setToDate}
              style={{ width: 144 }}
              clearable
            />
          </FilterField>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Fecha" sortKey="date" orderBy={orderBy} onSort={sort} />
              <th>Válida hasta</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={sort} />
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
            ) : quotations.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin cotizaciones</div>
                    <p className="empty-sub">Crea tu primera cotización para comenzar.</p>
                    <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/cotizaciones/nueva')}>
                      <Plus size={14} /> Nueva Cotización
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              quotations.map((q) => {
                const itemTotal = q.grandTotal ?? q.items.reduce((s, i) => s + i.amount, 0) + (q.taxAmount ?? 0)
                return (
                  <tr
                    key={q.id}
                    className="table-row-clickable"
                    onClick={() => navigate(`/cotizaciones/${q.id}`)}
                  >
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {q.amendedFrom && <GitBranch size={11} style={{ marginRight: 4, color: 'var(--text-tertiary)', verticalAlign: 'middle' }} />}
                      {displayId(q.id, q.sequence)}
                    </td>
                    <td style={{ fontWeight: 500 }}>{q.customerName}</td>
                    <td>{formatDate(q.date)}</td>
                    <td>{formatDate(q.validTill)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(itemTotal)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[q.status] ?? 'badge-neutral'}`}>
                        {STATUS_LABEL[q.status] ?? q.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                      <ActionsMenu>
                        <ActionsMenuItem onClick={() => navigate(`/cotizaciones/${q.id}`)}>
                          <Eye size={14} /> Ver
                        </ActionsMenuItem>
                        <ActionsMenuItem onClick={() => navigate(`/cotizaciones/nueva?duplicate=${q.id}`)}>
                          <Copy size={14} /> Duplicar
                        </ActionsMenuItem>
                        {q.status === 'draft' && (
                          <ActionsMenuItem danger onClick={() => setToCancel(q)}>
                            <X size={14} /> Cancelar
                          </ActionsMenuItem>
                        )}
                      </ActionsMenu>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {quotations.length} de {data.meta.total} cotizaciones
          </span>
        </div>
      )}

      {toCancel && (
        <div className="modal-overlay" onClick={() => setToCancel(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Cancelar cotización</h2>
              <button className="modal-close" onClick={() => setToCancel(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Se cancelará la cotización <strong>{toCancel.id}</strong>.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToCancel(null)}>Volver</button>
              <button className="btn btn-danger" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
                Cancelar Cotización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
