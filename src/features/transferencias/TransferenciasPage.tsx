import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listTransferencias, confirmarTransferencia, cancelarTransferencia } from '@/shared/api/transferencias'
import type { ListTransferenciasParams } from '@/shared/api/transferencias'
import type { Transferencia } from '@/shared/api/types'
import { listAlmacenes } from '@/shared/api/config'
import { getUsuarioAlmacenesPermitidos } from '@/shared/api/usuarios'
import { getUser } from '@/shared/api/storage'
import { formatDate } from '@/lib/formatters'
import { Plus, Eye, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  in_transit: 'badge-warning',
  completed: 'badge-success',
  cancelled: 'badge-error',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  in_transit: 'En tránsito',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

export default function TransferenciasPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string>('all')
  const [warehouse, setWarehouse] = useState('')
  const [toConfirm, setToConfirm] = useState<Transferencia | null>(null)
  const [toCancel, setToCancel] = useState<Transferencia | null>(null)

  const currentUserEmail = getUser()?.email

  const { data: warehousesData } = useQuery({
    queryKey: ['almacenes-all'],
    queryFn: () => listAlmacenes(),
  })
  const warehouses = warehousesData ?? []

  const { data: myWarehouses } = useQuery({
    queryKey: ['usuarioAlmacenesPermitidos', currentUserEmail],
    queryFn: () => getUsuarioAlmacenesPermitidos(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 60_000,
  })

  function canConfirm(t: Transferencia) {
    // Fail-open: si aún no cargó la lista de almacenes permitidos, no ocultamos el botón —
    // el backend valida igual en el submit.
    if (!myWarehouses) return true
    return myWarehouses.warehouses.includes(t.toWarehouse)
  }

  const params: ListTransferenciasParams = {
    status: status === 'all' ? undefined : (status as ListTransferenciasParams['status']),
    warehouse: warehouse || undefined,
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['transferencias', params],
    queryFn: () => listTransferencias(params),
  })

  const transferencias = data?.items ?? []

  const confirmMutation = useMutation({
    mutationFn: () => confirmarTransferencia(toConfirm!.id),
    onSuccess: () => {
      toast.success('Transferencia confirmada — el stock ya está disponible en destino')
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
      setToConfirm(null)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al confirmar la transferencia')
      if (err?.message?.toLowerCase().includes('no tienes acceso a la sucursal')) {
        queryClient.invalidateQueries({ queryKey: ['usuarioAlmacenesPermitidos'] })
      }
      setToConfirm(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarTransferencia(toCancel!.id),
    onSuccess: () => {
      toast.success('Transferencia cancelada')
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
      setToCancel(null)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al cancelar la transferencia')
      setToCancel(null)
    },
  })

  return (
    <div className="page-container">
      <PageHeader
        title="Transferencias entre Almacenes"
        description="Mueve artículos entre almacenes o sucursales"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/transferencias/nueva')}>
            <Plus size={16} />
            Nueva Transferencia
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="in_transit">En tránsito</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
          <select className="filter-select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">Todos los almacenes</option>
            {warehouses.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Origen</th>
              <th>Destino</th>
              <th style={{ textAlign: 'right' }}>Artículos</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th style={{ textAlign: 'right', width: 180 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : transferencias.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-title">Sin transferencias</div>
                    <p className="empty-sub">Crea la primera transferencia entre almacenes.</p>
                    <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/transferencias/nueva')}>
                      <Plus size={14} /> Nueva Transferencia
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              transferencias.map((t) => (
                <tr
                  key={t.id}
                  className="table-row-clickable"
                  onClick={() => navigate(`/transferencias/${t.id}`)}
                >
                  <td style={{ fontWeight: 500 }}>{t.fromWarehouse}</td>
                  <td style={{ fontWeight: 500 }}>{t.toWarehouse}</td>
                  <td style={{ textAlign: 'right' }}>{t.items.length}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[t.status] ?? 'badge-neutral'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="td-muted">{formatDate(t.createdAt)}</td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    {t.status === 'in_transit' ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary btn-size-sm"
                          title={canConfirm(t) ? 'Confirmar recepción' : 'No tienes acceso a la sucursal destino'}
                          disabled={!canConfirm(t)}
                          onClick={() => setToConfirm(t)}
                        >
                          <Check size={13} /> Confirmar
                        </button>
                        <button
                          className="btn btn-ghost btn-size-icon-sm"
                          style={{ color: 'var(--icon-muted)' }}
                          onClick={() => setToCancel(t)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost btn-size-icon-sm"
                        onClick={() => navigate(`/transferencias/${t.id}`)}
                      >
                        <Eye size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {transferencias.length} de {data.meta.total ?? transferencias.length} transferencias
          </span>
        </div>
      )}

      {/* Confirmar recepción */}
      {toConfirm && (
        <div className="modal-overlay" onClick={() => setToConfirm(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Confirmar recepción</h2>
              <button className="modal-close" onClick={() => setToConfirm(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Vas a recibir en <strong>{toConfirm.toWarehouse}</strong> los siguientes artículos, provenientes de <strong>{toConfirm.fromWarehouse}</strong>:
              </p>
              <table className="data-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr><th>Artículo</th><th style={{ textAlign: 'right' }}>Cantidad</th></tr>
                </thead>
                <tbody>
                  {toConfirm.items.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.itemName ?? i.itemCode}</td>
                      <td style={{ textAlign: 'right' }}>{i.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToConfirm(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
                Confirmar Recepción
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancelar */}
      {toCancel && (
        <div className="modal-overlay" onClick={() => setToCancel(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Cancelar transferencia?</h2>
              <button className="modal-close" onClick={() => setToCancel(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se cancelará la transferencia de <strong>{toCancel.fromWarehouse}</strong> a <strong>{toCancel.toWarehouse}</strong> y el stock regresará al origen.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToCancel(null)}>Volver</button>
              <button className="btn btn-danger" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
                Cancelar Transferencia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
