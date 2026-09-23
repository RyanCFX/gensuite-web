import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'

import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTabs } from '@/contexts/TabsContext'
import { createQuotation, updateQuotation, getQuotation, getQuotationDuplicateSource } from '@/shared/api/quotations'
import { listCustomers, getCustomer } from '@/shared/api/customers'
import { getDefaultPriceTier } from '@/shared/api/catalog'
import { listImpuestosVentas, listAlmacenes, getFacturacionConfig } from '@/shared/api/config'
import type { CreateQuotationDto, ItemPrices, Bundle, Customer, MonedaCode } from '@/shared/api/types'
import type { Item } from '@/shared/api/types'
import { getTasaVigente } from '@/shared/api/monedas'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { UomSelect } from '@/shared/ui/UomSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { formatMoney, displayId, round2 } from '@/lib/formatters'
import { formatUomNotAllowedMessage } from '@/lib/stockAlerts'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { Select, SelectItem } from '@/components/ui/select'
import { ArrowLeft, Save, Plus, Trash2, Eye, Loader2, Info, UserPlus, ChevronDown, RotateCcw } from 'lucide-react'
import { CustomerQuickCreateModal } from '@/features/customers/CustomerQuickCreateModal'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { PinModal } from '@/components/shared/PinModal'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
import { isCostoCompraError } from '@/lib/pinOverride'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems } from '@/shared/api/catalog'
import { client } from '@/shared/api/client'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import { getCachedUser } from '@/shared/api/storage'
import { DatePicker } from '@/shared/ui/DatePicker'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  itemCode: string
  itemLabel?: string
  itemType?: 'product' | 'service' | 'combo'
  description: string
  qty: number
  rate: number
  /** Precio en `monedaBase` (catálogo), ya ajustado por UDM pero SIN convertir a la moneda
   *  elegida — es el anchor a partir del cual se recalcula `rate` al cambiar moneda/tasa/UDM. */
  baseRate: number
  amount: number
  discountPct: number
  salesTaxPct: number
  salesTaxTemplate: string
  uom: string
  /** UDM de venta vs. UDM de stock — 1 = misma unidad, ver `saleRate()`. */
  conversionFactor: number
  _prices?: ItemPrices
  maxDiscountPct?: number
  autoDiscountPct?: number
  manualDiscountPct: number
  /** Modo de descuento de la línea — mutuamente excluyentes, nunca se envían ambos al backend */
  discountMode: 'pct' | 'amount'
  /** Descuento fijo en RD$ — solo aplica en modo "monto fijo" */
  discountAmount: number
  allowsDiscount?: boolean
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

function calcAmount(qty: number, rate: number, discountPct: number = 0, discountAmount: number = 0) {
  const base = qty * rate
  const discount = discountAmount > 0 ? discountAmount : base * (discountPct / 100)
  return Math.round(Math.max(0, base - discount) * 100) / 100
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
  const { multiTab, activeId, closeTab } = useTabs()
  const [searchParams] = useSearchParams()
  const duplicateId = searchParams.get('duplicate')

  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPriceTier, setCustomerPriceTier] = useState<keyof ItemPrices | undefined>(undefined)
  /** % de descuento por defecto del cliente elegido — solo sugiere el valor al AGREGAR una línea
   *  nueva (selectCatalogItem/selectBundle), nunca reescribe una que el usuario ya haya tocado. */
  const [customerDefaultDiscountPct, setCustomerDefaultDiscountPct] = useState<number | undefined>(undefined)
  const [customerQuery, setCustomerQuery] = useState('')
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [esClienteOcasional, setEsClienteOcasional] = useState(false)
  const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
  const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')
  const [clienteOcasionalDireccion, setClienteOcasionalDireccion] = useState('')
  const [date, setDate] = useState(todayIso())
  const [validTill, setValidTill] = useState(defaultValidTill())
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
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [costPinModalOpen, setCostPinModalOpen] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)
  const [viewItemCode, setViewItemCode] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [branch, setBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [taxesTemplate, setTaxesTemplate] = useState('')
  const [taxesTemplateSearch, setTaxesTemplateSearch] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  // '' = automático (Cliente.defaultCurrency → moneda base). Al editar, se hidrata con la
  // moneda/tasa existente — reenviarla es equivalente a omitirla (docs/tasks/64_multimoneda_completo.md §3.2).
  const [currency, setCurrency] = useState('')
  const [conversionRate, setConversionRate] = useState<number | ''>('')

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaImpuestoDocumento = facturacionConfig?.usaImpuestoDocumento ?? true
  const multimonedaHabilitada = facturacionConfig?.multimonedaHabilitada ?? false
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'
  const monedasHabilitadas = facturacionConfig?.monedasHabilitadas ?? ['DOP']

  // Tasa vigente configurada para el par (moneda elegida → moneda base) — se autocompleta el
  // campo "Tasa de cambio" con esto la primera vez que el usuario elige una moneda distinta a la
  // base, sin pisar un valor que el usuario ya haya tocado a mano.
  const { data: tasaVigente } = useQuery({
    queryKey: ['monedas-tasa-vigente', currency, monedaBase],
    queryFn: () => getTasaVigente({ from: currency as MonedaCode, to: monedaBase as MonedaCode }),
    enabled: multimonedaHabilitada && !!currency && currency !== monedaBase,
    retry: false,
  })
  useEffect(() => {
    if (currency && currency !== monedaBase && tasaVigente && conversionRate === '') {
      setConversionRate(tasaVigente.tasa)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaVigente])

  // El catálogo (prices/standardRate) siempre está en `monedaBase` — `baseRate` guarda ese precio
  // sin tocar; `saleRate` es lo que efectivamente se cobra/muestra por línea: convertido a la
  // moneda elegida (si no es la base) y ajustado por la UDM de venta (`factor`, 1 = UDM de stock).
  function saleRate(base: number, factor: number = 1): number {
    const converted = base * factor
    const rate = currency && currency !== monedaBase && conversionRate !== '' && Number(conversionRate) > 0
      ? converted / Number(conversionRate)
      : converted
    return Math.round(rate * 10000) / 10000
  }

  // Al elegir/cambiar moneda o tasa, se reconvierten los precios de las líneas ya cargadas en esta
  // sesión (con `_prices`, es decir, elegidas desde el catálogo) — no toca líneas hidratadas de una
  // cotización existente, que ya vienen en la moneda con la que se guardaron originalmente.
  useEffect(() => {
    setItems((prev) =>
      prev.map((row) => {
        if (!row._prices || !row.itemCode) return row
        const rate = saleRate(row.baseRate, row.conversionFactor)
        const amount = row.discountMode === 'amount'
          ? calcAmount(row.qty, rate, 0, row.discountAmount)
          : calcAmount(row.qty, rate, row.discountPct)
        return { ...row, rate, amount }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, conversionRate, monedaBase])

  // ── Load existing quotation when editing ─────────────────────────────────
  const { data: existingQuotation, isLoading: loadingQuotation } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => getQuotation(id!),
    enabled: isEdit,
  })

  // Con Multipestañas, esta pantalla queda montada (KeepAlive) al cambiar de pestaña — al volver
  // a ella se re-consulta por si la cotización cambió en el servidor mientras el usuario estaba en otra.
  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['quotation', id] })
  }, [isEdit, id], true)

useEffect(() => {
     if (!existingQuotation || initialized) return
     setCustomerId(existingQuotation.customer)
     setCustomerName(existingQuotation.customerName)
     setDate(existingQuotation.date)
     setValidTill(existingQuotation.validTill ?? defaultValidTill())
     setCurrency(existingQuotation.currency ?? '')
     setConversionRate(existingQuotation.conversionRate ?? '')
      setItems(existingQuotation.items.map((i) => {
        const discountAmount = i.discountAmount ?? 0
        const discountPct = discountAmount > 0 ? 0 : (i.discountPct ?? 0)
        const discountMode: 'pct' | 'amount' = discountAmount > 0 ? 'amount' : 'pct'
        return {
          itemCode: i.itemCode,
          description: i.description ?? '',
          qty: i.qty,
          rate: i.rate,
          baseRate: i.rate,
          conversionFactor: 1,
          amount: i.amount,
          discountPct,
          discountMode,
          discountAmount,
          manualDiscountPct: discountMode === 'pct' ? discountPct : 0,
          salesTaxPct: 0,
          salesTaxTemplate: '',
          uom: i.uom,
          warehouse: '',
        }
      }))
     setNotes(existingQuotation.notes ?? '')
     setBranch(existingQuotation.branch ?? '')
     if (existingQuotation.esClienteOcasional) {
       setEsClienteOcasional(true)
       setClienteOcasionalNombre(existingQuotation.clienteOcasionalNombre ?? '')
       setClienteOcasionalRnc(existingQuotation.clienteOcasionalRnc ?? '')
       setClienteOcasionalDireccion(existingQuotation.clienteOcasionalDireccion ?? '')
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
    setItems(duplicateSource.items.map((i) => {
      const discountAmount = i.discountAmount ?? 0
      const discountPct = discountAmount > 0 ? 0 : (i.discountPct ?? 0)
      const discountMode: 'pct' | 'amount' = discountAmount > 0 ? 'amount' : 'pct'
      return {
        itemCode: i.itemCode,
        description: i.description ?? '',
        qty: i.qty,
        rate: i.rate,
        baseRate: i.rate,
        conversionFactor: 1,
        amount: calcAmount(i.qty, i.rate, discountPct, discountAmount),
        discountPct,
        discountMode,
        discountAmount,
        manualDiscountPct: discountMode === 'pct' ? discountPct : 0,
        salesTaxPct: 0,
        salesTaxTemplate: '',
        uom: i.uom ?? 'Unidad',
        warehouse: '',
      }
    }))
    setNotes(duplicateSource.notes ?? '')
    setInitialized(true)
  }, [duplicateSource, isEdit, initialized])

  useEffect(() => {
    if (!duplicateCustomer) return
    setCustomerName(duplicateCustomer.customerName)
    setCustomerPriceTier(duplicateCustomer.priceTier)
    setCustomerDefaultDiscountPct(duplicateCustomer.descuentoDefaultPct ?? undefined)
  }, [duplicateCustomer])

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

  const currentUserEmail = getCachedUser()?.email
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser', currentUserEmail],
    queryFn: () => getUsuario(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 5 * 60_000,
  })

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const isSystemManager = useIsSystemManager()
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

  function handleCustomerCreated(customer: Customer) {
    setShowCreateCustomer(false)
    setCustomerId(customer.id)
    setCustomerName(customer.customerName)
    setCustomerPriceTier(customer.priceTier)
    setCustomerDefaultDiscountPct(customer.descuentoDefaultPct ?? undefined)
    queryClient.invalidateQueries({ queryKey: ['customerSearch'] })
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (dto: CreateQuotationDto) => createQuotation(dto),
    onSuccess: (quotation) => {
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast.success('Cotización creada correctamente')
      navigate(`/cotizaciones/${quotation.id}`)
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (err: { message?: string }) => {
      handleError(err)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (dto: Partial<CreateQuotationDto>) => updateQuotation(id!, dto),
    onSuccess: (quotation) => {
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.removeQueries({ queryKey: ['quotation', id] })
      if (quotation.id !== id) {
        toast.success(`Nueva versión creada: ${displayId(quotation.id, quotation.sequence)}`)
        navigate(`/cotizaciones/${quotation.id}`)
      } else {
        toast.success(`Versión ${quotation.sequence} guardada como historial`)
        navigate(`/cotizaciones/${quotation.id}`, { replace: true })
      }
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (err: { message?: string }) => {
      handleError(err)
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

/** Arma el body de creación/edición desde el estado actual del formulario — usado tanto en el
 *  submit normal como al reintentar con `pinOverride` (override de descuento y de costo). */
function buildDto(): CreateQuotationDto {
     return {
       ...(esClienteOcasional
         ? { clienteOcasionalNombre: clienteOcasionalNombre || undefined, clienteOcasionalRnc: clienteOcasionalRnc || undefined, clienteOcasionalDireccion: clienteOcasionalDireccion || undefined }
         : { customer: customerId }),
       date,
       validTill,
       branch: branch || undefined,
       currency: currency || undefined,
       conversionRate: currency && currency !== monedaBase && conversionRate !== '' ? conversionRate : undefined,
       items: items.filter((i) => i.itemCode).map((i) => ({
         itemCode: i.itemCode,
         description: i.description,
         qty: i.qty,
         rate: i.rate,
         // Mutuamente excluyentes — nunca se envían ambos, aunque el usuario haya escrito algo
         // en el otro campo antes de cambiar de modo.
         discountPct: i.discountMode === 'amount' ? undefined : (i.discountPct || undefined),
         discountAmount: i.discountMode === 'amount' ? (i.discountAmount || undefined) : undefined,
         uom: i.uom || undefined,
         warehouse: i.warehouse || undefined,
       })),
       notes: notes || undefined,
       taxesTemplate: usaImpuestoDocumento ? (taxesTemplate || undefined) : undefined,
     }
   }

   function submitDto() {
     const dto = buildDto()
     if (id) updateMutation.mutate(dto)
     else createMutation.mutate(dto)
   }

   /** Reintenta la MISMA operación (crear o editar) con `pinOverride` embebido, tras el 400 de
    *  "no puede ser menor al costo de compra" — el backend verifica el PIN dentro de este mismo
    *  request, no hay un POST /auth/verify-admin-pin aparte. Deja que el 401 (PIN inválido/sin
    *  permisos) se propague tal cual para que el modal lo muestre y permita reintentar. */
   async function retryQuotationWithPinOverride(pin: string, identidad: { usuario?: string; codigoTarjeta?: string }) {
     const dto = { ...buildDto(), pinOverride: { pin, ...identidad } }
     const formTabId = activeId
     if (id) {
       const quotation = await updateQuotation(id, dto)
       queryClient.invalidateQueries({ queryKey: ['quotations'] })
       queryClient.removeQueries({ queryKey: ['quotation', id] })
       if (quotation.id !== id) {
         toast.success(`Nueva versión creada: ${displayId(quotation.id, quotation.sequence)}`)
         navigate(`/cotizaciones/${quotation.id}`)
       } else {
         toast.success(`Versión ${quotation.sequence} guardada como historial`)
         navigate(`/cotizaciones/${quotation.id}`, { replace: true })
       }
     } else {
       const quotation = await createQuotation(dto)
       queryClient.invalidateQueries({ queryKey: ['quotations'] })
       toast.success('Cotización creada correctamente')
       navigate(`/cotizaciones/${quotation.id}`)
     }
     if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
   }

  function handleError(err: { message?: string; statusCode?: number }) {
    const msg = err?.message ?? ''
    if (isApiErrorCode(err, ERROR_CODES.SALE_WAREHOUSE_MISMATCH)) {
      toast.error(msg, { duration: 8000 })
      return
    }
    if (isApiErrorCode(err, ERROR_CODES.UOM_NOT_ALLOWED)) {
      toast.error(formatUomNotAllowedMessage(err), { duration: 8000 })
      return
    }
    if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) {
      setPinModalOpen(true)
      return
    }
    if (isCostoCompraError(err)) {
      setCostPinModalOpen(true)
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
        if ('discountMode' in patch) {
          // Mutuamente excluyentes — al cambiar de modo se limpia el valor del otro, nunca se
          // envían ambos campos al backend.
          if (updated.discountMode === 'amount') {
            updated.manualDiscountPct = 0
            updated.discountPct = 0
          } else {
            updated.discountAmount = 0
          }
        }
        if ('manualDiscountPct' in patch) {
          updated.discountPct = (updated.autoDiscountPct ?? 0) + (updated.manualDiscountPct ?? 0)
        }
        if ('qty' in patch || 'rate' in patch || 'discountPct' in patch || 'discountAmount' in patch || 'discountMode' in patch) {
          updated.amount = updated.discountMode === 'amount'
            ? calcAmount(updated.qty, updated.rate, 0, updated.discountAmount)
            : calcAmount(updated.qty, updated.rate, updated.discountPct)
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
        const amount = item.discountMode === 'amount'
          ? calcAmount(qty, item.rate, 0, item.discountAmount)
          : calcAmount(qty, item.rate, item.discountPct)
        const updated = { ...item, warehouse, qty, amount }
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
        const baseRate = s.item.prices?.[tier] ?? s.item.standardRate ?? 0
        const rate = saleRate(baseRate)
        return {
          itemCode: s.item.id,
          itemLabel: s.item.itemName,
          itemType: s.item.type,
          description: s.item.internalDescription ?? s.item.itemName,
          qty: s.qty,
          rate,
          baseRate,
          conversionFactor: 1,
          amount: calcAmount(s.qty, rate, 0),
          discountPct: 0,
          discountMode: 'pct' as const,
          discountAmount: 0,
          salesTaxPct: s.item.salesTaxPct ?? 0,
          salesTaxTemplate: s.item.salesTaxTemplate ?? '',
          uom: s.item.stockUom ?? 'Unidad',
          maxDiscountPct: s.item.allowsDiscount ? s.item.maxDiscountPct : undefined,
          autoDiscountPct: s.item.autoDiscount?.discountType === 'Discount Percentage' ? s.item.autoDiscount.discountPercentage : undefined,
          manualDiscountPct: 0,
          allowsDiscount: s.item.allowsDiscount,
          _prices: s.item.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: s.item.stockByWarehouse,
        }
      }),
    ])
    setVariantTemplate(null)
  }

  function selectCatalogItem(index: number, catalogItem: Item, opts?: { autoAddRow?: boolean }) {
    const autoAddRow = opts?.autoAddRow ?? true
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = index === prev.length - 1
      return prev.map((row, i) => {
        if (i !== index) return row
        const baseRate = catalogItem.prices?.[tier] ?? catalogItem.standardRate ?? 0
        const rate = saleRate(baseRate)
        const autoDiscountPct = catalogItem.autoDiscount?.discountType === 'Discount Percentage' ? catalogItem.autoDiscount.discountPercentage : undefined
        // Sugerencia del % de descuento del cliente al agregar la línea — solo al agregarla, nunca
        // reescribe una línea que el usuario ya haya tocado. Sigue siendo editable por línea.
        const defaultManualPct = catalogItem.allowsDiscount && customerDefaultDiscountPct && customerDefaultDiscountPct > 0
          ? customerDefaultDiscountPct
          : 0
        return {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          itemType: catalogItem.type,
          description: catalogItem.internalDescription ?? catalogItem.itemName,
          rate,
          baseRate,
          conversionFactor: 1,
          amount: calcAmount(row.qty, rate, (autoDiscountPct ?? 0) + defaultManualPct, 0),
          maxDiscountPct: catalogItem.allowsDiscount ? catalogItem.maxDiscountPct : undefined,
          autoDiscountPct,
          discountPct: (autoDiscountPct ?? 0) + defaultManualPct,
          discountMode: 'pct' as const,
          discountAmount: 0,
          manualDiscountPct: defaultManualPct,
          allowsDiscount: catalogItem.allowsDiscount,
          uom: catalogItem.stockUom ?? row.uom,
          _prices: catalogItem.prices,
          salesTaxPct: catalogItem.salesTaxPct ?? 0,
          salesTaxTemplate: catalogItem.salesTaxTemplate ?? '',
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
        const baseRate = bundle.prices?.[tier] ?? 0
        const rate = saleRate(baseRate)
        // Solo aplica la sugerencia si la línea todavía no tiene un descuento manual (recién
        // agregada) — no pisa uno que el usuario ya haya tocado.
        const defaultManualPct = row.discountMode === 'pct' && !row.manualDiscountPct && customerDefaultDiscountPct && customerDefaultDiscountPct > 0
          ? customerDefaultDiscountPct
          : row.manualDiscountPct
        return {
          ...row,
          itemCode: bundle.id,
          itemLabel: bundle.itemName,
          itemType: 'combo',
          description: bundle.itemName,
          rate,
          baseRate,
          conversionFactor: 1,
          manualDiscountPct: defaultManualPct,
          discountPct: row.discountMode === 'amount' ? row.discountPct : defaultManualPct,
          amount: row.discountMode === 'amount'
            ? calcAmount(row.qty, rate, 0, row.discountAmount)
            : calcAmount(row.qty, rate, defaultManualPct),
          maxDiscountPct: undefined,
          uom: bundle.itemUom ?? '',
          _prices: bundle.prices,
          salesTaxPct: 0,
          salesTaxTemplate: '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: undefined,
          stockError: undefined,
        }
      })
    })
    if (wasLastRow) addRow()
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, discountPct: 0, discountMode: 'pct', discountAmount: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '' })
  }

  // ── Reprice on customer change ───────────────────────────────────────────
  useEffect(() => {
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    setItems((prev) =>
      prev.map((row) => {
        if (!row._prices) return row
        const baseRate = row._prices[tier] ?? row.baseRate
        const rate = saleRate(baseRate, row.conversionFactor)
        const amount = row.discountMode === 'amount'
          ? calcAmount(row.qty, rate, 0, row.discountAmount)
          : calcAmount(row.qty, rate, row.discountPct)
        return { ...row, rate, baseRate, amount }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPriceTier, defaultPriceTier])

  function addRow() {
    if (!branch) {
      toast.error('Debe seleccionar una sucursal antes de agregar artículos.')
      return
    }
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, conversionFactor: 1, amount: 0, discountPct: 0, discountMode: 'pct', discountAmount: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', uom: 'Unidad', warehouse: '' }])
  }
  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const hasAnyDiscount = items.some((i) => i.discountPct > 0 || i.discountAmount > 0)
  /** Quita el descuento de TODAS las líneas de una sola vez — no toca cantidad, precio ni
   *  ningún otro campo de la línea. */
  function undoDiscounts() {
    setItems((prev) => prev.map((item) => ({
      ...item,
      discountPct: 0,
      manualDiscountPct: 0,
      discountAmount: 0,
      amount: calcAmount(item.qty, item.rate, 0, 0),
    })))
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const taxTotal = items.reduce((s, i) => s + (i.amount * i.salesTaxPct / 100), 0)
  const total = subtotal + taxTotal

  const isDirty = useDirtyCheck({
    customerId,
    esClienteOcasional,
    clienteOcasionalNombre,
    clienteOcasionalRnc,
    clienteOcasionalDireccion,
    date,
    validTill,
    items,
    notes,
    branch,
    taxesTemplate,
    currency,
    conversionRate,
  }, isEdit || duplicateId ? initialized : true)
  useBeforeUnloadWarning(isDirty)

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    // Fila vacía sobrante (queda una después de seleccionar el último artículo real, por el
    // auto-agregado de fila) — se descarta de la vista y de la validación al someter, para no
    // confundir al usuario ni enviarla al API.
    const validItems = items.filter((i) => i.itemCode)
    if (validItems.length !== items.length) setItems(validItems)

if (esClienteOcasional) {
       if (!clienteOcasionalNombre.trim()) {
         toast.error('Ingresa el nombre del cliente ocasional')
         return
       }
       const rncDigits = clienteOcasionalRnc.replace(/\D/g, '')
       if (rncDigits && rncDigits.length !== 9 && rncDigits.length !== 11) {
         toast.error('El RNC debe tener 9 dígitos o la cédula 11 dígitos')
         return
       }
     } else {
       if (!customerId) {
         toast.error('Selecciona un cliente')
         return
       }
     }
    if (validItems.length === 0) {
      toast.error('Agrega al menos un artículo')
      return
    }

    for (let i = 0; i < validItems.length; i++) {
      const row = validItems[i]
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
      // En modo monto fijo no replicamos la conversión monto→% que hace el backend para
      // comparar contra los topes — el backend valida y devuelve 400 si excede el límite.
      if (row.discountMode === 'pct' && row.discountPct > effectiveLimit) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton label="Actualizar" />
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
                       const c = cid ? customersData?.items?.find((c) => c.id === cid) : undefined
                       setCustomerPriceTier(c?.priceTier)
                       setCustomerDefaultDiscountPct(c?.descuentoDefaultPct ?? undefined)
                     }}
                     options={customerOptions}
                     selectedLabel={customerName}
                     onSearch={setCustomerQuery}
                     loading={loadingCustomers}
                     placeholder="Buscar cliente…"
                     error={!customerId}
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

               {multimonedaHabilitada && (
                 <div className="ff-wrap">
                   <label className="ff-label" htmlFor="quotationCurrency">Moneda</label>
                   <Select
                     value={currency}
                     onValueChange={(v) => { setCurrency(v); if (v === monedaBase || !v) setConversionRate('') }}
                     placeholder={`Automático (${monedaBase})`}
                   >
                     <SelectItem value="">Automático ({monedaBase})</SelectItem>
                     {(['DOP', 'USD', 'EUR'] as const).map((c) => (
                       <SelectItem key={c} value={c} disabled={!monedasHabilitadas.includes(c)}>
                         {c}{!monedasHabilitadas.includes(c) ? ' (habilítela primero en Monedas)' : ''}
                       </SelectItem>
                     ))}
                   </Select>
                   {currency && currency !== monedaBase && (
                     <div style={{ marginTop: 8 }}>
                       <label className="ff-label" htmlFor="quotationConversionRate">
                         Tasa de cambio ({currency} → {monedaBase})
                       </label>
                       <input
                         id="quotationConversionRate"
                         type="number"
                         min="0"
                         step="0.0001"
                         className="ff-input"
                         value={conversionRate}
                         onChange={(e) => setConversionRate(e.target.value === '' ? '' : Number(e.target.value))}
                         placeholder="Vacío = resuelve automático contra /monedas/tasas"
                       />
                     </div>
                   )}
                 </div>
               )}
               {esClienteOcasional && (
                 <div className="ff-wrap">
                   <label className="ff-label" htmlFor="clienteOcasionalRnc">RNC o Cédula</label>
                   <input
                     id="clienteOcasionalRnc"
                     className="ff-input"
                     value={clienteOcasionalRnc}
                     onChange={(e) => setClienteOcasionalRnc(e.target.value)}
                     placeholder="132456785 o 00113918866 (opcional)"
                   />
                 </div>
               )}
               {esClienteOcasional && (
                 <div className="ff-wrap">
                   <label className="ff-label" htmlFor="clienteOcasionalDireccion">Dirección</label>
                   <input
                     id="clienteOcasionalDireccion"
                     className="ff-input"
                     value={clienteOcasionalDireccion}
                     onChange={(e) => setClienteOcasionalDireccion(e.target.value)}
                     placeholder="Dirección del cliente ocasional (opcional)"
                   />
                 </div>
               )}

               <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                 <label className="ff-toggle-wrap">
                   <span className="ff-toggle">
                     <input type="checkbox" checked={esClienteOcasional} onChange={(e) => { setEsClienteOcasional(e.target.checked); if (e.target.checked) setCustomerId('') }} />
                     <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
                   </span>
                   Venta ocasional (cliente no registrado)
                   {esClienteOcasional && (
                     <FieldTooltip>Ingresa el nombre del cliente. No se requiere RUC/Cédula para cotizaciones.</FieldTooltip>
                   )}
                 </label>
               </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="date">Fecha</label>
                <DatePicker
                  id="date"
                  className="ff-input"
                  value={date}
                  onChange={setDate}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="validTill">Válida hasta</label>
                <DatePicker
                  id="validTill"
                  className="ff-input"
                  value={validTill}
                  onChange={setValidTill}
                  clearable
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

              {usaImpuestoDocumento && (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="taxesTemplate">
                    Impuesto del Documento
                    <FieldTooltip>Impuesto aplicado al total del documento (ej. ITBIS 18%). Si no eliges ninguno, se usa el template marcado como default, si existe.</FieldTooltip>
                  </label>
                  <SearchSelect
                    id="taxesTemplate"
                    value={taxesTemplate}
                    onChange={(val) => setTaxesTemplate(val)}
                    options={taxesTemplateOptions}
                    onSearch={setTaxesTemplateSearch}
                    selectedLabel={taxesTemplates?.find((t) => String(t.id) === taxesTemplate)?.title ?? ''}
                    placeholder="Usar el default de la compañía"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Artículos ───────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title">Artículos</h2>
            {hasAnyDiscount && (
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={undoDiscounts}>
                <RotateCcw size={13} /> Deshacer descuentos
              </button>
            )}
          </div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Artículo</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 80 }}>
                  Descuento
                  <Info size={11} style={{ marginLeft: 2, verticalAlign: 'middle', color: 'var(--text-tertiary)' }} />
                </th>
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
                    <tr
                      key={index}
                      ref={(el) => { rowRefs.current[index] = el }}
                      className={highlightedRow === index ? 'row-flash' : undefined}
                    >
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
                        <QtyInput
                          className={`items-input${(submitted && (!item.qty || item.qty <= 0)) || item.stockError ? ' items-input-error' : ''}`}
                          value={item.qty}
                          uom={item.uom}
                          onChange={(v) => updateItem(index, { qty: v })}
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
                          value={round2(item.rate)}
                          disabled
                          style={{ textAlign: 'right' }}
                        />
                      </td>

                      {/* Descuento */}
                      <td>
                        {(() => {
                          const autoPct = item.autoDiscountPct ?? 0
                          const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
                          const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
                          const priceLimit = maxDiscFromPrices(item.rate, item._prices)
                          const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
                          const allowsManual = item.allowsDiscount !== false
                          const isAmountMode = item.discountMode === 'amount'
                          return (
                            <>
                              {autoPct > 0 && !isAmountMode && (
                                <div style={{ marginBottom: 4 }}>
                                  <span className="badge badge-discount" style={{ fontSize: 10, padding: '2px 6px' }}>
                                    {autoPct}% auto
                                  </span>
                                </div>
                              )}
                              <div className={`disc-combo${submitted && !isAmountMode && item.discountPct > effectiveLimit ? ' disc-combo-error' : ''}`}>
                                <div className="disc-combo-select-wrap">
                                  <select
                                    className="disc-combo-select"
                                    value={item.discountMode}
                                    onChange={(e) => updateItem(index, { discountMode: e.target.value as 'pct' | 'amount' })}
                                    disabled={!allowsManual}
                                  >
                                    <option value="pct">%</option>
                                    <option value="amount">RD$</option>
                                  </select>
                                  <ChevronDown size={12} className="disc-combo-chevron" />
                                </div>
                                {isAmountMode ? (
                                  <input
                                    className="disc-combo-input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.discountAmount}
                                    onChange={(e) => updateItem(index, { discountAmount: parseFloat(e.target.value) || 0 })}
                                    disabled={!allowsManual}
                                    title={allowsManual ? undefined : 'Este artículo no acepta descuentos'}
                                  />
                                ) : (
                                  <input
                                    className="disc-combo-input"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={item.manualDiscountPct}
                                    onChange={(e) => updateItem(index, { manualDiscountPct: parseFloat(e.target.value) || 0 })}
                                    disabled={!allowsManual}
                                    title={allowsManual ? undefined : 'Este artículo no acepta descuentos'}
                                  />
                                )}
                              </div>
                              {isAmountMode ? (
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  Descuento: {formatMoney(item.discountAmount, currency || monedaBase)}
                                </span>
                              ) : (
                                <>
                                  {item.discountPct > 0 && (
                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                      Total: {item.discountPct.toFixed(1)}%
                                    </span>
                                  )}
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
                                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block', marginTop: 2, cursor: 'help' }} title="El descuento puede incluir una parte automática (Pricing Rule) y una parte manual del vendedor. Ambas se suman contra el tope máximo.">
                                    ⓘ automático + manual
                                  </span>
                                </>
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
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.amount, currency || monedaBase, { trimZeros: true })}</td>

                      <td>
                        {item.itemType === 'service' || item.itemType === 'combo' ? (
                          <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                        ) : (
                          <UomSelect
                            value={item.uom}
                            onChange={(v, factor) => updateItem(index, { uom: v, rate: saleRate(item.baseRate, factor), conversionFactor: factor })}
                            itemCode={item.itemCode || undefined}
                            error={submitted && !item.uom}
                            direction="sale"
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
                <span>{formatMoney(grossTotal, currency || monedaBase)}</span>
              </div>

              {totalDiscount > 0 && (
                <div className="items-total-line" style={{ color: 'var(--text-danger)' }}>
                  <span>Descuento total</span>
                  <span>-{formatMoney(totalDiscount, currency || monedaBase)}</span>
                </div>
              )}

              {taxTotal > 0 && (
                <div className="items-total-line" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  <span>Impuesto</span>
                  <span>{formatMoney(taxTotal, currency || monedaBase)}</span>
                </div>
              )}
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                <span>Total</span>
                <span>{formatMoney(total, currency || monedaBase)}</span>
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
          <button type="submit" className="btn btn-navy" disabled={isPending}>
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
        accion="override_descuento"
        onAuthorized={(userId) => { client.defaults.headers.common['X-Admin-Pin'] = userId; setPinModalOpen(false); submitDto() }}
        title="Autorización requerida"
        description="El descuento supera tu límite. Ingresa el PIN de un administrador."
      />

      <PinModal
        open={costPinModalOpen}
        onClose={() => setCostPinModalOpen(false)}
        onSubmitInline={retryQuotationWithPinOverride}
        onAuthorized={() => setCostPinModalOpen(false)}
        title="Autorización requerida"
        description="Esta línea se vendería por debajo del costo. Ingresa un PIN de administrador para autorizarlo."
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

      {showCreateCustomer && (
        <CustomerQuickCreateModal
          onCreated={handleCustomerCreated}
          onClose={() => setShowCreateCustomer(false)}
        />
      )}
    </div>
  )
}
