import { useState, useCallback, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { esClienteEmisorNoEncontrado, ECF_ADMIN_ROUTE } from '@/lib/ecfErrors'
import { Search, DollarSign, ChevronLeft, ChevronRight, X, Clock, AlertTriangle } from 'lucide-react'
import { listPendientes, cobrarFactura } from '@/shared/api/caja'
import { getFacturacionConfig, listMetodosPago } from '@/shared/api/config'
import { getTurnoActual } from '@/shared/api/pos'
import { downloadInvoicePdf } from '@/shared/api/invoices'
import { formatDate, formatMoney } from '@/lib/formatters'
import { useDebounce } from '@/lib/useDebounce'
import { PaymentLinesEditor } from '@/components/shared/PaymentLinesEditor'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { TurnoCajaIndicator } from '@/components/shared/TurnoCajaIndicator'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { usePosTicketPrinter } from '@/shared/hooks/usePosTicketPrinter'
import { useMetodoPagoCurrencies } from '@/shared/hooks/useMetodoPagoCurrencies'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import {
  EMPTY_PAYMENT_LINES_VALUE,
  buildSubmitPayload,
  sumPayments,
  cashAmount,
  emptyPaymentLine,
  resolveDefaultModeOfPago,
  friendlyPaymentError,
  PAYMENT_LINES_TOLERANCE,
  type PaymentLinesValue,
} from '@/lib/paymentLines'
import type { Invoice, CobrarFacturaDto } from '@/shared/api/types'

const PAGE_SIZE = 20

export default function CajaPage() {
  const navigate = useNavigate()
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
   const monedaBase = facturacion?.monedaBase ?? 'DOP'
   const { tryPrintPosTicket, printTargetNode } = usePosTicketPrinter()
   const metodosActivos = (metodos ?? []).filter((m) => !m.disabled)
   // Caja/POS nunca convierte moneda (docs/tasks/70_caja_pos_sin_soporte_multimoneda.md) — el
   // método de pago debe operar en la MISMA moneda de la factura que se está cobrando.
   const metodoCurrencies = useMetodoPagoCurrencies(metodosActivos, monedaBase)
   const selectedInvoiceCurrency = selectedInvoice?.currency ?? monedaBase
   const metodosCompatibles = metodosActivos.filter((m) => (metodoCurrencies[m.name] ?? monedaBase) === selectedInvoiceCurrency)
   const pendientes = data?.items ?? []
   const [directoMopSearch, setDirectoMopSearch] = useState('')
   const directoMopOptions: SearchSelectOption[] = metodosCompatibles
     .filter((m) => !directoMopSearch || m.name.toLowerCase().includes(directoMopSearch.toLowerCase()))
     .map((m) => ({ value: m.name, label: m.name }))
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
    onSuccess: async (res) => {
      const invoiceId = selectedInvoice!.id
      if (res.fullyPaid) {
        toast.success(`Factura ${invoiceId} saldada`)
      } else {
        toast.success(`Cobro parcial: nuevo saldo ${formatMoney(res.outstandingAmount, selectedInvoiceCurrency)}`)
      }
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['caja-pendientes'] })
      // El cierre real de una venta de consumo ocurre aquí, no al someter la factura — someter
      // solo la reserva y la manda a Caja sin completar el pago (§5.2 del doc de plantillas).
      // El gate es `usaModuloPos` (toda factura cobrada en Caja es una venta POS) — NO
      // `formatoImpresionDefault === 'pos'`, que es la preferencia de formato de página
      // genérica del tenant (independiente de si usa el módulo POS) y no debe condicionar si
      // se imprime el ticket aquí.
      if (res.fullyPaid && usaModuloPos) {
        // El modal de cobro ya se cerró — sin este toast, la resolución de render-data + el
        // envío a QZ Tray/impresión ocurren en silencio y el usuario no tiene forma de saber
        // que algo sigue en curso mientras espera el ticket.
        const toastId = toast.loading('Preparando ticket para imprimir…')
        const printed = await tryPrintPosTicket(invoiceId)
        if (printed) {
          toast.success('Ticket enviado a imprimir', { id: toastId })
        } else {
          toast.error('No se pudo imprimir el ticket — se descargará el PDF en su lugar', { id: toastId })
          downloadInvoicePdf(invoiceId, `factura-${invoiceId}.pdf`, 'pos')
        }
      }
    },
    onError: (err: { message?: string }) => {
      // El mensaje del backend ya es específico y accionable para este código (doc 70) — no hace
      // falta un texto genérico distinto, solo asegurarse de mostrarlo tal cual en vez de caer al
      // fallback genérico de otros errores.
      if (isApiErrorCode(err, ERROR_CODES.POS_PAYMENT_CURRENCY_MISMATCH)) {
        toast.error(err.message, { duration: 8000 })
        return
      }
      const msg = friendlyPaymentError(err?.message)
      if (esClienteEmisorNoEncontrado(msg)) {
        toast.error(msg, {
          duration: 10000,
          action: { label: 'Ir a administración de e-CF', onClick: () => navigate(ECF_ADMIN_ROUTE) },
        })
        return
      }
      toast.error(msg)
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
     const invoiceCurrency = invoice.currency ?? monedaBase
     if (flujoCobro === 'directo') {
       setDirectoMop(resolveDefaultModeOfPago(facturacion, invoiceCurrency))
       setDirectoAmount(String(invoice.outstandingAmount))
     } else {
       // El método de caja por defecto del turno solo se prellena si opera en la misma moneda
       // que esta factura — si no (ej. turno en DOP, factura en USD), se cae al default
       // configurado en Facturacion Config para esa moneda (modoPagoCajaUsd/modoPagoCajaEur).
       const cashMethod = turno?.modeOfPayment ?? turno?.modoPagoCaja ?? ''
       const cashMethodCurrency = metodoCurrencies[cashMethod] ?? monedaBase
       setPaymentsValue({
         ...EMPTY_PAYMENT_LINES_VALUE,
         payments: [{
           ...emptyPaymentLine(),
           modeOfPayment: cashMethodCurrency === invoiceCurrency ? cashMethod : resolveDefaultModeOfPago(facturacion, invoiceCurrency),
           amount: String(invoice.outstandingAmount),
         }],
       })
     }
   }

  function closeModal() {
    setSelectedInvoice(null)
    setDirectoMop('')
    setDirectoAmount('')
  }

  const cobroIsDirty = useDirtyCheck(
    { directoMop, directoAmount, paymentsValue, condicionFiscal, clienteOcasionalRnc },
    !!selectedInvoice,
  )
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(cobroIsDirty, closeModal)

function validateAndSubmit() {
     if (!selectedInvoice) return
     if (turnoVencido) { toast.error('Tu turno ha expirado. Cierra el turno actual y abre uno nuevo.'); return }
     const outstanding = selectedInvoice.outstandingAmount

     if (flujoCobro === 'directo') {
       if (!directoMop) { toast.error('Selecciona un método de pago'); return }
       const amount = Number(directoAmount)
       if (!amount || amount <= 0) { toast.error('El monto debe ser mayor a 0'); return }
       if (amount > outstanding) { toast.error(`El monto no puede exceder ${formatMoney(outstanding, selectedInvoiceCurrency)}`); return }
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
       toast.error(`La suma de pagos (${formatMoney(total, selectedInvoiceCurrency)}) excede el saldo pendiente (${formatMoney(outstanding, selectedInvoiceCurrency)})`)
       return
     }

     const cash = cashAmount(paymentsValue.payments, metodosActivos)
     if (paymentsValue.vueltoEnabled) {
       const tenderedCash = Number(paymentsValue.tenderedCash) || 0
       if (tenderedCash <= 0) { toast.error('Indica el efectivo entregado por el cliente'); return }
       if (cash <= 0) { toast.error('No hay pagos en efectivo para registrar vuelto'); return }
       if (tenderedCash < cash - PAYMENT_LINES_TOLERANCE) {
         toast.error(`El efectivo entregado (${formatMoney(tenderedCash, selectedInvoiceCurrency)}) es menor al total de pagos en efectivo (${formatMoney(cash, selectedInvoiceCurrency)})`); return
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
    if (remaining > 0) return `Quedará un saldo pendiente de ${formatMoney(remaining, selectedInvoiceCurrency)}`
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
       </div>
         <TurnoCajaIndicator />

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
                          {formatMoney(inv.grandTotal, inv.currency ?? monedaBase)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--color-error)' }}>
                          {formatMoney(inv.outstandingAmount, inv.currency ?? monedaBase)}
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
         <div className="modal-overlay" onClick={requestClose}>
           <div className="modal-box" style={{ maxWidth: flujoCobro === 'caja' ? 640 : 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
             <div className="modal-head">
               <h2 className="modal-title">Cobrar {selectedInvoice.id}</h2>
               <button className="modal-close" type="button" onClick={requestClose}><X size={16} /></button>
             </div>

             <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
               {/* ── Resumen de la factura ──────────────────────────── */}
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
                 <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
                 <span style={{ fontWeight: 500 }}>{selectedInvoice.customerName}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>NCF:</span>
                 <span>{selectedInvoice.ncf || '—'}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>Total factura:</span>
                 <span>{formatMoney(selectedInvoice.grandTotal, selectedInvoiceCurrency)}</span>
                 <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>Saldo pendiente:</span>
                 <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{formatMoney(selectedInvoice.outstandingAmount, selectedInvoiceCurrency)}</span>
               </div>
               {!!selectedInvoice.roundingAdjustment && (
                 <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
                   El saldo pendiente incluye un ajuste por redondeo de {selectedInvoice.roundingAdjustment > 0 ? '+' : ''}{formatMoney(selectedInvoice.roundingAdjustment, selectedInvoiceCurrency)}.
                 </p>
               )}

               <div className="divider" />

               {flujoCobro === 'directo' ? (
                 /* ── Flujo directo ─────────────────────────────────── */
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                   {metodosCompatibles.length === 0 && (
                     <div className="inline-alert inline-alert-warn">
                       <AlertTriangle size={16} />
                       <span>
                         No hay ningún método de pago configurado en {selectedInvoiceCurrency} — Caja/POS
                         nunca convierte moneda, así que un método solo sirve acá si la cuenta bancaria o
                         contable que tiene asociada está denominada en {selectedInvoiceCurrency}.{' '}
                         <Link to="/config/metodos-pago" style={{ fontWeight: 600, textDecoration: 'underline' }}>
                           Configurar en Métodos de Pago
                         </Link>
                       </span>
                     </div>
                   )}
                   <div className="ff-wrap">
                     <label className="ff-label ff-required">Método de pago</label>
                     <SearchSelect
                       value={directoMop}
                       onChange={setDirectoMop}
                       options={directoMopOptions}
                       onSearch={setDirectoMopSearch}
                       selectedLabel={directoMop}
                       placeholder="Seleccionar…"
                     />
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
                         Cobro parcial — quedará un saldo pendiente de {formatMoney(selectedInvoice.outstandingAmount - Number(directoAmount), selectedInvoiceCurrency)}
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
                     La suma no puede exceder <strong>{formatMoney(selectedInvoice.outstandingAmount, selectedInvoiceCurrency)}</strong> (saldo pendiente).
                   </p>
                   <PaymentLinesEditor
                     amountDue={selectedInvoice.outstandingAmount}
                     value={paymentsValue}
                     onChange={setPaymentsValue}
                     currency={selectedInvoiceCurrency}
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
               <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
               <button
                 className="btn btn-primary"
                 onClick={validateAndSubmit}
                 disabled={cobrarMutation.isPending || (flujoCobro === 'caja' && !canSubmitCaja)}
               >
                 {cobrarMutation.isPending ? 'Procesando…' : `Cobrar ${formatMoney(
                   flujoCobro === 'directo'
                     ? Number(directoAmount) || 0
                     : sumPayments(paymentsValue.payments),
                   selectedInvoiceCurrency,
                 )}`}
                </button>
              </div>
            </div>
          </div>
        )}

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
      </>
    )}
    {printTargetNode}
  </div>
)
}
