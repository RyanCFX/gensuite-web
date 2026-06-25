import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listPedidos, cancelPedido } from '@/shared/api/pedidos'
import type { Pedido } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, X, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'

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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [toCancel, setToCancel] = useState<Pedido | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['pedidos', search, statusFilter],
    queryFn: () => listPedidos({ search: search || undefined, status: statusFilter as any || undefined, limit: 100 }),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPedido(toCancel!.id),
    onSuccess: () => { toast.success('Pedido cancelado'); queryClient.invalidateQueries({ queryKey: ['pedidos'] }); setToCancel(null) },
    onError: () => toast.error('Error al cancelar el pedido'),
  })

  return (
    <div className="page-container">
      <PageHeader
        title="Pedidos de Venta"
        description="Cotización → Pedido → Factura"
        action={
          <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/pedidos/nuevo')}>
            <Plus size={14} /> Nuevo Pedido
          </button>
        }
      />

      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="search-wrap" style={{ flex: 1, maxWidth: 300 }}>
            <span className="search-icon"><Search size={13} /></span>
            <input placeholder="Buscar pedido…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="ff-select" style={{ width: 160, fontSize: 12 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="submitted">En Proceso</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="table-config">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Estado</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }}><Loader2 size={20} className="spin" /></td></tr>
              ) : !data?.items?.length ? (
                <tr><td colSpan={6}><div className="empty-state"><p className="empty-title">Sin pedidos</p><p className="empty-sub">Crea el primer pedido de venta.</p></div></td></tr>
              ) : (
                data.items.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/pedidos/${p.id}`)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{p.id}</td>
                    <td>{p.customerName}</td>
                    <td className="td-muted">{formatDate(p.transactionDate)}</td>
                    <td style={{ fontWeight: 500 }}>{formatDOP(p.items.reduce((s, i) => s + i.amount, 0))}</td>
                    <td><span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
                    <td>
                      {p.status === 'draft' && (
                        <button className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--icon-muted)' }} onClick={(e) => { e.stopPropagation(); setToCancel(p) }}>
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
              <button className="btn btn-danger" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>Cancelar Pedido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
