import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createLoteFarmacia } from '@/shared/api/farmacia'
import { listCustomers } from '@/shared/api/customers'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import type { LoteFacturacionArs } from '@/shared/api/types'

export function LoteCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (lote: LoteFacturacionArs) => void }) {
  const [aseguradoraId, setAseguradoraId] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  const [aseguradoraQuery, setAseguradoraQuery] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [responsable, setResponsable] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { data: aseguradorasData, isLoading: aseguradorasLoading } = useQuery({
    queryKey: ['customerSearch-ars', aseguradoraQuery],
    queryFn: () => listCustomers({ search: aseguradoraQuery || undefined, limit: 15 }),
  })
  const aseguradoraOptions: SearchSelectOption[] = (aseguradorasData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
  }))
  const aseguradoraSeleccionada = aseguradorasData?.items.find((c) => c.id === aseguradoraId)

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
              <SearchSelect
                value={aseguradoraId}
                selectedLabel={aseguradoraLabel}
                onChange={(val, opt) => { setAseguradoraId(val); setAseguradoraLabel(opt?.label ?? '') }}
                options={aseguradoraOptions}
                onSearch={setAseguradoraQuery}
                loading={aseguradorasLoading}
                placeholder="Buscar ARS…"
                error={submitted && !aseguradoraId}
              />
            </div>

            {aseguradoraSeleccionada && aseguradoraSeleccionada.hasCredit === false && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--warning-bg, rgba(234,179,8,0.1))', fontSize: 12 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Este cliente no tiene "Tiene crédito fiscal" activado — "Facturar" fallará al cierre.
                  Actívalo en el registro del cliente antes de facturar este lote.
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
