import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { listInvoices, getInvoice } from '@/shared/api/invoices'
import { listCustomers } from '@/shared/api/customers'
import { listMetodosPago } from '@/shared/api/config'
import { getEcfTipos } from '@/shared/api/ecf'
import { createDevolucion } from '@/shared/api/devoluciones'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDOP, formatDate, daysSince } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { RotateCcw, Users, FileText, Check, AlertCircle, AlertTriangle } from 'lucide-react'
import type { ApiError, EcfModificationCode } from '@/shared/api/types'
import { ECF_MODIFICATION_CODES, ecfTipoElectronicoHabilitado } from '@/lib/dgii'
import { Select, SelectItem } from '@/components/ui/select'
import { DEVOLUCION_DIAS_LIMITE_ITBIS } from '@/lib/constants'

const RETURN_RESOLUTION_OPTIONS: SearchSelectOption[] = [
  { value: 'credit_note_only', label: 'Saldo a favor' },
  { value: 'refund', label: 'Reembolsar ahora' },
]

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: 'Pagada',
  unpaid: 'Pendiente',
  partly_paid: 'Parcialmente pagada',
}

interface ReturnRow {
  itemCode: string
  description: string
  qtyPurchased: number
  qty: number
  checked: boolean
}

export default function DevolucionForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()

  // ── Paso 1/2: selección de cliente → factura sometida (pagada o pendiente) ──
  // Todo vive en esta misma vista — elegir la factura no navega a otra pantalla,
  // solo revela el formulario de devolución debajo (misma lógica que Devoluciones de Compras).

  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customerSearch-devolucion', customerSearch],
    queryFn: () => listCustomers({ search: customerSearch || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  const [invoiceId, setInvoiceId] = useState('')
  const [invoiceLabel, setInvoiceLabel] = useState('')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const { data: invoicesSometidas, isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices-submitted-picker', customerId],
    // Sin `paymentStatus` — trae tanto facturas pagadas como pendientes de cobro.
    queryFn: () => listInvoices({ status: 'submitted', customer: customerId, limit: 100 }),
    enabled: !!customerId,
    staleTime: 60_000,
  })
  const invoiceOptions: SearchSelectOption[] = (invoicesSometidas?.items ?? [])
    .filter((i) => !invoiceSearch || [i.id, i.ncf].some((v) => v?.toLowerCase().includes(invoiceSearch.toLowerCase())))
    .map((i) => ({
      value: i.id,
      label: i.ncf ?? i.id,
      sublabel: `${formatDate(i.postingDate)} — ${formatDOP(i.grandTotal)} — ${PAYMENT_STATUS_LABEL[i.paymentStatus ?? ''] ?? 'Sin cobro registrado'}`,
    }))

  function changeCustomer() {
    setCustomerId('')
    setCustomerLabel('')
    setInvoiceSearch('')
    setInvoiceId('')
    setInvoiceLabel('')
  }

  // ── Factura elegida → datos completos para el formulario de devolución ────

  const { data: invoice, isLoading: loadingInvoice } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => getInvoice(invoiceId),
    enabled: !!invoiceId,
    staleTime: 30_000,
  })

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: !!invoiceId,
    staleTime: 5 * 60_000,
  })

  // e-CF: si la Nota de Crédito (typeId 34) se emite como comprobante electrónico para este
  // tenant, el modificationCode (Tabla VI DGII) es obligatorio para poder someterla en Aura.
  const { data: ecfTipos } = useQuery({ queryKey: ['ecf-tipos'], queryFn: getEcfTipos, staleTime: 60 * 60_000 })
  const notaCreditoEsEcf = ecfTipoElectronicoHabilitado(ecfTipos, '34')

  const [returnFullInvoice, setReturnFullInvoice] = useState(true)
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([])
  const [returnResolution, setReturnResolution] = useState<'refund' | 'credit_note_only'>('credit_note_only')
  const [returnModeOfPayment, setReturnModeOfPayment] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [returnResolutionSearch, setReturnResolutionSearch] = useState('')
  const [returnModeOfPaymentSearch, setReturnModeOfPaymentSearch] = useState('')
  const [modificationCode, setModificationCode] = useState<EcfModificationCode | ''>('')
  const [modificationCodeError, setModificationCodeError] = useState('')
  const modificationCodeTouched = useRef(false)

  // Infiere el código de modificación DGII a partir de lo que el usuario elige devolver: la
  // factura completa se declara como "Anula" (1), una devolución parcial como "Corrige montos"
  // (3). El usuario puede sobreescribirlo (ej. si en realidad es una corrección de texto o un
  // caso de contingencia/factura de consumo) — a partir de ahí dejamos de reinferir.
  useEffect(() => {
    if (modificationCodeTouched.current) return
    setModificationCode(returnFullInvoice ? 1 : 3)
  }, [returnFullInvoice])

  const rowsSeededFor = useRef('')
  useEffect(() => {
    if (!invoice || rowsSeededFor.current === invoice.id) return
    rowsSeededFor.current = invoice.id
    setReturnRows(
      invoice.items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description || i.itemCode,
        qtyPurchased: i.qty,
        qty: i.qty,
        checked: false,
      })),
    )
  }, [invoice])

  function selectInvoice(id: string, label: string) {
    setInvoiceId(id)
    setInvoiceLabel(label)
    setReturnFullInvoice(true)
    setReturnResolution('credit_note_only')
    setReturnModeOfPayment('')
    setReturnReason('')
    modificationCodeTouched.current = false
    setModificationCode(1)
    setModificationCodeError('')
  }

  function toggleReturnRow(itemCode: string) {
    setReturnRows((prev) => prev.map((r) => (r.itemCode === itemCode ? { ...r, checked: !r.checked } : r)))
  }
  function setReturnRowQty(itemCode: string, qty: number) {
    setReturnRows((prev) => prev.map((r) => (r.itemCode === itemCode ? { ...r, qty } : r)))
  }

  // Regla fiscal (la controla el backend): pasados los 30 días de la factura original, la
  // devolución ya no reintegra el ITBIS, solo el monto neto antes de impuestos. Aquí solo se
  // avisa con anticipación — el cálculo real siempre lo hace el backend.
  const diasDesdeFactura = daysSince(invoice?.postingDate)
  const facturaVencidaParaItbis = diasDesdeFactura != null && diasDesdeFactura > DEVOLUCION_DIAS_LIMITE_ITBIS

  const hasOutstandingBalance = (invoice?.outstandingAmount ?? 0) > 0
  const returnResolutionOptions: SearchSelectOption[] = useMemo(() => {
    const q = returnResolutionSearch.toLowerCase()
    return RETURN_RESOLUTION_OPTIONS.filter((o) => o.value !== 'refund' || !hasOutstandingBalance).filter(
      (o) => !q || o.label.toLowerCase().includes(q),
    )
  }, [returnResolutionSearch, hasOutstandingBalance])

  const returnModeOptions: SearchSelectOption[] = useMemo(() => {
    const q = returnModeOfPaymentSearch.toLowerCase()
    return (metodos ?? [])
      .filter((m) => !m.disabled)
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ value: m.name, label: m.name }))
  }, [metodos, returnModeOfPaymentSearch])

  const returnCheckedRows = returnRows.filter((r) => r.checked)
  const returnReasonValid = returnReason.trim().length >= 10 && returnReason.trim().length <= 500
  const returnModeValid = returnResolution !== 'refund' || !!returnModeOfPayment
  const returnItemsValid =
    returnFullInvoice ||
    (returnCheckedRows.length > 0 && returnCheckedRows.every((r) => r.qty > 0 && r.qty <= r.qtyPurchased))
  const returnModificationCodeValid = !notaCreditoEsEcf || !!modificationCode
  const canConfirmReturn = returnReasonValid && returnModeValid && returnItemsValid && returnModificationCodeValid

  const isDirty = useDirtyCheck(
    { returnFullInvoice, returnRows, returnResolution, returnModeOfPayment, returnReason, modificationCode },
    !!invoiceId && !loadingInvoice,
  )
  const confirmClose = useConfirmClose(isDirty, () => navigate('/devoluciones'))

  const devolucionMutation = useMutation({
    mutationFn: () => {
      setModificationCodeError('')
      return createDevolucion({
        invoiceId,
        items: returnFullInvoice ? undefined : returnCheckedRows.map((r) => ({ itemCode: r.itemCode, qty: r.qty })),
        resolution: returnResolution,
        refundModeOfPayment: returnResolution === 'refund' ? returnModeOfPayment : undefined,
        reason: returnReason.trim(),
        modificationCode: modificationCode || undefined,
      })
    },
    onSuccess: (result) => {
      toast.success(result.message ?? 'Devolución procesada correctamente', {
        duration: result.appliedToOriginalInvoice ? 8000 : undefined,
      })
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['devoluciones'] })
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      navigate(`/devoluciones/${result.creditNoteId}`)
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (err: ApiError) => {
      // El backend rechaza con 400 si la nota de crédito se emite como e-CF y falta el
      // modificationCode — puede pasar aunque no lo hayamos marcado como requerido (el frontend
      // no adivina si el tenant tiene e-CF activo con certeza total). En ese caso lo mostramos
      // como error de validación del campo, no como un toast genérico.
      if (err?.message?.toLowerCase().includes('modificationcode')) {
        setModificationCodeError(err.message)
        return
      }
      toast.error(err?.message ?? 'Error al procesar la devolución')
    },
  })

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={invoiceId ? confirmClose.requestClose : () => navigate('/devoluciones')}>
        ← Devoluciones
      </button>

      <PageHeader
        title="Nueva Devolución"
        description="Busca al cliente y selecciona la factura sometida a devolver (pagada o pendiente)."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="badge badge-info"
              style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >
              1
            </span>
            <span className="card-title">Cliente</span>
          </div>
          <div className="card-body">
            {customerId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={16} style={{ color: 'var(--icon-muted)' }} />
                  <span style={{ fontWeight: 500 }}>{customerLabel}</span>
                  <Check size={14} style={{ color: 'var(--success-text)' }} />
                </div>
                <button type="button" className="btn btn-ghost btn-size-sm" onClick={changeCustomer}>
                  Cambiar
                </button>
              </div>
            ) : (
              <SearchSelect
                value=""
                onChange={(val, opt) => {
                  if (!val) return
                  setCustomerId(val)
                  setCustomerLabel(opt?.label ?? val)
                }}
                options={customerOptions}
                onSearch={setCustomerSearch}
                selectedLabel=""
                placeholder="Buscar cliente por nombre, RNC o cédula…"
                loading={loadingCustomers}
              />
            )}
          </div>
        </div>

        <div className="card" style={{ opacity: customerId ? 1 : 0.5, pointerEvents: customerId ? 'auto' : 'none' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="badge badge-info"
              style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >
              2
            </span>
            <span className="card-title">Factura</span>
          </div>
          <div className="card-body">
            {invoiceId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} style={{ color: 'var(--icon-muted)' }} />
                  <span style={{ fontWeight: 500 }}>{invoiceLabel}</span>
                  <Check size={14} style={{ color: 'var(--success-text)' }} />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-size-sm"
                  onClick={() => { setInvoiceId(''); setInvoiceLabel('') }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <SearchSelect
                  value=""
                  onChange={(val, opt) => {
                    if (!val) return
                    selectInvoice(val, opt?.label ?? val)
                  }}
                  options={invoiceOptions}
                  onSearch={setInvoiceSearch}
                  selectedLabel=""
                  placeholder="Buscar factura (NCF, # factura)…"
                  loading={loadingInvoices}
                  disabled={!customerId}
                />
                {customerId && invoicesSometidas && invoicesSometidas.items.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                    Este cliente no tiene facturas sometidas.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Paso 3: formulario de devolución — aparece debajo, en la misma vista ── */}

        {invoiceId && (loadingInvoice || !invoice) && (
          <div className="card">
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="skeleton-box" style={{ height: 18, width: '60%', display: 'block' }} />
              <span className="skeleton-box" style={{ height: 120, width: '100%', display: 'block' }} />
            </div>
          </div>
        )}

        {invoice && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RotateCcw size={15} style={{ color: 'var(--icon-muted)' }} />
              <span className="card-title">Devolver producto(s)</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {facturaVencidaParaItbis && (
                <div className="inline-alert inline-alert-warn">
                  <AlertTriangle size={16} />
                  Esta factura tiene más de {DEVOLUCION_DIAS_LIMITE_ITBIS} días ({diasDesdeFactura} días) — por regla
                  fiscal, la nota de crédito no reintegrará el ITBIS, solo el monto neto antes de impuestos.
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={returnFullInvoice}
                  onChange={(e) => setReturnFullInvoice(e.target.checked)}
                />
                Devolver la factura completa
              </label>

              {!returnFullInvoice && (
                <div className="items-table-wrap">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Artículo</th>
                        <th style={{ textAlign: 'right', width: 100 }}>Comprado</th>
                        <th style={{ textAlign: 'right', width: 120 }}>Cant. a devolver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnRows.map((row) => (
                        <tr key={row.itemCode} style={{ opacity: row.checked ? 1 : 0.6 }}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={() => toggleReturnRow(row.itemCode)}
                              style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                            />
                          </td>
                          <td>
                            <span style={{ fontWeight: 500 }}>{row.description}</span>
                            <br />
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{row.itemCode}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{row.qtyPurchased}</td>
                          <td>
                            <input
                              className={`items-input${row.checked && (row.qty <= 0 || row.qty > row.qtyPurchased) ? ' items-input-error' : ''}`}
                              type="number"
                              min="0"
                              max={row.qtyPurchased}
                              step="1"
                              style={{ textAlign: 'right' }}
                              value={row.qty}
                              disabled={!row.checked}
                              onChange={(e) => setReturnRowQty(row.itemCode, parseFloat(e.target.value) || 0)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="ff-wrap">
                <label className={`ff-label${notaCreditoEsEcf ? ' ff-required' : ''}`}>Código de modificación (DGII)</label>
                <Select
                  value={modificationCode ? String(modificationCode) : ''}
                  onValueChange={(v) => {
                    modificationCodeTouched.current = true
                    setModificationCode(v ? (Number(v) as EcfModificationCode) : '')
                    setModificationCodeError('')
                  }}
                  placeholder="Selecciona el código…"
                >
                  {ECF_MODIFICATION_CODES.map((c) => (
                    <SelectItem key={c.code} value={String(c.code)}>{c.label}</SelectItem>
                  ))}
                </Select>
                <p className="ff-hint">
                  Preseleccionado según la devolución ({returnFullInvoice ? '"Anula" para factura completa' : '"Corrige montos" para devolución parcial'}) —
                  cámbialo si no aplica. Solo tiene efecto si esta nota de crédito se emite como comprobante
                  electrónico (e-CF) ante la DGII; si el negocio no emite e-CF, se ignora.
                </p>
                {modificationCodeError && (
                  <div className="inline-alert inline-alert-error" style={{ marginTop: 4 }}>
                    <AlertCircle size={14} />
                    {modificationCodeError}
                  </div>
                )}
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required">¿Qué hacer con el monto?</label>
                <SearchSelect
                  value={returnResolution}
                  selectedLabel={RETURN_RESOLUTION_OPTIONS.find((o) => o.value === returnResolution)?.label ?? ''}
                  onChange={(val) => setReturnResolution((val || 'credit_note_only') as 'refund' | 'credit_note_only')}
                  options={returnResolutionOptions}
                  onSearch={setReturnResolutionSearch}
                  className="ff-select"
                />
                {hasOutstandingBalance && (
                  <p className="ff-hint">
                    Esta factura tiene {formatDOP(invoice.outstandingAmount)} pendiente de cobro — la nota de
                    crédito se aplicará automáticamente a ese pendiente, por eso "Reembolsar ahora" no está disponible.
                  </p>
                )}
              </div>

              {returnResolution === 'refund' && (
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="returnModeOfPayment">Método de pago del reembolso</label>
                  <SearchSelect
                    id="returnModeOfPayment"
                    value={returnModeOfPayment}
                    selectedLabel={metodos?.find((m) => m.name === returnModeOfPayment)?.name ?? ''}
                    onChange={setReturnModeOfPayment}
                    options={returnModeOptions}
                    onSearch={setReturnModeOfPaymentSearch}
                    placeholder="Seleccionar…"
                    className="ff-select"
                  />
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="returnReason">Motivo de la devolución</label>
                <textarea
                  id="returnReason"
                  className="ff-textarea"
                  rows={3}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Describe el motivo de la devolución (mínimo 10 caracteres)"
                  maxLength={500}
                />
                <p className="ff-hint">{returnReason.trim().length}/500 caracteres (mínimo 10)</p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={confirmClose.requestClose}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => devolucionMutation.mutate()}
                disabled={!canConfirmReturn || devolucionMutation.isPending}
              >
                {devolucionMutation.isPending && <span className="spinner" />}
                <RotateCcw size={14} /> Confirmar devolución
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmClose.confirming}
        onClose={confirmClose.cancelDiscard}
        onConfirm={confirmClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar. Si sales, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}
