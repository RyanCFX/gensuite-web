import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTabs } from '@/contexts/TabsContext'
import { createPedido, updatePedido, getPedido, getPedidoDuplicateSource } from '@/shared/api/pedidos'
import { listCustomers, getCustomer } from '@/shared/api/customers'
import { getQuotation } from '@/shared/api/quotations'
import { getLayawayConfig, listAlmacenes, getFacturacionConfig } from '@/shared/api/config'
import type { Item, ItemPrices, CreatePedidoDto, Bundle, Customer } from '@/shared/api/types'
import { CustomerQuickCreateModal } from '@/features/customers/CustomerQuickCreateModal'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { UomSelect } from '@/shared/ui/UomSelect'
import { formatDOP, round2 } from '@/lib/formatters'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ArrowLeft, Save, Plus, Trash2, Eye, Loader2, PackageOpen, UserPlus } from 'lucide-react'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { PinModal } from '@/components/shared/PinModal'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems, getDefaultPriceTier } from '@/shared/api/catalog'
import { client, isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import { getUser } from '@/shared/api/storage'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'

const SYSTEM_MANAGER_ROLE = 'System Manager'

interface LineItem {
  itemCode: string
  itemLabel?: string
  itemType?: 'product' | 'service' | 'combo'
  description: string
  qty: number
  rate: number
  amount: number
  discountPct: number
  uom: string
  conversionFactor: number
  maxDiscountPct?: number
  _prices?: ItemPrices
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

function todayIso() { return format(new Date(), 'yyyy-MM-dd') }
function defaultDelivery() { return format(addDays(new Date(), 7), 'yyyy-MM-dd') }
function calcAmount(qty: number, rate: number, discountPct: number = 0) {
  const base = qty * rate; const discount = base * (discountPct / 100)
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

export default function PedidoForm() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const quotationId = searchParams.get('quotation')
  const duplicateId = searchParams.get('duplicate')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()
  const isEdit = !!id

const [customerId, setCustomerId] = useState('')
   const [customerName, setCustomerName] = useState('')
   const [customerPriceTier, setCustomerPriceTier] = useState<keyof ItemPrices | undefined>(undefined)
   const [customerQuery, setCustomerQuery] = useState('')
   const [showCreateCustomer, setShowCreateCustomer] = useState(false)
   const [esClienteOcasional, setEsClienteOcasional] = useState(false)
   const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
   const [clienteOcasionalDireccion, setClienteOcasionalDireccion] = useState('')
   const [transactionDate, setTransactionDate] = useState(todayIso())
  const [deliveryDate, setDeliveryDate] = useState(defaultDelivery())
  const [items, setItems] = useState<LineItem[]>([])
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const flashRow = useCallback((index: number) => {
    rowRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => {
      setHighlightedRow(index)
      setTimeout(() => setHighlightedRow((cur) => (cur === index ? null : cur)), 2200)
    }, 400)
  }, [])
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)
  const [viewItemCode, setViewItemCode] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [isLayaway, setIsLayaway] = useState(false)
  const [branch, setBranch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true

  const { data: layawayConfig } = useQuery({
    queryKey: ['layaway-config'],
    queryFn: getLayawayConfig,
    enabled: !isEdit,
    staleTime: 5 * 60_000,
  })

  // ── Barcode scanner ───────────────────────────────────────────────────────
  useBarcodeScanner({
    onBarcode: async (code) => {
      if (!branch) {
        toast.error('Debe seleccionar una sucursal antes de agregar artículos.')
        return
      }
      const res = await listItems({ barcode: code, limit: 1, branch })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      const existingIndex = items.findIndex((row) => row.itemCode === item.id)
      if (existingIndex !== -1) {
        flashRow(existingIndex)
        return
      }
      const targetIndex = items.length
      addRow()
      setTimeout(() => {
        selectCatalogItem(targetIndex, item, { autoAddRow: false })
        addRow()
      }, 0)
    },
  })

  // Load quotation data
  useEffect(() => {
    if (!quotationId || loaded || isEdit) return
    setLoaded(true)
    getQuotation(quotationId).then((q) => {
      setCustomerId(q.customer)
      setTransactionDate(todayIso())
      setItems(q.items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description ?? '',
        qty: i.qty,
        rate: i.rate,
        amount: i.amount,
        discountPct: (i as any).discountPct ?? 0,
         uom: i.uom,
         conversionFactor: 1,
        warehouse: '',
      })))
      setNotes(q.notes ?? '')
    }).catch(() => toast.error('Error al cargar la cotización'))
  }, [quotationId, loaded, isEdit])

  // Duplicar: precargar desde un pedido existente (no crea nada en el backend)
  useEffect(() => {
    if (!duplicateId || loaded || isEdit || quotationId) return
    setLoaded(true)
    getPedidoDuplicateSource(duplicateId).then((src) => {
      setCustomerId(src.customer)
      setTransactionDate(todayIso())
      setItems(src.items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description ?? '',
        qty: i.qty,
        rate: i.rate,
        amount: calcAmount(i.qty, i.rate, i.discountPct ?? 0),
        discountPct: i.discountPct ?? 0,
         uom: 'Unidad',
         conversionFactor: 1,
         warehouse: '',
      })))
      getCustomer(src.customer).then((c) => {
        setCustomerName(c.customerName)
        setCustomerPriceTier(c.priceTier)
      }).catch(() => {})
    }).catch(() => toast.error('Error al cargar el pedido a duplicar'))
  }, [duplicateId, loaded, isEdit, quotationId])

  // Load existing pedido
  const { data: existing } = useQuery({
    queryKey: ['pedido', id],
    queryFn: () => getPedido(id!),
    enabled: isEdit,
  })

  // Con Multipestañas, esta pantalla queda montada (KeepAlive) al cambiar de pestaña — al volver
  // a ella se re-consulta por si el pedido cambió en el servidor mientras el usuario estaba en otra.
  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['pedido', id] })
  }, [isEdit, id], true)
useEffect(() => {
     if (!existing || loaded) return
     setCustomerId(existing.customer)
     setTransactionDate(existing.transactionDate)
     setDeliveryDate(existing.deliveryDate ?? defaultDelivery())
     setItems(existing.items.map((i) => ({
       itemCode: i.itemCode,
       description: i.description,
       qty: i.qty,
       rate: i.rate,
       amount: i.amount,
       discountPct: (i as any).discountPct ?? 0,
        uom: i.uom ?? 'Unidad',
        conversionFactor: 1,
       warehouse: '',
     })))
     setNotes(existing.notes ?? '')
     setBranch(existing.branch ?? '')
     setDepartment((existing as any).department ?? '')
     if (existing.esClienteOcasional) {
       setEsClienteOcasional(true)
       setClienteOcasionalNombre(existing.clienteOcasionalNombre ?? '')
       setClienteOcasionalDireccion(existing.clienteOcasionalDireccion ?? '')
     }
     setLoaded(true)
   }, [existing])

  const { data: customersData } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
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

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({ value: c.id, label: c.customerName, sublabel: c.rnc ?? c.cedula }))

  function handleCustomerCreated(customer: Customer) {
    setShowCreateCustomer(false)
    setCustomerId(customer.id)
    setCustomerName(customer.customerName)
    setCustomerPriceTier(customer.priceTier)
    queryClient.invalidateQueries({ queryKey: ['customerSearch'] })
  }

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
  const branchOptions = isSystemManager
    ? (allSucursales?.items.map((s) => s.name) ?? [])
    : (myBranches?.branches ?? [])
  const [branchSearch, setBranchSearch] = useState('')
  const branchSelectOptions: SearchSelectOption[] = branchOptions
    .filter((b) => !branchSearch || b.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((b) => ({ value: b, label: b }))

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

  function handleError(err: unknown) {
    const msg = (err as any)?.message ?? ''
    setSubmitError(msg)
    if (isApiErrorCode(err, ERROR_CODES.BRANCH_REQUIRED)) {
      setBranchError(true)
      toast.error(msg || 'Selecciona una sucursal')
      return
    }
    if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) {
      setPinModalOpen(true)
      return
    }
    if (msg.toLowerCase().includes('no tienes acceso a la sucursal')) {
      refetchMyBranches()
      toast.error(`${msg} Tus sucursales asignadas se actualizaron, vuelve a intentar.`)
      return
    }
    toast.error(msg || 'Error al guardar el pedido')
  }

  const createMutation = useMutation({
    mutationFn: (dto: CreatePedidoDto) => createPedido(dto),
    onSuccess: (p) => {
      setSubmitError(null)
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success('Pedido creado')
      navigate(`/pedidos/${p.id}`)
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (err) => handleError(err),
  })
  const updateMutation = useMutation({
    mutationFn: (dto: Partial<CreatePedidoDto>) => updatePedido(id!, dto),
    onSuccess: (result) => {
      setSubmitError(null)
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.removeQueries({ queryKey: ['pedido', id] })
      toast.success('Pedido actualizado')
      const newId = (result as any).id
      navigate(newId && newId !== id ? `/pedidos/${newId}` : `/pedidos/${id}`)
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (err) => handleError(err),
  })
  const isPending = createMutation.isPending || updateMutation.isPending

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item
      const updated = { ...item, ...patch }
      if ('qty' in patch || 'rate' in patch || 'discountPct' in patch) updated.amount = calcAmount(updated.qty, updated.rate, updated.discountPct)
      if ('qty' in patch || 'warehouse' in patch) updated.stockError = validateLineStock(updated)
      return updated
    }))
  }
  function updateWarehouse(index: number, warehouse: string) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item
      const available = item._stockByWarehouse?.[warehouse]
      const qty = available != null ? Math.min(item.qty, available) : item.qty
      const updated = { ...item, warehouse, qty, amount: calcAmount(qty, item.rate, item.discountPct) }
      updated.stockError = validateLineStock(updated)
      return updated
    }))
  }
  function selectCatalogItem(index: number, catalogItem: Item, opts?: { autoAddRow?: boolean }) {
    const autoAddRow = opts?.autoAddRow ?? true
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = index === prev.length - 1
      return prev.map((row, i) => {
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
           uom: catalogItem.stockUom ?? row.uom,
           conversionFactor: 1,
           maxDiscountPct: catalogItem.allowsDiscount ? catalogItem.maxDiscountPct : undefined,
          _prices: catalogItem.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: catalogItem.stockByWarehouse,
          stockError: undefined,
        }
      })
    })
    if (autoAddRow && wasLastRow) addRow()
  }
  function selectBundle(index: number, bundle: Bundle) {
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = index === prev.length - 1
      return prev.map((row, i) => {
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
           uom: bundle.itemUom ?? '',
           conversionFactor: 1,
           maxDiscountPct: undefined,
          _prices: bundle.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: undefined,
          stockError: undefined,
        }
      })
    })
    if (wasLastRow) addRow()
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
          uom: s.item.stockUom ?? 'Unidad',
          conversionFactor: 1,
          maxDiscountPct: s.item.allowsDiscount ? s.item.maxDiscountPct : undefined,
          _prices: s.item.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: s.item.stockByWarehouse,
        }
      }),
    ])
    setVariantTemplate(null)
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
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, amount: 0, discountPct: 0, uom: 'Unidad', conversionFactor: 1, warehouse: '' }])
  }
  function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)) }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const total = subtotal

function submitDto() {
     const itemsDto = items.map((i) => ({
       itemCode: i.itemCode,
       qty: i.qty,
       rate: i.rate,
       discountPct: i.discountPct || undefined,
       warehouse: i.warehouse || undefined,
       uom: i.uom || undefined,
     }))
     const baseDto = {
       ...(esClienteOcasional
         ? { clienteOcasionalNombre: clienteOcasionalNombre || undefined, clienteOcasionalDireccion: clienteOcasionalDireccion || undefined }
         : { customer: customerId }),
       transactionDate,
       deliveryDate: deliveryDate || undefined,
       branch: branch || undefined,
       department: usaDepartamentos ? (department || undefined) : undefined,
       items: itemsDto,
       quotation: quotationId || undefined,
       isLayaway: isLayaway || undefined,
     }
     if (isEdit) updateMutation.mutate(baseDto)
     else createMutation.mutate(baseDto)
   }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setSubmitError(null)

try {
       if (esClienteOcasional) {
         if (!clienteOcasionalNombre.trim()) { toast.error('Ingresa el nombre del cliente ocasional'); return }
       } else {
         if (!customerId) { toast.error('Selecciona un cliente'); return }
       }
       if (items.length === 0) { toast.error('Agrega al menos un artículo'); return }
      for (let i = 0; i < items.length; i++) {
        const item = items[i]; const num = i + 1
        if (!item.qty || item.qty <= 0) { toast.error(`Artículo #${num}: la cantidad es requerida`); return }
        if (!item.rate || item.rate <= 0) { toast.error(`Artículo #${num}: el precio unitario es requerido`); return }
        const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
        const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
        const priceLimit = maxDiscFromPrices(item.rate, item._prices)
        const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
        if (item.discountPct > effectiveLimit) {
          toast.error(`Línea ${num}: el descuento supera el límite de ${effectiveLimit}%`)
          return
        }
        if (item.stockError) {
          toast.error(`Línea ${num}: ${item.stockError}`)
          return
        }
      }
      submitDto()
    } catch (err) {
      setSubmitError(String(err))
      toast.error('Error inesperado al enviar el formulario')
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/pedidos')}><ArrowLeft size={14} /> Pedidos</a>
          <h1 className="page-title">{isEdit ? 'Editar Pedido' : 'Nuevo Pedido'}</h1>
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {submitError && (
          <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 6, background: 'var(--bg-danger)', border: '1px solid var(--border-danger)', color: 'var(--text-danger)' }}>
            <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>{submitError}</span>
            <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => setSubmitError(null)} style={{ flexShrink: 0 }}>✕</button>
          </div>
        )}
        <div className="card">
          <div className="card-header"><h2 className="card-title">Información General</h2></div>
          <div className="card-body">
            <div className="form-row form-row-3">
<div className="ff-wrap">
                 <label className="ff-label ff-required">Cliente</label>
                 {esClienteOcasional ? (
                   <input
                     className="ff-input"
                     value={clienteOcasionalNombre}
                     onChange={(e) => setClienteOcasionalNombre(e.target.value)}
                     placeholder="Nombre del cliente ocasional"
                     required={esClienteOcasional}
                   />
                 ) : (
                   <SearchSelect
                     value={customerId}
                     onChange={(id, opt) => {
                       const cid = id === '' ? '' : (opt?.value ?? id)
                       setCustomerId(cid)
                       setCustomerName(opt?.label ?? '')
                       const c = cid ? customersData?.items?.find((c) => c.id === cid) : undefined
                       setCustomerPriceTier(c?.priceTier)
                     }}
                     options={customerOptions}
                     selectedLabel={customerName}
                     onSearch={setCustomerQuery}
                     loading={false}
                     placeholder="Buscar cliente…"
                     error={submitted && !customerId}
                     headerContent={
                       <button
                         type="button"
                         className="btn btn-ghost btn-size-sm"
                         style={{ width: '100%', justifyContent: 'flex-start' }}
                         onClick={() => setShowCreateCustomer(true)}
                       >
                         <UserPlus size={14} /> Agregar cliente
                       </button>
                     }
                   />
                 )}
               </div>
               {esClienteOcasional && (
                 <div className="ff-wrap">
                   <label className="ff-label">Dirección</label>
                   <input
                     className="ff-input"
                     value={clienteOcasionalDireccion}
                     onChange={(e) => setClienteOcasionalDireccion(e.target.value)}
                     placeholder="Dirección del cliente ocasional (opcional)"
                   />
                 </div>
               )}

               <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                   <input type="checkbox" checked={esClienteOcasional} onChange={(e) => { setEsClienteOcasional(e.target.checked); if (e.target.checked) setCustomerId('') }} />
                   Venta ocasional (cliente no registrado)
                 </label>
                 {esClienteOcasional && (
                   <p className="ff-hint" style={{ marginTop: 4 }}>
                     Ingresa el nombre del cliente. No se requiere RUC/Cédula para pedidos.
                   </p>
                 )}
               </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Fecha</label>
                <DatePicker value={transactionDate} onChange={setTransactionDate} className="ff-input" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Entrega estimada</label>
                <DatePicker value={deliveryDate} onChange={setDeliveryDate} className="ff-input" clearable />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Sucursal</label>
                <SearchSelect
                  value={branch}
                  onChange={(val) => { setBranch(val); setBranchError(false) }}
                  options={branchSelectOptions}
                  onSearch={setBranchSearch}
                  selectedLabel={branch}
                  placeholder="Sin especificar"
                  error={!branch || branchError}
                />
              </div>
              {usaDepartamentos && (
                <div className="ff-wrap">
                  <label className="ff-label">Departamento</label>
                  <DepartmentSelect value={department} onChange={setDepartment} placeholder="Buscar departamento…" />
                </div>
              )}
            </div>

            {!isEdit && (
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={isLayaway} onChange={(e) => setIsLayaway(e.target.checked)} />
                  <PackageOpen size={14} style={{ color: 'var(--text-secondary)' }} />
                  Es un apartado (layaway)
                </label>
                {isLayaway && (
                  <p className="ff-hint" style={{ marginTop: 6 }}>
                    Al someter el pedido se reservará el stock y no se generará factura de inmediato.
                    {layawayConfig && (
                      <> Anticipo mínimo requerido: <strong>{layawayConfig.porcentajeMinimoAnticipo}%</strong> del total del pedido.</>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">Artículos</h2></div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Artículo</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 72 }}>UDM</th>
                  <th style={{ width: 140 }}>Almacén</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>No hay artículos.</td></tr>
                ) : (
                  items.map((item, index) => (
                    <tr
                      key={index}
                      ref={(el) => { rowRefs.current[index] = el }}
                      className={highlightedRow === index ? 'row-flash' : undefined}
                    >
                      <td>
                        <ItemSelect value={item.itemCode} selectedLabel={item.itemLabel} onSelect={(ci) => selectCatalogItem(index, ci)} onSelectBundle={(b) => selectBundle(index, b)} includeBundles onClear={() => updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, discountPct: 0 })} onVariantSelect={(t) => setVariantTemplate(t)} validateStock branch={branch || undefined} />
                      </td>
                      <td>
                        <input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" />
                      </td>
                      <td>
                        <input className={`items-input${(submitted && (!item.qty || item.qty <= 0)) || item.stockError ? ' items-input-error' : ''}`} type="number" min="0" step="1" value={item.qty} onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                        {item.stockError && (
                          <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                            {item.stockError}
                          </span>
                        )}
                      </td>
                      <td>
                        <input className={`items-input${submitted && (!item.rate || item.rate <= 0) ? ' items-input-error' : ''}`} type="number" min="0" step="0.01" value={round2(item.rate)} disabled style={{ textAlign: 'right' }} />
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
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount, { trimZeros: true })}</td>
                      <td>
                        {item.itemType === 'service' || item.itemType === 'combo' ? (
                          <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                        ) : (
                          <UomSelect value={item.uom} onChange={(v) => updateItem(index, { uom: v })} itemCode={item.itemCode || undefined} />
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
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}><Plus size={14} /> Agregar artículo</button>
            </div>
            <div className="items-total-row">
              <div className="items-total-line"><span>Subtotal bruto</span><span>{formatDOP(grossTotal)}</span></div>
              {totalDiscount > 0 && <div className="items-total-line" style={{ color: 'var(--text-danger)' }}><span>Descuento total</span><span>-{formatDOP(totalDiscount)}</span></div>}
              {/*<div className="items-total-line"><span>Subtotal neto</span><span>{formatDOP(subtotal)}</span></div>*/}
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}><span>Total</span><span>{formatDOP(total)}</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">Notas</h2></div>
          <div className="card-body">
            <textarea className="ff-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones, condiciones de entrega…" rows={3} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/pedidos')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            Guardar Borrador
          </button>
        </div>
      </form>

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

      {showCreateCustomer && (
        <CustomerQuickCreateModal
          onCreated={handleCustomerCreated}
          onClose={() => setShowCreateCustomer(false)}
        />
      )}

      <PinModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onAuthorized={(userId) => {
          client.defaults.headers.common['X-Admin-Pin'] = userId
          setPinModalOpen(false)
          submitDto()
        }}
        title="Autorización requerida"
        description="El descuento supera tu límite. Ingresa el PIN de un administrador."
      />
    </div>
  )
}
