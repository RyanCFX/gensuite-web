import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createQuotation, updateQuotation, getQuotation, getQuotationDuplicateSource } from '@/shared/api/quotations'
import { listCustomers, getCustomer } from '@/shared/api/customers'
import { getDefaultPriceTier } from '@/shared/api/catalog'
import { listImpuestosVentas, listAlmacenes } from '@/shared/api/config'
import type { CreateQuotationDto, ItemPrices, Bundle } from '@/shared/api/types'
import type { Item } from '@/shared/api/types'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { formatDOP, displayId } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Eye, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { PinModal } from '@/components/shared/PinModal'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems } from '@/shared/api/catalog'
import { client } from '@/shared/api/client'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import { getUser } from '@/shared/api/storage'

const SYSTEM_MANAGER_ROLE = 'System Manager'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  uom: string
  _prices?: ItemPrices
  maxDiscountPct?: number
  warehouse: string
  /** Stock por almacén del artículo seleccionado, para validar contra el almacén elegido en la línea */
  _stockByWarehouse?: Record<string, number>
  stockError?: string
}

function validateLineStock(row: LineItem): string | undefined {
  if (!row.warehouse || !row._stockByWarehouse) return undefined
  const available = row._stockByWarehouse[row.warehouse] ?? 0
  if (row.qty > available) {
    return `Stock insuficiente en ${row.warehouse}. Disponible: ${available}`
  }
  return undefined
}



// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultValidTill() {
  return format(addDays(new Date(), 15), 'yyyy-MM-dd')
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

// ─── Form ─────────────────────────────────────────────────────────────────────

export default function QuotationForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const duplicateId = searchParams.get('duplicate')

  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPriceTier, setCustomerPriceTier] = useState<keyof ItemPrices | undefined>(undefined)
  const [customerQuery, setCustomerQuery] = useState('')
  const [esClienteOcasional, setEsClienteOcasional] = useState(false)
  const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
  const [date, setDate] = useState(todayIso())
  const [validTill, setValidTill] = useState(defaultValidTill())
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)
  const [viewItemCode, setViewItemCode] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [branch, setBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [taxesTemplate, setTaxesTemplate] = useState('')
  const [taxesTemplateSearch, setTaxesTemplateSearch] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')

  // ── Load existing quotation when editing ─────────────────────────────────
  const { data: existingQuotation, isLoading: loadingQuotation } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => getQuotation(id!),
    enabled: isEdit,
  })

useEffect(() => {
     if (!existingQuotation || initialized) return
     setCustomerId(existingQuotation.customer)
     setCustomerName(existingQuotation.customerName)
     setDate(existingQuotation.date)
     setValidTill(existingQuotation.validTill ?? defaultValidTill())
     setItems(existingQuotation.items.map((i) => ({
       itemCode: i.itemCode,
       description: i.description,
       qty: i.qty,
       rate: i.rate,
       amount: i.amount,
       discountPct: i.discountPct ?? 0,
       salesTaxPct: 0,
       salesTaxTemplate: '',
       uom: i.uom,
       warehouse: '',
     })))
     setNotes(existingQuotation.notes ?? '')
     setBranch(existingQuotation.branch ?? '')
     if (existingQuotation.esClienteOcasional) {
       setEsClienteOcasional(true)
       setClienteOcasionalNombre(existingQuotation.clienteOcasionalNombre ?? '')
     }
     setInitialized(true)
   }, [existingQuotation, initialized])

  // ── Duplicar: precargar desde una cotización existente (no crea nada) ────
  const { data: duplicateSource } = useQuery({
    queryKey: ['quotation-duplicate-source', duplicateId],
    queryFn: () => getQuotationDuplicateSource(duplicateId!),
    enabled: !isEdit && !!duplicateId,
  })

  const { data: duplicateCustomer } = useQuery({
    queryKey: ['customer', duplicateSource?.customer],
    queryFn: () => getCustomer(duplicateSource!.customer),
    enabled: !isEdit && !!duplicateSource?.customer,
  })

  useEffect(() => {
    if (isEdit || !duplicateSource || initialized) return
    setCustomerId(duplicateSource.customer)
    setItems(duplicateSource.items.map((i) => ({
      itemCode: i.itemCode,
      description: i.description ?? '',
      qty: i.qty,
      rate: i.rate,
      amount: calcAmount(i.qty, i.rate, i.discountPct ?? 0),
      discountPct: i.discountPct ?? 0,
      salesTaxPct: 0,
      salesTaxTemplate: '',
      uom: i.uom ?? 'Unidad',
      warehouse: '',
    })))
    setNotes(duplicateSource.notes ?? '')
    setInitialized(true)
  }, [duplicateSource, isEdit, initialized])

  useEffect(() => {
    if (!duplicateCustomer) return
    setCustomerName(duplicateCustomer.customerName)
    setCustomerPriceTier(duplicateCustomer.priceTier)
  }, [duplicateCustomer])

  // ── Barcode scanner ───────────────────────────────────────────────────────
  useBarcodeScanner({
    onBarcode: async (code) => {
      if (!branch) {
        toast.error('Debe seleccionar una sucursal antes de agregar artículos.')
        return
      }
      const res = await listItems({ barcode: code, limit: 1, validateStock: true, branch })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      addRow()
      setTimeout(() => selectCatalogItem(items.length, item), 0)
    },
  })

  // ── Customer search ──────────────────────────────────────────────────────

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

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch && !isEdit) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  // ── Almacenes de la sucursal seleccionada (para el selector por línea) ───
  const { data: branchWarehouses } = useQuery({
    queryKey: ['almacenes', { branch }],
    queryFn: () => listAlmacenes({ branch }),
    enabled: !!branch,
    staleTime: 60_000,
  })

  // Al cambiar de sucursal, el almacén elegido en cada línea deja de ser válido
  useEffect(() => {
    setItems((prev) => prev.map((row) => (row.warehouse ? { ...row, warehouse: '', stockError: undefined } : row)))
  }, [branch])

  const warehouseSelectOptions: SearchSelectOption[] = useMemo(() => {
    const q = warehouseSearch.toLowerCase()
    return (branchWarehouses ?? [])
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => ({ value: w.id, label: w.name }))
  }, [branchWarehouses, warehouseSearch])

  function defaultWarehouse(): string {
    return branchWarehouses?.length === 1 ? branchWarehouses[0].id : ''
  }

  // Si la sucursal solo tiene un almacén, se autoselecciona en las líneas que no tengan uno.
  useEffect(() => {
    if (branchWarehouses?.length !== 1) return
    const onlyId = branchWarehouses[0].id
    setItems((prev) =>
      prev.map((row) => {
        if (!row.itemCode || row.warehouse) return row
        const updated = { ...row, warehouse: onlyId }
        updated.stockError = validateLineStock(updated)
        return updated
      }),
    )
  }, [branchWarehouses])

  // ── Impuesto del documento (Sales Taxes and Charges Template) ────────────
  const { data: taxesTemplates } = useQuery({
    queryKey: ['impuestos-ventas'],
    queryFn: listImpuestosVentas,
    staleTime: 5 * 60_000,
  })
  const taxesTemplateOptions: SearchSelectOption[] = useMemo(() => {
    const q = taxesTemplateSearch.toLowerCase()
    return (taxesTemplates ?? [])
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .map((t) => ({ value: String(t.id), label: t.title }))
  }, [taxesTemplates, taxesTemplateSearch])

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (dto: CreateQuotationDto) => createQuotation(dto),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast.success('Cotización creada correctamente')
      navigate(`/cotizaciones/${quotation.id}`)
    },
    onError: (err: { message?: string }) => {
      handleError(err)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (dto: Partial<CreateQuotationDto>) => updateQuotation(id!, dto),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['quotation', id] })
      if (quotation.id !== id) {
        toast.success(`Nueva versión creada: ${displayId(quotation.id, quotation.sequence)}`)
        navigate(`/cotizaciones/${quotation.id}`)
      } else {
        toast.success(`Versión ${quotation.sequence} guardada como historial`)
        navigate(`/cotizaciones/${quotation.id}`, { replace: true })
      }
    },
    onError: (err: { message?: string }) => {
      handleError(err)
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

function submitDto() {
     const dto: CreateQuotationDto = {
       ...(esClienteOcasional ? { clienteOcasionalNombre: clienteOcasionalNombre || undefined } : { customer: customerId }),
       date,
       validTill,
       branch: branch || undefined,
       items: items.map((i) => ({
         itemCode: i.itemCode,
         description: i.description,
         qty: i.qty,
         rate: i.rate,
         discountPct: i.discountPct || undefined,
         uom: i.uom || undefined,
         warehouse: i.warehouse || undefined,
       })),
       notes: notes || undefined,
       taxesTemplate: taxesTemplate || undefined,
     }
     if (id) updateMutation.mutate(dto)
     else createMutation.mutate(dto)
   }

  function handleError(err: { message?: string }) {
    const msg = err?.message ?? ''
    if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) {
      setPinModalOpen(true)
      return
    }
    if (msg.toLowerCase().includes('no tienes acceso a la sucursal')) {
      refetchMyBranches()
      toast.error(`${msg} Tus sucursales asignadas se actualizaron, vuelve a intentar.`)
      return
    }
    toast.error(msg || 'Error al guardar la cotización')
  }

  // ── Line item helpers ────────────────────────────────────────────────────

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, ...patch }
        if ('qty' in patch || 'rate' in patch || 'discountPct' in patch) {
          updated.amount = calcAmount(updated.qty, updated.rate, updated.discountPct)
        }
        if ('qty' in patch || 'warehouse' in patch) {
          updated.stockError = validateLineStock(updated)
        }
        return updated
      }),
    )
  }

  function updateWarehouse(index: number, warehouse: string) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const available = item._stockByWarehouse?.[warehouse]
        const qty = available != null ? Math.min(item.qty, available) : item.qty
        const updated = { ...item, warehouse, qty, amount: calcAmount(qty, item.rate, item.discountPct) }
        updated.stockError = validateLineStock(updated)
        return updated
      }),
    )
  }

  function onVariantConfirm(selections: VariantSelection[]) {
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
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
          amount: calcAmount(s.qty, rate, 0),
          discountPct: 0,
          salesTaxPct: s.item.salesTaxPct ?? 0,
          salesTaxTemplate: s.item.salesTaxTemplate ?? '',
          uom: s.item.stockUom ?? 'Unidad',
          maxDiscountPct: s.item.allowsDiscount ? s.item.maxDiscountPct : undefined,
          _prices: s.item.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: s.item.stockByWarehouse,
        }
      }),
    ])
    setVariantTemplate(null)
  }

  function selectCatalogItem(index: number, catalogItem: Item) {
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const rate = catalogItem.prices?.[tier] ?? catalogItem.standardRate ?? 0
        return {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          itemType: catalogItem.type,
          description: catalogItem.internalDescription ?? catalogItem.itemName,
          rate,
          amount: calcAmount(row.qty, rate, row.discountPct),
          maxDiscountPct: catalogItem.allowsDiscount ? catalogItem.maxDiscountPct : undefined,
          uom: catalogItem.stockUom ?? row.uom,
          _prices: catalogItem.prices,
          salesTaxPct: catalogItem.salesTaxPct ?? 0,
          salesTaxTemplate: catalogItem.salesTaxTemplate ?? '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: catalogItem.stockByWarehouse,
          stockError: undefined,
        }
      }),
    )
  }

  function selectBundle(index: number, bundle: Bundle) {
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const rate = bundle.prices?.[tier] ?? 0
        return {
          ...row,
          itemCode: bundle.id,
          itemLabel: bundle.itemName,
          itemType: 'combo',
          description: bundle.itemName,
          rate,
          amount: calcAmount(row.qty, rate, row.discountPct),
          maxDiscountPct: undefined,
          uom: bundle.itemUom ?? '',
          _prices: bundle.prices,
          salesTaxPct: 0,
          salesTaxTemplate: '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: undefined,
          stockError: undefined,
        }
      }),
    )
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, discountPct: 0, salesTaxPct: 0, salesTaxTemplate: '' })
  }

  // ── Reprice on customer change ───────────────────────────────────────────
  useEffect(() => {
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    setItems((prev) =>
      prev.map((row) => {
        if (!row._prices) return row
        const rate = row._prices[tier] ?? row.rate
        return { ...row, rate, amount: calcAmount(row.qty, rate, row.discountPct) }
      }),
    )
  }, [customerPriceTier, defaultPriceTier])

  function addRow() {
    if (!branch) {
      toast.error('Debe seleccionar una sucursal antes de agregar artículos.')
      return
    }
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, amount: 0, discountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', uom: 'Unidad', warehouse: '' }])
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

if (esClienteOcasional) {
       if (!clienteOcasionalNombre.trim()) {
         toast.error('Ingresa el nombre del cliente ocasional')
         return
       }
     } else {
       if (!customerId) {
         toast.error('Selecciona un cliente')
         return
       }
     }
    if (items.length === 0) {
      toast.error('Agrega al menos un artículo')
      return
    }

    for (let i = 0; i < items.length; i++) {
      const row = items[i]
      const num = i + 1
      if (!row.qty || row.qty <= 0) {
        toast.error(`Artículo #${num}: la cantidad es requerida`)
        return
      }
      if (!row.rate || row.rate <= 0) {
        toast.error(`Artículo #${num}: el precio unitario es requerido`)
        return
      }
      if (row.itemType !== 'service' && row.itemType !== 'combo' && !row.uom) {
        toast.error(`Artículo #${num}: la unidad (UDM) es requerida`)
        return
      }
      const itemMax = row.maxDiscountPct && row.maxDiscountPct > 0 ? row.maxDiscountPct : 100
      const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
      const priceLimit = maxDiscFromPrices(row.rate, row._prices)
      const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
      if (row.discountPct > effectiveLimit) {
        toast.error(`Artículo #${num}: el descuento supera el límite de ${effectiveLimit}%`)
        return
      }
      if (row.stockError) {
        toast.error(`Artículo #${num}: ${row.stockError}`)
        return
      }
    }

    submitDto()
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (isEdit && loadingQuotation) {
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
          <a className="page-back-link" onClick={() => navigate('/cotizaciones')}>
            <ArrowLeft size={14} /> Cotizaciones
          </a>
          <h1 className="page-title">{id ? 'Editar Cotización' : 'Nueva Cotización'}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* ── Información General ─────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Información General</h2>
          </div>
          <div className="card-body">
            <div className="form-row form-row-3">
<div className="ff-wrap">
                 <label className="ff-label ff-required" htmlFor="customer">Cliente</label>
                 {esClienteOcasional ? (
                   <input
                     id="customer"
                     className="ff-input"
                     value={clienteOcasionalNombre}
                     onChange={(e) => setClienteOcasionalNombre(e.target.value)}
                     placeholder="Nombre del cliente ocasional"
                     required={esClienteOcasional}
                   />
                 ) : (
                   <SearchSelect
                     id="customer"
                     value={customerId}
                     onChange={(id, opt) => {
                       const cid = id === '' ? '' : (opt?.value ?? id)
                       setCustomerId(cid)
                       setCustomerName(opt?.label ?? '')
                       const c = cid && customersData?.items?.find((c) => c.id === cid)
                       setCustomerPriceTier(c?.priceTier)
                     }}
                     options={customerOptions}
                     selectedLabel={customerName}
                     onSearch={setCustomerQuery}
                     loading={loadingCustomers}
                     placeholder="Buscar cliente…"
                     error={!customerId}
                   />
                 )}
               </div>
               <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                   <input type="checkbox" checked={esClienteOcasional} onChange={(e) => { setEsClienteOcasional(e.target.checked); if (e.target.checked) setCustomerId('') }} />
                   Venta ocasional (cliente no registrado)
                 </label>
                 {esClienteOcasional && (
                   <p className="ff-hint" style={{ marginTop: 4 }}>
                     Ingresa el nombre del cliente. No se requiere RUC/Cédula para cotizaciones.
                   </p>
                 )}
               </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="date">Fecha</label>
                <input
                  id="date"
                  type="date"
                  className="ff-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="validTill">Válida hasta</label>
                <input
                  id="validTill"
                  type="date"
                  className="ff-input"
                  value={validTill}
                  onChange={(e) => setValidTill(e.target.value)}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="branch">Sucursal</label>
                <SearchSelect
                  id="branch"
                  value={branch}
                  selectedLabel={branch}
                  error={!branch}
                  onChange={(val) => setBranch(val)}
                  options={branchSelectOptions}
                  onSearch={setBranchSearch}
                  placeholder="Sin especificar"
                  className="ff-select"
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="taxesTemplate">Impuesto del Documento</label>
                <SearchSelect
                  id="taxesTemplate"
                  value={taxesTemplate}
                  onChange={(val) => setTaxesTemplate(val)}
                  options={taxesTemplateOptions}
                  onSearch={setTaxesTemplateSearch}
                  selectedLabel={taxesTemplates?.find((t) => String(t.id) === taxesTemplate)?.title ?? ''}
                  placeholder="Usar el default de la compañía"
                />
                <p className="ff-hint">Impuesto aplicado al total del documento (ej. ITBIS 18%). Si no eliges ninguno, se usa el template marcado como default, si existe.</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Artículos ───────────────────────────────────────────────────── */}
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
                  <th style={{ textAlign: 'right', width: 80 }}>Dto. %</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Impuesto</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 72 }}>UDM</th>
                  <th style={{ width: 140 }}>Almacén</th>
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
                      {/* Artículo — SearchSelect por catálogo */}
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
                          branch={branch || undefined}
                        />
                      </td>

                      {/* Descripción — editable, pre-llenada al seleccionar ítem */}
                      <td>
                        <input
                          className="items-input"
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder="Descripción del servicio o artículo"
                        />
                      </td>

                      <td>
                        <input
                          className={`items-input${(submitted && (!item.qty || item.qty <= 0)) || item.stockError ? ' items-input-error' : ''}`}
                          type="number"
                          min="0"
                          step="1"
                          value={item.qty}
                          onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })}
                          style={{ textAlign: 'right' }}
                        />
                        {item.stockError && (
                          <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                            {item.stockError}
                          </span>
                        )}
                      </td>

                      <td>
                        <input
                          className={`items-input${submitted && (!item.rate || item.rate <= 0) ? ' items-input-error' : ''}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          disabled
                          style={{ textAlign: 'right' }}
                        />
                      </td>

                      {/* Descuento */}
                      <td>
                        {(() => {
                          const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
                          const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
                          const priceLimit = maxDiscFromPrices(item.rate, item._prices)
                          const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
                          return (
                            <>
                              <input
                                className={`items-input${submitted && item.discountPct > effectiveLimit ? ' items-input-error' : ''}`}
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={item.discountPct}
                                onChange={(e) => updateItem(index, { discountPct: parseFloat(e.target.value) || 0 })}
                                style={{ textAlign: 'right', width: 64 }}
                              />
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
                            onChange={(v) => updateItem(index, { uom: v })}
                            itemCode={item.itemCode || undefined}
                            error={submitted && !item.uom}
                          />
                        )}
                      </td>

                      <td>
                        <SearchSelect
                          value={item.warehouse}
                          onChange={(val) => updateWarehouse(index, val)}
                          options={warehouseSelectOptions}
                          onSearch={setWarehouseSearch}
                          selectedLabel={branchWarehouses?.find((w) => w.id === item.warehouse)?.name ?? ''}
                          placeholder="Almacén por defecto"
                          disabled={!item.itemCode}
                        />
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
            <div className="items-total-line">
                <span>Subtotal bruto</span>
                <span>{formatDOP(grossTotal)}</span>
              </div>

              {totalDiscount > 0 && (
                <div className="items-total-line" style={{ color: 'var(--text-danger)' }}>
                  <span>Descuento total</span>
                  <span>-{formatDOP(totalDiscount)}</span>
                </div>
              )}

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

        {/* ── Notas ───────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Notas</h2>
          </div>
          <div className="card-body">
            <textarea
              className="ff-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones comerciales, términos de entrega, observaciones..."
              rows={3}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/cotizaciones')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={15} />}
            Guardar Borrador
          </button>
        </div>
      </form>

      <PinModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onAuthorized={(userId) => { client.defaults.headers.common['X-Admin-Pin'] = userId; setPinModalOpen(false); submitDto() }}
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
