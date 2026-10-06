import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'

import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTabs } from '@/contexts/TabsContext'
import { createQuotation, updateQuotation, getQuotation, getQuotationDuplicateSource } from '@/shared/api/quotations'
import { getFacturacionConfig } from '@/shared/api/config'
import type { CreateQuotationDto, ItemPrices, Bundle, Customer, MonedaCode } from '@/shared/api/types'
import type { Item, DimensionesLinea, ItemDimensionDeclarada } from '@/shared/api/types'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { mergeLineasIguales } from '@/shared/lib/mergeLineasIguales'
import { getTasaVigente } from '@/shared/api/monedas'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { UomSelect } from '@/shared/ui/UomSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { formatMoney, displayId, round2, formatDate } from '@/lib/formatters'
import { formatUomNotAllowedMessage } from '@/lib/stockAlerts'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { Select, SelectItem } from '@/components/ui/select'
import { ArrowLeft, Save, Plus, Minus, Trash2, Eye, Loader2, UserPlus, ChevronDown, RotateCcw, Info, Lock } from 'lucide-react'
import { CustomerQuickCreateModal } from '@/features/customers/CustomerQuickCreateModal'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { PinModal } from '@/components/shared/PinModal'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
import { isPinPrecioError } from '@/lib/pinOverride'
import { isPrecioCatalogoError, precioBloqueadoParaLinea } from '@/lib/precioCatalogo'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { focusLineQty, lineQtyId } from '@/lib/focusLineQty'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { lookupItems, getItemLookup } from '@/shared/api/catalog'
import { client } from '@/shared/api/client'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { getCachedUser } from '@/shared/api/storage'
import { DatePicker } from '@/shared/ui/DatePicker'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { useOpcionesArray } from '@/shared/hooks/useOpciones'
import { getClienteDetalle, getStockSettingsLookup } from '@/shared/api/formularios'

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
  /** Precio escrito a mano por el operador (solo cuando el toggle correspondiente está activo).
   *  Los reprices automáticos (cambio de cliente/tier, moneda o UDM) no tocan estas líneas —
   *  igual que `manualDiscountPct` con los descuentos. Se limpia al elegir otro artículo. */
  precioManual?: boolean
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
  /** Combinación de dimensión de inventario elegida para esta línea (docs/tasks/
   *  PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §5) — solo relevante si el artículo la usa. */
  dimensiones?: DimensionesLinea
  /** Dimensiones que el artículo de esta línea declara (`item.dimensiones`), guardadas en la fila
   *  al seleccionar el artículo (o al re-consultarlo en modo edición/duplicado) para poder
   *  renderizar el selector de combinación sin tener que re-pedirlo. Vacío/undefined si el
   *  artículo no usa dimensiones. */
  itemDimensionesDeclaradas?: ItemDimensionDeclarada[]
}

function validateLineStock(row: LineItem, allowNegativeStock?: boolean): string | undefined {
  // Tenant con "Permitir stock negativo" activo (Stock Settings) — ERPNext deja cotizar por
  // debajo de disponible, así que bloquear acá sería más estricto que el propio backend.
  if (allowNegativeStock) return undefined
  if (!row.warehouse || !row._stockByWarehouse) return undefined
  // const available = row._stockByWarehouse[row.warehouse] ?? 0
  // if (row.qty > available) {
  //   return `Stock insuficiente en ${row.warehouse}. Disponible: ${available}`
  // }
  return undefined
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [esClienteOcasional, setEsClienteOcasional] = useState(false)
  const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
  const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')
  const [clienteOcasionalDireccion, setClienteOcasionalDireccion] = useState('')
  const [validTill, setValidTill] = useState(defaultValidTill())
  const [items, setItems] = useState<LineItem[]>([])
  // Anchos de columna de la tabla de artículos — el usuario puede arrastrar los divisores del
  // thead para ajustarlos (ver useResizableColumns). Reservan desde el inicio el ancho real que
  // necesita cada control (ej. Descuento es un combo select+input de ~140px), no el mínimo que
  // ocuparía solo el texto del header — así no cambian de tamaño al pasar de "sin artículos" a
  // "con artículos".
  const ITEMS_COLUMNS = [
    { key: 'codigo', width: 100 },
    { key: 'articulo', width: 220 },
    { key: 'cant', width: 80 },
    { key: 'udm', width: 100 },
    { key: 'precio', width: 120 },
    { key: 'descuento', width: 140 },
    { key: 'itbis', width: 80 },
    { key: 'subtotal', width: 120 },
    { key: 'combination', width: 160 },
    { key: 'actions', width: 70 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(ITEMS_COLUMNS)
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
  const [notesOpen, setNotesOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [costPinModalOpen, setCostPinModalOpen] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)
  const [viewItemCode, setViewItemCode] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [branch, setBranch] = useState('')
  const [currency, setCurrency] = useState('')
  const [conversionRate, setConversionRate] = useState<number | ''>('')

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
  })
  const { data: stockSettings } = useQuery({
    queryKey: ['stock-settings'],
    queryFn: getStockSettingsLookup,
  })
  // Candados "Permitir Modificar Precio Libremente" (servicios/productos por separado) — con el
  // toggle correspondiente apagado, el precio de la línea debe ser exactamente uno de los precios
  // de catálogo (A/B/C). Se decide por línea según el tipo de artículo; el 400 se maneja en
  // `handleError`.
  const bloqueoPrecioServicios = facturacionConfig?.permitirModificarPrecioServicios === false
  const bloqueoPrecioProductos = facturacionConfig?.permitirModificarPrecioProductos === false
  const algunBloqueoPrecio = bloqueoPrecioServicios || bloqueoPrecioProductos
  const precioBloqueadoPara = (itemType: string | undefined) =>
    precioBloqueadoParaLinea(itemType, facturacionConfig ?? undefined)
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

  /** Inversa de `saleRate`: del precio visible al anchor (`baseRate`, moneda base y UDM de
   *  stock). Se usa al escribir el precio a mano para que el valor tecleado se vuelva la nueva
   *  base en vez de perderse en el próximo reprice. */
  function baseRateFromDisplayed(rate: number, factor: number = 1): number {
    const c = currency && currency !== monedaBase && conversionRate !== '' && Number(conversionRate) > 0
      ? Number(conversionRate)
      : 1
    const safeFactor = factor > 0 ? factor : 1
    return (rate * c) / safeFactor
  }

  /** Precio escrito a mano (solo cuando el toggle correspondiente está activo, el input viene
   *  habilitado). Marca la línea con `precioManual` para que los reprices automáticos la
   *  respeten. Los pisos de costo/precio mínimo siguen validando al guardar (diálogo de PIN). */
  function updateManualRate(index: number, raw: string) {
    if (raw.trim() === '') {
      updateItem(index, { rate: 0, baseRate: 0, precioManual: true })
      return
    }
    const parsed = Number(raw)
    if (Number.isNaN(parsed) || parsed < 0) return
    const row = items[index]
    if (!row) return
    updateItem(index, { rate: parsed, baseRate: baseRateFromDisplayed(parsed, row.conversionFactor), precioManual: true })
  }

  // Al elegir/cambiar moneda o tasa, se reconvierten los precios de las líneas ya cargadas en esta
  // sesión (con `_prices`, es decir, elegidas desde el catálogo) — no toca líneas hidratadas de una
  // cotización existente, que ya vienen en la moneda con la que se guardaron originalmente.
  useEffect(() => {
    setItems((prev) =>
      prev.map((row) => {
        if (!row._prices || !row.itemCode || row.precioManual) return row
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

  // GET /quotations/:id no devuelve itemName por línea (QuotationItem no lo trae) — se re-consulta
  // el catálogo para poder mostrar el Artículo al editar. De paso, esta misma consulta sirve para
  // la config de dimensiones del artículo: a diferencia de lo que originalmente documentaba
  // §10.2, GET /quotations/:id SÍ ecoa la combinación elegida por línea (confirmado en vivo
  // 2026-09-27) — se usa directamente para poblar la línea.
  useEffect(() => {
    if (!existingQuotation) return
    let cancelled = false
    Promise.all(existingQuotation.items.map((i) => getItemLookup(i.itemCode).catch(() => null))).then((catalogItems) => {
      if (cancelled) return
      setItems((prev) => prev.map((row, idx) => {
        const catalogItem = catalogItems[idx]
        const ei = existingQuotation.items[idx]
        if (!catalogItem) return row
        return {
          ...row,
          itemLabel: catalogItem.itemName,
          description: row.description || catalogItem.internalDescription || catalogItem.itemName,
          ...(catalogItem.usaDimensiones
            ? { itemDimensionesDeclaradas: catalogItem.dimensiones, dimensiones: ei?.dimensiones ?? row.dimensiones }
            : {}),
        }
      }))
    })
    return () => { cancelled = true }
  }, [existingQuotation])

  // ── Duplicar: precargar desde una cotización existente (no crea nada) ────
  const { data: duplicateSource } = useQuery({
    queryKey: ['quotation-duplicate-source', duplicateId],
    queryFn: () => getQuotationDuplicateSource(duplicateId!),
    enabled: !isEdit && !!duplicateId,
  })

  const { data: duplicateCustomer } = useQuery({
    queryKey: ['cliente-detalle', duplicateSource?.customer],
    queryFn: () => getClienteDetalle(duplicateSource!.customer),
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

  // GET .../duplicate-source no devuelve itemName por línea — se re-consulta el catálogo para
  // poder mostrar el Artículo. Igual que al editar: duplicar tampoco trae de vuelta la
  // combinación de dimensión de cada línea (§10.2) — la misma consulta sirve para saber cuáles
  // líneas la necesitan y mostrarles el selector, obligando a reingresarla antes de guardar.
  useEffect(() => {
    if (isEdit || !duplicateSource) return
    let cancelled = false
    Promise.all(duplicateSource.items.map((i) => getItemLookup(i.itemCode).catch(() => null))).then((catalogItems) => {
      if (cancelled) return
      setItems((prev) => prev.map((row, idx) => {
        const catalogItem = catalogItems[idx]
        if (!catalogItem) return row
        return {
          ...row,
          itemLabel: catalogItem.itemName,
          description: row.description || catalogItem.internalDescription || catalogItem.itemName,
          ...(catalogItem.usaDimensiones ? { itemDimensionesDeclaradas: catalogItem.dimensiones } : {}),
        }
      }))
    })
    return () => { cancelled = true }
  }, [duplicateSource, isEdit])

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
      const res = await lookupItems({ barcode: code, limit: 1, branch })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      const existingIndex = items.findIndex((row) => row.itemCode === item.id)
      if (existingIndex !== -1) {
        flashRow(existingIndex)
        focusLineQty(existingIndex)
        return
      }
      const targetIndex = items.length
      addRow()
      setTimeout(() => {
        selectCatalogItem(targetIndex, item, { autoAddRow: false })
        addRow()
        focusLineQty(targetIndex)
      }, 0)
    },
  })

  // ── Customer search ──────────────────────────────────────────────────────


  // Viene en GET /config/facturacion (ya cargado arriba): sin consulta de catálogo aparte.
  const defaultPriceTier = facturacionConfig?.defaultPriceTier ?? 'B'

  const currentUserEmail = getCachedUser()?.email
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser', currentUserEmail],
    queryFn: () => getUsuario(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 5 * 60_000,
  })

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const { data: myBranches, refetch: refetchMyBranches } = useQuery({
    queryKey: ['usuarioSucursales', currentUserEmail],
    queryFn: () => getUsuarioSucursales(currentUserEmail!),
    enabled: !!currentUserEmail,
  })


  useEffect(() => {
    if (myBranches?.defaultBranch && !branch && !isEdit) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  // ── Almacenes de la sucursal seleccionada (para el selector por línea) ───
  const { data: branchWarehouses } = useOpcionesArray('almacenes', { branch: branch, limit: 100, enabled: !!branch})

  // Al cambiar de sucursal, el almacén elegido en cada línea deja de ser válido
  useEffect(() => {
    setItems((prev) => prev.map((row) => (row.warehouse ? { ...row, warehouse: '', stockError: undefined } : row)))
  }, [branch])

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
        updated.stockError = validateLineStock(updated, stockSettings?.allowNegativeStock)
        return updated
      }),
    )
  }, [branchWarehouses])


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
       validTill,
       branch: branch || undefined,
       currency: currency || undefined,
       conversionRate: currency && currency !== monedaBase && conversionRate !== '' ? conversionRate : undefined,
       // §5.1 — antes de armar el payload, se fusionan líneas del mismo artículo con la MISMA
       // combinación de dimensión exacta, sumando la cantidad, para no dejarle al servidor un
       // único error de stock confuso sobre la suma de dos líneas separadas.
       items: mergeLineasIguales(items.filter((i) => i.itemCode), {
         getItemCode: (r) => r.itemCode,
         getDimensiones: (r) => r.dimensiones,
         sumQty: (base, extra) => {
           const qty = base.qty + extra.qty
           const amount = base.discountMode === 'amount'
             ? calcAmount(qty, base.rate, 0, base.discountAmount)
             : calcAmount(qty, base.rate, base.discountPct)
           return { ...base, qty, amount }
         },
       }).map((i) => ({
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
         // ⚠️ Se reenvía SIEMPRE que la línea la tenga, en cada create/PUT — este formulario
         // reemplaza el array `items[]` completo en cada guardado (incluso en una edición que solo
         // tocó el encabezado), y la heurística de conservación de líneas de `PUT /quotations/:id`
         // no es confiable cuando `items` se reenvía completo (§7.3/§10.1).
         dimensiones: i.dimensiones && Object.keys(i.dimensiones).length > 0 ? i.dimensiones : undefined,
       })),
       notes: notes || undefined,
       taxesTemplate: undefined,
     }
   }

   function submitDto() {
     const dto = buildDto()
     if (id) updateMutation.mutate(dto)
     else createMutation.mutate(dto)
   }

   /** Reintenta la MISMA operación (crear o editar) con `pinOverride` embebido, tras el 400 de
    *  "no puede ser menor al costo de compra" o "por debajo del precio mínimo" (docs/tasks/81 §1) — el backend verifica el PIN dentro de este mismo
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
    // docs/PROMPT_ERRORES_COMERCIALES_FRONTEND.md §4/§5.3 — la cotización dejó de ser editable
    // mientras se editaba. No hay una acción de enmienda local propia para Cotizaciones hoy — se
    // devuelve al detalle con el mensaje comercial del backend tal cual.
    if (id && isApiErrorCode(err, ERROR_CODES.DOC_SUBMITTED_IMMUTABLE)) {
      toast.error(msg || 'Esta cotización ya no se puede editar')
      navigate(`/cotizaciones/${id}`)
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
    if (isPinPrecioError(err)) {
      setCostPinModalOpen(true)
      return
    }
    // Candado "Permitir Modificar Precio Libremente" apagado — el rate no es A/B/C. Sin PIN
    // que lo salve: el mensaje del backend ya es comercial y se muestra tal cual, con duración
    // larga para que el operador lo lea completo.
    if (isPrecioCatalogoError(err)) {
      toast.error(msg, { duration: 10000 })
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
          updated.stockError = validateLineStock(updated, stockSettings?.allowNegativeStock)
        }
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
          maxDiscountPct: s.item.allowsDiscount ? (s.item.maxDiscountPct ?? undefined) : undefined,
          autoDiscountPct: s.item.autoDiscount?.discountType === 'Discount Percentage' ? s.item.autoDiscount.discountPercentage : undefined,
          manualDiscountPct: 0,
          allowsDiscount: s.item.allowsDiscount ?? undefined,
          _prices: s.item.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: s.item.stockByWarehouse ?? undefined,
          itemDimensionesDeclaradas: s.item.usaDimensiones ? s.item.dimensiones : undefined,
          dimensiones: undefined,
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
          precioManual: undefined,
          conversionFactor: 1,
          amount: calcAmount(row.qty, rate, (autoDiscountPct ?? 0) + defaultManualPct, 0),
          maxDiscountPct: catalogItem.allowsDiscount ? (catalogItem.maxDiscountPct ?? undefined) : undefined,
          autoDiscountPct,
          discountPct: (autoDiscountPct ?? 0) + defaultManualPct,
          discountMode: 'pct' as const,
          discountAmount: 0,
          manualDiscountPct: defaultManualPct,
          allowsDiscount: catalogItem.allowsDiscount ?? undefined,
          uom: catalogItem.stockUom ?? row.uom,
          _prices: catalogItem.prices,
          salesTaxPct: catalogItem.salesTaxPct ?? 0,
          salesTaxTemplate: catalogItem.salesTaxTemplate ?? '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: catalogItem.stockByWarehouse ?? undefined,
          stockError: undefined,
          // Un artículo nuevo en la fila implica una combinación nueva — nunca arrastramos la
          // combinación del artículo anterior (§5).
          itemDimensionesDeclaradas: catalogItem.usaDimensiones ? catalogItem.dimensiones : undefined,
          dimensiones: undefined,
        }
      })
    })
    // El picker puede no traer `dimensiones` — solo el detalle las garantiza (§4.3). Si faltan,
    // se completan para habilitar la columna de dimensión.
    if (!catalogItem.dimensiones || catalogItem.dimensiones.length === 0) {
      getItemLookup(catalogItem.id).then((detail) => {
        if (!detail?.usaDimensiones || !detail.dimensiones || detail.dimensiones.length === 0) return
        setItems((prev) => prev.map((row, i) =>
          i === index && row.itemCode === catalogItem.id && !(row.itemDimensionesDeclaradas?.length)
            ? { ...row, itemDimensionesDeclaradas: detail.dimensiones }
            : row,
        ))
      }).catch(() => {})
    }
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
          precioManual: undefined,
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
          // Un combo agrupa varios artículos — la combinación de dimensión no aplica a nivel de
          // línea de combo (§0), así que nunca se muestra el selector para esta fila.
          itemDimensionesDeclaradas: undefined,
          dimensiones: undefined,
        }
      })
    })
    if (wasLastRow) addRow()
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, precioManual: undefined, discountPct: 0, discountMode: 'pct', discountAmount: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', itemDimensionesDeclaradas: undefined, dimensiones: undefined })
  }

  // ── Reprice on customer change ───────────────────────────────────────────
  useEffect(() => {
    const tier = customerPriceTier ?? defaultPriceTier ?? 'B'
    setItems((prev) =>
      prev.map((row) => {
        if (!row._prices || row.precioManual) return row
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

  // Al editar, la línea ya se precarga con su combinación real (ver efecto de arriba). Al
  // duplicar, el endpoint de duplicate-source no está confirmado que la traiga — se le pide al
  // usuario que la reingrese en ese caso. Red de seguridad para ambos si igual queda incompleta.
  const lineasRequierenReingresoDimension = (isEdit || !!duplicateId) && items.some(
    (i) => (i.itemDimensionesDeclaradas?.length ?? 0) > 0 && !combinacionCompleta(i.itemDimensionesDeclaradas ?? [], i.dimensiones ?? {}),
  )

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
    validTill,
    items,
    notes,
    branch,
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
      // Artículo con dimensión de inventario: exige la combinación completa antes de someter
      // (§0.2, §11) — evita un 400 confuso del servidor sobre una línea sin identificar.
      if (
        (row.itemDimensionesDeclaradas?.length ?? 0) > 0
        && !combinacionCompleta(row.itemDimensionesDeclaradas ?? [], row.dimensiones ?? {})
      ) {
        toast.error(`Artículo #${num} (${row.itemLabel ?? row.itemCode}): selecciona la dimensión completa antes de guardar`)
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
          <h1 className="page-title"><span className="page-title-dot" />{id ? 'Editar Cotización' : 'Nueva Cotización'}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton label="Actualizar" />
        </div>
      </div>

      {lineasRequierenReingresoDimension && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 0 }}>
          <Info size={16} />
          <span>Esta cotización tiene línea(s) con un artículo que usa dimensión de inventario incompleta. Selecciónala en la columna «Dimensión» antes de guardar, o esa línea será rechazada.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* ── Información General ─────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header navy-card-header">
            <h2 className="card-title">Información General</h2>
          </div>
          <div className="card-body">
            <div className="form-row">
<div className="ff-wrap" style={multimonedaHabilitada ? undefined : { gridColumn: 'span 2' }}>
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
                   <OpcionesSelect recurso="clientes" id="customer" value={customerId} onChange={(id, opt) => {
                       const cid = id === '' ? '' : (opt?.value ?? id)
                       setCustomerId(cid)
                       setCustomerName(opt?.label ?? '')
                       setCustomerPriceTier(undefined)
                       setCustomerDefaultDiscountPct(undefined)
                       // /opciones solo trae value/label: tarifa y descuento salen del detalle del cliente.
                       if (cid) {
                         getClienteDetalle(cid).then((c) => {
                           setCustomerPriceTier(c.priceTier)
                           setCustomerDefaultDiscountPct(c.descuentoDefaultPct ?? undefined)
                         }).catch(() => {})
                       }
                     }} placeholder="Buscar cliente…" error={!customerId} headerContent={
                       <button
                         type="button"
                         className="btn btn-ghost btn-size-sm"
                         style={{ width: '100%', justifyContent: 'flex-start' }}
                         onClick={() => setShowCreateCustomer(true)}
                       >
                         <UserPlus size={14} /> Agregar cliente
                       </button>
                     } selectedLabel={customerName} minChars={2} />
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

              {/* La fecha de la cotización ya no la fija el cliente — el servidor siempre la
                  asigna con el momento real del request (evita el desfase cronológico con
                  inventario que rompía el submit). En edición se muestra de solo lectura,
                  informativa; en alta no hay nada que mostrar todavía. */}
              {id && (
                <div className="ff-wrap">
                  <span className="ff-label">Fecha</span>
                  <span className="ff-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                    {existingQuotation?.date ? formatDate(existingQuotation.date) : ''}
                  </span>
                </div>
              )}

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
                <OpcionesSelect recurso="sucursales" id="branch" value={branch} onChange={(val) => setBranch(val)} placeholder="Sin especificar" error={!branch} className="ff-select" selectedLabel={branch} />
              </div>

            </div>
          </div>
        </div>

        {/* ── Artículos ───────────────────────────────────────────────────── */}
        <div className="card">
          <div className="items-table-wrap">
            <table className="items-table navy-table items-table-resizable">
              <colgroup>
                {ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th>
                    Código
                    <span className="col-resize-handle" onMouseDown={startResize('codigo')} />
                  </th>
                  <th>
                    Artículo
                    <span className="col-resize-handle" onMouseDown={startResize('articulo')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Cant.
                    <span className="col-resize-handle" onMouseDown={startResize('cant')} />
                  </th>
                  <th>
                    UDM
                    <span className="col-resize-handle" onMouseDown={startResize('udm')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Precio Unit.
                    {algunBloqueoPrecio && (
                      <Lock size={11} style={{ marginLeft: 4, verticalAlign: 'middle', color: 'var(--text-tertiary)' }} aria-label="Precio de catálogo en líneas bloqueadas — edición deshabilitada" />
                    )}
                    <span className="col-resize-handle" onMouseDown={startResize('precio')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Descuento
                    <span className="col-resize-handle" onMouseDown={startResize('descuento')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    ITBIS
                    <span className="col-resize-handle" onMouseDown={startResize('itbis')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Subtotal
                    <span className="col-resize-handle" onMouseDown={startResize('subtotal')} />
                  </th>
                   <th style={{ textAlign: 'right' }}>
                    Dimensión
                    <span className="col-resize-handle" onMouseDown={startResize('combination')} />
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
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
                      {/* Código — solo lectura, informativo */}
                      <td>
                        <span className="td-muted" style={{ fontSize: 12 }}>{item.itemCode || '—'}</span>
                      </td>

                      {/* Artículo — SearchSelect por catálogo (la descripción de la línea se
                          autopobla al seleccionar, ver selectCatalogItem/selectBundle — ya no
                          hace falta un campo de descripción editable aparte, era redundante). */}
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

                      <td>
                        <QtyInput
                          id={lineQtyId(index)}
                          className={`items-input${(submitted && (!item.qty || item.qty <= 0)) || item.stockError ? ' items-input-error' : ''}`}
                          value={item.qty}
                          uom={item.uom}
                          onChange={(v) => updateItem(index, { qty: v })}
                          style={{ textAlign: 'right' }}
                        />
                        {item.stockError && (
                          <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                            {item.stockError}
                          </span>
                        )}
                      </td>

                      <td>
                        {item.itemType === 'service' || item.itemType === 'combo' ? (
                          <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                        ) : (
                          <UomSelect
                            value={item.uom}
                            onChange={(v, factor) => {
                              // Con precio manual se conserva el valor tecleado y solo se re-ancla
                              // la base a la nueva UDM; sin precio manual se recalcula del catálogo.
                              if (item.precioManual) updateItem(index, { uom: v, conversionFactor: factor, baseRate: baseRateFromDisplayed(item.rate, factor) })
                              else updateItem(index, { uom: v, rate: saleRate(item.baseRate, factor), conversionFactor: factor })
                            }}
                            itemCode={item.itemCode || undefined}
                            error={submitted && !item.uom}
                            direction="sale"
                          />
                        )}
                      </td>

                      <td title={precioBloqueadoPara(item.itemType) ? 'Precio de catálogo — la edición manual está deshabilitada para este tipo de artículo' : 'Precio editable — los pisos de costo/mínimo se validan al guardar'}>
                        <input
                          className={`items-input${submitted && (!item.rate || item.rate <= 0) ? ' items-input-error' : ''}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={precioBloqueadoPara(item.itemType) ? round2(item.rate) : (item.rate ?? '')}
                          disabled={precioBloqueadoPara(item.itemType)}
                          onChange={(e) => updateManualRate(index, e.target.value)}
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
                        {item.itemDimensionesDeclaradas && item.itemDimensionesDeclaradas.length > 0 && (
                          <CombinacionDimensionSelector
                            itemDimensiones={item.itemDimensionesDeclaradas}
                            value={item.dimensiones ?? {}}
                            onChange={(v) => updateItem(index, { dimensiones: v })}
                            compact
                          />
                        )}
                      </td>

                      <td onClick={(e) => e.stopPropagation()} className="actions-cell" style={{ position: 'relative', verticalAlign: 'middle' }}>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-size-icon-xs"
                            onClick={() => setViewItemCode(item.itemCode)}
                            disabled={!item.itemCode}
                            title="Ver detalle"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-size-icon-xs"
                            onClick={() => removeRow(index)}
                            title="Eliminar"
                            style={{ color: 'var(--error-text)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}>
              <Plus size={14} /> Agregar artículo
            </button>
            {hasAnyDiscount && (
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={undoDiscounts}>
                <RotateCcw size={13} /> Deshacer descuentos
              </button>
            )}
          </div>

          <div className="items-total-row navy-totals">
            <div className="items-total-line" style={{ fontSize: 16, justifyContent: 'flex-end', gap: 24 }}>
                <span style={{ textAlign: 'right' }}>Subtotal</span>
                <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(grossTotal, currency || monedaBase)}</span>
              </div>

              <div className="items-total-line" style={{ fontSize: 16, justifyContent: 'flex-end', gap: 24 }}>
                <span style={{ textAlign: 'right' }}>Descuento</span>
                <span style={{ textAlign: 'left', minWidth: 170 }}>-{formatMoney(totalDiscount, currency || monedaBase)}</span>
              </div>

              <div className="items-total-line" style={{ fontSize: 16, justifyContent: 'flex-end', gap: 24 }}>
                <span style={{ textAlign: 'right' }}>Impuesto</span>
                <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(taxTotal, currency || monedaBase)}</span>
              </div>
              <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, justifyContent: 'flex-end', gap: 24 }}>
                <span style={{ fontSize: 20, color: '#FCB124', textAlign: 'right' }}>Total</span>
                <span style={{ fontSize: 20, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>{formatMoney(total, currency || monedaBase)}</span>
              </div>
            </div>
        </div>

        {/* ── Notas ───────────────────────────────────────────────────────── */}
        <div className="card">
          <div
            className="card-header navy-card-header"
            style={{ cursor: 'pointer' }}
            onClick={() => setNotesOpen((o) => !o)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="card-title">Notas</h2>
              <button
                type="button"
                className="navy-header-toggle-btn icon-swap"
                aria-expanded={notesOpen}
                aria-label={notesOpen ? 'Ocultar notas' : 'Mostrar notas'}
                onClick={(e) => { e.stopPropagation(); setNotesOpen((o) => !o) }}
              >
                {notesOpen ? <Minus size={13} /> : <Plus size={13} />}
              </button>
            </div>
            {!notesOpen && (
              <span className="navy-header-hint">
                Agrega comentarios para aclarar datos de la cotización, serán visibles PDF.
              </span>
            )}
          </div>
          {notesOpen && (
            <div className="card-body">
              <textarea
                className="ff-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condiciones comerciales, términos de entrega, observaciones..."
                rows={3}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(isEdit ? `/cotizaciones/${id}` : '/cotizaciones')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-navy" disabled={isPending}>
            {isPending
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={15} />}
            {isEdit ? 'Guardar cambios' : 'Guardar Borrador'}
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
        description="Esta línea se vendería por debajo del costo o del precio mínimo. Ingresa un PIN de administrador para autorizarlo."
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
