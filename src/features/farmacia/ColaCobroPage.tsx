import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cobrarDespacho, listDespachos } from '@/shared/api/farmacia'
import { listMetodosPago, listDenominaciones } from '@/shared/api/config'
import { PaymentLinesEditor } from '@/components/shared/PaymentLinesEditor'
import { EMPTY_PAYMENT_LINES_VALUE, buildSubmitPayload, isPaymentLinesValid } from '@/lib/paymentLines'
import type { PaymentLinesValue } from '@/lib/paymentLines'
import { formatDOP } from '@/lib/formatters'
import { X, DollarSign, Loader2 } from 'lucide-react'
import { Select, SelectItem } from '@/components/ui/select'
import { Permitido } from '@/components/shared/Permitido'
import { useTabActiva } from '@/shared/hooks/useTabActiva'
import type { DespachoProvisionalArs } from '@/shared/api/types'

// El backend documenta esta cola como SSE, pero él mismo aclara que es polling cada 5s
// disfrazado — sin push real. EventSource nativo tampoco soporta los headers de auth que este
// API exige siempre (Authorization/X-Tenant), así que se usa el endpoint plano de fallback ya
// documentado con el mismo mecanismo de refetchInterval que ya usa el resto del repo.
const COLA_REFETCH_MS = 5_000

export default function ColaCobroPage() {
  const queryClient = useQueryClient()
  const tabActiva = useTabActiva()
  const [cobrando, setCobrando] = useState<DespachoProvisionalArs | null>(null)
  const [paymentsValue, setPaymentsValue] = useState<PaymentLinesValue>(EMPTY_PAYMENT_LINES_VALUE)
  const [ncfType, setNcfType] = useState<'B01' | 'B02'>('B02')

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-cola-cobro'],
    queryFn: () => listDespachos({ estado: 'Confirmado', limit: 50 }),
    refetchInterval: tabActiva ? COLA_REFETCH_MS : false,
  })
  const despachos = data?.items ?? []

  const { data: metodos } = useQuery({ queryKey: ['metodos-pago'], queryFn: listMetodosPago, staleTime: 5 * 60_000 })
  const { data: denominaciones } = useQuery({ queryKey: ['denominaciones'], queryFn: listDenominaciones, staleTime: 5 * 60_000 })

  function abrirCobro(despacho: DespachoProvisionalArs) {
    setCobrando(despacho)
    setPaymentsValue(EMPTY_PAYMENT_LINES_VALUE)
    setNcfType('B02')
  }

  function cerrarCobro() {
    setCobrando(null)
  }

  const cobrarMutation = useMutation({
    mutationFn: () =>
      cobrarDespacho(cobrando!.id, {
        ...buildSubmitPayload(paymentsValue),
        ncfType,
      }),
    onSuccess: (result) => {
      toast.success(result.ncf ? `Cobrado — NCF ${result.ncf}` : 'Cobrado — el NCF se completará cuando la DGII responda')
      queryClient.invalidateQueries({ queryKey: ['farmacia-cola-cobro'] })
      cerrarCobro()
    },
    onError: (err: { message?: string }) => {
      // Errores de configuración (ITBIS/253-12, flujoCobro) no los puede resolver el cajero por
      // sí mismo — el mensaje del servidor ya explica exactamente qué falta corregir y dónde
      // (docs/FARMACIA_ARS_FRONTEND.md §3.4.1); se muestra tal cual en ambos casos.
      toast.error(err?.message ?? 'Error al cobrar el despacho')
    },
  })

  const canSubmit =
    !!cobrando && isPaymentLinesValid(paymentsValue, cobrando.montoPaciente, metodos ?? [], denominaciones ?? [])

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cola de Cobro</h1>
          <p className="page-sub">Despachos esperando que se cobre la parte del paciente — se actualiza cada 5 segundos</p>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ARS</th>
              <th>Paciente</th>
              <th>N.º autorización</th>
              <th>Carnet</th>
              <th style={{ textAlign: 'right' }}>A cobrar</th>
              <th style={{ width: 140 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : despachos.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin despachos pendientes de cobro</div>
                    <p className="empty-sub">Los despachos aparecen acá apenas se confirman.</p>
                  </div>
                </td>
              </tr>
            ) : (
              despachos.map((d) => (
                <tr key={d.id}>
                  <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.id}</td>
                  <td style={{ fontWeight: 500 }}>{d.aseguradoraName ?? d.aseguradora ?? '—'}</td>
                  <td>{d.clienteName ?? d.cliente ?? '—'}</td>
                  <td>{d.numeroAprobacion ?? '—'}</td>
                  <td>{d.carnetAfiliado ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(d.montoPaciente)}</td>
                  <td className="actions-cell">
                    <Permitido accion="farmacia.despachos.cobrar">
                      <button className="btn btn-primary btn-size-sm" onClick={() => abrirCobro(d)}>
                        <DollarSign size={14} /> Cobrar
                      </button>
                    </Permitido>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {cobrando && (
        <div className="modal-overlay" onClick={cerrarCobro}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Cobrar despacho {cobrando.id}</h2>
              <button className="modal-close" onClick={cerrarCobro}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                La cobertura de la ARS ({formatDOP(cobrando.montoArs)}) se registra sola — este formulario
                es solo por lo que el paciente entrega.
              </p>
              <PaymentLinesEditor amountDue={cobrando.montoPaciente} value={paymentsValue} onChange={setPaymentsValue} />
              <div className="ff-wrap">
                <label className="ff-label">Tipo de comprobante</label>
                <Select value={ncfType} onValueChange={(val) => setNcfType(val as 'B01' | 'B02')}>
                  <SelectItem value="B02">B02 — Consumo (default)</SelectItem>
                  <SelectItem value="B01">B01 — Crédito Fiscal (el paciente tiene RNC)</SelectItem>
                </Select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={cerrarCobro}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => cobrarMutation.mutate()} disabled={!canSubmit || cobrarMutation.isPending}>
                {cobrarMutation.isPending ? <Loader2 size={14} className="spinner" /> : <DollarSign size={14} />}
                Cobrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
