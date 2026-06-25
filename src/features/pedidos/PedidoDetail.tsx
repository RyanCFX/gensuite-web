import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getPedido, submitPedido, cancelPedido, amendPedido } from '@/shared/api/pedidos'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate, formatDOP } from '@/lib/formatters'
import { ArrowLeft, Send, Trash2, GitBranch, Loader2, FileText, History } from 'lucide-react'
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

export default function PedidoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: pedido, isLoading } = useQuery({
    queryKey: ['pedido', id],
    queryFn: () => getPedido(id!),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: () => submitPedido(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      toast.success('Pedido facturado correctamente')
      if ((result as any)?.facturaId) navigate(`/facturacion/facturas/${(result as any).facturaId}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al facturar el pedido'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPedido(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pedidos'] }); queryClient.invalidateQueries({ queryKey: ['pedido', id] }); toast.success('Pedido cancelado') },
    onError: () => toast.error('Error al cancelar el pedido'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendPedido(id!),
    onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Enmienda creada'); navigate(`/pedidos/${(result as any).newId}`) },
    onError: () => toast.error('Error al crear enmienda'),
  })

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending

  if (isLoading) return <div className="page-container"><div className="skeleton-box" style={{ width: 280, height: 28 }} /><div className="skeleton-box" style={{ width: '100%', height: 128, marginTop: 12 }} /></div>
  if (!pedido) return <div className="page-container"><div className="empty-state"><p className="empty-title">Pedido no encontrado</p></div></div>

  const subtotal = pedido.items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = pedido.items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const itbis = Math.round(subtotal * 0.18 * 100) / 100
  const total = subtotal + itbis
  const versionNumber = pedido.history ? pedido.history.length + 1 : 1

  return (
    <div className="page-container">
      <PageHeader
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Pedido {pedido.id}
            <span className={`badge ${STATUS_BADGE[pedido.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[pedido.status] ?? pedido.status}</span>
            {pedido.amendedFrom && <span className="badge badge-info">Versión {versionNumber}</span>}
          </div>
        }
        description={`Cliente: ${pedido.customerName}`}
        backTo="/pedidos"
        backLabel="Pedidos"
      />

      <div className="doc-actions-bar">
        {pedido.status === 'draft' && (
          <>
            <button className="btn btn-primary btn-size-sm" onClick={() => submitMutation.mutate()} disabled={isPending}>
              <Send size={14} /> Facturar
            </button>
            <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/pedidos/${id}/editar`)} disabled={isPending}>
              <FileText size={14} /> Editar
            </button>
            <button className="btn btn-danger btn-size-sm" onClick={() => cancelMutation.mutate()} disabled={isPending}>
              <Trash2 size={14} /> Cancelar
            </button>
          </>
        )}
        {pedido.status === 'submitted' && (
          <button className="btn btn-ghost btn-size-sm" onClick={() => amendMutation.mutate()} disabled={isPending}>
            <GitBranch size={14} /> Enmendar
          </button>
        )}
        {pedido.facturaId && (
          <span className="badge badge-success" style={{ marginLeft: 8 }}>
            <FileText size={12} /> Factura generada: {pedido.facturaId}
          </span>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Información General</h2></div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{pedido.customerName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(pedido.transactionDate)}</span>
            </div>
            {pedido.deliveryDate && (
              <div className="detail-field">
                <span className="detail-label">Entrega estimada</span>
                <span className="detail-value">{formatDate(pedido.deliveryDate)}</span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Estado</span>
              <span className="detail-value"><span className={`badge ${STATUS_BADGE[pedido.status]}`}>{STATUS_LABEL[pedido.status]}</span></span>
            </div>
          </div>
          {pedido.notes && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Notas</p>
              <p style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{pedido.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Artículos</h2></div>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th>UDM</th>
              </tr>
            </thead>
            <tbody>
              {pedido.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right' }}>
                    {item.discountPct && item.discountPct > 0 ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)', marginRight: 4 }}>{formatDOP(item.rate)}</span>
                        {formatDOP(item.discountedRate ?? item.rate)}
                      </>
                    ) : formatDOP(item.rate)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{item.discountPct ? `${item.discountPct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                  <td>{item.uom || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="items-total-row">
            <div className="items-total-line"><span>Subtotal bruto</span><span>{formatDOP(grossTotal)}</span></div>
            {totalDiscount > 0 && <div className="items-total-line" style={{ color: 'var(--text-danger)' }}><span>Descuento total</span><span>-{formatDOP(totalDiscount)}</span></div>}
            <div className="items-total-line"><span>Subtotal neto</span><span>{formatDOP(subtotal)}</span></div>
            <div className="items-total-line"><span>ITBIS (18%)</span><span>{formatDOP(itbis)}</span></div>
            <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}><span>Total</span><span>{formatDOP(total)}</span></div>
          </div>
        </div>
      </div>

      {pedido.history && pedido.history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><History size={15} /> Historial de versiones</h2></div>
          <div className="card-body">
            {pedido.history.map((entry, idx) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: idx < pedido.history!.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.status === 'Cancelled' ? 'var(--color-danger)' : 'var(--color-success)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>Versión {idx + 1} — {entry.id}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{entry.status} · {formatDate(entry.date)} · {formatDOP(entry.total)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
