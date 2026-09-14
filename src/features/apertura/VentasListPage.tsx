// Listado de facturas de apertura de venta (CxC) — docs/tasks/PROMPT_APERTURA_FRONTEND.md §8.1.
// Incluye tanto "submitted" como "cancelled" (para auditar qué se anuló) — no hay estado borrador.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Upload, ChevronLeft, ChevronRight, Ban } from 'lucide-react'
import { listAperturaVentas, cancelarAperturaVenta } from '@/shared/api/apertura'
import { listCustomers } from '@/shared/api/customers'
import type { FacturaAperturaVenta } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatMoney } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useDebounce } from '@/lib/useDebounce'

const PAGE_SIZE = 20
const ESTADO_BADGE: Record<string, string> = { submitted: 'badge-submitted', cancelled: 'badge-cancelled' }
const ESTADO_LABEL: Record<string, string> = { submitted: 'Confirmada', cancelled: 'Anulada' }

export default function VentasListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeCrear = usePuede('apertura.ventas.crear')
  const puedeAnular = usePuede('apertura.ventas.anular')

  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [toCancel, setToCancel] = useState<FacturaAperturaVenta | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['aperturaCustomerFilterSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({ value: c.id, label: c.customerName }))

  const { data, isLoading } = useQuery({
    queryKey: ['apertura-ventas', { debouncedSearch, customerId, fromDate, toDate, offset }],
    queryFn: () => listAperturaVentas({
      search: debouncedSearch || undefined,
      customer: customerId || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelarAperturaVenta(id),
    onSuccess: () => {
      toast.success('Factura de apertura anulada')
      queryClient.invalidateQueries({ queryKey: ['apertura-ventas'] })
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
        title={<><span className="page-title-dot" />Ventas — Migración de Saldos</>}
        description="Facturas de apertura de venta (CxC) — saldos pendientes migrados del sistema anterior."
        action={
          puedeCrear ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => navigate('/apertura/ventas/importar')}>
                <Upload size={16} /> Importar
              </button>
              <button className="btn btn-navy" onClick={() => navigate('/apertura/ventas/nueva')}>
                <Plus size={16} /> Cargar saldo de cliente
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Buscar">
                <input className="ff-input filter-select" placeholder="Referencia, NCF…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
              </FilterField>
              <FilterField label="Cliente" style={{ width: 220 }}>
                <SearchSelect
                  value={customerId}
                  selectedLabel={customerLabel}
                  onChange={(id, opt) => { setCustomerId(id); setCustomerLabel(opt?.label ?? ''); setPage(1) }}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={customersLoading}
                  placeholder="Todos los clientes"
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
                <th>Referencia</th>
                <th>Cliente</th>
                <th style={{ textAlign: 'right' }}>Monto pendiente</th>
                <th style={{ textAlign: 'right' }}>Saldo actual</th>
                <th>NCF</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 8 }).map((__, j) => <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>)}</tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={8}>
                          <div className="empty-state">
                            <p className="empty-title">Sin facturas de apertura</p>
                            <p className="empty-sub">Carga el primer saldo pendiente de un cliente.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((v) => (
                      <tr key={v.id} className="data-table-row-link" onClick={() => navigate(`/apertura/ventas/${v.id}`)}>
                        <td className="td-muted">{formatDate(v.fechaFactura)}</td>
                        <td>{v.numeroFacturaOriginal}</td>
                        <td>{v.customerName}</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(v.montoPendiente, v.currency)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(v.saldoActual, v.currency)}</td>
                        <td className="td-muted">{v.ncf ?? '—'}</td>
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
        title="Anular factura de apertura"
        description={`¿Confirmas anular ${toCancel?.id}? Esta acción no se puede deshacer directamente — para corregirla deberás cargarla de nuevo con el monto correcto.`}
        confirmLabel="Anular"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
