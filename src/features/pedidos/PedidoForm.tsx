import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTabs } from '@/contexts/TabsContext'
import { createPedido, updatePedido, getPedido, getPedidoDuplicateSource } from '@/shared/api/pedidos'
import { listCustomers, getCustomer } from '@/shared/api/customers'
import { getQuotation } from '@/shared/api/quotations'
import { getLayawayConfig, listAlmacenes, getFacturacionConfig } from '@/shared/api/config'
import type { Item, ItemPrices, CreatePedidoDto, Bundle, Customer, ItemStock, MonedaCode } from '@/shared/api/types'
import { getTasaVigente } from '@/shared/api/monedas'
import { useItemsStock, resolveDisponible } from '@/shared/hooks/useItemsStock'
import { useItemInventory } from '@/shared/hooks/useItemInventory'
import { CustomerQuickCreateModal } from '@/features/customers/CustomerQuickCreateModal'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { DatePicker } from '@/shared/ui/DatePicker'
import { UomSelect } from '@/shared/ui/UomSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { formatMoney, round2, formatDate } from '@/lib/formatters'
import { formatUomNotAllowedMessage } from '@/lib/stockAlerts'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ArrowLeft, Save, Plus, Trash2, Eye, Loader2, PackageOpen, UserPlus, ChevronDown, RotateCcw } from 'lucide-react'
import { RecargarButton } from '@/components/shared/RecargarButton'
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
import { listSucursales, getSucursal } from '@/shared/api/sucursales'
import { getCachedUser } from '@/shared/api/storage'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { isCostoCompraError } from '@/lib/pinOverride'

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
  /** Modo de descuento de la línea — mutuamente excluyentes, nunca se envían ambos al backend */
  discountMode: 'pct' | 'amount'
  /** Descuento fijo en RD$ — solo aplica en modo "monto fijo" */
  discountAmount: number
  uom: string
  conversionFactor: number
  maxDiscountPct?: number
  _prices?: ItemPrices
  warehouse: string
  /** Stock por almacén del artículo seleccionado, para validar contra el almacén elegido en la línea */
  _stockByWarehouse?: Record<string, number>
}

// Un Pedido no valida disponibilidad del lado del servidor antes de crearse (ni siquiera al
// someterse, si no toca stock — despacho habilitado, o el pedido queda en borrador) — ver
// docs/tasks/73_alertas_stock_disponible_reservado.md §4.2. Esta es la única barrera real contra
// prometer stock que ya está reservado para otro cliente (Apartado) o que simplemente no alcanza.
// Compara siempre contra `disponible` (físico − reservado), nunca contra el físico a secas.
function validateLineStock(row: LineItem, stockMap: Map<string, ItemStock>): string | undefined {
  if (!row.warehouse || !row.itemCode || row.itemType === 'service' || row.itemType === 'combo') return undefined
  const info = resolveDisponible(stockMap.get(row.itemCode), row.warehouse)
  if (!info) return undefined // stock del artículo aún no cargado — no bloquear con datos incompletos
  if (row.qty > info.disponible) {
    return info.reservedStock > 0
      ? `Solo hay ${info.disponible} disponibles de este artículo en ${row.warehouse} (${info.reservedStock} reservadas para otro cliente)`
      : `Stock insuficiente en ${row.warehouse}. Disponible: ${info.disponible}`
  }
  return undefined
}

function todayIso() { return format(new Date(), 'yyyy-MM-dd') }
function defaultDelivery() { return format(addDays(new Date(), 7), 'yyyy-MM-dd') }
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
   /** % de descuento por defecto del cliente elegido — solo sugiere el valor al AGREGAR una línea
    *  nueva (selectCatalogItem/selectBundle), nunca reescribe una que el usuario ya haya tocado. */
   const [customerDefaultDiscountPct, setCustomerDefaultDiscountPct] = useState<number | undefined>(undefined)
   const [customerQuery, setCustomerQuery] = useState('')
   const [showCreateCustomer, setShowCreateCustomer] = useState(false)
   const [esClienteOcasional, setEsClienteOcasional] = useState(false)
   const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
   const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')
   const [clienteOcasionalDireccion, setClienteOcasionalDireccion] = useState('')
   const [transactionDate, setTransactionDate] = useState(todayIso())
  const [deliveryDate, setDeliveryDate] = useState(defaultDelivery())
  const [items, setItems] = useState<LineItem[]>([])
  // Disponibilidad real (físico − reservado) por artículo — docs/tasks/73_alertas_stock_disponible_reservado.md.
  const stockMap = useItemsStock(
    items.map((i) => (i.itemCode && i.itemType !== 'service' && i.itemType !== 'combo' ? i.itemCode : undefined)),
  )
  // "En pedido" (reservedQty, informativo, NO bloqueante) — docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md §7.4.
  const inventoryMap = useItemInventory(
    items.map((i) => (i.itemCode && i.warehouse && i.itemType !== 'service' && i.itemType !== 'combo' ? { itemCode: i.itemCode, warehouse: i.warehouse } : undefined)),
  )
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
  const [costPinModalOpen, setCostPinModalOpen] = useState(false)
  const [isLayaway, setIsLayaway] = useState(false)
  const [despachoFuturo, setDespachoFuturo] = useState(false)
  const [branch, setBranch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  // '' = automático (Cliente.defaultCurrency → moneda base). Al convertir desde una Cotización se
  // hidrata explícitamente con la moneda/tasa de esa cotización (se hereda tal cual, nunca se
  // re-resuelve — docs/tasks/64_multimoneda_completo.md §3.3).
  const [currency, setCurrency] = useState('')
  const [conversionRate, setConversionRate] = useState<number | ''>('')

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true
  const multimonedaHabilitada = facturacionConfig?.multimonedaHabilitada ?? false
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'
  const monedasHabilitadas = facturacionConfig?.monedasHabilitadas ?? ['DOP']
  // Con despacho activo, un pedido puede venderse sin stock (se reserva lo que haya y el resto se
  // completa al recibir la compra — docs/PROMPT_VENDER_SIN_STOCK_FRONTEND.md §0/§9): la falta de
  // stock deja de ser un bloqueo del lado del cliente y pasa a ser solo informativa.
  const despachoHabilitado = facturacionConfig?.despachoHabilitado ?? false
  const despachoFuturoHabilitado = facturacionConfig?.despachoFuturoHabilitado ?? true
  // Mismo criterio que InvoiceForm — visible solo si el tenant tiene ambos módulos habilitados.
  // Mutuamente excluyente con "Es un apartado": un pedido a futuro ya difiere la entrega por su
  // cuenta, no tiene sentido combinarlo con layaway (docs/tasks/79_confirmacion_despacho_pedido.md §2).
  const mostrarSelectorDespachoFuturo = despachoHabilitado && despachoFuturoHabilitado && !isLayaway

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
  // sesión (con `_prices`, es decir, elegidas desde el catálogo) — no toca líneas hidratadas de un
  // pedido/cotización existente, que ya vienen en la moneda con la que se guardaron originalmente.
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
      const res = await listItems({ barcode: code, limit: 1, branch: despachoHabilitado ? undefined : branch })
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
      // Se hereda tal cual de la cotización — nunca se re-resuelve contra el cliente actual.
      setCurrency(q.currency ?? '')
      setConversionRate(q.conversionRate ?? '')
      setItems(q.items.map((i) => {
        const discountAmount = i.discountAmount ?? 0
        const discountPct = discountAmount > 0 ? 0 : (i.discountPct ?? 0)
        const discountMode: 'pct' | 'amount' = discountAmount > 0 ? 'amount' : 'pct'
        return {
          itemCode: i.itemCode,
          description: i.description ?? '',
          qty: i.qty,
          rate: i.rate,
          baseRate: i.rate,
          amount: i.amount,
          discountPct,
          discountMode,
          discountAmount,
          uom: i.uom,
          conversionFactor: 1,
          warehouse: '',
        }
      }))
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
      setItems(src.items.map((i) => {
        const discountAmount = i.discountAmount ?? 0
        const discountPct = discountAmount > 0 ? 0 : (i.discountPct ?? 0)
        const discountMode: 'pct' | 'amount' = discountAmount > 0 ? 'amount' : 'pct'
        return {
          itemCode: i.itemCode,
          description: i.description ?? '',
          qty: i.qty,
          rate: i.rate,
          baseRate: i.rate,
          amount: calcAmount(i.qty, i.rate, discountPct, discountAmount),
          discountPct,
          discountMode,
          discountAmount,
          uom: 'Unidad',
          conversionFactor: 1,
          warehouse: '',
        }
      }))
      getCustomer(src.customer).then((c) => {
        setCustomerName(c.customerName)
        setCustomerPriceTier(c.priceTier)
        setCustomerDefaultDiscountPct(c.descuentoDefaultPct ?? undefined)
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
     setCurrency(existing.currency ?? '')
     setConversionRate(existing.conversionRate ?? '')
     setItems(existing.items.map((i) => {
       const discountAmount = i.discountAmount ?? 0
       const discountPct = discountAmount > 0 ? 0 : (i.discountPct ?? 0)
       const discountMode: 'pct' | 'amount' = discountAmount > 0 ? 'amount' : 'pct'
       return {
         itemCode: i.itemCode,
         description: i.description,
         qty: i.qty,
         rate: i.rate,
         baseRate: i.rate,
         amount: i.amount,
         discountPct,
         discountMode,
         discountAmount,
         uom: i.uom ?? 'Unidad',
         conversionFactor: 1,
         warehouse: '',
       }
     }))
     setNotes(existing.notes ?? '')
     setBranch(existing.branch ?? '')
     setDepartment((existing as any).department ?? '')
     if (existing.esClienteOcasional) {
       setEsClienteOcasional(true)
       setClienteOcasionalNombre(existing.clienteOcasionalNombre ?? '')
       setClienteOcasionalRnc(existing.clienteOcasionalRnc ?? '')
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

  const currentUserEmail = getCachedUser()?.email
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
    setCustomerDefaultDiscountPct(customer.descuentoDefaultPct ?? undefined)
    queryClient.invalidateQueries({ queryKey: ['customerSearch'] })
  }

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

  // Si el usuario solo tiene una sucursal asignada, se selecciona sola (igual que en Nueva
  // Factura) — el select queda bloqueado en la práctica porque no hay otra opción que elegir.
  useEffect(() => {
    if (!isEdit && branchOptions.length === 1 && branch !== branchOptions[0]) setBranch(branchOptions[0])
  }, [branchOptions, branch, isEdit])

  // ── Almacenes de la sucursal seleccionada (para el selector por línea) ───
  const { data: branchWarehouses } = useQuery({
    queryKey: ['almacenes', { branch }],
    queryFn: () => listAlmacenes({ branch }),
    enabled: !!branch,
    staleTime: 60_000,
  })

  // docs/tasks/75_almacen_venta_confirmar_stock_uoms_permitidas.md §1.4 — si la sucursal tiene
  // almacén de venta configurado, TODA venta debe salir de ahí sin excepción: se oculta el
  // selector por línea y se fuerza ese almacén, en vez de dejar elegir y recién enterarse con el
  // 400 de SALE_WAREHOUSE_MISMATCH al someter.
  const { data: sucursalActual } = useQuery({
    queryKey: ['sucursal', branch],
    queryFn: () => getSucursal(branch),
    enabled: !!branch,
    staleTime: 60_000,
  })
  const almacenVentaSucursal = sucursalActual?.almacenVenta || null

  // Al cambiar de sucursal, el almacén elegido en cada línea deja de ser válido
  useEffect(() => {
    setItems((prev) => prev.map((row) => (row.warehouse ? { ...row, warehouse: '' } : row)))
  }, [branch])

  const warehouseSelectOptions: SearchSelectOption[] = useMemo(() => {
    const q = warehouseSearch.toLowerCase()
    return (branchWarehouses ?? [])
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => ({ value: w.id, label: w.name }))
  }, [branchWarehouses, warehouseSearch])

  function defaultWarehouse(): string {
    if (almacenVentaSucursal) return almacenVentaSucursal
    return branchWarehouses?.length === 1 ? branchWarehouses[0].id : ''
  }

  // Si la sucursal solo tiene un almacén, se autoselecciona en las líneas que no tengan uno.
  useEffect(() => {
    if (branchWarehouses?.length !== 1) return
    const onlyId = branchWarehouses[0].id
    setItems((prev) =>
      prev.map((row) => {
        if (!row.itemCode || row.warehouse) return row
        return { ...row, warehouse: onlyId }
      }),
    )
  }, [branchWarehouses])

  // Con almacén de venta configurado, se fuerza en TODAS las líneas (no solo en las vacías) — no
  // hay atajo posible desde otro almacén de la misma sucursal.
  useEffect(() => {
    if (!almacenVentaSucursal) return
    setItems((prev) =>
      prev.map((row) => (row.warehouse === almacenVentaSucursal ? row : { ...row, warehouse: almacenVentaSucursal })),
    )
  }, [almacenVentaSucursal])

  function handleError(err: unknown) {
    const msg = (err as any)?.message ?? ''
    setSubmitError(msg)
    // docs/PROMPT_ERRORES_COMERCIALES_FRONTEND.md §4/§5.3 — el pedido dejó de ser editable
    // (sometido/cancelado mientras se editaba). No hay una acción de enmienda local propia para
    // Pedidos hoy — se devuelve al detalle con el mensaje comercial del backend tal cual.
    if (id && isApiErrorCode(err, ERROR_CODES.DOC_SUBMITTED_IMMUTABLE)) {
      toast.error(msg || 'Este pedido ya no se puede editar')
      navigate(`/pedidos/${id}`)
      return
    }
    if (isApiErrorCode(err, ERROR_CODES.BRANCH_REQUIRED)) {
      setBranchError(true)
      toast.error(msg || 'Selecciona una sucursal')
      return
    }
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
    if (isCostoCompraError(err as { statusCode?: number; message?: string })) {
      setCostPinModalOpen(true)
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
      if ('discountMode' in patch) {
        // Mutuamente excluyentes — al cambiar de modo se limpia el valor del otro, nunca se
        // envían ambos campos al backend.
        if (updated.discountMode === 'amount') updated.discountPct = 0
        else updated.discountAmount = 0
      }
      if ('qty' in patch || 'rate' in patch || 'discountPct' in patch || 'discountAmount' in patch || 'discountMode' in patch) {
        updated.amount = updated.discountMode === 'amount'
          ? calcAmount(updated.qty, updated.rate, 0, updated.discountAmount)
          : calcAmount(updated.qty, updated.rate, updated.discountPct)
      }
      return updated
    }))
  }
  function updateWarehouse(index: number, warehouse: string) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item
      const available = despachoHabilitado ? undefined : item._stockByWarehouse?.[warehouse]
      const qty = available != null ? Math.min(item.qty, available) : item.qty
      const amount = item.discountMode === 'amount'
        ? calcAmount(qty, item.rate, 0, item.discountAmount)
        : calcAmount(qty, item.rate, item.discountPct)
      return { ...item, warehouse, qty, amount }
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
        const baseRate = catalogItem.prices?.[tier] ?? catalogItem.standardRate ?? 0
        const rate = saleRate(baseRate)
        const defaultPct = catalogItem.allowsDiscount && customerDefaultDiscountPct && customerDefaultDiscountPct > 0
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
          amount: calcAmount(row.qty, rate, defaultPct, 0),
          discountPct: defaultPct,
          discountMode: 'pct' as const,
          discountAmount: 0,
           uom: catalogItem.stockUom ?? row.uom,
           conversionFactor: 1,
           maxDiscountPct: catalogItem.allowsDiscount ? catalogItem.maxDiscountPct : undefined,
          _prices: catalogItem.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: catalogItem.stockByWarehouse,
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
        // Solo aplica la sugerencia si la línea todavía no tiene un descuento (recién agregada) —
        // no pisa uno que el usuario ya haya tocado.
        const defaultPct = row.discountMode === 'pct' && !row.discountPct && customerDefaultDiscountPct && customerDefaultDiscountPct > 0
          ? customerDefaultDiscountPct
          : row.discountPct
        return {
          ...row,
          itemCode: bundle.id,
          itemLabel: bundle.itemName,
          itemType: 'combo',
          description: bundle.itemName,
          rate,
          baseRate,
          discountPct: defaultPct,
          amount: row.discountMode === 'amount'
            ? calcAmount(row.qty, rate, 0, row.discountAmount)
            : calcAmount(row.qty, rate, defaultPct),
           uom: bundle.itemUom ?? '',
           conversionFactor: 1,
           maxDiscountPct: undefined,
          _prices: bundle.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: undefined,
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
          amount: calcAmount(s.qty, rate, 0),
          discountPct: 0,
          discountMode: 'pct' as const,
          discountAmount: 0,
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
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, amount: 0, discountPct: 0, discountMode: 'pct', discountAmount: 0, uom: 'Unidad', conversionFactor: 1, warehouse: '' }])
  }
  function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)) }

  const hasAnyDiscount = items.some((i) => i.discountPct > 0 || i.discountAmount > 0)
  /** Quita el descuento de TODAS las líneas de una sola vez — no toca cantidad, precio ni
   *  ningún otro campo de la línea. */
  function undoDiscounts() {
    setItems((prev) => prev.map((item) => ({
      ...item,
      discountPct: 0,
      discountAmount: 0,
      amount: calcAmount(item.qty, item.rate, 0, 0),
    })))
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const total = subtotal

/** Arma el body de creación/edición desde el estado actual del formulario — usado tanto en el
 *  submit normal como al reintentar con `pinOverride` (override de descuento y de costo). */
function buildDto(): CreatePedidoDto {
     const itemsDto = items.filter((i) => i.itemCode).map((i) => ({
       itemCode: i.itemCode,
       qty: i.qty,
       rate: i.rate,
       // Mutuamente excluyentes — nunca se envían ambos, aunque el usuario haya escrito algo
       // en el otro campo antes de cambiar de modo.
       discountPct: i.discountMode === 'amount' ? undefined : (i.discountPct || undefined),
       discountAmount: i.discountMode === 'amount' ? (i.discountAmount || undefined) : undefined,
       warehouse: i.warehouse || undefined,
       uom: i.uom || undefined,
     }))
     return {
       ...(esClienteOcasional
         ? { clienteOcasionalNombre: clienteOcasionalNombre || undefined, clienteOcasionalRnc: clienteOcasionalRnc || undefined, clienteOcasionalDireccion: clienteOcasionalDireccion || undefined }
         : { customer: customerId }),
       deliveryDate: deliveryDate || undefined,
       branch: branch || undefined,
       department: usaDepartamentos ? (department || undefined) : undefined,
       items: itemsDto,
       quotation: quotationId || undefined,
       isLayaway: isLayaway || undefined,
       despachoFuturo: mostrarSelectorDespachoFuturo ? despachoFuturo : undefined,
       currency: currency || undefined,
       conversionRate: currency && currency !== monedaBase && conversionRate !== '' ? conversionRate : undefined,
     } as CreatePedidoDto
   }

   function submitDto() {
     const baseDto = buildDto()
     if (isEdit) updateMutation.mutate(baseDto)
     else createMutation.mutate(baseDto)
   }

   /** Reintenta la MISMA operación (crear o editar) con `pinOverride` embebido, tras el 400 de
    *  "no puede ser menor al costo de compra" — el backend verifica el PIN dentro de este mismo
    *  request, no hay un POST /auth/verify-admin-pin aparte. Deja que el 401 (PIN inválido/sin
    *  permisos) se propague tal cual para que el modal lo muestre y permita reintentar. */
   async function retryPedidoWithPinOverride(pin: string, identidad: { usuario?: string; codigoTarjeta?: string }) {
     const dto = { ...buildDto(), pinOverride: { pin, ...identidad } }
     const formTabId = activeId
     const result = isEdit ? await updatePedido(id!, dto) : await createPedido(dto)
     setSubmitError(null)
     queryClient.invalidateQueries({ queryKey: ['pedidos'] })
     if (isEdit) queryClient.removeQueries({ queryKey: ['pedido', id] })
     toast.success(isEdit ? 'Pedido actualizado' : 'Pedido creado')
     const newId = (result as { id: string }).id
     navigate(isEdit ? (newId && newId !== id ? `/pedidos/${newId}` : `/pedidos/${id}`) : `/pedidos/${newId}`)
     if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
   }

  const isDirty = useDirtyCheck({
    customerId,
    esClienteOcasional,
    clienteOcasionalNombre,
    clienteOcasionalRnc,
    clienteOcasionalDireccion,
    deliveryDate,
    items,
    notes,
    isLayaway,
    despachoFuturo,
    branch,
    department,
    currency,
    conversionRate,
  }, isEdit || quotationId || duplicateId ? loaded : true)
  useBeforeUnloadWarning(isDirty)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setSubmitError(null)
    // Fila vacía sobrante (queda una después de seleccionar el último artículo real, por el
    // auto-agregado de fila — ver selectCatalogItem/selectBundle) — se descarta de la vista y de
    // la validación al someter, para no confundir al usuario ni enviarla al API.
    const validItems = items.filter((i) => i.itemCode)
    if (validItems.length !== items.length) setItems(validItems)

try {
       if (esClienteOcasional) {
         if (!clienteOcasionalNombre.trim()) { toast.error('Ingresa el nombre del cliente ocasional'); return }
         const rncDigits = clienteOcasionalRnc.replace(/\D/g, '')
         if (rncDigits && rncDigits.length !== 9 && rncDigits.length !== 11) {
           toast.error('El RNC debe tener 9 dígitos o la cédula 11 dígitos')
           return
         }
       } else {
         if (!customerId) { toast.error('Selecciona un cliente'); return }
       }
       if (validItems.length === 0) { toast.error('Agrega al menos un artículo'); return }
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i]; const num = i + 1
        if (!item.qty || item.qty <= 0) { toast.error(`Artículo #${num}: la cantidad es requerida`); return }
        if (!item.rate || item.rate <= 0) { toast.error(`Artículo #${num}: el precio unitario es requerido`); return }
        const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
        const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
        const priceLimit = maxDiscFromPrices(item.rate, item._prices)
        const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
        // En modo monto fijo no replicamos la conversión monto→% que hace el backend para
        // comparar contra los topes — el backend valida y devuelve 400 si excede el límite.
        if (item.discountMode === 'pct' && item.discountPct > effectiveLimit) {
          toast.error(`Línea ${num}: el descuento supera el límite de ${effectiveLimit}%`)
          return
        }
        const stockError = validateLineStock(item, stockMap)
        if (stockError && !despachoHabilitado) {
          toast.error(`Línea ${num}: ${stockError}`)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton label="Actualizar" />
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
                       setCustomerDefaultDiscountPct(c?.descuentoDefaultPct ?? undefined)
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

               {multimonedaHabilitada && !quotationId && (
                 <div className="ff-wrap">
                   <label className="ff-label" htmlFor="pedidoCurrency">Moneda</label>
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
                       <label className="ff-label" htmlFor="pedidoConversionRate">
                         Tasa de cambio ({currency} → {monedaBase})
                       </label>
                       <input
                         id="pedidoConversionRate"
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
               {multimonedaHabilitada && quotationId && currency && (
                 <div className="ff-wrap">
                   <label className="ff-label">Moneda</label>
                   <p className="ff-hint" style={{ marginTop: 6 }}>
                     Heredada de la cotización: <strong>{currency}</strong>
                     {conversionRate !== '' ? ` (tasa ${conversionRate})` : ''}
                   </p>
                 </div>
               )}
               {esClienteOcasional && (
                 <div className="ff-wrap">
                   <label className="ff-label">RNC o Cédula</label>
                   <input
                     className="ff-input"
                     value={clienteOcasionalRnc}
                     onChange={(e) => setClienteOcasionalRnc(e.target.value)}
                     placeholder="132456785 o 00113918866 (opcional)"
                   />
                 </div>
               )}
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
                 <label className="ff-toggle-wrap">
                   <span className="ff-toggle">
                     <input type="checkbox" checked={esClienteOcasional} onChange={(e) => { setEsClienteOcasional(e.target.checked); if (e.target.checked) setCustomerId('') }} />
                     <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
                   </span>
                   Venta ocasional (cliente no registrado)
                   {esClienteOcasional && (
                     <FieldTooltip>Ingresa el nombre del cliente. No se requiere RUC/Cédula para pedidos.</FieldTooltip>
                   )}
                 </label>
               </div>
              {/* La fecha del pedido ya no la fija el cliente — el servidor siempre la asigna con
                  el momento real del request. En edición se muestra de solo lectura, informativa. */}
              {id && (
                <div className="ff-wrap">
                  <span className="ff-label">Fecha</span>
                  <span className="ff-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                    {formatDate(transactionDate)}
                  </span>
                </div>
              )}
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
                  disabled={branchOptions.length === 1}
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
                  <input
                    type="checkbox"
                    checked={isLayaway}
                    onChange={(e) => {
                      setIsLayaway(e.target.checked)
                      if (e.target.checked) setDespachoFuturo(false)
                    }}
                  />
                  <PackageOpen size={14} style={{ color: 'var(--text-secondary)' }} />
                  Es un apartado
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

            {!isEdit && mostrarSelectorDespachoFuturo && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
                <label className="ff-label" style={{ marginBottom: 8, display: 'block' }}>Despacho</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn btn-size-sm ${!despachoFuturo ? 'btn-navy' : 'btn-secondary'}`}
                    onClick={() => setDespachoFuturo(false)}
                  >
                    Despachar ahora
                  </button>
                  <button
                    type="button"
                    className={`btn btn-size-sm ${despachoFuturo ? 'btn-navy' : 'btn-secondary'}`}
                    onClick={() => setDespachoFuturo(true)}
                  >
                    Despachar después
                  </button>
                </div>
                <p className="ff-hint" style={{ marginTop: 6 }}>
                  {despachoFuturo
                    ? 'El pedido no descontará inventario al facturarse — la salida física se registra después con un Despacho.'
                    : 'El pedido descontará inventario al facturarse — se confirma que exista stock físico en el almacén de cada línea.'}
                </p>
              </div>
            )}
          </div>
        </div>

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
                  <th style={{ textAlign: 'right', width: 72 }}>Descuento</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 72 }}>UDM</th>
                  {!almacenVentaSucursal && <th style={{ width: 140 }}>Almacén</th>}
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={almacenVentaSucursal ? 8 : 9} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>No hay artículos.</td></tr>
                ) : (
                  items.map((item, index) => (
                    <tr
                      key={index}
                      ref={(el) => { rowRefs.current[index] = el }}
                      className={highlightedRow === index ? 'row-flash' : undefined}
                    >
                      <td>
                        <ItemSelect value={item.itemCode} selectedLabel={item.itemLabel} onSelect={(ci) => selectCatalogItem(index, ci)} onSelectBundle={(b) => selectBundle(index, b)} includeBundles onClear={() => updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, discountPct: 0, discountMode: 'pct', discountAmount: 0 })} onVariantSelect={(t) => setVariantTemplate(t)} validateStock={!despachoHabilitado} branch={despachoHabilitado ? undefined : (branch || undefined)} />
                      </td>
                      <td>
                        <input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" />
                      </td>
                      <td>
                        {(() => {
                          const stockError = validateLineStock(item, stockMap)
                          const info = item.itemCode && item.warehouse ? resolveDisponible(stockMap.get(item.itemCode), item.warehouse) : undefined
                          const invItem = item.itemCode && item.warehouse ? inventoryMap.get(`${item.itemCode}::${item.warehouse}`) : undefined
                          const enPedido = invItem?.reservedQty ?? 0
                          return (
                            <>
                              <QtyInput className={`items-input${(submitted && (!item.qty || item.qty <= 0)) || stockError ? ' items-input-error' : ''}`} value={item.qty} uom={item.uom} onChange={(v) => updateItem(index, { qty: v })} style={{ textAlign: 'right' }} />
                              {stockError ? (
                                <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  {stockError}
                                </span>
                              ) : info && info.reservedStock > 0 ? (
                                <span style={{ fontSize: 11, color: 'var(--warning-text)', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  Disponible: {info.disponible} ({info.reservedStock} reservadas para otro cliente)
                                  {enPedido > 0 ? ` · En pedido: ${enPedido} (informativo)` : ''}
                                </span>
                              ) : enPedido > 0 ? (
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  En pedido: {enPedido} (informativo)
                                </span>
                              ) : null}
                            </>
                          )
                        })()}
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
                          const isAmountMode = item.discountMode === 'amount'
                          return (
                            <>
                              <div className={`disc-combo${!isAmountMode && item.discountPct > effectiveLimit ? ' disc-combo-error' : ''}`}>
                                <div className="disc-combo-select-wrap">
                                  <select
                                    className="disc-combo-select"
                                    value={item.discountMode}
                                    onChange={(e) => updateItem(index, { discountMode: e.target.value as 'pct' | 'amount' })}
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
                                  />
                                ) : (
                                  <input
                                    className="disc-combo-input"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={item.discountPct}
                                    onChange={(e) => updateItem(index, { discountPct: parseFloat(e.target.value) || 0 })}
                                  />
                                )}
                              </div>
                              {isAmountMode ? (
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  Descuento: {formatMoney(item.discountAmount, currency || monedaBase)}
                                </span>
                              ) : (
                                <>
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
                              )}
                            </>
                          )
                        })()}
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
                            direction="sale"
                          />
                        )}
                      </td>
                      {!almacenVentaSucursal && (
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
                      )}
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
              <div className="items-total-line"><span>Subtotal bruto</span><span>{formatMoney(grossTotal, currency || monedaBase)}</span></div>
              {totalDiscount > 0 && <div className="items-total-line" style={{ color: 'var(--text-danger)' }}><span>Descuento total</span><span>-{formatMoney(totalDiscount, currency || monedaBase)}</span></div>}
              {/*<div className="items-total-line"><span>Subtotal neto</span><span>{formatDOP(subtotal)}</span></div>*/}
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}><span>Total</span><span>{formatMoney(total, currency || monedaBase)}</span></div>
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
          <button type="submit" className="btn btn-navy" disabled={isPending}>
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
        accion="override_descuento"
        onAuthorized={(userId) => {
          client.defaults.headers.common['X-Admin-Pin'] = userId
          setPinModalOpen(false)
          submitDto()
        }}
        title="Autorización requerida"
        description="El descuento supera tu límite. Ingresa el PIN de un administrador."
      />

      <PinModal
        open={costPinModalOpen}
        onClose={() => setCostPinModalOpen(false)}
        onSubmitInline={retryPedidoWithPinOverride}
        onAuthorized={() => setCostPinModalOpen(false)}
        title="Autorización requerida"
        description="Esta línea se vendería por debajo del costo. Ingresa un PIN de administrador para autorizarlo."
      />
    </div>
  )
}
