// Detalle de una factura de apertura de venta — docs/tasks/PROMPT_APERTURA_FRONTEND.md §8.2.
// Sin edición ni e-CF: la única acción posible es Anular (§8.3).

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Ban } from 'lucide-react'
import { getAperturaVenta, cancelarAperturaVenta } from '@/shared/api/apertura'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatMoney } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'

const ESTADO_BADGE: Record<string, string> = { submitted: 'badge-submitted', cancelled: 'badge-cancelled' }
const ESTADO_LABEL: Record<string, string> = { submitted: 'Confirmada', cancelled: 'Anulada' }

export default function VentaDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeAnular = usePuede('apertura.ventas.anular')
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: venta, isLoading, isError } = useQuery({
    queryKey: ['apertura-venta', id],
    queryFn: () => getAperturaVenta(id!),
    enabled: !!id,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarAperturaVenta(id!),
    onSuccess: () => {
      toast.success('Factura de apertura anulada')
      queryClient.invalidateQueries({ queryKey: ['apertura-venta', id] })
      queryClient.invalidateQueries({ queryKey: ['apertura-ventas'] })
      setConfirmCancel(false)
    },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al anular'); setConfirmCancel(false) },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 16 }} />
        <span className="skeleton-box" style={{ height: 220, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !venta) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/apertura/ventas')}><ArrowLeft size={14} /> Ventas — Apertura</a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>No se encontró la factura de apertura</div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/apertura/ventas')}><ArrowLeft size={14} /> Ventas — Apertura</a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {venta.id}
            <span className={`badge ${ESTADO_BADGE[venta.estado]}`}>{ESTADO_LABEL[venta.estado]}</span>
          </h1>
          <p className="page-sub">{venta.customerName} · {formatDate(venta.fechaFactura)}</p>
        </div>
      </div>

      {venta.estado === 'submitted' && puedeAnular && (
        <div className="doc-actions-bar">
          <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmCancel(true)} disabled={cancelMutation.isPending}>
            <Ban size={14} /> Anular
          </button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Información de la factura</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{venta.customerName} ({venta.customer})</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">N° de factura original</span>
              <span className="detail-value">{venta.numeroFacturaOriginal}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de la factura</span>
              <span className="detail-value">{formatDate(venta.fechaFactura)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de vencimiento</span>
              <span className="detail-value">{formatDate(venta.fechaVencimiento)}</span>
            </div>
            {venta.origen && (
              <div className="detail-field">
                <span className="detail-label">Origen</span>
                <span className="detail-value">{venta.origen}</span>
              </div>
            )}
            {venta.branch && (
              <div className="detail-field">
                <span className="detail-label">Sucursal</span>
                <span className="detail-value">{venta.branch}</span>
              </div>
            )}
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div className="detail-field">
              <span className="detail-label">Monto migrado (saldo pendiente original)</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(venta.montoPendiente, venta.currency)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Saldo actual</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: venta.saldoActual > 0 ? 'var(--warning-text, #b45309)' : 'var(--success-text)' }}>
                {formatMoney(venta.saldoActual, venta.currency)}
              </span>
            </div>
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }} className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">NCF</span>
              <span className="detail-value">{venta.ncf ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de comprobante</span>
              <span className="detail-value">{venta.ncfType ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Reportada en DGII (607)</span>
              <span className={`badge ${venta.reportadaEnDgii ? 'badge-submitted' : 'badge-neutral'}`}>
                {venta.reportadaEnDgii ? 'Sí' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Anular factura de apertura"
        description={`¿Confirmas anular ${venta.id}? Esta acción no se puede deshacer directamente — para corregirla deberás cargarla de nuevo con el monto correcto.`}
        confirmLabel="Anular"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
