import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { createInvoice, updateInvoice, getInvoice } from '@/shared/api/invoices'
import { listCustomers } from '@/shared/api/customers'
import { client } from '@/shared/api/client'
import { listImpuestosVentas } from '@/shared/api/config'
import { getItemStock } from '@/shared/api/catalog'
import type { CreateInvoiceDto, UpdateInvoiceDto, Customer, SemaforoEntry, SemaforoResult, ItemStock } from '@/shared/api/types'
import { ENDPOINTS } from '@/shared/api/endpoints'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { NCF_TYPES } from '@/lib/constants'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import type { Item } from '@/shared/api/types'

type NcfType = 'B01' | 'B02' | 'B14' | 'B15' | 'B16'

interface LineItem {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  amount: number
  /** Precio base al stockUom — se usa para recalcular al cambiar UOM */
  baseRate: number
  uom: string
  warehouse: string
  /** Snapshot del stock por almacén al momento de seleccionar el artículo */
  stock?: ItemStock
  /** Factor de conversión activo (UOM seleccionada / stockUom) */
  conversionFactor: number
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultDueDate() {
  return format(addDays(new Date(), 30), 'yyyy-MM-dd')
}

// fallback rate used only when no template is selected
const ITBIS_RATE = 0.18

function calcAmount(qty: number, rate: number) {
  return Math.round(qty * rate * 100) / 100
}

// ─── WarehouseSelect — SearchSelect con filtrado local ────────────────────────
interface WarehouseSelectProps {
  value: string
  options: SearchSelectOption[]
  onChange: (value: string) => void
}
function WarehouseSelect({ value, options, onChange }: WarehouseSelectProps) {
  const [query, setQuery] = useState('')
  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <SearchSelect
      value={value}
      options={filtered}
      onSearch={setQuery}
      onChange={(val) => onChange(val)}
      placeholder="Buscar almacén…"
      className="items-input"
    />
  )
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
  const [taxesAndCharges, setTaxesAndCharges] = useState<string>('')

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
        uom: i.uom,
        warehouse: i.warehouse ?? '',
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

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  // ── Tax templates ─────────────────────────────────────────────────────────
  const { data: taxTemplates } = useQuery({
    queryKey: ['impuestos-ventas'],
    queryFn: listImpuestosVentas,
    staleTime: 5 * 60 * 1000,
  })

  // Auto-select default template on first load
  useEffect(() => {
    if (taxTemplates && !taxesAndCharges) {
      const def = taxTemplates.find((t) => t.isDefault)
      if (def) setTaxesAndCharges(def.id)
    }
  }, [taxTemplates])

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
      toast.error(err?.message ?? 'Error al crear la factura')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (dto: UpdateInvoiceDto) => updateInvoice(id!, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      toast.success('Factura actualizada')
      navigate(`/facturacion/facturas/${id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al actualizar la factura')
    },
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  // ── Line item helpers ─────────────────────────────────────────────────────
  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, ...patch }
        if ('qty' in patch || 'rate' in patch) {
          updated.amount = calcAmount(updated.qty, updated.rate)
        }
        return updated
      }),
    )
  }

  async function selectCatalogItem(index: number, catalogItem: Item) {
    // Fetch stock in parallel with state update
    let stock: ItemStock | undefined
    try {
      stock = await getItemStock(catalogItem.id)
    } catch {
      stock = undefined
    }

    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const baseRate = catalogItem.standardRate ?? 0
        return {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          description: catalogItem.description ?? catalogItem.itemName,
          rate: baseRate,
          baseRate,
          amount: calcAmount(row.qty, baseRate),
          uom: catalogItem.salesUom ?? catalogItem.stockUom ?? row.uom,
          warehouse: '',
          stock,
          conversionFactor: 1,
        }
      }),
    )
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, description: '', rate: 0, amount: 0 })
  }

  function addRow() {
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, amount: 0, uom: 'Unidad', warehouse: '', conversionFactor: 1 }])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const selectedTemplate = taxTemplates?.find((t) => t.id === taxesAndCharges) ?? null
  const taxRate = selectedTemplate
    ? selectedTemplate.taxes
        .filter((l) => l.chargeType === 'On Net Total')
        .reduce((s, l) => s + l.rate, 0) / 100
    : ITBIS_RATE
  const itbis = Math.round(subtotal * taxRate * 100) / 100
  const total = subtotal + itbis
  const taxLabel = selectedTemplate
    ? selectedTemplate.taxes[0]?.description || selectedTemplate.title
    : 'ITBIS (18%)'
  const taxPct = Math.round(taxRate * 100)

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

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

    // Validar almacén seleccionado y stock disponible
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.itemCode) continue
      if (!item.warehouse) {
        toast.error(`Línea ${i + 1}: selecciona un almacén`)
        return
      }
      if (item.stock) {
        const whEntry = item.stock.warehouses.find(w => w.warehouse === item.warehouse)
        const availableQty = whEntry?.qty ?? 0
        // La cantidad ingresada está en la UOM seleccionada; convertir a stockUom para comparar
        const qtyInStockUom = item.qty * item.conversionFactor
        if (qtyInStockUom > availableQty) {
          const disponible = (availableQty / item.conversionFactor).toFixed(4).replace(/\.?0+$/, '')
          toast.error(`Línea ${i + 1} (${item.itemLabel ?? item.itemCode}): stock insuficiente en "${item.warehouse}". Disponible: ${disponible} ${item.uom}`)
          return
        }
      }
    }

    const itemsDto = items.map((i) => ({
      itemCode: i.itemCode,
      description: i.description,
      qty: i.qty,
      rate: i.rate,
      uom: i.uom,
      warehouse: i.warehouse || undefined,
    }))

    if (isEdit) {
      updateMutation.mutate({
        customer: customerId,
        postingDate,
        dueDate,
        ncfType,
        taxesAndCharges: taxesAndCharges || undefined,
        items: itemsDto,
        notes: notes || undefined,
      })
    } else {
      createMutation.mutate({
        customer: customerId,
        postingDate,
        dueDate,
        ncfType,
        taxesAndCharges: taxesAndCharges || undefined,
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
                  <th style={{ width: 160 }}>Almacén</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 56 }}>UDM</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
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
                        />
                      </td>
                      <td>
                        <input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" />
                      </td>
                      <td>
                        {(() => {
                          const whOptions: SearchSelectOption[] = item.stock
                            ? item.stock.warehouses.map((w) => {
                                const avail = (w.qty / item.conversionFactor).toFixed(2).replace(/\.?0+$/, '')
                                return { value: w.warehouse, label: w.warehouse, sublabel: `${avail} ${item.uom} disp.` }
                              })
                            : []
                          const whEntry = item.stock?.warehouses.find(w => w.warehouse === item.warehouse)
                          const available = whEntry ? whEntry.qty / item.conversionFactor : null
                          const overStock = available !== null && item.qty > available
                          return (
                            <div>
                              <WarehouseSelect
                                value={item.warehouse}
                                options={whOptions}
                                onChange={(val) => updateItem(index, { warehouse: val })}
                              />
                              {overStock && (
                                <span style={{ fontSize: 11, color: 'var(--color-danger)', display: 'block', marginTop: 2 }}>
                                  Disp: {available!.toFixed(2).replace(/\.?0+$/, '')} {item.uom}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td>
                        <input className="items-input" type="number" min="0" step="1" value={item.qty} onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="items-input" type="number" min="0" step="0.01" value={item.rate} onChange={(e) => updateItem(index, { rate: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
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
              {/* Tax template selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Plantilla de impuesto</span>
                <select
                  className="ff-select"
                  style={{ fontSize: 12, padding: '3px 8px', flex: 1 }}
                  value={taxesAndCharges}
                  onChange={(e) => setTaxesAndCharges(e.target.value)}
                >
                  <option value="">— Sin impuesto —</option>
                  {taxTemplates?.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                {taxTemplates?.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    No hay templates. <a href="/config/impuestos-ventas" style={{ color: 'var(--color-brand)' }}>Configurar</a>
                  </span>
                )}
              </div>
              <div className="items-total-line">
                <span>Subtotal</span>
                <span>{formatDOP(subtotal)}</span>
              </div>
              {taxesAndCharges && (
                <div className="items-total-line">
                  <span>{taxLabel} ({taxPct}%)</span>
                  <span>{formatDOP(itbis)}</span>
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
    </div>
  )
}
