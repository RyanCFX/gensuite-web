import { useState, useEffect, useMemo, Fragment } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createInvoice } from '@/shared/api/invoices'
import { listCustomers } from '@/shared/api/customers'
import { client } from '@/shared/api/client'
import { listItems, getDefaultPriceTier, getItem } from '@/shared/api/catalog'
import { listImpuestosVentas, listAlmacenes, getCatalogosFiscales, getStockSettings } from '@/shared/api/config'
import { getItemUbicaciones } from '@/shared/api/ubicaciones'
import type { CreateInvoiceDto, Customer, SemaforoEntry, SemaforoResult, Item, ItemPrices, Bundle, ComponentTracking } from '@/shared/api/types'
import { ComponentTrackingModal } from '@/components/shared/ComponentTrackingModal'
import type { TrackedComponent } from '@/components/shared/ComponentTrackingModal'
import { TrackedComponentEditor } from '@/components/shared/TrackedComponentEditor'
import { ENDPOINTS } from '@/shared/api/endpoints'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Eye, Loader2, Info } from 'lucide-react'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'

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
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'

const SYSTEM_MANAGER_ROLE = 'System Manager'


type NcfType = string

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
  /** Porcentaje de descuento automático del Pricing Rule (solo lectura, se suma al manual) */
  autoDiscountPct?: number
  /** Descuento manual que escribe el vendedor (encima del automático) */
  manualDiscountPct: number
  allowsDiscount?: boolean
  _stockByWarehouse?: Record<string, number>
  stockError?: string
  /** Ubicación/rack específico dentro del almacén elegido, si el artículo tiene alguna asignada ahí */
  ubicacion?: string
  /** Mensaje cuando el backend rechazó la venta por ambigüedad de ubicación (varias con stock) — obliga a elegir una */
  ubicacionError?: string
  /** Componentes del combo con tracking de serial/lote activo (solo si itemType === 'combo') */
  _comboComponents?: { itemCode: string; itemName?: string; trackingType: 'serial' | 'batch'; qtyPerCombo: number }[]
  componentTracking?: ComponentTracking[]
}

function validateLineStock(row: LineItem): string | undefined {
  if (!row.warehouse || !row._stockByWarehouse) return undefined
  const available = row._stockByWarehouse[row.warehouse] ?? 0
  if (row.qty > available) {
    return `Stock insuficiente en ${row.warehouse}. Disponible: ${available}`
  }
  return undefined
}

/** Requerimiento de seriales/lotes por componente, recalculado según la cantidad actual de la línea */
function getTrackingRequirement(row: LineItem): TrackedComponent[] {
  return (row._comboComponents ?? []).map((c) => ({
    itemCode: c.itemCode,
    itemName: c.itemName,
    trackingType: c.trackingType,
    qtyNeeded: c.qtyPerCombo * row.qty,
    warehouse: row.warehouse || undefined,
  }))
}

function isTrackingComplete(row: LineItem): boolean {
  const requirement = getTrackingRequirement(row)
  if (requirement.length === 0) return true
  return requirement.every((req) => {
    const entry = row.componentTracking?.find((t) => t.itemCode === req.itemCode)
    if (req.trackingType === 'serial') return (entry?.serials?.length ?? 0) === req.qtyNeeded
    const sum = (entry?.batches ?? []).reduce((s, b) => s + Number(b.qty || 0), 0)
    return sum === req.qtyNeeded && (entry?.batches?.length ?? 0) > 0
  })
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

/** Selector de ubicación/rack de la línea — solo se muestra si el artículo tiene alguna ubicación
 *  asignada en el almacén elegido. Si no tiene ninguna, no hay nada que elegir. */
function LineUbicacionCell({
  itemCode,
  warehouse,
  value,
  error,
  onChange,
}: {
  itemCode: string
  warehouse: string
  value?: string
  error?: string
  onChange: (ubicacion: string) => void
}) {
  const { data } = useQuery({
    queryKey: ['item-ubicaciones', itemCode, warehouse],
    queryFn: () => getItemUbicaciones(itemCode, warehouse),
    enabled: !!itemCode && !!warehouse,
  })
  const ubicaciones = data?.items ?? []

  if (data?.note || ubicaciones.length === 0) {
    return <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
  }

  return (
    <>
      <select
        className={`ff-select${error ? ' items-input-error' : ''}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Sin especificar</option>
        {ubicaciones.map((u) => (
          <option key={u.id} value={u.ubicacionId}>
            {u.zonaName ? `${u.zonaName} / ${u.ubicacionName ?? u.ubicacionId}` : u.ubicacionName ?? u.ubicacionId}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'normal', maxWidth: 160 }}>
          {error}
        </span>
      )}
    </>
  )
}

export default function InvoiceForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [esClienteOcasional, setEsClienteOcasional] = useState(false)
  const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
  const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')
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
  const [trackingModalIndex, setTrackingModalIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [ncfTypeSearch, setNcfTypeSearch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [taxesTemplate, setTaxesTemplate] = useState('')
  const [taxesTemplateSearch, setTaxesTemplateSearch] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')

  // ── Stock settings: define si los seriales/lotes se capturan inline en la fila (useSerialBatchFields)
  //    o vía diálogo emergente (ComponentTrackingModal). El catálogo es fijo, se cachea 1h.
  const { data: stockSettings } = useQuery({
    queryKey: ['stock-settings'],
    queryFn: getStockSettings,
    staleTime: 60 * 60_000,
  })
  const useInlineSerialBatch = stockSettings?.useSerialBatchFields === true

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

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })

  const ncfTypeOptions: SearchSelectOption[] = useMemo(() => {
    const q = ncfTypeSearch.toLowerCase()
    return (catalogos?.ncfTypes ?? []).filter((t) => !q || t.label.toLowerCase().includes(q))
  }, [catalogos, ncfTypeSearch])

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

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
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

  // ── Auto-select NCF type for ocasional customers ────────────────────────
  useEffect(() => {
    if (!esClienteOcasional) return
    if (clienteOcasionalRnc.trim()) {
      setNcfType('B01')
    } else {
      setNcfType('B02')
    }
  }, [esClienteOcasional, clienteOcasionalRnc])

  // ── Mutations ─────────────────────────────────────────────────────────────
  /** Cuando el backend rechaza la venta por tener stock repartido en varias ubicaciones del mismo
   *  almacén, marca la línea afectada para que el cajero elija una ahí mismo en vez de un toast genérico. */
  function tryResolveUbicacionAmbiguity(msg: string): boolean {
    const match = msg.match(/art[ií]culo\s+([A-Za-z0-9_.-]+)\s+tiene stock en varias ubicaciones/i)
    const itemCode = match?.[1]
    if (!itemCode) return false

    let found = false
    setItems((prev) =>
      prev.map((row) => {
        if (row.itemCode !== itemCode) return row
        found = true
        return { ...row, ubicacionError: 'Selecciona la ubicación específica desde la que se venderá este artículo.' }
      }),
    )
    if (!found) return false

    toast.error(`El artículo ${itemCode} tiene stock en varias ubicaciones. Selecciona una en la línea correspondiente.`)
    return true
  }

  const createMutation = useMutation({
    mutationFn: (dto: CreateInvoiceDto) => createInvoice(dto),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Factura creada como borrador')
      navigate(`/facturas/${invoice.id}`)
    },
    onError: (err: { message?: string; code?: string }) => {
      const msg = err?.message ?? ''
      if (isApiErrorCode(err, ERROR_CODES.BRANCH_REQUIRED)) {
        setBranchError(true)
        toast.error(msg || 'Selecciona una sucursal')
        return
      }
      if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) { setPinModalOpen(true); return }
      if (msg.toLowerCase().includes('no tienes acceso a la sucursal')) {
        refetchMyBranches()
        toast.error(`${msg} Tus sucursales asignadas se actualizaron, vuelve a intentar.`)
        return
      }
      if (tryResolveUbicacionAmbiguity(msg)) return
      if (msg.toLowerCase().includes('ubicac')) {
        toast.error(msg || 'Error al crear la factura', {
          action: {
            label: 'Ver pendientes',
            onClick: () => navigate('/inventario/zonas?tab=pendientes'),
          },
        })
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
         if ('manualDiscountPct' in patch) {
           updated.discountPct = (updated.autoDiscountPct ?? 0) + (updated.manualDiscountPct ?? 0)
         }
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
        const updated = { ...item, warehouse, qty, amount: calcAmount(qty, item.rate, item.discountPct), ubicacion: undefined, ubicacionError: undefined }
        updated.stockError = validateLineStock(updated)
        return updated
      }),
    )
  }

  function updateComponentTracking(
    index: number,
    itemCode: string,
    patch: { serials?: string[]; batches?: { batchId: string; qty: number }[] },
  ) {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const others = (row.componentTracking ?? []).filter((t) => t.itemCode !== itemCode)
        return { ...row, componentTracking: [...others, { itemCode, ...patch }] }
      }),
    )
  }

  function trackingEntry(row: LineItem, itemCode: string) {
    return row.componentTracking?.find((t) => t.itemCode === itemCode)
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
          autoDiscountPct: catalogItem.autoDiscount?.discountType === 'Discount Percentage' ? catalogItem.autoDiscount.discountPercentage : undefined,
          manualDiscountPct: 0,
          allowsDiscount: catalogItem.allowsDiscount,
          _prices: catalogItem.prices,
          salesTaxPct: catalogItem.salesTaxPct ?? 0,
          salesTaxTemplate: catalogItem.salesTaxTemplate ?? '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: catalogItem.stockByWarehouse,
          stockError: undefined,
          _comboComponents: undefined,
          componentTracking: undefined,
          ubicacion: undefined,
          ubicacionError: undefined,
        }
      }),
    )
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, discountPct: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', _comboComponents: undefined, componentTracking: undefined, ubicacion: undefined, ubicacionError: undefined })
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
          uom: bundle.itemUom ?? '',
          conversionFactor: 1,
          maxDiscountPct: undefined,
          _prices: bundle.prices,
          salesTaxPct: 0,
          salesTaxTemplate: '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: undefined,
          stockError: undefined,
          _comboComponents: undefined,
          componentTracking: undefined,
          ubicacion: undefined,
          ubicacionError: undefined,
        }
      }),
    )

    // Detecta componentes del combo con tracking de serial/lote — solo aplica a facturación directa.
    Promise.all(
      (bundle.components ?? []).map(async (c) => {
        try {
          const item = await getItem(c.itemCode)
          if (item.trackingType === 'serial' || item.trackingType === 'batch') {
            return { itemCode: c.itemCode, itemName: item.itemName, trackingType: item.trackingType, qtyPerCombo: c.qty }
          }
        } catch {
          // ignora — si falla la consulta del componente, no se bloquea la selección del combo
        }
        return null
      }),
    ).then((results) => {
      const tracked = results.filter((r): r is NonNullable<typeof r> => r != null)
      if (tracked.length === 0) return
      setItems((prev) => prev.map((row, i) => (i === index ? { ...row, _comboComponents: tracked } : row)))
      // En modo inline (useSerialBatchFields) los campos se muestran en la fila; sin modal.
      if (!useInlineSerialBatch) setTrackingModalIndex(index)
    })
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
    if (!branch) {
      toast.error('Debe seleccionar una sucursal antes de agregar artículos.')
      return
    }
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, amount: 0, discountPct: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', uom: 'Unidad', conversionFactor: 1, warehouse: '' }])
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
       if (ncfType === 'B01' && !clienteOcasionalRnc.trim()) {
         toast.error('El RNC es requerido para comprobante B01 (Crédito Fiscal)')
         return
       }
     } else {
       if (!customerId) {
         toast.error('Selecciona un cliente')
         return
       }
       if (ncfType === 'B01' && !selectedCustomer?.rnc) {
         toast.error('El cliente necesita RNC para comprobante B01 (Crédito Fiscal)')
         return
       }
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
      if (item.stockError) {
        toast.error(`Línea ${i + 1}: ${item.stockError}`)
        return
      }
      if (!isTrackingComplete(item)) {
        toast.error(`Línea ${i + 1}: selecciona las series/lotes de los componentes del combo antes de continuar`)
        return
      }
    }

const itemsDto = items.map((i) => ({
       itemCode: i.itemCode,
       description: i.description,
       qty: i.qty,
       rate: i.rate,
       discountPct: i.discountPct || undefined,
       uom: i.uom || undefined,
       warehouse: i.warehouse || undefined,
       ubicacion: i.ubicacion || undefined,
       componentTracking: i.componentTracking,
     }))

     const baseDto = {
       ...(esClienteOcasional
         ? { clienteOcasionalNombre: clienteOcasionalNombre || undefined, clienteOcasionalRnc: clienteOcasionalRnc || undefined }
         : { customer: customerId }),
       postingDate,
       dueDate,
       branch: branch || undefined,
       department: department || undefined,
       ncfType,
       items: itemsDto,
       notes: notes || undefined,
       taxesTemplate: taxesTemplate || undefined,
     }

     createMutation.mutate(baseDto)
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
                 )}
                 {selectedCustomer && !esClienteOcasional && (
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
               <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                   <input type="checkbox" checked={esClienteOcasional} onChange={(e) => { setEsClienteOcasional(e.target.checked); if (e.target.checked) { setCustomerId(''); setSelectedCustomer(null); setSemaforo(null) } }} />
                   Venta ocasional (cliente no registrado)
                 </label>
                 {esClienteOcasional && (
                   <p className="ff-hint" style={{ marginTop: 4 }}>
                     Ingresa el nombre del cliente. Para Crédito Fiscal (B01), también se requiere el RNC.
                   </p>
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
                   selectedLabel={(catalogos?.ncfTypes ?? []).find((t) => t.value === ncfType)?.label ?? ''}
                   onChange={(val) => setNcfType((val || 'B02') as NcfType)}
                   options={ncfTypeOptions}
                   onSearch={setNcfTypeSearch}
                   className="ff-select"
                 />
                 {ncfType === 'B01' && !selectedCustomer?.rnc && !esClienteOcasional && (
                   <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                     B01 requiere RNC del cliente
                   </p>
                 )}
                 {ncfType === 'B01' && esClienteOcasional && (
                   <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                     B01 requiere RNC del cliente ocasional
                   </p>
                 )}
               </div>

               {esClienteOcasional && ncfType === 'B01' && (
                 <div className="ff-wrap">
                   <label className="ff-label ff-required" htmlFor="clienteOcasionalRnc">RNC del cliente</label>
                   <input
                     id="clienteOcasionalRnc"
                     type="text"
                     className="ff-input"
                     value={clienteOcasionalRnc}
                     onChange={(e) => setClienteOcasionalRnc(e.target.value)}
                     placeholder="RNC del cliente ocasional"
                     required
                   />
                 </div>
               )}

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="branch">Sucursal</label>
                <SearchSelect
                  id="branch"
                  value={branch}
                  selectedLabel={branch}
                  error={!branch || branchError}
                  onChange={(val) => { setBranch(val); setBranchError(false) }}
                  options={branchSelectOptions}
                  onSearch={setBranchSearch}
                  placeholder="Sin especificar"
                  className="ff-select"
                  disabled={branchOptions.length === 1}
                />
                {branchError && <p className="ff-hint" style={{ color: 'var(--color-danger)' }}>Debes seleccionar una sucursal para continuar</p>}
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="department">Departamento</label>
                <DepartmentSelect id="department" value={department} onChange={setDepartment} />
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
                  className="ff-select"
                />
                <p className="ff-hint">Impuesto aplicado al total de la factura (ej. ITBIS 18%). Si no eliges ninguno, se usa el template marcado como default, si existe.</p>
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
                  <th style={{ textAlign: 'right', width: 72 }}>
                  Dto. %
                  <Info size={11} style={{ marginLeft: 2, verticalAlign: 'middle', color: 'var(--text-tertiary)' }} title="El descuento puede incluir una parte automática (Pricing Rule) y una parte manual del vendedor. Ambas se suman contra el tope máximo." />
                </th>
                  <th style={{ textAlign: 'right', width: 80 }}>Impuesto</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 56 }}>UDM</th>
                  <th style={{ width: 140 }}>Almacén</th>
                  <th style={{ width: 140 }}>Ubicación</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                      No hay artículos. Agrega uno con el botón de abajo.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <Fragment key={index}>
                    <tr>
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
                        <input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" />
                      </td>
                      <td>
                        <input className={`items-input${item.stockError ? ' items-input-error' : ''}`} type="number" min="0" step="1" value={item.qty} onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                        {item.stockError && (
                          <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                            {item.stockError}
                          </span>
                        )}
                      </td>
                      <td>
                        <input className="items-input" type="number" min="0" step="0.01" value={item.rate} disabled style={{ textAlign: 'right' }} />
                      </td>
                       <td>
                         {(() => {
                           const autoPct = item.autoDiscountPct ?? 0
                           const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
                           const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
                           const priceLimit = maxDiscFromPrices(item.rate, item._prices)
                           const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
                           const allowsManual = item.allowsDiscount !== false
                           return (
                             <>
                               {autoPct > 0 && (
                                 <div style={{ marginBottom: 4 }}>
                                   <span className="badge badge-discount" style={{ fontSize: 10, padding: '2px 6px' }}>
                                     {autoPct}% auto
                                   </span>
                                 </div>
                               )}
                               <input
                                 className={`items-input${submitted && item.discountPct > effectiveLimit ? ' items-input-error' : ''}`}
                                 type="number"
                                 min="0"
                                 max="100"
                                 step="0.1"
                                 value={item.manualDiscountPct}
                                 onChange={(e) => updateItem(index, { manualDiscountPct: parseFloat(e.target.value) || 0 })}
                                 style={{ textAlign: 'right', width: 56 }}
                                 disabled={!allowsManual}
                                 title={allowsManual ? undefined : 'Este artículo no acepta descuentos'}
                               />
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
                      <td>
                        {item.itemCode && item.warehouse ? (
                          <LineUbicacionCell
                            itemCode={item.itemCode}
                            warehouse={item.warehouse}
                            value={item.ubicacion}
                            error={item.ubicacionError}
                            onChange={(val) => updateItem(index, { ubicacion: val || undefined, ubicacionError: undefined })}
                          />
                        ) : (
                          <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
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
                    {item.itemType === 'combo' && item._comboComponents && item._comboComponents.length > 0 && (
                      <tr>
                        <td colSpan={11} style={{ padding: '4px 12px 10px' }}>
                          {useInlineSerialBatch ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {getTrackingRequirement(item).map((req) => {
                                const entry = trackingEntry(item, req.itemCode)
                                return (
                                  <TrackedComponentEditor
                                    key={req.itemCode}
                                    component={req}
                                    serials={entry?.serials ?? []}
                                    onChangeSerials={(s) => updateComponentTracking(index, req.itemCode, { serials: s })}
                                    batches={entry?.batches ?? []}
                                    onChangeBatches={(b) => updateComponentTracking(index, req.itemCode, { batches: b })}
                                  />
                                )
                              })}
                            </div>
                          ) : isTrackingComplete(item) ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-success)' }}>
                              ✓ Series/lotes de componentes asignados
                              <button type="button" className="btn btn-ghost btn-size-xs" onClick={() => setTrackingModalIndex(index)}>
                                Editar
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-warning)' }}>
                              ⚠ Este combo requiere seleccionar series/lotes de sus componentes
                              <button type="button" className="btn btn-secondary btn-size-xs" onClick={() => setTrackingModalIndex(index)}>
                                Seleccionar series/lotes
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
                <span>Subtotal</span>
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
             discountPct: i.discountPct || undefined, uom: i.uom || undefined, warehouse: i.warehouse || undefined,
             ubicacion: i.ubicacion || undefined,
             componentTracking: i.componentTracking,
           }))
           const baseDto = {
             ...(esClienteOcasional
               ? { clienteOcasionalNombre: clienteOcasionalNombre || undefined, clienteOcasionalRnc: clienteOcasionalRnc || undefined }
               : { customer: customerId }),
             postingDate, dueDate, branch: branch || undefined, department: department || undefined, ncfType,
             items: itemsDto,
             notes: notes || undefined,
             taxesTemplate: taxesTemplate || undefined,
           }
           createMutation.mutate(baseDto)
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

      {trackingModalIndex != null && items[trackingModalIndex] && (
        <ComponentTrackingModal
          bundleName={items[trackingModalIndex].itemLabel ?? items[trackingModalIndex].itemCode}
          components={getTrackingRequirement(items[trackingModalIndex])}
          initial={items[trackingModalIndex].componentTracking}
          onConfirm={(tracking) => {
            updateItem(trackingModalIndex, { componentTracking: tracking })
            setTrackingModalIndex(null)
          }}
          onClose={() => setTrackingModalIndex(null)}
        />
      )}
    </div>
  )
}
