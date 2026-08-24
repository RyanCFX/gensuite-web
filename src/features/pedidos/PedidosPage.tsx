import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listPedidos, cancelPedido } from '@/shared/api/pedidos'
import type { Pedido } from '@/shared/api/types'
import type { ListPedidosParams } from '@/shared/api/pedidos'
import { listSucursales } from '@/shared/api/sucursales'
import { listCustomers } from '@/shared/api/customers'
import { displayId, formatDate, formatDOP } from '@/lib/formatters'
import { Plus, Eye, X, Loader2, Copy, PackageOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'En Proceso',
  cancelled: 'Cancelado',
}

export default function PedidosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [toCancel, setToCancel] = useState<Pedido | null>(null)
  const [onlyLayaway, setOnlyLayaway] = useState(false)
  const [branch, setBranch] = useState('')
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

  const params: ListPedidosParams = {
    customer: customerId || undefined,
    status: status === 'all' ? undefined : status as ListPedidosParams['status'],
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    branch: branch || undefined,
    orderBy: orderBy || undefined,
    isLayaway: onlyLayaway || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['pedidos', params],
    queryFn: () => listPedidos(params),
  })

  const pedidos = data?.items ?? []

  const cancelMutation = useMutation({
    mutationFn: () => cancelPedido(toCancel!.id),
    onSuccess: () => { toast.success('Pedido cancelado'); queryClient.invalidateQueries({ queryKey: ['pedidos'] }); setToCancel(null) },
    onError: () => toast.error('Error al cancelar el pedido'),
  })

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos de Venta</h1>
          <p className="page-sub">Cotización → Pedido → Factura</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/pedidos/nuevo')}>
          <Plus size={16} />
          Nuevo Pedido
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
            <Select value={status} onValueChange={setStatus}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="submitted">En Proceso</SelectItem>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={onlyLayaway} onChange={(e) => setOnlyLayaway(e.target.checked)} />
            <PackageOpen size={14} style={{ color: 'var(--text-secondary)' }} />
            Solo apartados
          </label>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="#" sortKey="id" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Cliente" sortKey="customerName" orderBy={orderBy} onSort={sort} />
              <SortableTh label="Fecha" sortKey="transactionDate" orderBy={orderBy} onSort={sort} />
              <th>Entrega</th>
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
            ) : pedidos.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin pedidos</div>
                    <p className="empty-sub">Crea el primer pedido de venta.</p>
                    <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/pedidos/nuevo')}>
                      <Plus size={14} /> Nuevo Pedido
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              pedidos.map((p) => {
                const itemTotal = p.grandTotal ?? p.items.reduce((s, i) => s + i.amount, 0) + (p.taxAmount ?? 0)
                return (
                  <tr
                    key={p.id}
                    className="table-row-clickable"
                    onClick={() => navigate(`/pedidos/${p.id}`)}
                  >
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{displayId(p.id, p.sequence)}</td>
                    <td style={{ fontWeight: 500 }}>{p.customerName}</td>
                    <td>{formatDate(p.transactionDate)}</td>
                    <td>{p.deliveryDate ? formatDate(p.deliveryDate) : <span className="td-dim">—</span>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(itemTotal)}</td>
                    <td style={{ display: 'flex', flexWrap: 'wrap', alignItems:'center', gap: 4 }}>
                      <span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-neutral'}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>

                      {p.isLayaway && (
                        <span
                          className={`badge ${p.layawayVencido ? 'badge-error' : 'badge-info'}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          title={p.layawayVencido ? 'Apartado vencido' : `${p.layawayDiasRestantes ?? '—'} días restantes`}
                        >
                          <PackageOpen size={11} /> Apartado{p.layawayVencido ? ' vencido' : ''}
                        </span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                      <ActionsMenu>
                        <ActionsMenuItem onClick={() => navigate(`/pedidos/${p.id}`)}>
                          <Eye size={14} /> Ver
                        </ActionsMenuItem>
                        <ActionsMenuItem onClick={() => navigate(`/pedidos/nuevo?duplicate=${p.id}`)}>
                          <Copy size={14} /> Duplicar
                        </ActionsMenuItem>
                        {p.status === 'draft' && (
                          <ActionsMenuItem danger onClick={() => setToCancel(p)}>
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
            Mostrando {pedidos.length} de {data.meta.total} pedidos
          </span>
        </div>
      )}

      {toCancel && (
        <div className="modal-overlay" onClick={() => setToCancel(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Cancelar pedido</h2>
              <button className="modal-close" onClick={() => setToCancel(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Se cancelará el pedido <strong>{toCancel.id}</strong>.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToCancel(null)}>Volver</button>
              <button className="btn btn-danger" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
                Cancelar Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
