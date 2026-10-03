import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createLoteFarmacia } from '@/shared/api/farmacia'
import { DatePicker } from '@/shared/ui/DatePicker'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import type { LoteFacturacionArs } from '@/shared/api/types'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'

export function LoteCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (lote: LoteFacturacionArs) => void }) {
  const [aseguradoraId, setAseguradoraId] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [responsable, setResponsable] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const [aseguradoraTieneCredito, setAseguradoraTieneCredito] = useState<boolean | null>(null)

  const createMutation = useMutation({
    mutationFn: createLoteFarmacia,
    onSuccess: (lote) => {
      toast.success('Lote creado correctamente')
      onCreated(lote)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el lote'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!aseguradoraId) { toast.error('Selecciona la ARS'); return }
    if (!periodoInicio || !periodoFin) { toast.error('Indica el período que cubre este lote'); return }
    createMutation.mutate({
      aseguradora: aseguradoraId,
      periodoInicio,
      periodoFin,
      responsable: responsable || undefined,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Nuevo Lote de Facturación</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label ff-required">ARS</label>
              <OpcionesSelect
                recurso="aseguradoras"
                value={aseguradoraId}
                selectedLabel={aseguradoraLabel}
                onChange={(val, opt) => {
                  setAseguradoraId(val)
                  setAseguradoraLabel(opt?.label ?? '')
                  const credito = opt?.raw?.custom_tiene_credito
                  setAseguradoraTieneCredito(val ? credito === 1 || credito === true : null)
                }}
                placeholder="Buscar ARS…"
                error={submitted && !aseguradoraId}
              />
            </div>

            {aseguradoraTieneCredito === false && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--warning-bg, rgba(234,179,8,0.1))', fontSize: 12 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Esta aseguradora no tiene "Tiene crédito" activado — "Facturar" fallará al cierre.
                  Actívalo en el registro de la aseguradora antes de facturar este lote.
                </span>
              </div>
            )}

            <div className="ff-wrap">
              <label className="ff-label ff-required">Período — desde</label>
              <DatePicker className="ff-input" value={periodoInicio} onChange={setPeriodoInicio} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label ff-required">Período — hasta</label>
              <DatePicker className="ff-input" value={periodoFin} onChange={setPeriodoFin} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Responsable (opcional)</label>
              <input className="ff-input" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Correo del responsable" />
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
              Crear Lote
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
