import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { createInvoice, updateInvoice, getInvoice } from '@/shared/api/invoices'
import { listCustomers } from '@/shared/api/customers'
import { client } from '@/shared/api/client'
import { listItems, getDefaultPriceTier } from '@/shared/api/catalog'
import type { CreateInvoiceDto, UpdateInvoiceDto, Customer, SemaforoEntry, SemaforoResult, Item, ItemPrices } from '@/shared/api/types'
import { ENDPOINTS } from '@/shared/api/endpoints'
import { formatDOP, displayId } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { NCF_TYPES } from '@/lib/constants'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { PinModal } from '@/components/shared/PinModal'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { getUsuario } from '@/shared/api/usuarios'
import { getUser } from '@/shared/api/storage'


type NcfType = 'B01' | 'B02' | 'B14' | 'B15' | 'B16'

interface LineItem {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  amount: number
  discountPct: number
  salesTaxPct: number
  salesTaxTemplate: string
  /** Precio base al stockUom — se usa para recalcular al cambiar UOM */
  baseRate: number
  uom: string

  /** Factor de conversión activo (UOM seleccionada / stockUom) */
  conversionFactor: number
  maxDiscountPct?: number
  _prices?: ItemPrices
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultDueDate() {
  return format(addDays(new Date(), 30), 'yyyy-MM-dd')
}

function calcAmount(qty: number, rate: number, discountPct: number = 0) {
  const base = qty * rate
  const discount = base * (discountPct / 100)
  return Math.round((base - discount) * 100) / 100
}

function maxDiscFromPrices(rate: number, prices: ItemPrices | undefined): number {
  if (!prices || rate <= 0) return 100
  const vals = Object.values(prices).filter((v): v is number => v != null)
  if (vals.length === 0) return 100
  const minPrice = Math.min(...vals)
  if (minPrice <= 0) return 100
  return Math.max(0, (1 - minPrice / rate) * 100)
}

export default function InvoiceForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // When `:id` is present in the URL we're in edit mode
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [postingDate, setPostingDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState(defaultDueDate())
  const [ncfType, setNcfType] = useState<NcfType>('B02')
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [semaforo, setSemaforo] = useState<SemaforoEntry | null>(null)
  const [loadingSemaforo, setLoadingSemaforo] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // ── Barcode scanner ───────────────────────────────────────────────────────
  useBarcodeScanner({
    onBarcode: async (code) => {
      const res = await listItems({ barcode: code, limit: 1, validateStock: true })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      addRow()
      setTimeout(() => selectCatalogItem(items.length, item), 0)
    },
  })

  // ── Load existing invoice when editing ────────────────────────────────────
  const { data: existingInvoice, isLoading: loadingInvoice } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: isEdit,
  })

  // Pre-populate form once the existing invoice loads
  useEffect(() => {
    if (!existingInvoice || initialized) return
    setCustomerId(existingInvoice.customer)
    setPostingDate(existingInvoice.postingDate)
    setDueDate(existingInvoice.dueDate ?? defaultDueDate())
    setNcfType((existingInvoice.ncfType as NcfType) ?? 'B02')
    setNotes(existingInvoice.notes ?? '')
    setItems(
      existingInvoice.items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        baseRate: i.rate,
        amount: i.amount,
        discountPct: (i as any).discountPct ?? 0,
        salesTaxPct: 0,
        salesTaxTemplate: '',
        uom: i.uom,

        conversionFactor: 1,
      })),
    )
    setInitialized(true)
  }, [existingInvoice, initialized])

  // ── Customer search ───────────────────────────────────────────────────────
  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
    enabled: true,
  })

  const { data: defaultPriceTier = 'B' } = useQuery({
    queryKey: ['defaultPriceTier'],
    queryFn: getDefaultPriceTier,
    staleTime: 5 * 60_000,
  })

  const currentUserEmail = getUser()?.email
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser', currentUserEmail],
    queryFn: () => getUsuario(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 5 * 60_000,
  })

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  // In edit mode, the selected customer name comes from the invoice until the user picks a new one
  const selectedLabel = isEdit && !customerQuery && existingInvoice && customerId === existingInvoice.customer
    ? existingInvoice.customerName
    : undefined

  // ── Semaforo ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedCustomer) {
      setSemaforo(null)
      return
    }
    setLoadingSemaforo(true)
    client
      .get<{ success: true; data: SemaforoResult }>(ENDPOINTS.cobros.semaforo, {
        params: { customer: selectedCustomer.id },
      })
      .then((res) => {
        const entry = res.data.data.clientes.find((s) => s.customer === selectedCustomer.id) ?? null
        setSemaforo(entry)
      })
      .catch(() => setSemaforo(null))
      .finally(() => setLoadingSemaforo(false))
  }, [selectedCustomer])

  // ── Auto-select NCF type based on customer (only for new customers) ───────
  useEffect(() => {
    if (!selectedCustomer) return
    if (selectedCustomer.isGovernment) {
      setNcfType('B15')
    } else if (selectedCustomer.rnc) {
      setNcfType('B01')
    } else {
      setNcfType('B02')
    }
  }, [selectedCustomer])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (dto: CreateInvoiceDto) => createInvoice(dto),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Factura creada como borrador')
      navigate(`/facturacion/facturas/${invoice.id}`)
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? ''
      if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) { setPinModalOpen(true); return }
      toast.error(msg || 'Error al crear la factura')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (dto: UpdateInvoiceDto) => updateInvoice(id!, dto),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      if (invoice.id !== id) {
        toast.success(`Nueva versión creada: ${displayId(invoice.id, invoice.sequence)}`)
        navigate(`/facturacion/facturas/${invoice.id}`)
      } else {
        toast.success(`Versión ${invoice.sequence} guardada como historial`)
        navigate(`/facturacion/facturas/${invoice.id}`, { replace: true })
      }
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? ''
      if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) { setPinModalOpen(true); return }
      toast.error(msg || 'Error al actualizar la factura')
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  // ── Line item helpers ─────────────────────────────────────────────────────
  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, ...patch }
        if ('qty' in patch || 'rate' in patch || 'discountPct' in patch) {
          updated.amount = calcAmount(updated.qty, updated.rate, updated.discountPct)
        }
        return updated
      }),
    )
  }

  async function selectCatalogItem(index: number, catalogItem: Item) {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const tier = selectedCustomer?.priceTier ?? defaultPriceTier ?? 'B'
        const baseRate = catalogItem.prices?.[tier] ?? catalogItem.standardRate ?? 0
        return {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          description: catalogItem.internalDescription ?? catalogItem.itemName,
          rate: baseRate,
          baseRate,
          amount: calcAmount(row.qty, baseRate, row.discountPct),
          uom: catalogItem.stockUom ?? row.uom,
          conversionFactor: 1,
          maxDiscountPct: catalogItem.allowsDiscount ? catalogItem.maxDiscountPct : undefined,
          _prices: catalogItem.prices,
          salesTaxPct: catalogItem.salesTaxPct ?? 0,
          salesTaxTemplate: catalogItem.salesTaxTemplate ?? '',
        }
      }),
    )
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, description: '', rate: 0, amount: 0, discountPct: 0, salesTaxPct: 0, salesTaxTemplate: '' })
  }

  function onVariantConfirm(selections: VariantSelection[]) {
    const tier = selectedCustomer?.priceTier ?? defaultPriceTier ?? 'B'
    setItems((prev) => [
      ...prev,
      ...selections.map((s) => {
        const rate = s.item.prices?.[tier] ?? s.item.standardRate ?? 0
        return {
          itemCode: s.item.id,
          itemLabel: s.item.itemName,
          description: s.item.internalDescription ?? s.item.itemName,
          qty: s.qty,
          rate,
          baseRate: rate,
          amount: calcAmount(s.qty, rate, 0),
          discountPct: 0,
          salesTaxPct: s.item.salesTaxPct ?? 0,
          salesTaxTemplate: s.item.salesTaxTemplate ?? '',
          uom: s.item.stockUom ?? 'Unidad',
          conversionFactor: 1,
          maxDiscountPct: s.item.allowsDiscount ? s.item.maxDiscountPct : undefined,
          _prices: s.item.prices,
        }
      }),
    ])
    setVariantTemplate(null)
  }

  // ── Reprice on customer change ───────────────────────────────────────────
  useEffect(() => {
    const tier = selectedCustomer?.priceTier ?? defaultPriceTier ?? 'B'
    setItems((prev) =>
      prev.map((row) => {
        if (!row._prices) return row
        const rate = row._prices[tier] ?? row.rate
        return { ...row, rate, baseRate: rate, amount: calcAmount(row.qty, rate, row.discountPct) }
      }),
    )
  }, [selectedCustomer?.priceTier, defaultPriceTier])

  function addRow() {
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, amount: 0, discountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', uom: 'Unidad', conversionFactor: 1 }])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const taxTotal = items.reduce((s, i) => s + (i.amount * i.salesTaxPct / 100), 0)
  const total = subtotal + taxTotal

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)

    if (!customerId) {
      toast.error('Selecciona un cliente')
      return
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un artículo')
      return
    }
    if (ncfType === 'B01' && !selectedCustomer?.rnc) {
      toast.error('El cliente necesita RNC para comprobante B01 (Crédito Fiscal)')
      return
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.itemCode) continue
      const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
      const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
      const priceLimit = maxDiscFromPrices(item.rate, item._prices)
      const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
      if (item.discountPct > effectiveLimit) {
        toast.error(`Línea ${i + 1}: el descuento supera el límite de ${effectiveLimit}%`)
        return
      }
    }

    const itemsDto = items.map((i) => ({
      itemCode: i.itemCode,
      description: i.description,
      qty: i.qty,
      rate: i.rate,
      discountPct: i.discountPct || undefined,
      uom: i.uom,
    }))

    if (isEdit) {
      updateMutation.mutate({
        customer: customerId,
        postingDate,
        dueDate,
        ncfType,
        items: itemsDto,
        notes: notes || undefined,
      })
    } else {
      createMutation.mutate({
        customer: customerId,
        postingDate,
        dueDate,
        ncfType,
        items: itemsDto,
        notes: notes || undefined,
      })
    }
  }

  const semaforoStatusClass: Record<string, string> = {
    verde: 'semaforo-verde',
    amarillo: 'semaforo-amarillo',
    rojo: 'semaforo-rojo',
  }
  const semaforoLabel: Record<string, string> = {
    verde: 'Crédito OK',
    amarillo: 'Crédito en alerta',
    rojo: 'Límite excedido',
  }

  // ── Loading skeleton while fetching existing invoice ─────────────────────
  if (isEdit && loadingInvoice) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 220, height: 24, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 180, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 280, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate(isEdit ? `/facturacion/facturas/${id}` : '/facturacion/facturas')}>
            <ArrowLeft size={14} /> {isEdit ? `Factura ${id}` : 'Facturas'}
          </a>
          <h1 className="page-title">{isEdit ? 'Editar Factura' : 'Nueva Factura'}</h1>
          {isEdit && (
            <p className="page-sub" style={{ color: 'var(--color-warning)' }}>
              Solo facturas en borrador pueden ser editadas
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Información General</h2>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                <label className="ff-label ff-required" htmlFor="customer">Cliente</label>
                <SearchSelect
                  id="customer"
                  value={customerId}
                  selectedLabel={selectedLabel}
                  onChange={(val, _opt) => {
                    setCustomerId(val)
                    if (!val) {
                      setSelectedCustomer(null)
                      setSemaforo(null)
                    } else {
                      const match = customersData?.items.find((c) => c.id === val) ?? null
                      setSelectedCustomer(match)
                    }
                  }}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={loadingCustomers}
                  placeholder="Buscar cliente…"
                  error={!customerId}
                />
                {selectedCustomer && (
                  <div style={{ marginTop: 6 }}>
                    {loadingSemaforo ? (
                      <div className="skeleton-box" style={{ width: 120, height: 20 }} />
                    ) : semaforo ? (
                      <div className={`semaforo ${semaforoStatusClass[semaforo.semaforo] ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span className="semaforo-dot" />
                        {semaforoLabel[semaforo.semaforo] ?? semaforo.semaforo}
                        {` — ${(semaforo.pctUsado ?? 0).toFixed(0)}% del límite`}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="postingDate">Fecha</label>
                <input
                  id="postingDate"
                  type="date"
                  className="ff-input"
                  value={postingDate}
                  onChange={(e) => setPostingDate(e.target.value)}
                  required
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="dueDate">Fecha vencimiento</label>
                <input
                  id="dueDate"
                  type="date"
                  className="ff-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="ncfType">Tipo NCF</label>
                <select
                  id="ncfType"
                  className="ff-select"
                  value={ncfType}
                  onChange={(e) => setNcfType(e.target.value as NcfType)}
                >
                  {NCF_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {ncfType === 'B01' && !selectedCustomer?.rnc && (
                  <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                    B01 requiere RNC del cliente
                  </p>
                )}
              </div>
            </div>

            {semaforo?.semaforo === 'rojo' && (
              <div className="inline-alert inline-alert-warn" style={{ marginTop: 12 }}>
                El cliente ha excedido su límite de crédito ${(semaforo.pctUsado ?? 0).toFixed(1)}% utilizado).
                Considera revisar el saldo pendiente antes de emitir esta factura.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Artículos</h2>
          </div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Artículo</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Impuesto</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 56 }}>UDM</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                      No hay artículos. Agrega uno con el botón de abajo.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={index}>
                      <td style={{ minWidth: 200 }}>
                        <ItemSelect
                          value={item.itemCode}
                          selectedLabel={item.itemLabel}
                          onSelect={(catalogItem) => selectCatalogItem(index, catalogItem)}
                          onClear={() => clearCatalogItem(index)}
                          onVariantSelect={(t) => setVariantTemplate(t)}
                          validateStock
                        />
                      </td>
                      <td>
                        <input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" />
                      </td>
                      <td>
                        <input className="items-input" type="number" min="0" step="1" value={item.qty} onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="items-input" type="number" min="0" step="0.01" value={item.rate} disabled style={{ textAlign: 'right' }} />
                      </td>
                      <td>
                        {(() => {
                          const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
                          const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
                          const priceLimit = maxDiscFromPrices(item.rate, item._prices)
                          const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
                          return (
                            <>
                              <input className={`items-input${item.discountPct > effectiveLimit ? ' items-input-error' : ''}`} type="number" min="0" max="100" step="0.1" value={item.discountPct} onChange={(e) => updateItem(index, { discountPct: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right', width: 56 }} />
                              {effectiveLimit < 100 && (
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  máx {effectiveLimit.toFixed(2)}%
                                </span>
                              )}
                              {item.discountPct > effectiveLimit && (
                                <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  Supera el límite de {effectiveLimit.toFixed(2)}%
                                </span>
                              )}
                            </>
                          )
                        })()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {item.salesTaxPct > 0 ? (
                          <span className="td-muted" style={{ fontSize: 12 }}>
                            {item.salesTaxPct}%
                          </span>
                        ) : (
                          <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                      <td>
                        <UomSelect
                          value={item.uom}
                          onChange={(v, factor) => {
                            const newRate = Math.round(item.baseRate * factor * 10000) / 10000
                            updateItem(index, { uom: v, rate: newRate, conversionFactor: factor })
                          }}
                          itemCode={item.itemCode || undefined}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeRow(index)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}>
                <Plus size={14} /> Agregar artículo
              </button>
            </div>
            <div className="items-total-row">
              {/* <div className="items-total-line">
                <span>Subtotal bruto</span>
                <span>{formatDOP(grossTotal)}</span>
              </div> */}
              {totalDiscount > 0 && (
                <div className="items-total-line" style={{ color: 'var(--text-danger)' }}>
                  <span>Descuento total</span>
                  <span>-{formatDOP(totalDiscount)}</span>
                </div>
              )}
              <div className="items-total-line">
                <span>Subtotal neto</span>
                <span>{formatDOP(subtotal)}</span>
              </div>
              {taxTotal > 0 && (
                <div className="items-total-line" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  <span>Impuesto</span>
                  <span>{formatDOP(taxTotal)}</span>
                </div>
              )}
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                <span>Total</span>
                <span>{formatDOP(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Notas</h2>
          </div>
          <div className="card-body">
            <textarea
              className="ff-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones, términos de pago, instrucciones especiales..."
              rows={3}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(isEdit ? `/facturacion/facturas/${id}` : '/facturacion/facturas')}
          >
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={15} />}
            {isEdit ? 'Guardar Cambios' : 'Guardar Borrador'}
          </button>
        </div>
      </form>

      <PinModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onAuthorized={(userId) => {
          client.defaults.headers.common['X-Admin-Pin'] = userId
          setPinModalOpen(false)
          const itemsDto = items.map((i) => ({
            itemCode: i.itemCode, description: i.description, qty: i.qty, rate: i.rate,
            discountPct: i.discountPct || undefined, uom: i.uom,
          }))
          if (isEdit) updateMutation.mutate({ customer: customerId, postingDate, dueDate, ncfType, items: itemsDto, notes: notes || undefined })
          else createMutation.mutate({ customer: customerId, postingDate, dueDate, ncfType, items: itemsDto, notes: notes || undefined })
        }}
        title="Autorización requerida"
        description="El descuento supera tu límite. Ingresa el PIN de un administrador."
      />

      {variantTemplate && (
        <VariantsModal
          templateItem={variantTemplate}
          onConfirm={onVariantConfirm}
          onClose={() => setVariantTemplate(null)}
        />
      )}
    </div>
  )
}
