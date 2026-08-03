import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, DollarSign, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react'
import { listPendientes, cobrarFactura } from '@/shared/api/caja'
import { getFacturacionConfig, listMetodosPago } from '@/shared/api/config'
import { getTurnoActual } from '@/shared/api/pos'
import { formatDate, formatDOP } from '@/lib/formatters'
import { useDebounce } from '@/lib/useDebounce'
import { PaymentLinesEditor } from '@/components/shared/PaymentLinesEditor'
import { TurnoCajaIndicator } from '@/components/shared/TurnoCajaIndicator'
import {
  EMPTY_PAYMENT_LINES_VALUE,
  buildSubmitPayload,
  sumPayments,
  cashAmount,
  PAYMENT_LINES_TOLERANCE,
  type PaymentLinesValue,
} from '@/lib/paymentLines'
import type { Invoice, CobrarFacturaDto } from '@/shared/api/types'

const PAGE_SIZE = 20

export default function CajaPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['caja-pendientes', { search: debouncedSearch, offset }],
    queryFn: () => listPendientes({ search: debouncedSearch || undefined, offset, limit: PAGE_SIZE }),
  })

  const { data: facturacion } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    staleTime: 5 * 60_000,
  })


   const usaModuloPos = facturacion?.usaModuloPos ?? false
   const flujoCobro = facturacion?.flujoCobro ?? 'directo'
   const metodosActivos = (metodos ?? []).filter((m) => !m.disabled)
   const pendientes = data?.items ?? []
   const totalPages = data?.meta ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

   const { data: turno } = useQuery({
     queryKey: ['turno-actual'],
     queryFn: getTurnoActual,
     enabled: usaModuloPos,
     staleTime: 30_000,
   })

   const turnoBlocked = usaModuloPos && !turno

   // ─── Turn expiration ──────────────────────────────────────
   const [turnoVencido, setTurnoVencido] = useState(false)

   useEffect(() => {
     if (!turno?.periodStartDate || !turno.turnoMaxHoras || turno.turnoMaxHoras <= 0) {
       setTurnoVencido(false)
       return
     }
     const start = new Date(turno.periodStartDate).getTime()
     const elapsed = (Date.now() - start) / (1000 * 60 * 60)
     setTurnoVencido(elapsed >= turno.turnoMaxHoras)
   }, [turno])

   useEffect(() => {
     if (!turno?.periodStartDate || !turno.turnoMaxHoras || turno.turnoMaxHoras <= 0) return
     const interval = setInterval(() => {
       const start = new Date(turno.periodStartDate!).getTime()
       const elapsed = (Date.now() - start) / (1000 * 60 * 60)
       setTurnoVencido(elapsed >= turno.turnoMaxHoras!)
     }, 60_000)
     return () => clearInterval(interval)
   }, [turno])

   const turnoBlockedOrExpired = turnoBlocked || turnoVencido

  // ─── Form state ────────────────────────────────────────────────────

const [directoMop, setDirectoMop] = useState('')
   const [directoAmount, setDirectoAmount] = useState('')

   const [paymentsValue, setPaymentsValue] = useState<PaymentLinesValue>(EMPTY_PAYMENT_LINES_VALUE)
   const [condicionFiscal, setCondicionFiscal] = useState<'CREDITO_FISCAL' | 'CONSUMO'>('CONSUMO')
   const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')

  // ─── Mutation ──────────────────────────────────────────────────────

  const cobrarMutation = useMutation({
    mutationFn: (dto: CobrarFacturaDto) => cobrarFactura(selectedInvoice!.id, dto),
    onSuccess: (res) => {
      if (res.fullyPaid) {
        toast.success(`Factura ${selectedInvoice!.id} saldada`)
      } else {
        toast.success(`Cobro parcial: nuevo saldo ${formatDOP(res.outstandingAmount)}`)
      }
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['caja-pendientes'] })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al procesar el cobro')
    },
  })

  // ─── Modal handlers ────────────────────────────────────────────────

function openModal(invoice: Invoice) {
     setSelectedInvoice(invoice)
     setClienteOcasionalRnc(invoice.clienteOcasionalRnc ?? '')
     if (invoice.esClienteOcasional) {
       setCondicionFiscal('CREDITO_FISCAL')
     } else if (invoice.customer) {
       setCondicionFiscal('CREDITO_FISCAL')
     } else {
       setCondicionFiscal('CONSUMO')
     }
     if (flujoCobro === 'directo') {
       setDirectoMop('')
       setDirectoAmount(String(invoice.outstandingAmount))
     } else {
       setPaymentsValue(EMPTY_PAYMENT_LINES_VALUE)
     }
   }

  function closeModal() {
    setSelectedInvoice(null)
    setDirectoMop('')
    setDirectoAmount('')
  }

function validateAndSubmit() {
     if (!selectedInvoice) return
     if (turnoVencido) { toast.error('Tu turno ha expirado. Cierra el turno actual y abre uno nuevo.'); return }
     const outstanding = selectedInvoice.outstandingAmount

     if (flujoCobro === 'directo') {
       if (!directoMop) { toast.error('Selecciona un método de pago'); return }
       const amount = Number(directoAmount)
       if (!amount || amount <= 0) { toast.error('El monto debe ser mayor a 0'); return }
       if (amount > outstanding) { toast.error(`El monto no puede exceder ${formatDOP(outstanding)}`); return }
       const dto: CobrarFacturaDto = {
         payments: [{ modeOfPayment: directoMop, amount }],
         condicionFiscal,
         ...(selectedInvoice.esClienteOcasional && condicionFiscal === 'CREDITO_FISCAL' ? { rnc: clienteOcasionalRnc || undefined } : {}),
       }
       cobrarMutation.mutate(dto)
       return
     }

     // caja flow
     const validLines = paymentsValue.payments.filter((p) => p.modeOfPayment && Number(p.amount) > 0)
     if (validLines.length === 0) { toast.error('Agrega al menos una línea de pago válida'); return }
     const total = sumPayments(paymentsValue.payments)
     if (total > outstanding + PAYMENT_LINES_TOLERANCE) {
       toast.error(`La suma de pagos (${formatDOP(total)}) excede el saldo pendiente (${formatDOP(outstanding)})`)
       return
     }

     const cash = cashAmount(paymentsValue.payments, metodosActivos)
     if (paymentsValue.vueltoEnabled) {
       const tenderedCash = Number(paymentsValue.tenderedCash) || 0
       if (tenderedCash <= 0) { toast.error('Indica el efectivo entregado por el cliente'); return }
       if (cash <= 0) { toast.error('No hay pagos en efectivo para registrar vuelto'); return }
       if (tenderedCash < cash - PAYMENT_LINES_TOLERANCE) {
         toast.error('El efectivo entregado (RD$' + String(tenderedCash.toFixed(2)) + ') es menor al total de pagos en efectivo (RD$' + String(cash.toFixed(2)) + ')'); return
       }
     }

     const payload = buildSubmitPayload(paymentsValue)
     cobrarMutation.mutate({
       ...payload,
       condicionFiscal,
       ...(selectedInvoice.esClienteOcasional && condicionFiscal === 'CREDITO_FISCAL' ? { rnc: clienteOcasionalRnc || undefined } : {}),
     })
   }

  const canSubmitCaja =
    flujoCobro !== 'caja' ||
    (() => {
      if (!paymentsValue.payments.some((p) => p.modeOfPayment && Number(p.amount) > 0)) return false
      const total = sumPayments(paymentsValue.payments)
      if (total > selectedInvoice?.outstandingAmount! + PAYMENT_LINES_TOLERANCE) return false
      if (paymentsValue.vueltoEnabled) {
        const cash = cashAmount(paymentsValue.payments, metodosActivos)
        const tenderedCash = Number(paymentsValue.tenderedCash) || 0
        if (tenderedCash <= 0 || cash <= 0) return false
        if (tenderedCash < cash - PAYMENT_LINES_TOLERANCE) return false
      }
      return true
    })()

  function getRemaining(outstanding: number): string {
    const total = sumPayments(paymentsValue.payments)
    const remaining = outstanding - total
    if (Math.abs(remaining) < PAYMENT_LINES_TOLERANCE) return 'No quedará saldo pendiente'
    if (remaining > 0) return `Quedará un saldo pendiente de ${formatDOP(remaining)}`
    return ''
  }

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  return (
    <div className="page-container">
       {/* ── Header ───────────────────────────────────────────────────── */}
       <div className="page-header">
         <div>
           <h1 className="page-title">Cobros Pendientes</h1>
           <p className="page-sub">
             {data?.meta ? `${data.meta.total} factura(s) pendiente(s) de cobro` : 'Cola de cobros pendientes'}
           </p>
         </div>
         <TurnoCajaIndicator />
       </div>

       {/* ── Turno gate (POS habilitado sin turno abierto o turno vencido) ──── */}
       {turnoBlockedOrExpired ? (
         <div className="empty-state" style={{ padding: '48px 24px' }}>
           <Clock size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
           <div className="empty-title">{turnoVencido ? 'Turno vencido' : 'Caja bloqueada'}</div>
           <p className="empty-sub" style={{ maxWidth: 400, textAlign: 'center' }}>
             {turnoVencido
               ? 'Tu turno de caja ha excedido el tiempo máximo permitido. Debes cerrarlo y abrir uno nuevo.'
               : 'El módulo POS/Caja está habilitado pero no tienes un turno de caja abierto. Abre un turno para acceder a los cobros pendientes.'}
           </p>
         </div>
       ) : (
        <>
      {/* ── Filtros ──────────────────────────────────────────────────── */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar factura o cliente…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      </div>

      {/* ── Tabla de pendientes ──────────────────────────────────────── */}
      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Cliente</th>
                <th>NCF</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Saldo Pendiente</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : pendientes.length === 0
                  ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty-state">
                            <p className="empty-title">Sin pendientes de cobro</p>
                            <p className="empty-sub">No hay facturas con saldo pendiente en este momento.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : pendientes.map((inv) => (
                      <tr key={inv.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{inv.id}</td>
                        <td>{inv.customerName}</td>
                        <td className="td-muted">{inv.ncf || '—'}</td>
                        <td className="td-muted">{formatDate(inv.postingDate)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                          {formatDOP(inv.grandTotal)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--color-error)' }}>
                          {formatDOP(inv.outstandingAmount)}
                        </td>
                        <td>
                          <button className="btn btn-primary btn-size-xs" onClick={() => openModal(inv)}>
                            <DollarSign size={13} /> Cobrar
                          </button>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {data?.meta && data.meta.total > PAGE_SIZE && (
          <div className="pagination">
            <span className="pagination-info">
              Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
            </span>
            <div className="pagination-controls">
              <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

       {/* ── Modal de cobro ────────────────────────────────────────────── */}
       {selectedInvoice && (
         <div className="modal-overlay" onClick={closeModal}>
           <div className="modal-box" style={{ maxWidth: flujoCobro === 'caja' ? 640 : 480 }} onClick={(e) => e.stopPropagation()}>
             <div className="modal-head">
               <h2 className="modal-title">Cobrar {selectedInvoice.id}</h2>
               <button className="modal-close" type="button" onClick={closeModal}><X size={16} /></button>
             </div>

             <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
               {/* ── Resumen de la factura ──────────────────────────── */}
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
                 <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
                 <span style={{ fontWeight: 500 }}>{selectedInvoice.customerName}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>NCF:</span>
                 <span>{selectedInvoice.ncf || '—'}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>Total factura:</span>
                 <span>{formatDOP(selectedInvoice.grandTotal)}</span>
                 <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>Saldo pendiente:</span>
                 <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{formatDOP(selectedInvoice.outstandingAmount)}</span>
               </div>

               <div className="divider" />

               {flujoCobro === 'directo' ? (
                 /* ── Flujo directo ─────────────────────────────────── */
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                   <div className="ff-wrap">
                     <label className="ff-label ff-required">Método de pago</label>
                     <select
                       className="ff-input"
                       value={directoMop}
                       onChange={(e) => setDirectoMop(e.target.value)}
                     >
                       <option value="">Seleccionar…</option>
                       {metodosActivos.map((m) => (
                         <option key={m.name} value={m.name}>{m.name}</option>
                       ))}
                     </select>
                   </div>
                   <div className="ff-wrap">
                     <label className="ff-label ff-required">Monto a cobrar</label>
                     <input
                       className="ff-input"
                       type="number"
                       min="0.01"
                       step="0.01"
                       value={directoAmount}
                       onChange={(e) => setDirectoAmount(e.target.value)}
                     />
                     {Number(directoAmount) > 0 && Number(directoAmount) < selectedInvoice.outstandingAmount && (
                       <p className="ff-hint" style={{ marginTop: 4 }}>
                         Cobro parcial — quedará un saldo pendiente de {formatDOP(selectedInvoice.outstandingAmount - Number(directoAmount))}
                       </p>
                     )}
                   </div>
                 </div>
               ) : (
                 /* ── Flujo caja ────────────────────────────────────── */
                 <>
                   <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                     El monto de cada línea de pago es lo que se aplica a la factura.
                     Si el cliente entrega más efectivo del que se aplica, registra el excedente en <strong>"Efectivo entregado"</strong> más abajo.
                     La suma no puede exceder <strong>{formatDOP(selectedInvoice.outstandingAmount)}</strong> (saldo pendiente).
                   </p>
                   <PaymentLinesEditor
                     amountDue={selectedInvoice.outstandingAmount}
                     value={paymentsValue}
                     onChange={setPaymentsValue}
                   />
                   {sumPayments(paymentsValue.payments) > 0 && (
                     <p style={{ fontSize: 13, margin: 0, color: 'var(--text-secondary)' }}>
                       {getRemaining(selectedInvoice.outstandingAmount)}
                     </p>
                   )}
                 </>
               )}
             </div>

             <div className="modal-foot">
               <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
               <button
                 className="btn btn-primary"
                 onClick={validateAndSubmit}
                 disabled={cobrarMutation.isPending || (flujoCobro === 'caja' && !canSubmitCaja)}
               >
                 {cobrarMutation.isPending ? 'Procesando…' : `Cobrar ${formatDOP(
                   flujoCobro === 'directo'
                     ? Number(directoAmount) || 0
                     : sumPayments(paymentsValue.payments)
                 )}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )}
  </div>
)
}
