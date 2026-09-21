import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, DollarSign, Trash2, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { listPorCobrar, completarCobro, descartarFactura } from '@/shared/api/caja'
import { getFacturacionConfig, listMetodosPago } from '@/shared/api/config'
import { getCustomer } from '@/shared/api/customers'
import { getTurnoActual } from '@/shared/api/pos'
import { downloadInvoicePdf } from '@/shared/api/invoices'
import { formatDate, formatMoney } from '@/lib/formatters'
import { useDebounce } from '@/lib/useDebounce'
import { PaymentLinesEditor } from '@/components/shared/PaymentLinesEditor'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { TurnoCajaIndicator } from '@/components/shared/TurnoCajaIndicator'
import { ConfirmModal } from '@/shared/ui/Modal'
import { Drawer } from '@/shared/ui/Drawer'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { usePosTicketPrinter } from '@/shared/hooks/usePosTicketPrinter'
import { RecargarButton } from '@/components/shared/RecargarButton'
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
import type { CobrarFacturaDto, PendienteCobroItem } from '@/shared/api/types'

const PAGE_SIZE = 20

/**
 * Importe que realmente se le cobra al paciente/cliente. El backend lo manda resuelto en
 * `montoACobrar`; el fallback a `roundedTotal ?? grandTotal` cubre respuestas sin el campo
 * (tenant general o backend viejo), donde no hay cobertura que descontar.
 */
function montoACobrarDe(inv: PendienteCobroItem): number {
  return inv.montoACobrar ?? inv.roundedTotal ?? inv.grandTotal
}

export default function PorCobrarPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [selectedInvoice, setSelectedInvoice] = useState<PendienteCobroItem | null>(null)
  const [confirmDescartar, setConfirmDescartar] = useState<PendienteCobroItem | null>(null)

  // Monto real a cobrar — usar en vez de grandTotal para prellenar, validar y someter el cobro.
  // Con cobertura ARS el backend ya antepone la fila de pago "Cobertura ARS": el cajero cobra
  // SOLO `montoACobrar` (= roundedTotal − montoCobertura) y nunca manda esa fila
  // (docs/PROMPT_FARMACIA_V2_FRONTEND.md §4.1/§4.3).
  const selectedRoundedTotal = selectedInvoice ? montoACobrarDe(selectedInvoice) : 0
  const selectedRoundingAdjustment = selectedInvoice?.roundingAdjustment ?? 0
  const selectedCobertura = selectedInvoice?.aseguradora?.montoCobertura ?? 0

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['caja-por-cobrar', { search: debouncedSearch, offset }],
    queryFn: () => listPorCobrar({ search: debouncedSearch || undefined, offset, limit: PAGE_SIZE }),
  })

  const { data: facturacion, isLoading: facturacionLoading } = useQuery({
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
  // método de pago debe operar en la MISMA moneda de la factura (nunca la de "Cobertura ARS",
  // que el propio backend siempre resuelve en DOP sin importar la moneda de la factura).
  const metodoCurrencies = useMetodoPagoCurrencies(metodosActivos, monedaBase)
  const selectedInvoiceCurrency = selectedInvoice?.currency ?? monedaBase
  const metodosCompatibles = metodosActivos.filter((m) => (metodoCurrencies[m.name] ?? monedaBase) === selectedInvoiceCurrency)
  const [directoMopSearch, setDirectoMopSearch] = useState('')
  const directoMopOptions: SearchSelectOption[] = metodosCompatibles
    .filter((m) => !directoMopSearch || m.name.toLowerCase().includes(directoMopSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))

  const { data: turno, isLoading: turnoLoading } = useQuery({
    queryKey: ['turno-actual'],
    queryFn: getTurnoActual,
    enabled: usaModuloPos,
    staleTime: 30_000,
  })
   const pendientes = data?.items ?? []
   const totalPages = data?.meta ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

   // Mientras facturacion-config o turno-actual siguen cargando, no sabemos todavía si el
   // módulo POS está activo ni si hay un turno abierto — no mostrar "Caja bloqueada" hasta
   // que ambos hayan resuelto, para no parpadear ese estado en cada carga/refetch.
   const turnoBlocked = !facturacionLoading && !turnoLoading && usaModuloPos && !turno

   // ─── Turn expiration ──────────────────────────────────────
   const [turnoVencido, setTurnoVencido] = useState(false)
   const [turnoWarning, setTurnoWarning] = useState(false)

   useEffect(() => {
     if (!turno?.periodStartDate || !turno.turnoMaxHoras || turno.turnoMaxHoras <= 0) {
       setTurnoVencido(false)
       setTurnoWarning(false)
       return
     }
     const start = new Date(turno.periodStartDate).getTime()
     const elapsed = (Date.now() - start) / (1000 * 60 * 60)
     setTurnoVencido(elapsed >= turno.turnoMaxHoras)
     setTurnoWarning(elapsed >= turno.turnoMaxHoras - 0.5 && elapsed < turno.turnoMaxHoras)
   }, [turno])

   useEffect(() => {
     if (!turno?.periodStartDate || !turno.turnoMaxHoras || turno.turnoMaxHoras <= 0) return
     const interval = setInterval(() => {
       const start = new Date(turno.periodStartDate!).getTime()
       const elapsed = (Date.now() - start) / (1000 * 60 * 60)
       setTurnoVencido(elapsed >= turno.turnoMaxHoras!)
       setTurnoWarning(elapsed >= turno.turnoMaxHoras! - 0.5 && elapsed < turno.turnoMaxHoras!)
     }, 60_000)
     return () => clearInterval(interval)
   }, [turno])

   const turnoBlockedOrExpired = turnoBlocked || turnoVencido

   // ─── Auto-open modal when redirected from submit ────────────────────
  const invoiceIdParam = searchParams.get('invoiceId')
  useEffect(() => {
    if (invoiceIdParam && pendientes.length > 0 && !selectedInvoice) {
      const found = pendientes.find((p) => p.id === invoiceIdParam)
      if (found) {
        setSelectedInvoice(found)
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.delete('invoiceId')
          return next
        }, { replace: true })
      }
    }
  }, [invoiceIdParam, pendientes, selectedInvoice, setSearchParams])

  // ─── Form state ────────────────────────────────────────────────────
const [directoMop, setDirectoMop] = useState('')
   const [paymentsValue, setPaymentsValue] = useState<PaymentLinesValue>(EMPTY_PAYMENT_LINES_VALUE)
   const [condicionFiscal, setCondicionFiscal] = useState<'CREDITO_FISCAL' | 'CONSUMO'>('CONSUMO')
   const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')

  // ─── Customer fetch (to pre-suggest condicionFiscal) ────────────────
  const { data: customerData } = useQuery({
    queryKey: ['customer', selectedInvoice?.customer],
    queryFn: () => getCustomer(selectedInvoice!.customer),
    enabled: !!selectedInvoice,
  })
  useEffect(() => {
    if (customerData) {
      setCondicionFiscal(customerData.rnc ? 'CREDITO_FISCAL' : 'CONSUMO')
    }
  }, [customerData])

  // ─── Completar cobro mutation ───────────────────────────────────────
  const completarMutation = useMutation({
    mutationFn: (dto: CobrarFacturaDto) => completarCobro(selectedInvoice!.id, { ...dto, condicionFiscal }),
    onSuccess: async (res) => {
      const invoiceId = selectedInvoice!.id
      const msg = `Factura cobrada — NCF: ${res.ncf}`
      if (res.fullyPaid) {
        toast.success(msg)
      } else {
        toast.success(`${msg} — Saldo pendiente: ${formatMoney(res.outstandingAmount, selectedInvoiceCurrency)}. Puedes terminar el cobro desde la cola de Caja.`)
      }
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['caja-por-cobrar'] })
      // Este es el cierre real de la venta (§5.2 del doc de plantillas) — someter la factura
      // solo la reservó y la mandó aquí sin NCF ni pago completo. El gate es `usaModuloPos`
      // (toda factura en esta cola es una venta POS), no el formato de página genérico.
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
      if (isApiErrorCode(err, ERROR_CODES.POS_PAYMENT_CURRENCY_MISMATCH)) {
        toast.error(err.message, { duration: 8000 })
        return
      }
      toast.error(friendlyPaymentError(err?.message, 'Error al completar el cobro'))
    },
  })

  // ─── Descartar mutation ────────────────────────────────────────────
  const descartarMutation = useMutation({
    mutationFn: () => descartarFactura(confirmDescartar!.id),
    onSuccess: () => {
      toast.success('Factura descartada')
      setConfirmDescartar(null)
      queryClient.invalidateQueries({ queryKey: ['caja-por-cobrar'] })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al descartar la factura')
    },
  })

  // ─── Modal handlers ────────────────────────────────────────────────
function openModal(invoice: PendienteCobroItem) {
     setSelectedInvoice(invoice)
     setClienteOcasionalRnc('')
     if (invoice.esClienteOcasional) {
       setCondicionFiscal('CREDITO_FISCAL')
     } else if (customerData?.rnc) {
       setCondicionFiscal('CREDITO_FISCAL')
     } else {
       setCondicionFiscal('CONSUMO')
     }
     const invoiceCurrency = invoice.currency ?? monedaBase
     if (flujoCobro === 'directo') {
       setDirectoMop(resolveDefaultModeOfPago(facturacion, invoiceCurrency))
     } else {
       // El método de caja por defecto del turno solo se prellena si opera en la misma moneda
       // que esta factura — si no, se cae al default configurado en Facturacion Config para esa
       // moneda (modoPagoCajaUsd/modoPagoCajaEur).
       const cashMethod = turno?.modeOfPayment ?? turno?.modoPagoCaja ?? ''
       const cashMethodCurrency = metodoCurrencies[cashMethod] ?? monedaBase
       setPaymentsValue({
         ...EMPTY_PAYMENT_LINES_VALUE,
         payments: [{
           ...emptyPaymentLine(),
           modeOfPayment: cashMethodCurrency === invoiceCurrency ? cashMethod : resolveDefaultModeOfPago(facturacion, invoiceCurrency),
           amount: String(montoACobrarDe(invoice)),
         }],
       })
     }
   }

  function closeModal() {
    setSelectedInvoice(null)
    setDirectoMop('')
  }

  const cobroIsDirty = useDirtyCheck(
    { directoMop, paymentsValue, condicionFiscal, clienteOcasionalRnc },
    !!selectedInvoice,
  )
  const { requestClose: requestCloseModal, confirming: confirmingCloseModal, confirmDiscard: confirmDiscardModal, cancelDiscard: cancelDiscardModal } = useConfirmClose(cobroIsDirty, closeModal)

function validateAndSubmit() {
     if (!selectedInvoice) return
     if (turnoVencido) { toast.error('Tu turno ha expirado. Cierra el turno actual y abre uno nuevo.'); return }
     const total = selectedRoundedTotal

     if (flujoCobro === 'directo') {
       if (!directoMop) { toast.error('Selecciona un método de pago'); return }
       const dto: CobrarFacturaDto = {
         payments: [{ modeOfPayment: directoMop, amount: total }],
         condicionFiscal,
         ...(selectedInvoice.esClienteOcasional && condicionFiscal === 'CREDITO_FISCAL' ? { rnc: clienteOcasionalRnc || undefined } : {}),
       }
       completarMutation.mutate(dto)
       return
     }

     const validLines = paymentsValue.payments.filter((p) => p.modeOfPayment && Number(p.amount) > 0)
     if (validLines.length === 0) { toast.error('Agrega al menos una línea de pago válida'); return }
     const entered = sumPayments(paymentsValue.payments)
     if (entered > total + PAYMENT_LINES_TOLERANCE) {
       toast.error(`La suma de pagos (${formatMoney(entered, selectedInvoiceCurrency)}) excede el total (${formatMoney(total, selectedInvoiceCurrency)})`)
       return
     }

     const cash = cashAmount(paymentsValue.payments, metodosActivos)
     if (paymentsValue.vueltoEnabled) {
       const tenderedCash = Number(paymentsValue.tenderedCash) || 0
       if (tenderedCash <= 0) { toast.error('Indica el efectivo entregado por el cliente'); return }
       if (cash <= 0) { toast.error('No hay pagos en efectivo para registrar vuelto'); return }
       if (tenderedCash < cash - PAYMENT_LINES_TOLERANCE) {
         toast.error(`El efectivo entregado (${formatMoney(tenderedCash, selectedInvoiceCurrency)}) es menor al total de pagos en efectivo (${formatMoney(cash, selectedInvoiceCurrency)})`)
         return
       }
     }

     const payload = buildSubmitPayload(paymentsValue)
     completarMutation.mutate({
       ...payload,
       condicionFiscal,
       ...(selectedInvoice.esClienteOcasional && condicionFiscal === 'CREDITO_FISCAL' ? { rnc: clienteOcasionalRnc || undefined } : {}),
     })
   }

  const canSubmitCaja =
    flujoCobro !== 'caja' ||
    (() => {
      if (!paymentsValue.payments.some((p) => p.modeOfPayment && Number(p.amount) > 0)) return false
      const entered = sumPayments(paymentsValue.payments)
      if (entered > selectedRoundedTotal + PAYMENT_LINES_TOLERANCE) return false
      if (paymentsValue.vueltoEnabled) {
        const cash = cashAmount(paymentsValue.payments, metodosActivos)
        const tenderedCash = Number(paymentsValue.tenderedCash) || 0
        if (tenderedCash <= 0 || cash <= 0) return false
        if (tenderedCash < cash - PAYMENT_LINES_TOLERANCE) return false
      }
      return true
    })()

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  return (
    <div className="page-container">
       <div className="page-header">
         <div>
           <h1 className="page-title"><span className="page-title-dot" />Caja</h1>
           <p className="page-sub">
             {data?.meta
               ? `${data.meta.total} factura(s) pendiente(s) de completar cobro`
               : 'Facturas enviadas a Caja que aún no tienen NCF'}
           </p>
         </div>
         <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
           <RecargarButton />
         </div>
       </div>

       <TurnoCajaIndicator />

       {turnoBlockedOrExpired ? (
         <div className="empty-state" style={{ padding: '48px 24px' }}>
           <Clock size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
           <div className="empty-title">{turnoVencido ? 'Turno vencido' : 'Caja bloqueada'}</div>
           <p className="empty-sub" style={{ maxWidth: 400, textAlign: 'center' }}>
             {turnoVencido
               ? 'Tu turno de caja ha excedido el tiempo máximo permitido. Debes cerrarlo y abrir uno nuevo.'
               : 'El módulo POS/Caja está habilitado pero no tienes un turno de caja abierto. Abre un turno para acceder a los pendientes por cobrar.'}
           </p>
         </div>
       ) : (
        <>
        {/* ── Warning when turn is about to expire ──────────────── */}
        {turnoWarning && (
          <div className="inline-alert inline-alert-warn" style={{ margin: '16px 24px' }}>
            ⚠ Tu turno de caja está por expirar. Queda menos de 30 minutos.
          </div>
        )}

        <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="filter-bar" style={{ margin: 0 }}>
              <div className="filter-bar-left">
                <div className="search-input-wrap">
                  <Search size={14} className="search-input-icon" />
                  <input
                    className="search-input"
                    placeholder="Buscar factura o cliente…"
                    value={search}
                    onChange={handleSearchChange}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Cubre ARS</th>
                <th style={{ textAlign: 'right' }}>A cobrar</th>
                <th style={{ width: 180 }} />
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
                            <p className="empty-title">Sin pendientes por cobrar</p>
                            <p className="empty-sub">No hay facturas en espera de completar cobro.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : pendientes.map((inv) => (
                      <tr key={inv.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{inv.id}</td>
                        <td>{inv.esClienteOcasional ? (
                           <span>
                             {inv.clienteOcasionalNombre ?? inv.customerName}
                             <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>(ocasional)</span>
                           </span>
                         ) : (
                           inv.customerName
                         )}</td>
                        <td className="td-muted">{formatDate(inv.postingDate)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                          {formatMoney(inv.roundedTotal ?? inv.grandTotal, inv.currency ?? monedaBase)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-brand)' }}>
                          {/* La cobertura ARS siempre es DOP, sin importar la moneda de la factura. */}
                          {inv.aseguradora ? formatMoney(inv.aseguradora.montoCobertura, 'DOP') : <span className="td-dim">—</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
                          {formatMoney(montoACobrarDe(inv), inv.currency ?? monedaBase)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary btn-size-xs" onClick={() => openModal(inv)}>
                              <DollarSign size={13} /> Completar cobro
                            </button>
                            <button className="btn btn-ghost btn-size-xs" style={{ color: 'var(--color-error)' }} onClick={() => setConfirmDescartar(inv)}>
                              <Trash2 size={13} /> Descartar
                            </button>
                          </div>
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
      </>
      )}

       {/* ── Drawer: completar cobro ─────────────────────────────── */}
       {selectedInvoice && (
         <Drawer
           open={!!selectedInvoice}
           onClose={requestCloseModal}
           title={`Completar cobro — ${selectedInvoice.id}`}
           size="md"
           width={600}
           footer={
             <>
               <button className="btn btn-ghost" onClick={requestCloseModal}>Cancelar</button>
               <button
                 className="btn btn-primary"
                 onClick={validateAndSubmit}
                 disabled={completarMutation.isPending || (flujoCobro === 'caja' && !canSubmitCaja)}
               >
                 {completarMutation.isPending ? 'Procesando…' : `Cobrar ${formatMoney(
                   flujoCobro === 'directo' ? selectedRoundedTotal : sumPayments(paymentsValue.payments),
                   selectedInvoiceCurrency,
                 )}`}
               </button>
             </>
           }
         >
           <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
                 <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
                 <span style={{ fontWeight: 500 }}>{selectedInvoice.customerName}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>NCF:</span>
                 <span style={{ fontStyle: 'italic', color: 'var(--text-tertiary)' }}>Se asignará al cobrar</span>
                 {selectedInvoice.aseguradora && (
                   <>
                     <span style={{ color: 'var(--text-secondary)' }}>Total de la factura:</span>
                     <span>{formatMoney(selectedInvoice.roundedTotal ?? selectedInvoice.grandTotal, selectedInvoiceCurrency)}</span>
                     <span style={{ color: 'var(--text-secondary)' }}>Cubre la ARS:</span>
                     <span style={{ color: 'var(--color-brand)', fontWeight: 500 }}>
                       {formatMoney(selectedCobertura, 'DOP')}
                       <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                         ({selectedInvoice.aseguradora.aseguradoraName ?? selectedInvoice.aseguradora.aseguradora})
                       </span>
                     </span>
                   </>
                 )}
                 <span style={{ color: 'var(--text-secondary)' }}>Monto a cobrar:</span>
                 <span style={{ fontWeight: 700, color: 'var(--color-error)' }}>{formatMoney(selectedRoundedTotal, selectedInvoiceCurrency)}</span>
               </div>
               {selectedInvoice.aseguradora && (
                 <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
                   La fila de pago "Cobertura ARS" la agrega el sistema — acá solo se registra lo
                   que entrega el paciente.
                 </p>
               )}
               {selectedRoundingAdjustment !== 0 && (
                 <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
                   Incluye ajuste por redondeo: {selectedRoundingAdjustment > 0 ? '+' : ''}{formatMoney(selectedRoundingAdjustment, selectedInvoiceCurrency)}
                   {' '}(total sin redondear: {formatMoney(selectedInvoice.grandTotal, selectedInvoiceCurrency)})
                 </p>
               )}

{(selectedRoundedTotal > 0 || (customerData?.rnc ?? customerData?.cedula) || selectedInvoice.esClienteOcasional) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Condición fiscal del comprobante
                    </label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="radio"
                          name="condicionFiscal"
                          value="CONSUMO"
                          checked={condicionFiscal === 'CONSUMO'}
                          onChange={() => setCondicionFiscal('CONSUMO')}
                        />
                        Consumo
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="radio"
                          name="condicionFiscal"
                          value="CREDITO_FISCAL"
                          checked={condicionFiscal === 'CREDITO_FISCAL'}
                          onChange={() => setCondicionFiscal('CREDITO_FISCAL')}
                        />
                        Crédito Fiscal
                      </label>
                    </div>
                    {customerData?.rnc && (
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Se sugiere Crédito Fiscal (RNC: {customerData.rnc})
                      </p>
                    )}
                    {!customerData?.rnc && customerData?.cedula && (
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Se sugiere Consumo (sin RNC registrado)
                      </p>
                    )}
                    {selectedInvoice.esClienteOcasional && condicionFiscal === 'CREDITO_FISCAL' && (
                      <div className="ff-wrap" style={{ marginTop: 8 }}>
                        <label className="ff-label ff-required" htmlFor="ocaRnc">RNC del cliente ocasional</label>
                        <input
                          id="ocaRnc"
                          type="text"
                          className="ff-input"
                          value={clienteOcasionalRnc}
                          onChange={(e) => setClienteOcasionalRnc(e.target.value)}
                          placeholder="RNC del cliente ocasional"
                          required
                        />
                      </div>
                    )}
                    {selectedInvoice.esClienteOcasional && condicionFiscal === 'CREDITO_FISCAL' && !clienteOcasionalRnc.trim() && (
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-warning)' }}>
                        El RNC es requerido para Crédito Fiscal (B01)
                      </p>
                    )}
                  </div>
                )}

               <div className="divider" />

               {flujoCobro === 'directo' ? (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                   <p className="ff-hint" style={{ margin: 0 }}>
                     Se cobrará el total de {formatMoney(selectedRoundedTotal, selectedInvoiceCurrency)} con este método.
                   </p>
                 </div>
               ) : (
                 <>
                   <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                     El monto de cada línea de pago es lo que se aplica a la factura.
                     La suma no puede exceder <strong>{formatMoney(selectedRoundedTotal, selectedInvoiceCurrency)}</strong>.
                   </p>
                   <PaymentLinesEditor
                     amountDue={selectedRoundedTotal}
                     value={paymentsValue}
                     onChange={setPaymentsValue}
                     currency={selectedInvoiceCurrency}
                   />
                 </>
               )}
           </div>
         </Drawer>
       )}

       {/* ── Modal: confirmar descartar ──────────────────────────── */}
       {confirmDescartar && (
         <div className="modal-overlay" onClick={() => setConfirmDescartar(null)}>
           <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
             <div className="modal-head">
               <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                 <Trash2 size={16} style={{ color: 'var(--color-error)' }} /> Descartar venta
               </h2>
               <button className="modal-close" onClick={() => setConfirmDescartar(null)}>×</button>
             </div>
             <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
               <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                 ¿Descartar esta venta? No se puede deshacer — la factura se eliminará por completo.
               </p>
               <div style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                 <span style={{ color: 'var(--text-secondary)' }}>Factura:</span>
                 <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{confirmDescartar.id}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
                 <span>{confirmDescartar.customerName}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>Total:</span>
                 <span>{formatMoney(confirmDescartar.roundedTotal ?? confirmDescartar.grandTotal, confirmDescartar.currency ?? monedaBase)}</span>
                 {confirmDescartar.aseguradora && (
                   <>
                     <span style={{ color: 'var(--text-secondary)' }}>Cubre la ARS:</span>
                     <span>{formatMoney(confirmDescartar.aseguradora.montoCobertura, 'DOP')}</span>
                   </>
                 )}
               </div>
             </div>
             <div className="modal-foot">
               <button className="btn btn-ghost" onClick={() => setConfirmDescartar(null)}>Volver</button>
               <button
                 className="btn btn-danger"
                 onClick={() => descartarMutation.mutate()}
                 disabled={descartarMutation.isPending}
               >
                 {descartarMutation.isPending ? 'Descartando…' : 'Sí, descartar'}
               </button>
             </div>
           </div>
         </div>
       )}

       <ConfirmModal
         open={confirmingCloseModal}
         onClose={cancelDiscardModal}
         onConfirm={confirmDiscardModal}
         title="¿Descartar cambios?"
         description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
         confirmLabel="Descartar cambios"
         variant="danger"
       />
       {printTargetNode}
     </div>
   )
 }
