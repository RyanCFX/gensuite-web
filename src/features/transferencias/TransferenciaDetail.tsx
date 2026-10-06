import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getTransferencia, confirmarTransferencia, cancelarTransferencia } from '@/shared/api/transferencias'
import { getUsuarioAlmacenesPermitidos } from '@/shared/api/usuarios'
import { getCachedUser } from '@/shared/api/storage'
import { formatDate } from '@/lib/formatters'
import { usePuede } from '@/shared/permissions/can'
import { useFeature } from '@/shared/features/can'
import { Modal, ConfirmModal } from '@/shared/ui/Modal'
import { useDimensionesInventario, useValoresDimension } from '@/shared/hooks/useDimensionesInventario'
import { ArrowLeft, Check, X, Loader2, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

const MODAL_COLUMNS = [
  { key: 'articulo', width: 200 },
  { key: 'cantidad', width: 110 },
]

/** Valor legible de una celda de dimensión — se resuelve contra el catálogo de valores del eje. */
function DimensionValorCell({ codigo, id }: { codigo: string; id: string | undefined }) {
  const { etiquetaDe, isLoading } = useValoresDimension(codigo)
  if (!id) return <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
  if (isLoading) return <span className="skeleton-box" style={{ width: 60, height: 14, display: 'inline-block' }} />
  return <>{etiquetaDe(id)}</>
}

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
  const currentUserEmail = getCachedUser()?.email

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const { widths: modalColWidths, startResize: startModalResize } = useResizableColumns(MODAL_COLUMNS)

  const tieneContabilidad = useFeature('contabilidad')
  const puedeVerLibro = usePuede('contabilidad.libros.ver')

  const { data: t, isLoading } = useQuery({
    queryKey: ['transferencia', id],
    queryFn: () => getTransferencia(id!),
    enabled: !!id,
  })

  // Una columna por cada eje de dimensión que tenga al menos una línea (como facturas/nueva).
  const dimensionCodes = Array.from(new Set((t?.items ?? []).flatMap((i) => Object.keys(i.dimensiones ?? {}))))
  const { etiquetaDe: dimensionEtiquetaDe } = useDimensionesInventario({ enabled: dimensionCodes.length > 0 })
  const ITEMS_COLUMNS = [
    { key: 'codigo', width: 120 },
    { key: 'articulo', width: 240 },
    ...dimensionCodes.map((code) => ({ key: `dim:${code}`, width: 140 })),
    { key: 'cantidad', width: 120 },
  ]
  const { widths: itemsColWidths, startResize: startItemsResize } = useResizableColumns(ITEMS_COLUMNS)

  const { data: myWarehouses } = useQuery({
    queryKey: ['usuarioAlmacenesPermitidos', currentUserEmail],
    queryFn: () => getUsuarioAlmacenesPermitidos(currentUserEmail!),
    enabled: !!currentUserEmail,
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

  const createdDate = t.createdAt.split('T')[0]

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/transferencias')}><ArrowLeft size={14} /> Transferencias</a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="page-title-dot" />
            Transferencia {t.id}
            <span className={`badge ${STATUS_BADGE[t.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
          </h1>
          <p className="page-sub">{t.fromWarehouse} → {t.toWarehouse}</p>
        </div>
      </div>

      <div className="doc-actions-bar" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {t.status === 'in_transit' && (
          <>
            <button
              className="btn btn-navy btn-size-md"
              title={canConfirm ? undefined : 'No tienes acceso a la sucursal destino'}
              disabled={!canConfirm}
              onClick={() => setConfirmOpen(true)}
            >
              <Check size={14} /> Confirmar Recepción
            </button>
            <button className="btn btn-danger btn-size-md" onClick={() => setCancelOpen(true)}>
              <X size={14} /> Cancelar
            </button>
          </>
        )}
        {tieneContabilidad && puedeVerLibro && (t.status === 'in_transit' || t.status === 'completed') && (
          <button
            className="btn btn-secondary btn-size-md"
            onClick={() => {
              navigate(
                `/contabilidad/libro-diario?voucherNo=${encodeURIComponent(t.id)}` +
                `&voucherType=Stock+Entry&fromDate=${createdDate}&toDate=${createdDate}`,
              )
            }}
          >
            <BookOpen size={14} /> Ver asientos
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header">
          <h2 className="card-title">Información de la Transferencia</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Almacén Origen</span>
              <span className="detail-value">{t.fromWarehouse}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Almacén Destino</span>
              <span className="detail-value">{t.toWarehouse}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de Creación</span>
              <span className="detail-value">{formatDate(t.createdAt)}</span>
            </div>
            {t.confirmationId && (
              <div className="detail-field">
                <span className="detail-label">Recepción (Stock Entry)</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-body)' }}>{t.confirmationId}</span>
              </div>
            )}
          </div>
          {t.notes && (
            <div className="detail-field" style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <span className="detail-label">Notas</span>
              <span className="detail-value" style={{ whiteSpace: 'pre-line' }}>{t.notes}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="items-table-wrap">
          <table className="items-table navy-table items-table-resizable">
            <colgroup>
              {ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: itemsColWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Código
                  <span className="col-resize-handle" onMouseDown={startItemsResize('codigo')} />
                </th>
                <th>
                  Artículo
                  <span className="col-resize-handle" onMouseDown={startItemsResize('articulo')} />
                </th>
                {dimensionCodes.map((code) => (
                  <th key={code}>
                    {dimensionEtiquetaDe(code)}
                    <span className="col-resize-handle" onMouseDown={startItemsResize(`dim:${code}`)} />
                  </th>
                ))}
                <th style={{ textAlign: 'right' }}>
                  Cantidad
                  <span className="col-resize-handle" onMouseDown={startItemsResize('cantidad')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {t.items.map((i, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{i.itemCode || '—'}</td>
                  <td>{i.itemName ?? i.itemCode}</td>
                  {dimensionCodes.map((code) => (
                    <td key={code}><DimensionValorCell codigo={code} id={i.dimensiones?.[code]} /></td>
                  ))}
                  <td style={{ textAlign: 'right' }}>{i.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar recepción"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>Cancelar</button>
            <button className="btn btn-navy" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
              Confirmar Recepción
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Vas a recibir en <strong>{t.toWarehouse}</strong> los siguientes artículos, provenientes de <strong>{t.fromWarehouse}</strong>:
        </p>
        <table className="data-table navy-table items-table-resizable" style={{ marginTop: 12 }}>
          <colgroup>
            {MODAL_COLUMNS.map((c) => <col key={c.key} style={{ width: modalColWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                Artículo
                <span className="col-resize-handle" onMouseDown={startModalResize('articulo')} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Cantidad
                <span className="col-resize-handle" onMouseDown={startModalResize('cantidad')} />
              </th>
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
      </Modal>

      <ConfirmModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="¿Cancelar transferencia?"
        description={`Se cancelará la transferencia de ${t.fromWarehouse} a ${t.toWarehouse} y el stock regresará al origen.`}
        confirmLabel="Cancelar Transferencia"
        variant="danger"
        loading={cancelMutation.isPending}
      />
    </div>
  )
}
