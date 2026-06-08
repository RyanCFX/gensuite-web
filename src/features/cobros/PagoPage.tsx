import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { registerPago } from '@/shared/api/cobros'
import { listCustomers } from '@/shared/api/customers'
import { listMetodosPago } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { CheckCircle2 } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

// CreateCobroDto fields (matches BFF exactly):
// customer*, postingDate*, paidAmount*, paidTo*, modeOfPayment*,
// referenceNo?, referenceDate?, remarks?

export default function PagoPage() {
  const queryClient = useQueryClient()

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [paidTo, setPaidTo] = useState('')          // account/cashier/bank
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [referenceDate, setReferenceDate] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10))

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
    enabled: true,
  })

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
  })

  const pagoMutation = useMutation({
    mutationFn: registerPago,
    onSuccess: () => {
      toast.success('Cobro registrado correctamente')
      queryClient.invalidateQueries({ queryKey: ['aging'] })
      queryClient.invalidateQueries({ queryKey: ['semaforo'] })
      setCustomerId('')
      setCustomerQuery('')
      setPaidAmount(0)
      setPaidTo('')
      setModeOfPayment('')
      setReferenceNo('')
      setReferenceDate('')
      setPostingDate(new Date().toISOString().slice(0, 10))
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al registrar el cobro')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) { toast.error('Selecciona un cliente'); return }
    if (!paidAmount || paidAmount <= 0) { toast.error('Ingresa un monto válido'); return }
    if (!modeOfPayment) { toast.error('Selecciona un método de pago'); return }

    pagoMutation.mutate({
      customer: customerId,
      postingDate,
      paidAmount,
      paidTo: paidTo || modeOfPayment,     // account to receive payment
      modeOfPayment,
      referenceNo: referenceNo || undefined,
      referenceDate: referenceDate || undefined,
    })
  }

  return (
    <div>
      <PageHeader
        title="Registrar Cobro"
        description="Registra un pago recibido de un cliente"
      />

      <div className="page-container" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} style={{ color: 'var(--success-text)' }} aria-hidden="true" />
              Nuevo Cobro
            </span>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── Cliente ── */}
              <div className="ff-wrap">
                <label className="ff-label">
                  Cliente <span className="ff-required">*</span>
                </label>
                <SearchSelect
                  id="customer"
                  value={customerId}
                  onChange={(id, opt) => setCustomerId(id === '' ? '' : (opt?.value ?? id))}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={customersLoading}
                  placeholder="Buscar cliente…"
                  error={!customerId}
                />
              </div>

              {/* ── Fecha ── */}
              <div className="ff-wrap">
                <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                <input
                  type="date"
                  className="ff-input"
                  value={postingDate}
                  onChange={(e) => setPostingDate(e.target.value)}
                  required
                />
              </div>

              {/* ── Monto ── */}
              <div className="ff-wrap">
                <label className="ff-label">Monto (RD$) <span className="ff-required">*</span></label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="ff-input"
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  required
                />
              </div>

              {/* ── Método de pago ── */}
              <div className="ff-wrap">
                <label className="ff-label">Método de Pago <span className="ff-required">*</span></label>
                <select
                  className="ff-select"
                  value={modeOfPayment}
                  onChange={(e) => setModeOfPayment(e.target.value)}
                  required
                >
                  <option value="">Seleccionar método…</option>
                  {metodos?.filter((m) => !m.disabled).map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* ── Cuenta destino (paidTo) ── */}
              <div className="ff-wrap">
                <label className="ff-label">
                  Cuenta / Caja destino
                  <span className="ff-hint" style={{ marginLeft: 6 }}>(opcional)</span>
                </label>
                <input
                  className="ff-input"
                  placeholder="Ej: Caja General, Banreservas…"
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                />
              </div>

              {/* ── Referencia ── */}
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">No. de Referencia</label>
                  <input
                    className="ff-input"
                    placeholder="# cheque, transferencia…"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Fecha de Referencia</label>
                  <input
                    type="date"
                    className="ff-input"
                    value={referenceDate}
                    onChange={(e) => setReferenceDate(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={pagoMutation.isPending}
              >
                {pagoMutation.isPending
                  ? <><span className="spinner spinner-white spinner-sm" /> Registrando…</>
                  : 'Registrar Cobro'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
