// Detalle de una factura de apertura de compra — docs/tasks/PROMPT_APERTURA_FRONTEND.md §8.4-8.6.
// Espejo exacto de VentaDetail, con supplier en vez de customer.

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Ban } from 'lucide-react'
import { getAperturaCompra, cancelarAperturaCompra } from '@/shared/api/apertura'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatMoney } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'

const ESTADO_BADGE: Record<string, string> = { submitted: 'badge-submitted', cancelled: 'badge-cancelled' }
const ESTADO_LABEL: Record<string, string> = { submitted: 'Confirmada', cancelled: 'Anulada' }

export default function CompraDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeAnular = usePuede('apertura.compras.anular')
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: compra, isLoading, isError } = useQuery({
    queryKey: ['apertura-compra', id],
    queryFn: () => getAperturaCompra(id!),
    enabled: !!id,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarAperturaCompra(id!),
    onSuccess: () => {
      toast.success('Factura de apertura anulada')
      queryClient.invalidateQueries({ queryKey: ['apertura-compra', id] })
      queryClient.invalidateQueries({ queryKey: ['apertura-compras'] })
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

  if (isError || !compra) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/apertura/compras')}><ArrowLeft size={14} /> Compras — Apertura</a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>No se encontró la factura de apertura</div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/apertura/compras')}><ArrowLeft size={14} /> Compras — Apertura</a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {compra.id}
            <span className={`badge ${ESTADO_BADGE[compra.estado]}`}>{ESTADO_LABEL[compra.estado]}</span>
          </h1>
          <p className="page-sub">{compra.supplierName} · {formatDate(compra.fechaFactura)}</p>
        </div>
      </div>

      {compra.estado === 'submitted' && puedeAnular && (
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
              <span className="detail-label">Proveedor</span>
              <span className="detail-value">{compra.supplierName} ({compra.supplier})</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">N° de factura del proveedor</span>
              <span className="detail-value">{compra.numeroFacturaProveedor}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de la factura</span>
              <span className="detail-value">{formatDate(compra.fechaFactura)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de vencimiento</span>
              <span className="detail-value">{formatDate(compra.fechaVencimiento)}</span>
            </div>
            {compra.origen && (
              <div className="detail-field">
                <span className="detail-label">Origen</span>
                <span className="detail-value">{compra.origen}</span>
              </div>
            )}
            {compra.branch && (
              <div className="detail-field">
                <span className="detail-label">Sucursal</span>
                <span className="detail-value">{compra.branch}</span>
              </div>
            )}
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div className="detail-field">
              <span className="detail-label">Monto migrado (saldo pendiente original)</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(compra.montoPendiente, compra.currency)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Saldo actual</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: compra.saldoActual > 0 ? 'var(--warning-text, #b45309)' : 'var(--success-text)' }}>
                {formatMoney(compra.saldoActual, compra.currency)}
              </span>
            </div>
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }} className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">NCF del proveedor</span>
              <span className="detail-value">{compra.ncf ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de comprobante</span>
              <span className="detail-value">{compra.ncfType ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Reportada en DGII (606)</span>
              <span className={`badge ${compra.reportadaEnDgii ? 'badge-submitted' : 'badge-neutral'}`}>
                {compra.reportadaEnDgii ? 'Sí' : 'No'}
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
        description={`¿Confirmas anular ${compra.id}? Esta acción no se puede deshacer directamente — para corregirla deberás cargarla de nuevo con el monto correcto.`}
        confirmLabel="Anular"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
