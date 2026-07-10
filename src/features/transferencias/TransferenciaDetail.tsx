import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getTransferencia, confirmarTransferencia, cancelarTransferencia } from '@/shared/api/transferencias'
import { getUsuarioAlmacenesPermitidos } from '@/shared/api/usuarios'
import { getUser } from '@/shared/api/storage'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDate } from '@/lib/formatters'
import { ArrowLeft, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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

export default function TransferenciaDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUserEmail = getUser()?.email

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const { data: t, isLoading } = useQuery({
    queryKey: ['transferencia', id],
    queryFn: () => getTransferencia(id!),
    enabled: !!id,
  })

  const { data: myWarehouses } = useQuery({
    queryKey: ['usuarioAlmacenesPermitidos', currentUserEmail],
    queryFn: () => getUsuarioAlmacenesPermitidos(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 60_000,
  })
  const canConfirm = !myWarehouses || !t ? true : myWarehouses.warehouses.includes(t.toWarehouse)

  const confirmMutation = useMutation({
    mutationFn: () => confirmarTransferencia(id!),
    onSuccess: () => {
      toast.success('Transferencia confirmada — el stock ya está disponible en destino')
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
      queryClient.invalidateQueries({ queryKey: ['transferencia', id] })
      setConfirmOpen(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al confirmar la transferencia')
      setConfirmOpen(false)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarTransferencia(id!),
    onSuccess: () => {
      toast.success('Transferencia cancelada')
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
      queryClient.invalidateQueries({ queryKey: ['transferencia', id] })
      setCancelOpen(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al cancelar la transferencia')
      setCancelOpen(false)
    },
  })

  if (isLoading || !t) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ height: 32, width: 240, marginBottom: 16 }} />
        <div className="skeleton-box" style={{ height: 200 }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <PageHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Transferencia: {t.fromWarehouse} → {t.toWarehouse}
            <span className={`badge ${STATUS_BADGE[t.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
          </span>
        }
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="page-back-link" onClick={() => navigate('/transferencias')}><ArrowLeft size={14} /> Transferencias</a>
            {t.status === 'in_transit' && (
              <>
                <button
                  className="btn btn-secondary"
                  title={canConfirm ? undefined : 'No tienes acceso a la sucursal destino'}
                  disabled={!canConfirm}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Check size={15} /> Confirmar Recepción
                </button>
                <button className="btn btn-ghost" style={{ color: 'var(--icon-muted)' }} onClick={() => setCancelOpen(true)}>
                  <X size={15} /> Cancelar
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="card">
        <div className="card-header"><h2 className="card-title">Información General</h2></div>
        <div className="card-body">
          <div className="form-row form-row-3">
            <div>
              <div className="ff-label" style={{ marginBottom: 4 }}>Almacén Origen</div>
              <div style={{ fontWeight: 500 }}>{t.fromWarehouse}</div>
            </div>
            <div>
              <div className="ff-label" style={{ marginBottom: 4 }}>Almacén Destino</div>
              <div style={{ fontWeight: 500 }}>{t.toWarehouse}</div>
            </div>
            <div>
              <div className="ff-label" style={{ marginBottom: 4 }}>Fecha de Creación</div>
              <div>{formatDate(t.createdAt)}</div>
            </div>
          </div>
          {t.confirmationId && (
            <div className="inline-alert" style={{ marginTop: 16 }}>
              Recepción confirmada — Stock Entry: <span style={{ fontFamily: 'var(--font-mono)' }}>{t.confirmationId}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><h2 className="card-title">Artículos</h2></div>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th style={{ textAlign: 'right', width: 120 }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {t.items.map((i, idx) => (
                <tr key={idx}>
                  <td>{i.itemName ?? i.itemCode}</td>
                  <td style={{ textAlign: 'right' }}>{i.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {t.notes && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header"><h2 className="card-title">Notas</h2></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{t.notes}</p>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Confirmar recepción</h2>
              <button className="modal-close" onClick={() => setConfirmOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Vas a recibir en <strong>{t.toWarehouse}</strong> los siguientes artículos, provenientes de <strong>{t.fromWarehouse}</strong>:
              </p>
              <table className="data-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr><th>Artículo</th><th style={{ textAlign: 'right' }}>Cantidad</th></tr>
                </thead>
                <tbody>
                  {t.items.map((i, idx) => (
                    <tr key={idx}>
                      <td>{i.itemName ?? i.itemCode}</td>
                      <td style={{ textAlign: 'right' }}>{i.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                {confirmMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
                Confirmar Recepción
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div className="modal-overlay" onClick={() => setCancelOpen(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Cancelar transferencia?</h2>
              <button className="modal-close" onClick={() => setCancelOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se cancelará la transferencia de <strong>{t.fromWarehouse}</strong> a <strong>{t.toWarehouse}</strong> y el stock regresará al origen.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setCancelOpen(false)}>Volver</button>
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
