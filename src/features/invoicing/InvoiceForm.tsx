import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createInvoice } from '@/shared/api/invoices'
import { listCustomers } from '@/shared/api/customers'
import { client } from '@/shared/api/client'
import { listItems, getDefaultPriceTier } from '@/shared/api/catalog'
import type { CreateInvoiceDto, Customer, SemaforoEntry, SemaforoResult, Item, ItemPrices, Bundle } from '@/shared/api/types'
import { ENDPOINTS } from '@/shared/api/endpoints'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Eye, Loader2 } from 'lucide-react'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
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
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import { getUser } from '@/shared/api/storage'

const SYSTEM_MANAGER_ROLE = 'System Manager'


type NcfType = 'B01' | 'B02' | 'B14' | 'B15' | 'B16'

interface LineItem {
  itemCode: string
  itemLabel?: string
  itemType?: 'product' | 'service' | 'combo'
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
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)
  const [viewItemCode, setViewItemCode] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [branch, setBranch] = useState('')
  const [ncfTypeSearch, setNcfTypeSearch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')

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

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const isSystemManager = currentUser?.roles?.includes(SYSTEM_MANAGER_ROLE) ?? false
  const { data: myBranches, refetch: refetchMyBranches } = useQuery({
    queryKey: ['usuarioSucursales', currentUserEmail],
    queryFn: () => getUsuarioSucursales(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 60_000,
  })
  const { data: allSucursales } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    enabled: isSystemManager,
    staleTime: 60_000,
  })
  const branchOptions = useMemo(
    () => (isSystemManager ? (allSucursales?.items.map((s) => s.name) ?? []) : (myBranches?.branches ?? [])),
    [isSystemManager, allSucursales, myBranches],
  )

  const branchSelectOptions: SearchSelectOption[] = useMemo(() => {
    const q = branchSearch.toLowerCase()
    return branchOptions
      .filter((b) => !q || b.toLowerCase().includes(q))
      .map((b) => ({ value: b, label: b }))
  }, [branchOptions, branchSearch])

  const ncfTypeOptions: SearchSelectOption[] = useMemo(() => {
    const q = ncfTypeSearch.toLowerCase()
    return NCF_TYPES.filter((t) => !q || t.label.toLowerCase().includes(q))
  }, [ncfTypeSearch])

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  // Si solo hay una sucursal disponible, se selecciona sola y el select se bloquea.
  useEffect(() => {
    if (branchOptions.length === 1 && branch !== branchOptions[0]) setBranch(branchOptions[0])
  }, [branchOptions, branch])

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

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
      navigate(`/facturas/${invoice.id}`)
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? ''
      if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) { setPinModalOpen(true); return }
      if (msg.toLowerCase().includes('no tienes acceso a la sucursal')) {
        refetchMyBranches()
        toast.error(`${msg} Tus sucursales asignadas se actualizaron, vuelve a intentar.`)
        return
      }
      toast.error(msg || 'Error al crear la factura')
    },
  })

  const isSaving = createMutation.isPending

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
          itemType: catalogItem.type,
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
    updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, discountPct: 0, salesTaxPct: 0, salesTaxTemplate: '' })
  }

  function selectBundle(index: number, bundle: Bundle) {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const tier = selectedCustomer?.priceTier ?? defaultPriceTier ?? 'B'
        const baseRate = bundle.prices?.[tier] ?? 0
        return {
          ...row,
          itemCode: bundle.id,
          itemLabel: bundle.itemName,
          itemType: 'combo',
          description: bundle.itemName,
          rate: baseRate,
          baseRate,
          amount: calcAmount(row.qty, baseRate, row.discountPct),
          uom: '',
          conversionFactor: 1,
          maxDiscountPct: undefined,
          _prices: bundle.prices,
          salesTaxPct: 0,
          salesTaxTemplate: '',
        }
      }),
    )
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
          itemType: s.item.type,
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

    createMutation.mutate({
      customer: customerId,
      postingDate,
      dueDate,
      branch: branch || undefined,
      ncfType,
      items: itemsDto,
      notes: notes || undefined,
    })
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

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/facturas')}>
            <ArrowLeft size={14} /> Facturas
          </a>
          <h1 className="page-title">Nueva Factura</h1>
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
                <SearchSelect
                  id="ncfType"
                  value={ncfType}
                  selectedLabel={NCF_TYPES.find((t) => t.value === ncfType)?.label ?? ''}
                  onChange={(val) => setNcfType((val || 'B02') as NcfType)}
                  options={ncfTypeOptions}
                  onSearch={setNcfTypeSearch}
                  className="ff-select"
                />
                {ncfType === 'B01' && !selectedCustomer?.rnc && (
                  <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                    B01 requiere RNC del cliente
                  </p>
                )}
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="branch">Sucursal</label>
                <SearchSelect
                  id="branch"
                  value={branch}
                  selectedLabel={branch}
                  onChange={(val) => setBranch(val)}
                  options={branchSelectOptions}
                  onSearch={setBranchSearch}
                  placeholder="Sin especificar"
                  className="ff-select"
                  disabled={branchOptions.length === 1}
                />
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
                          onSelectBundle={(b) => selectBundle(index, b)}
                          includeBundles
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
                        {item.itemType === 'service' || item.itemType === 'combo' ? (
                          <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                        ) : (
                          <UomSelect
                            value={item.uom}
                            onChange={(v, factor) => {
                              const newRate = Math.round(item.baseRate * factor * 10000) / 10000
                              updateItem(index, { uom: v, rate: newRate, conversionFactor: factor })
                            }}
                            itemCode={item.itemCode || undefined}
                          />
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                        <ActionsMenu>
                          <ActionsMenuItem
                            onClick={() => setViewItemCode(item.itemCode)}
                            disabled={!item.itemCode}
                          >
                            <Eye size={14} /> Ver detalle
                          </ActionsMenuItem>
                          <ActionsMenuItem danger onClick={() => removeRow(index)}>
                            <Trash2 size={14} /> Eliminar
                          </ActionsMenuItem>
                        </ActionsMenu>
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
              {/*<div className="items-total-line">
                <span>Subtotal neto</span>
                <span>{formatDOP(subtotal)}</span>
              </div>*/}
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
            onClick={() => navigate('/facturas')}
          >
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={15} />}
            Guardar Borrador
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
          createMutation.mutate({ customer: customerId, postingDate, dueDate, branch: branch || undefined, ncfType, items: itemsDto, notes: notes || undefined })
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

      {viewItemCode && (
        <ItemDetailModal itemCode={viewItemCode} onClose={() => setViewItemCode(null)} />
      )}
    </div>
  )
}
