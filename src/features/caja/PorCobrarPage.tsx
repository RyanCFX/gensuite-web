import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, DollarSign, Trash2, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react'
import { listPorCobrar, completarCobro, descartarFactura } from '@/shared/api/caja'
import { getFacturacionConfig, listMetodosPago } from '@/shared/api/config'
import { getCustomer } from '@/shared/api/customers'
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
import type { CobrarFacturaDto, PendienteCobroItem } from '@/shared/api/types'

const PAGE_SIZE = 20

export default function PorCobrarPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [selectedInvoice, setSelectedInvoice] = useState<PendienteCobroItem | null>(null)
  const [confirmDescartar, setConfirmDescartar] = useState<PendienteCobroItem | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['caja-por-cobrar', { search: debouncedSearch, offset }],
    queryFn: () => listPorCobrar({ search: debouncedSearch || undefined, offset, limit: PAGE_SIZE }),
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

  const { data: turno } = useQuery({
    queryKey: ['turno-actual'],
    queryFn: getTurnoActual,
    enabled: usaModuloPos,
    staleTime: 30_000,
  })
   const pendientes = data?.items ?? []
   const totalPages = data?.meta ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

   const turnoBlocked = usaModuloPos && !turno

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
    onSuccess: (res) => {
      const msg = `Factura cobrada — NCF: ${res.ncf}`
      if (res.fullyPaid) {
        toast.success(msg)
      } else {
        toast.success(`${msg} — Saldo pendiente: ${formatDOP(res.outstandingAmount)}. Puedes terminar el cobro desde la cola de Caja.`)
      }
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['caja-por-cobrar'] })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al completar el cobro')
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
     if (invoice.esClienteOcasional) {
       setCondicionFiscal('CREDITO_FISCAL')
     } else if (customerData?.rnc) {
       setCondicionFiscal('CREDITO_FISCAL')
     } else {
       setCondicionFiscal('CONSUMO')
     }
     if (flujoCobro === 'directo') {
       setDirectoMop('')
     } else {
       setPaymentsValue(EMPTY_PAYMENT_LINES_VALUE)
     }
   }

  function closeModal() {
    setSelectedInvoice(null)
    setDirectoMop('')
  }

function validateAndSubmit() {
     if (!selectedInvoice) return
     if (turnoVencido) { toast.error('Tu turno ha expirado. Cierra el turno actual y abre uno nuevo.'); return }
     const total = selectedInvoice.grandTotal

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
       toast.error(`La suma de pagos (${formatDOP(entered)}) excede el total (${formatDOP(total)})`)
       return
     }

     const cash = cashAmount(paymentsValue.payments, metodosActivos)
     if (paymentsValue.vueltoEnabled) {
       const tenderedCash = Number(paymentsValue.tenderedCash) || 0
       if (tenderedCash <= 0) { toast.error('Indica el efectivo entregado por el cliente'); return }
       if (cash <= 0) { toast.error('No hay pagos en efectivo para registrar vuelto'); return }
       if (tenderedCash < cash - PAYMENT_LINES_TOLERANCE) {
         toast.error(`El efectivo entregado (RD$${tenderedCash.toFixed(2)}) es menor al total de pagos en efectivo (RD$${cash.toFixed(2)})`)
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
      if (entered > (selectedInvoice?.grandTotal ?? 0) + PAYMENT_LINES_TOLERANCE) return false
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
           <h1 className="page-title">Caja</h1>
           <p className="page-sub">
             {data?.meta
               ? `${data.meta.total} factura(s) pendiente(s) de completar cobro`
               : 'Facturas enviadas a Caja que aún no tienen NCF'}
           </p>
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

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ width: 180 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : pendientes.length === 0
                  ? (
                      <tr>
                        <td colSpan={5}>
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
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
                          {formatDOP(inv.grandTotal)}
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

       {/* ── Modal: completar cobro ──────────────────────────────── */}
       {selectedInvoice && (
         <div className="modal-overlay" onClick={closeModal}>
           <div className="modal-box" style={{ maxWidth: flujoCobro === 'caja' ? 640 : 480 }} onClick={(e) => e.stopPropagation()}>
             <div className="modal-head">
               <h2 className="modal-title">Completar cobro — {selectedInvoice.id}</h2>
               <button className="modal-close" type="button" onClick={closeModal}><X size={16} /></button>
             </div>

             <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
                 <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
                 <span style={{ fontWeight: 500 }}>{selectedInvoice.customerName}</span>
                 <span style={{ color: 'var(--text-secondary)' }}>NCF:</span>
                 <span style={{ fontStyle: 'italic', color: 'var(--text-tertiary)' }}>Se asignará al cobrar</span>
                 <span style={{ color: 'var(--text-secondary)' }}>Monto a cobrar:</span>
                 <span style={{ fontWeight: 700, color: 'var(--color-error)' }}>{formatDOP(selectedInvoice.grandTotal)}</span>
               </div>

{(selectedInvoice.grandTotal > 0 || (customerData?.rnc ?? customerData?.cedula) || selectedInvoice.esClienteOcasional) && (
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
                   <p className="ff-hint" style={{ margin: 0 }}>
                     Se cobrará el total de {formatDOP(selectedInvoice.grandTotal)} con este método.
                   </p>
                 </div>
               ) : (
                 <>
                   <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                     El monto de cada línea de pago es lo que se aplica a la factura.
                     La suma no puede exceder <strong>{formatDOP(selectedInvoice.grandTotal)}</strong>.
                   </p>
                   <PaymentLinesEditor
                     amountDue={selectedInvoice.grandTotal}
                     value={paymentsValue}
                     onChange={setPaymentsValue}
                   />
                 </>
               )}
             </div>

             <div className="modal-foot">
               <button className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
               <button
                 className="btn btn-primary"
                 onClick={validateAndSubmit}
                 disabled={completarMutation.isPending || (flujoCobro === 'caja' && !canSubmitCaja)}
               >
                 {completarMutation.isPending ? 'Procesando…' : `Cobrar ${formatDOP(
                   flujoCobro === 'directo' ? selectedInvoice.grandTotal : sumPayments(paymentsValue.payments)
                 )}`}
               </button>
             </div>
           </div>
         </div>
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
                 <span>{formatDOP(confirmDescartar.grandTotal)}</span>
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
     </div>
   )
 }
