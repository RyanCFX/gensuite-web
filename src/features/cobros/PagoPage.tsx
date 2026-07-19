import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { registerPago } from '@/shared/api/cobros'
import { listInvoices } from '@/shared/api/invoices'
import { listPedidos } from '@/shared/api/pedidos'
import { listCustomers } from '@/shared/api/customers'
import { listMetodosPago, getLayawayConfig } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { CheckCircle2, AlertTriangle, Wallet, PackageOpen } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { formatDOP } from '@/lib/formatters'

interface ReferenciaRow {
  invoiceId: string
  grandTotal: number
  outstandingAmount: number
  postingDate: string
  checked: boolean
  allocatedAmount: number
}

interface PedidoReferenciaRow {
  pedidoId: string
  grandTotal: number
  transactionDate: string
  checked: boolean
  allocatedAmount: number
  minRequired: number
}

export default function PagoPage() {
  const queryClient = useQueryClient()

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [referenceDate, setReferenceDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().slice(0, 10))
  const [referencias, setReferencias] = useState<ReferenciaRow[]>([])
  const [advancePayment, setAdvancePayment] = useState(false)
  const [pedidoReferencias, setPedidoReferencias] = useState<PedidoReferenciaRow[]>([])

  // ── Customer search ──────────────────────────────────────────────────────

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

  // ── Pending invoices for selected customer ───────────────────────────────

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-pending', customerId],
    queryFn: () =>
      listInvoices({ customer: customerId, status: 'submitted', paymentStatus: 'unpaid', limit: 50 }),
    enabled: !!customerId && !advancePayment,
    staleTime: 30_000,
  })

  // Sync invoice rows when customer or invoice data changes
  useEffect(() => {
    if (!customerId || advancePayment) { setReferencias([]); return }
    const invoices = invoicesData?.items ?? []
    setReferencias(
      invoices
        .filter((inv) => inv.outstandingAmount > 0)
        .map((inv) => ({
          invoiceId: inv.id,
          grandTotal: inv.grandTotal,
          outstandingAmount: inv.outstandingAmount,
          postingDate: inv.postingDate,
          checked: false,
          allocatedAmount: inv.outstandingAmount,
        })),
    )
  }, [customerId, invoicesData, advancePayment])

  // ── Apartados (layaway) pendientes de anticipo ───────────────────────────

  const { data: layawayConfig } = useQuery({
    queryKey: ['layaway-config'],
    queryFn: getLayawayConfig,
    staleTime: 5 * 60_000,
  })

  const { data: pedidosData, isLoading: pedidosLoading } = useQuery({
    queryKey: ['pedidos-layaway-pending', customerId],
    queryFn: () => listPedidos({ customer: customerId, isLayaway: true, status: 'submitted', limit: 50 }),
    enabled: !!customerId && !advancePayment,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!customerId || advancePayment) { setPedidoReferencias([]); return }
    const pedidos = (pedidosData?.items ?? []).filter((p) => !p.facturaId)
    const pct = layawayConfig?.porcentajeMinimoAnticipo ?? 0
    setPedidoReferencias(
      pedidos.map((p) => {
        const grandTotal = p.items.reduce((s, i) => s + i.amount, 0)
        return {
          pedidoId: p.id,
          grandTotal,
          transactionDate: p.transactionDate,
          checked: false,
          allocatedAmount: Math.round(grandTotal * pct) / 100,
          minRequired: Math.round(grandTotal * pct) / 100,
        }
      }),
    )
  }, [customerId, pedidosData, advancePayment, layawayConfig])

  function togglePedidoReferencia(pedidoId: string) {
    setPedidoReferencias((prev) =>
      prev.map((r) => (r.pedidoId === pedidoId ? { ...r, checked: !r.checked } : r)),
    )
  }

  function setPedidoAllocated(pedidoId: string, value: number) {
    setPedidoReferencias((prev) =>
      prev.map((r) => (r.pedidoId === pedidoId ? { ...r, allocatedAmount: value } : r)),
    )
  }

  const checkedPedidoRefs = pedidoReferencias.filter((r) => r.checked)

  // ── Métodos de pago ──────────────────────────────────────────────────────

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
  })

  // ── Helpers ──────────────────────────────────────────────────────────────

  function toggleReferencia(invoiceId: string) {
    setReferencias((prev) =>
      prev.map((r) => (r.invoiceId === invoiceId ? { ...r, checked: !r.checked } : r)),
    )
  }

  function setAllocated(invoiceId: string, value: number) {
    setReferencias((prev) =>
      prev.map((r) => (r.invoiceId === invoiceId ? { ...r, allocatedAmount: value } : r)),
    )
  }

  const checkedRefs = referencias.filter((r) => r.checked)
  const totalAllocated = checkedRefs.reduce((s, r) => s + r.allocatedAmount, 0)
    + checkedPedidoRefs.reduce((s, r) => s + r.allocatedAmount, 0)
  const diff = Math.round((paidAmount - totalAllocated) * 100) / 100

  // ── Mutation ─────────────────────────────────────────────────────────────

  const pagoMutation = useMutation({
    mutationFn: registerPago,
    onSuccess: () => {
      toast.success('Cobro registrado correctamente')
      queryClient.invalidateQueries({ queryKey: ['aging'] })
      queryClient.invalidateQueries({ queryKey: ['semaforo'] })
      queryClient.invalidateQueries({ queryKey: ['invoices-pending', customerId] })
      queryClient.invalidateQueries({ queryKey: ['pedidos-layaway-pending', customerId] })
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      setCustomerId('')
      setCustomerQuery('')
      setPaidAmount(0)
      setModeOfPayment('')
      setReferenceNo('')
      setReferenceDate('')
      setRemarks('')
      setPostingDate(new Date().toISOString().slice(0, 10))
      setReferencias([])
      setPedidoReferencias([])
      setAdvancePayment(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al registrar el cobro')
    },
  })

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) { toast.error('Selecciona un cliente'); return }
    if (!paidAmount || paidAmount <= 0) { toast.error('Ingresa un monto válido'); return }
    if (!modeOfPayment) { toast.error('Selecciona un método de pago'); return }

    for (const ref of checkedPedidoRefs) {
      if (ref.allocatedAmount < ref.minRequired) {
        toast.error(`El anticipo de ${ref.pedidoId} debe ser al menos ${formatDOP(ref.minRequired)} (${layawayConfig?.porcentajeMinimoAnticipo ?? 0}% del total)`)
        return
      }
    }

    const allReferencias = [
      ...checkedRefs.map((r) => ({ invoiceId: r.invoiceId, allocatedAmount: r.allocatedAmount })),
      ...checkedPedidoRefs.map((r) => ({
        invoiceId: r.pedidoId,
        allocatedAmount: r.allocatedAmount,
        referenceDoctype: 'Sales Order' as const,
      })),
    ]

    pagoMutation.mutate({
      customer: customerId,
      postingDate,
      paidAmount,
      modeOfPayment,
      referenceNo: referenceNo || undefined,
      referenceDate: referenceDate || undefined,
      remarks: remarks || undefined,
      referencias: allReferencias.length > 0 ? allReferencias : undefined,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <PageHeader
        title="Registrar Cobro"
        description="Registra un pago recibido de un cliente"
      />

      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, alignItems: 'start' }}>

        {/* ════════════════ COLUMNA IZQUIERDA — facturas / apartados ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Facturas a Aplicar ───────────────────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Facturas Pendientes</span>
              {checkedRefs.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {checkedRefs.length} seleccionada{checkedRefs.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {advancePayment ? (
              <div className="card-body" style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Cobro anticipado — no se aplicará a ninguna factura.
              </div>
            ) : !customerId ? (
              <div className="card-body" style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Selecciona un cliente para ver sus facturas pendientes
              </div>
            ) : invoicesLoading ? (
              <div className="card-body" style={{ textAlign: 'center', padding: '24px 0' }}>
                <span className="spinner spinner-brand spinner-sm" />
              </div>
            ) : referencias.length === 0 ? (
              <div className="card-body" style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Sin facturas pendientes para este cliente
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Factura</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Pendiente</th>
                        <th style={{ textAlign: 'right', width: 140 }}>Monto a aplicar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referencias.map((ref) => (
                        <tr key={ref.invoiceId} style={{ opacity: ref.checked ? 1 : 0.6 }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={ref.checked}
                              onChange={() => toggleReferencia(ref.invoiceId)}
                              style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                            />
                          </td>
                          <td>
                            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                              {ref.invoiceId}
                            </span>
                            <br />
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ref.postingDate}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>{formatDOP(ref.grandTotal)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: 'var(--error-text)' }}>
                            {formatDOP(ref.outstandingAmount)}
                          </td>
                          <td>
                            <input
                              className="items-input"
                              type="number"
                              min="0.01"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={ref.allocatedAmount || ''}
                              disabled={!ref.checked}
                              onChange={(e) => setAllocated(ref.invoiceId, parseFloat(e.target.value) || 0)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Resumen de asignación */}
                {checkedRefs.length > 0 && (
                  <div style={{
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border-default)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    alignItems: 'flex-end',
                  }}>
                    <div style={{ display: 'flex', gap: 32, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Total asignado</span>
                      <strong>{formatDOP(totalAllocated)}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 32, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Monto del cobro</span>
                      <strong>{formatDOP(paidAmount)}</strong>
                    </div>
                    {diff !== 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: diff > 0 ? 'var(--warning-text, #b45309)' : 'var(--error-text)',
                        marginTop: 2,
                      }}>
                        <AlertTriangle size={13} />
                        {diff > 0
                          ? `Quedan ${formatDOP(diff)} sin asignar`
                          : `Asignación excede el cobro en ${formatDOP(Math.abs(diff))}`}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Apartados — Anticipo Pendiente ───────────────────────────── */}
          {!advancePayment && customerId && (pedidosLoading || pedidoReferencias.length > 0) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PackageOpen size={16} /> Apartados — Anticipo Pendiente
                </span>
                {checkedPedidoRefs.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {checkedPedidoRefs.length} seleccionado{checkedPedidoRefs.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {pedidosLoading ? (
                <div className="card-body" style={{ textAlign: 'center', padding: '24px 0' }}>
                  <span className="spinner spinner-brand spinner-sm" />
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Pedido</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Mínimo requerido</th>
                        <th style={{ textAlign: 'right', width: 140 }}>Monto a aplicar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidoReferencias.map((ref) => (
                        <tr key={ref.pedidoId} style={{ opacity: ref.checked ? 1 : 0.6 }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={ref.checked}
                              onChange={() => togglePedidoReferencia(ref.pedidoId)}
                              style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                            />
                          </td>
                          <td>
                            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                              {ref.pedidoId}
                            </span>
                            <br />
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ref.transactionDate}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>{formatDOP(ref.grandTotal)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>{formatDOP(ref.minRequired)}</td>
                          <td>
                            <input
                              className={`items-input${ref.checked && ref.allocatedAmount < ref.minRequired ? ' items-input-error' : ''}`}
                              type="number"
                              min="0.01"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={ref.allocatedAmount || ''}
                              disabled={!ref.checked}
                              onChange={(e) => setPedidoAllocated(ref.pedidoId, parseFloat(e.target.value) || 0)}
                            />
                            {ref.checked && ref.allocatedAmount < ref.minRequired && (
                              <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                Mínimo {formatDOP(ref.minRequired)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ════════════════ COLUMNA DERECHA — información del pago ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} style={{ color: 'var(--success-text)' }} aria-hidden="true" />
                Información del Pago
              </span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Cliente */}
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

              {/* Cobro anticipado / sin aplicar a factura */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={advancePayment}
                  onChange={(e) => setAdvancePayment(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wallet size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  Cobro anticipado — no aplicar a ninguna factura (queda como saldo a favor del cliente)
                </span>
              </label>

              {/* Fecha */}
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

              {/* Monto */}
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

              {/* Método de pago */}
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

              {/* Referencia */}
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

              {/* Notas */}
              <div className="ff-wrap">
                <label className="ff-label">Notas</label>
                <textarea
                  className="ff-textarea"
                  rows={2}
                  placeholder="Observaciones opcionales…"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

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
        </div>

      </form>
    </div>
  )
}
