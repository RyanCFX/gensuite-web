import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getSolicitudCompra, submitSolicitudCompra, cancelSolicitudCompra, amendSolicitudCompra,
  detenerSolicitudCompra, reanudarSolicitudCompra, generarOrdenDesdeSolicitud,
} from '@/shared/api/solicitudes-compra'
import { listSuppliers } from '@/shared/api/suppliers'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Send, X, RotateCcw, Pause, Play, ShoppingCart, FileText } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import type { OrdenFromSolicitudItemOverrideDto } from '@/shared/api/types'

type ConfirmAction = 'submit' | 'cancel' | 'amend' | 'detener' | 'reanudar' | null

export default function SolicitudDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [showGenerarOrden, setShowGenerarOrden] = useState(false)

  const { data: solicitud, isLoading, isError } = useQuery({
    queryKey: ['solicitud-compra', id],
    queryFn: () => getSolicitudCompra(id!),
    enabled: !!id,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['solicitud-compra', id] })
    queryClient.invalidateQueries({ queryKey: ['solicitudes-compra'] })
    setConfirmAction(null)
  }

  const submitMutation = useMutation({
    mutationFn: () => submitSolicitudCompra(id!),
    onSuccess: () => { toast.success('Solicitud sometida'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al someter la solicitud'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelSolicitudCompra(id!),
    onSuccess: () => { toast.success('Solicitud anulada'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al anular la solicitud'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendSolicitudCompra(id!),
    onSuccess: (data) => { toast.success('Enmienda creada'); queryClient.invalidateQueries({ queryKey: ['solicitudes-compra'] }); navigate(`/compras/solicitudes/${data.id}`) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al enmendar la solicitud'),
  })

  const detenerMutation = useMutation({
    mutationFn: () => detenerSolicitudCompra(id!),
    onSuccess: () => { toast.success('Solicitud detenida'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al detener la solicitud'),
  })

  const reanudarMutation = useMutation({
    mutationFn: () => reanudarSolicitudCompra(id!),
    onSuccess: () => { toast.success('Solicitud reanudada'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al reanudar la solicitud'),
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate()
    else if (confirmAction === 'cancel') cancelMutation.mutate()
    else if (confirmAction === 'amend') amendMutation.mutate()
    else if (confirmAction === 'detener') detenerMutation.mutate()
    else if (confirmAction === 'reanudar') reanudarMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending || detenerMutation.isPending || reanudarMutation.isPending

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !solicitud) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>Error al cargar la solicitud.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  const confirmMessages: Record<NonNullable<ConfirmAction>, { title: string; description: string; actionLabel: string }> = {
    submit: { title: '¿Someter solicitud?', description: 'La solicitud quedará sometida y disponible para generar órdenes de compra.', actionLabel: 'Someter' },
    cancel: { title: '¿Anular solicitud?', description: 'La solicitud será anulada. Falla si ya se generaron órdenes de compra — anúlalas primero.', actionLabel: 'Anular' },
    amend: { title: '¿Enmendar solicitud?', description: 'Se creará una nueva solicitud basada en esta. La versión actual quedará anulada.', actionLabel: 'Enmendar' },
    detener: { title: '¿Detener solicitud?', description: 'Deja de contar como pendiente de ordenar, sin anularla — puedes reanudarla luego.', actionLabel: 'Detener' },
    reanudar: { title: '¿Reanudar solicitud?', description: 'Vuelve a contar como pendiente de ordenar.', actionLabel: 'Reanudar' },
  }

  const remanentes = solicitud.items.filter((it) => it.qty - it.orderedQty > 0)

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Solicitudes de Compra
      </button>

      <PageHeader
        title={`Solicitud ${solicitud.id}`}
        description={`Creada el ${formatDate(solicitud.transactionDate)}`}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {solicitud.status === 'draft' && (
              <>
                <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/compras/solicitudes/${id}/editar`)}>
                  <FileText size={14} />Editar
                </button>
                <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmAction('submit')}>
                  <Send size={14} />Someter
                </button>
              </>
            )}
            {solicitud.status === 'submitted' && (
              <>
                {solicitud.erpStatus === 'Stopped' ? (
                  <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('reanudar')}>
                    <Play size={14} />Reanudar
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-primary btn-size-sm"
                      onClick={() => setShowGenerarOrden(true)}
                      disabled={remanentes.length === 0}
                      title={remanentes.length === 0 ? 'No queda remanente por ordenar' : undefined}
                    >
                      <ShoppingCart size={14} />Generar Orden
                    </button>
                    <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('detener')}>
                      <Pause size={14} />Detener
                    </button>
                  </>
                )}
                <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmAction('cancel')}>
                  <X size={14} />Anular
                </button>
              </>
            )}
            {solicitud.status === 'cancelled' && (
              <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('amend')}>
                <RotateCcw size={14} />Enmendar
              </button>
            )}
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={solicitud.erpStatus} />
          {solicitud.amendedFrom && (
            <span className="badge badge-default">Enmienda de {solicitud.amendedFrom}</span>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(solicitud.transactionDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha Necesaria</span>
              <span className="detail-value">{formatDate(solicitud.scheduleDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">% Ordenado</span>
              <span className="detail-value">{Math.round(solicitud.perOrdered)}%</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Artículos</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Precio Estimado</th>
                  <th style={{ textAlign: 'right' }}>Ordenado</th>
                  <th style={{ textAlign: 'right' }}>Remanente</th>
                  <th>Almacén</th>
                </tr>
              </thead>
              <tbody>
                {solicitud.items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.itemCode}</td>
                    <td>{item.itemName}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty} {item.uom}</td>
                    <td style={{ textAlign: 'right' }}>{item.rate > 0 ? formatDOP(item.rate) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{item.orderedQty}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{item.qty - item.orderedQty}</td>
                    <td className="td-muted">{item.warehouse ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{confirmMessages[confirmAction].title}</h2>
              <button className="modal-close" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {confirmMessages[confirmAction].description}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" disabled={isPending} onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Procesando…' : confirmMessages[confirmAction].actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGenerarOrden && (
        <GenerarOrdenModal
          solicitudId={id!}
          remanentes={remanentes}
          onClose={() => setShowGenerarOrden(false)}
          onSuccess={(orden) => {
            toast.success(`Orden ${orden.id} generada`)
            invalidate()
            setShowGenerarOrden(false)
            navigate(`/compras/ordenes/${orden.id}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Generar Orden ──────────────────────────────────────────────────────────

interface GenerarOrdenModalProps {
  solicitudId: string
  remanentes: { id: string; itemCode: string; itemName: string; qty: number; orderedQty: number; rate: number; uom: string }[]
  onClose: () => void
  onSuccess: (orden: { id: string }) => void
}

function GenerarOrdenModal({ solicitudId, remanentes, onClose, onSuccess }: GenerarOrdenModalProps) {
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [lines, setLines] = useState(
    remanentes.map((it) => ({
      materialRequestItem: it.id,
      itemCode: it.itemCode,
      itemName: it.itemName,
      uom: it.uom,
      remanente: it.qty - it.orderedQty,
      qty: it.qty - it.orderedQty,
      rate: it.rate || 0,
    })),
  )

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
  })
  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
    sublabel: s.rnc ?? s.cedula,
  }))

  const generarMutation = useMutation({
    mutationFn: (items: OrdenFromSolicitudItemOverrideDto[]) =>
      generarOrdenDesdeSolicitud(solicitudId, { supplier: supplierId, items }),
    onSuccess,
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al generar la orden de compra'),
  })

  function updateLine(idx: number, patch: Partial<{ qty: number; rate: number }>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function handleConfirm() {
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    const activeLines = lines.filter((l) => l.qty > 0)
    if (activeLines.length === 0) { toast.error('Indica una cantidad mayor a cero en al menos un artículo'); return }
    const missingRate = activeLines.find((l) => !l.rate || l.rate <= 0)
    if (missingRate) { toast.error(`Falta el precio de ${missingRate.itemCode}`); return }
    generarMutation.mutate(activeLines.map((l) => ({
      materialRequestItem: l.materialRequestItem,
      qty: l.qty,
      rate: l.rate,
    })))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Generar Orden de Compra</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="ff-wrap">
            <label className="ff-label">Proveedor <span className="ff-required">*</span></label>
            <SearchSelect
              value={supplierId}
              selectedLabel={supplierName}
              onChange={(sid, opt) => {
                const resolvedId = sid === '' ? '' : (opt?.value ?? sid)
                setSupplierId(resolvedId)
                setSupplierName(opt?.label ?? '')
              }}
              options={supplierOptions}
              onSearch={setSupplierQuery}
              loading={suppliersLoading}
              placeholder="Buscar proveedor…"
              error={!supplierId}
            />
          </div>

          <table className="items-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th style={{ width: '18%', textAlign: 'right' }}>Remanente</th>
                <th style={{ width: '20%', textAlign: 'right' }}>Cantidad a Ordenar</th>
                <th style={{ width: '22%', textAlign: 'right' }}>Precio</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.materialRequestItem}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{line.itemName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{line.itemCode}</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{line.remanente} {line.uom}</td>
                  <td>
                    <QtyInput
                      className="items-input"
                      style={{ textAlign: 'right' }}
                      max={line.remanente}
                      uom={line.uom}
                      value={line.qty}
                      onChange={(v) => updateLine(idx, { qty: Math.min(v, line.remanente) })}
                    />
                  </td>
                  <td>
                    <input
                      className="items-input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ textAlign: 'right' }}
                      value={line.rate || ''}
                      placeholder="Requerido"
                      onChange={(e) => updateLine(idx, { rate: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={generarMutation.isPending}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={generarMutation.isPending}>
            {generarMutation.isPending ? 'Generando…' : 'Generar Orden'}
          </button>
        </div>
      </div>
    </div>
  )
}
