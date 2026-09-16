// Detalle de una apertura de inventario — docs/tasks/PROMPT_APERTURA_INVENTARIO_FRONTEND.md §8.2.
// Sin edición: la única acción posible es Anular (§7) — y a diferencia de anular una factura de
// apertura, esto SÍ revierte stock real, por eso el modal de confirmación tiene su propio texto.

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Ban } from 'lucide-react'
import { getAperturaInventario, cancelarAperturaInventario } from '@/shared/api/apertura'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatMoney, formatNumber } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'

const ESTADO_BADGE: Record<string, string> = { submitted: 'badge-submitted', cancelled: 'badge-cancelled' }
const ESTADO_LABEL: Record<string, string> = { submitted: 'Confirmada', cancelled: 'Anulada' }

export default function InventarioDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const puedeAnular = usePuede('apertura.inventario.anular')
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['apertura-inventario', id],
    queryFn: () => getAperturaInventario(id!),
    enabled: !!id,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarAperturaInventario(id!),
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['apertura-inventario', id] })
      queryClient.invalidateQueries({ queryKey: ['apertura-inventario'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
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

  if (isError || !doc) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/apertura/inventario')}><ArrowLeft size={14} /> Inventario — Apertura</a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>No se encontró la apertura de inventario</div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/apertura/inventario')}><ArrowLeft size={14} /> Inventario — Apertura</a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {doc.id}
            <span className={`badge ${ESTADO_BADGE[doc.estado]}`}>{ESTADO_LABEL[doc.estado]}</span>
          </h1>
          <p className="page-sub">{formatDate(doc.fechaApertura)}{doc.branch ? ` · ${doc.branch}` : ''}</p>
        </div>
      </div>

      {doc.estado === 'submitted' && puedeAnular && (
        <div className="doc-actions-bar">
          <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmCancel(true)} disabled={cancelMutation.isPending}>
            <Ban size={14} /> Anular
          </button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Información general</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Fecha de apertura</span>
              <span className="detail-value">{formatDate(doc.fechaApertura)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Sucursal</span>
              <span className="detail-value">{doc.branch ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Departamento</span>
              <span className="detail-value">{doc.department ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cuenta de apertura</span>
              <span className="detail-value">{doc.cuentaApertura}</span>
            </div>
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <span className="detail-label">Monto total migrado</span>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(doc.montoTotal)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Artículos ({doc.items.length})</h2></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Almacén</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th style={{ textAlign: 'right' }}>Costo unitario</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.itemCode}</td>
                  <td className="td-muted">{it.warehouse}</td>
                  <td style={{ textAlign: 'right' }}>{formatNumber(it.qty)}</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(it.valuationRate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(it.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(doc.montoTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Anular apertura de inventario"
        description={`¿Anular esta apertura de inventario? A diferencia de anular una factura, esto SÍ revertirá el stock de los artículos/almacenes incluidos en este documento. Si ya se vendió o movió stock de estos artículos después de cargar esta apertura, verifica el inventario resultante antes de continuar. Esta acción no se puede deshacer directamente — para corregir, deberás cargar un nuevo documento con la cantidad correcta.`}
        confirmLabel="Anular"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
