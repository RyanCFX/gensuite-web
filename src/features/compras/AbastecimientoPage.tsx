// Abastecimiento (multi-pedido) — docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §5.
// Consolida líneas pendientes de comprar de varios pedidos en una sola orden de compra a un
// proveedor, sin mezclar cantidades entre pedidos distintos.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ShoppingCart, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { listPendientesAbastecimiento, crearOrdenDesdePedidos } from '@/shared/api/ordenes-compra'
import { listSuppliers } from '@/shared/api/suppliers'
import type { MargenNegativoWarning, PendienteAbastecimientoLinea, CreateOrdenDesdePedidosDto } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatMoney } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterField } from '@/shared/ui/FilterField'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Modal } from '@/shared/ui/Modal'
import { today } from '@/features/despachos/lib'

const PAGE_SIZE = 20

function rowKey(l: PendienteAbastecimientoLinea): string {
  return `${l.salesOrder}::${l.itemCode}`
}

export default function AbastecimientoPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeCrear = usePuede('compras.orden.crear')

  const [itemCode, setItemCode] = useState('')
  const [customer, setCustomer] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [supplierLabel, setSupplierLabel] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [transactionDate, setTransactionDate] = useState(today())
  const [marginWarnings, setMarginWarnings] = useState<MargenNegativoWarning[] | null>(null)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['pendientes-abastecimiento', { itemCode, customer, offset }],
    queryFn: () => listPendientesAbastecimiento({ itemCode: itemCode || undefined, customer: customer || undefined, limit: PAGE_SIZE, offset }),
  })

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch-abastecimiento', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
  })
  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({ value: s.id, label: s.supplierName }))

  const items = data?.items ?? []
  const total = data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const selectedRows = items.filter((l) => selected.has(rowKey(l)))
  const totalsByItem = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of selectedRows) map.set(r.itemCode, (map.get(r.itemCode) ?? 0) + r.qtyPendiente)
    return map
  }, [selectedRows])

  function toggleRow(l: PendienteAbastecimientoLinea) {
    setSelected((prev) => {
      const next = new Set(prev)
      const key = rowKey(l)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const crearMutation = useMutation({
    mutationFn: (dto: CreateOrdenDesdePedidosDto) => crearOrdenDesdePedidos(dto),
    onSuccess: (result) => {
      if (!('id' in result)) {
        setMarginWarnings(result.warnings)
        return
      }
      toast.success(`Orden de compra ${result.id} creada`)
      queryClient.invalidateQueries({ queryKey: ['pendientes-abastecimiento'] })
      queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] })
      setFormOpen(false)
      setMarginWarnings(null)
      setSelected(new Set())
      navigate(`/compras/ordenes/${result.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al generar la orden de compra'),
  })

  function buildDto(confirmarMargenNegativo?: boolean): CreateOrdenDesdePedidosDto {
    return {
      supplier: supplierId,
      items: selectedRows.map((r) => ({ salesOrder: r.salesOrder, itemCode: r.itemCode })),
      transactionDate: transactionDate || undefined,
      confirmarMargenNegativo,
    }
  }

  function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (selectedRows.length === 0) { toast.error('Selecciona al menos una línea'); return }
    crearMutation.mutate(buildDto())
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/compras/ordenes')}><ArrowLeft size={14} /> Órdenes de Compra</a>

      <PageHeader
        title={<><span className="page-title-dot" />Abastecimiento</>}
        description="Líneas de pedidos de venta pendientes de comprar — consolidá varias en una sola orden a un proveedor."
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Artículo">
                <input className="ff-input filter-select" placeholder="Código del artículo" value={itemCode} onChange={(e) => { setItemCode(e.target.value); setPage(1) }} />
              </FilterField>
              <FilterField label="Cliente">
                <input className="ff-input filter-select" placeholder="ID del cliente" value={customer} onChange={(e) => { setCustomer(e.target.value); setPage(1) }} />
              </FilterField>
            </div>
            {puedeCrear && (
              <div className="filter-bar-right">
                <button className="btn btn-navy" disabled={selected.size === 0} onClick={() => setFormOpen(true)}>
                  <ShoppingCart size={16} /> Generar orden de compra {selected.size > 0 ? `(${selected.size})` : ''}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Artículo</th>
                <th>Almacén</th>
                <th style={{ textAlign: 'right' }}>Precio venta</th>
                <th style={{ textAlign: 'right' }}>Pendiente</th>
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
                            <p className="empty-title">Nada pendiente de comprar</p>
                            <p className="empty-sub">Todos los pedidos de venta tienen stock suficiente.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((l) => {
                      const key = rowKey(l)
                      return (
                        <tr key={key} className="data-table-row-link" onClick={() => toggleRow(l)}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(key)} onChange={() => toggleRow(l)} />
                          </td>
                          <td>{l.salesOrder}</td>
                          <td className="td-muted">{formatDate(l.transactionDate)}</td>
                          <td>{l.customerName}</td>
                          <td>{l.itemName} <span className="td-muted">({l.itemCode})</span></td>
                          <td className="td-muted">{l.warehouse}</td>
                          <td style={{ textAlign: 'right' }}>{formatMoney(l.rate)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.qtyPendiente}</td>
                        </tr>
                      )
                    })}
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

      <p className="ff-hint" style={{ marginTop: 8 }}>
        Orden FIFO por fecha del pedido (el más antiguo primero) — es información de prioridad de
        atención, no la reordenes por otra columna.
      </p>

      {formOpen && (
        <Modal
          open
          onClose={() => setFormOpen(false)}
          title="Generar orden de compra"
          subtitle={`${selectedRows.length} línea(s) seleccionada(s)`}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancelar</button>
              <button className="btn btn-navy" onClick={handleSubmitForm} disabled={crearMutation.isPending}>
                {crearMutation.isPending ? 'Generando…' : 'Generar orden'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSubmitForm} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label ff-required">Proveedor</label>
              <SearchSelect
                value={supplierId}
                selectedLabel={supplierLabel}
                onChange={(id, opt) => { setSupplierId(id); setSupplierLabel(opt?.label ?? '') }}
                options={supplierOptions}
                onSearch={setSupplierQuery}
                loading={suppliersLoading}
                placeholder="Buscar proveedor…"
                error={!supplierId}
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Fecha</label>
              <DatePicker value={transactionDate} onChange={setTransactionDate} />
            </div>
            <div>
              <p className="ff-label" style={{ marginBottom: 6 }}>Total por artículo</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {[...totalsByItem.entries()].map(([code, qty]) => <li key={code}>{code}: {qty}</li>)}
              </ul>
            </div>
          </form>
        </Modal>
      )}

      {marginWarnings && (
        <Modal
          open
          onClose={() => setMarginWarnings(null)}
          title="Margen negativo en algunas líneas"
          subtitle="Comprar así implica perder dinero en esa venta específica — la orden todavía no se creó."
          size="lg"
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setMarginWarnings(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                disabled={crearMutation.isPending}
                onClick={() => crearMutation.mutate(buildDto(true))}
              >
                {crearMutation.isPending ? 'Creando…' : 'Sí, crear de todas formas'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="inline-alert inline-alert-error" style={{ margin: 0 }}>
              <AlertTriangle size={16} />
              <span>El costo de compra es igual o mayor al precio al que se le vendió esta mercancía al cliente.</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Pedido</th>
                    <th style={{ textAlign: 'right' }}>Precio venta</th>
                    <th style={{ textAlign: 'right' }}>Costo compra</th>
                    <th style={{ textAlign: 'right' }}>Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {marginWarnings.map((w, i) => (
                    <tr key={i}>
                      <td>{w.itemCode}</td>
                      <td>{w.salesOrder}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(w.precioVenta)}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(w.costoCompra)}</td>
                      <td style={{ textAlign: 'right', color: w.margen < 0 ? 'var(--danger-text, #b91c1c)' : undefined, fontWeight: 600 }}>
                        {formatMoney(w.margen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
