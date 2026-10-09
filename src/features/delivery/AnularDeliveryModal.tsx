// Anular una venta con entrega fallida — POST /delivery/facturas/:invoiceId/anular (§5).
// Idempotente/reintentable. 409 DELIVERY_ANULACION_NO_PERMITIDA → flujo normal de Devoluciones.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { anularFacturaDelivery } from '@/shared/api/delivery'
import type { ApiError, DeliveryAnularResult } from '@/shared/api/types'
import { Modal } from '@/shared/ui/Modal'
import { Select, SelectItem } from '@/components/ui/select'
import { esErrorDelivery } from '@/lib/deliveryErrors'
import { DeliveryErrorAlert } from './viajeUi'

const MOTIVOS_NC: { value: string; label: string }[] = [
  { value: '1', label: '1 — Deterioro de factura pre-impresa' },
  { value: '2', label: '2 — Errores de impresión (factura pre-impresa)' },
  { value: '3', label: '3 — Impresión defectuosa' },
  { value: '4', label: '4 — Corrección de la información' },
  { value: '5', label: '5 — Cambio de productos' },
]

interface Props {
  open: boolean
  invoiceId: string | null
  /** Texto de contexto (NCF · cliente). */
  descripcion?: string
  onClose: () => void
  onDone?: (res: DeliveryAnularResult) => void
}

export function AnularDeliveryModal({ open, invoiceId, descripcion, onClose, onDone }: Props) {
  const queryClient = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const [motivoAnulacion, setMotivoAnulacion] = useState('1')
  const [error, setError] = useState<ApiError | null>(null)

  const trimmed = motivo.trim()
  const valido = trimmed.length >= 10 && trimmed.length <= 500

  const mutation = useMutation({
    mutationFn: () =>
      anularFacturaDelivery(invoiceId!, {
        motivo: trimmed,
        motivoAnulacion: Number(motivoAnulacion) as 1 | 2 | 3 | 4 | 5,
      }),
    onSuccess: (res) => {
      if (res.yaAnulada) toast.info('La venta ya estaba anulada')
      else toast.success(`Venta anulada${res.notaCredito ? ` — nota de crédito ${res.notaCredito}` : ''}`)
      res.advertencias?.forEach((a) => toast.warning(a, { duration: 8000 }))
      for (const k of ['delivery-pendientes', 'delivery-viajes', 'delivery-viaje', 'delivery-cobros']) {
        queryClient.invalidateQueries({ queryKey: [k] })
      }
      setMotivo('')
      setError(null)
      onDone?.(res)
      onClose()
    },
    onError: (err: ApiError) => setError(err),
  })

  function cerrar() {
    if (mutation.isPending) return
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Anular venta"
      subtitle={descripcion ?? invoiceId ?? undefined}
      footer={
        <>
          <button className="btn btn-ghost" onClick={cerrar} disabled={mutation.isPending}>Cancelar</button>
          <button className="btn btn-danger" disabled={!valido || mutation.isPending} onClick={() => { setError(null); mutation.mutate() }}>
            {mutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Anular venta'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="inline-alert inline-alert-info" style={{ margin: 0 }}>
          Se emite una nota de crédito total con reembolso contra el cobro pendiente, la mercancía vuelve al
          inventario y se libera la reserva. Si falla a medias puedes reintentar.
        </div>
        <div className="ff-wrap">
          <label className="ff-label ff-required">Motivo (10 a 500 caracteres)</label>
          <textarea className="ff-textarea" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <span className="ff-hint">{trimmed.length}/500</span>
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Código DGII de la nota de crédito</label>
          <Select value={motivoAnulacion} onValueChange={setMotivoAnulacion} clearable={false}>
            {MOTIVOS_NC.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </Select>
        </div>
        {error && (
          <DeliveryErrorAlert err={error}>
            {esErrorDelivery(error, 'DELIVERY_ANULACION_NO_PERMITIDA') && (
              <span style={{ fontSize: 13 }}>
                El cobro ya fue conciliado: usa el flujo normal de <Link to="/devoluciones" onClick={onClose}>Devoluciones</Link>.
              </span>
            )}
          </DeliveryErrorAlert>
        )}
      </div>
    </Modal>
  )
}
