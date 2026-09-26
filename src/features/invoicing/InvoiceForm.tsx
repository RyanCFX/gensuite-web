import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { createInvoice, updateInvoice, getInvoice } from '@/shared/api/invoices'
import { usePermissionsStore } from '@/stores/permissions.store'
import { AseguradoraPanel, CoberturaArsResumen } from './AseguradoraPanel'
import { RecargarButton } from '@/components/shared/RecargarButton'
import {
  EMPTY_ASEGURADORA_FORM,
  aseguradoraFormFromInvoice,
  aseguradoraFormToDto,
  validarAseguradoraForm,
  type AseguradoraFormState,
} from './aseguradoraForm'
import { esCoberturaCompleta } from '@/shared/api/types'
import { listCustomers, getCustomer } from '@/shared/api/customers'
import { client } from '@/shared/api/client'
import { listItems, getDefaultPriceTier, getItem } from '@/shared/api/catalog'
import { listImpuestosVentas, listAlmacenes, getCatalogosFiscales, getStockSettings, getFacturacionConfig } from '@/shared/api/config'
import { getItemUbicaciones } from '@/shared/api/ubicaciones'
import type { CreateInvoiceDto, UpdateInvoiceDto, Customer, SemaforoEntry, SemaforoResult, Item, ItemPrices, Bundle, ComponentTracking, ItemStock, MonedaCode } from '@/shared/api/types'
import { getTasaVigente } from '@/shared/api/monedas'
import { ComponentTrackingModal } from '@/components/shared/ComponentTrackingModal'
import type { TrackedComponent } from '@/components/shared/ComponentTrackingModal'
import { TrackedComponentEditor } from '@/components/shared/TrackedComponentEditor'
import { ENDPOINTS } from '@/shared/api/endpoints'
import { formatDOP, formatMoney, round2, formatDate } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Minus, Trash2, Eye, Loader2, Info, UserPlus, Lock, LockOpen, ChevronDown, RotateCcw } from 'lucide-react'
import { CustomerQuickCreateModal } from '@/features/customers/CustomerQuickCreateModal'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { useTabs } from '@/contexts/TabsContext'

import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { BusquedaAsistidaPanel } from './BusquedaAsistidaPanel'
import { UomSelect } from '@/shared/ui/UomSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { DatePicker } from '@/shared/ui/DatePicker'
import { PinModal } from '@/components/shared/PinModal'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales, getSucursal } from '@/shared/api/sucursales'
import { getCachedUser } from '@/shared/api/storage'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { useItemsStock, resolveDisponible } from '@/shared/hooks/useItemsStock'
import { useItemInventory } from '@/shared/hooks/useItemInventory'
import { formatStockInsufficientMessage, formatUomNotAllowedMessage } from '@/lib/stockAlerts'
import { isCostoCompraError } from '@/lib/pinOverride'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'

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
  /** Porcentaje de descuento automático del Pricing Rule (solo lectura, se suma al manual en modo %) */
  autoDiscountPct?: number
  /** Descuento manual que escribe el vendedor (encima del automático) — solo aplica en modo "%" */
  manualDiscountPct: number
  /** Modo de descuento de la línea — mutuamente excluyentes, nunca se envían ambos campos al backend */
  discountMode: 'pct' | 'amount'
  /** Descuento fijo en RD$ — solo aplica en modo "monto fijo" */
  discountAmount: number
  allowsDiscount?: boolean
  /** Almacén seleccionado para la línea */
  warehouse: string
  /** Precios por tier del catálogo, para recalcular al cambiar el pricing tier */
  _prices?: ItemPrices
  _stockByWarehouse?: Record<string, number>
  /** Ubicación/rack específico dentro del almacén elegido, si el artículo tiene alguna asignada ahí */
  ubicacion?: string
  /** Mensaje cuando el backend rechazó la venta por ambigüedad de ubicación (varias con stock) — obliga a elegir una */
  ubicacionError?: string
  /** Componentes del combo con tracking de serial/lote activo (solo si itemType === 'combo') */
  _comboComponents?: { itemCode: string; itemName?: string; trackingType: 'serial' | 'batch'; qtyPerCombo: number }[]
  componentTracking?: ComponentTracking[]
  // ── Cobertura ARS por línea (vertical farmacia, §3.3). Editables: los tres primeros.
  /** Peso (%) para el reparto automático. Vacío en TODAS = reparto en partes iguales. */
  porcientoTeoricoArs?: number
  /** Cobertura ARS de la línea en RD$. Si ninguna línea lo trae, el servidor la reparte al guardar. */
  montoAprobadoArs?: number
  lineaBloqueadaArs?: boolean
  /** Solo respuesta del servidor (`amount − montoAprobadoArs`). */
  montoPacienteArs?: number
  /** Solo respuesta del servidor. */
  porcientoRealArs?: number
}

// Factura directa (sin despacho) no valida disponibilidad del lado del servidor antes de someter
// (docs/tasks/73_alertas_stock_disponible_reservado.md §4.2) — esta es la única barrera real
// contra prometer stock que ya está reservado para otro cliente (Apartado) o que simplemente no
// alcanza. Compara siempre contra `disponible` (físico − reservado), nunca contra el físico a secas.
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
  const [search, setSearch] = useState('')

  if (data?.note || ubicaciones.length === 0) {
    return <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
  }

  function ubicacionLabel(u: (typeof ubicaciones)[number]): string {
    return u.zonaName ? `${u.zonaName} / ${u.ubicacionName ?? u.ubicacionId}` : u.ubicacionName ?? u.ubicacionId
  }

  const options: SearchSelectOption[] = ubicaciones
    .filter((u) => !search || ubicacionLabel(u).toLowerCase().includes(search.toLowerCase()))
    .map((u) => ({ value: u.ubicacionId, label: ubicacionLabel(u) }))

  return (
    <>
      <SearchSelect
        value={value ?? ''}
        onChange={onChange}
        options={options}
        onSearch={setSearch}
        selectedLabel={(() => {
          const u = ubicaciones.find((u) => u.ubicacionId === value)
          return u ? ubicacionLabel(u) : ''
        })()}
        placeholder="Sin especificar"
        error={!!error}
      />
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
  const { multiTab, activeId, closeTab } = useTabs()

  // ── Modo edición de borrador (PATCH /invoices/:id) ────────────────────────
  // La misma pantalla sirve para crear (`/facturas/nueva`) y para editar un borrador
  // (`/facturas/:id/editar`). En edición se precarga el detalle actual y al guardar se hace
  // un PATCH con reemplazo COMPLETO (todas las líneas), no un diff.
  const { id: editId } = useParams<{ id: string }>()
  const isEdit = !!editId
  // Fases de hidratación: primero los escalares, luego (cuando ya hay almacenes de la sucursal)
  // las líneas — así el efecto que limpia almacenes al cambiar de sucursal no borra lo cargado.
  const scalarsHydratedRef = useRef(false)
  const itemsHydratedRef = useRef(false)
  // Mientras sea false, se ignoran los auto-efectos disparados por el cliente (auto-NCF, repricing)
  // para no pisar los valores que vienen del borrador. Se activa en cuanto el usuario toca el cliente.
  const customerTouchedRef = useRef(!isEdit)
  // En edición pasa a true al terminar de precargar el borrador — a partir de ahí el detector de
  // cambios sin guardar toma su "foto" contra el estado ya hidratado (no contra el formulario vacío).
  const [hydrationDone, setHydrationDone] = useState(!isEdit)

  const { data: editingInvoice, isLoading: loadingEditingInvoice } = useQuery({
    queryKey: ['invoice', editId],
    queryFn: () => getInvoice(editId!),
    enabled: isEdit,
  })

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [esClienteOcasional, setEsClienteOcasional] = useState(false)
  const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
  const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')
  const [clienteOcasionalDireccion, setClienteOcasionalDireccion] = useState('')
  const [postingDate, setPostingDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState(defaultDueDate())
  const [ncfType, setNcfType] = useState<NcfType>('B02')
  const [items, setItems] = useState<LineItem[]>([])
  // Disponibilidad real (físico − reservado) por artículo — docs/tasks/73_alertas_stock_disponible_reservado.md.
  // Se usa en validateLineStock para bloquear el submit ANTES de que ERPNext rechace la venta, que
  // en Factura directa (sin despacho) no valida esto por su cuenta (§4.2 del prompt).
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
    // Se espera a que el scroll suave asiente antes de animar, para que el highlight
    // no pase inadvertido mientras la vista todavía se está moviendo.
    setTimeout(() => {
      setHighlightedRow(index)
      setTimeout(() => setHighlightedRow((cur) => (cur === index ? null : cur)), 2200)
    }, 400)
  }, [])
  const [notes, setNotes] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [semaforo, setSemaforo] = useState<SemaforoEntry | null>(null)
  const [loadingSemaforo, setLoadingSemaforo] = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [costPinModalOpen, setCostPinModalOpen] = useState(false)
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
  // '' = automático (Cliente.defaultCurrency → moneda base). Al editar (PATCH), se hidrata con
  // la moneda/tasa que la factura ya tenía — reenviarla es equivalente a omitirla.
  const [currency, setCurrency] = useState('')
  const [conversionRate, setConversionRate] = useState<number | ''>('')

  // ── Cobertura ARS (vertical farmacia, docs/PROMPT_FARMACIA_V2_FRONTEND.md §3) ──────────────
  // El vertical no cambia en caliente (§11): se lee una vez de los permisos de la sesión.
  const esFarmacia = usePermissionsStore((s) => s.vertical) === 'farmacia'
  const [arsEnabled, setArsEnabled] = useState(false)
  // Fecha de aprobación y de indicación de la receta arrancan en hoy — el usuario casi siempre
  // aprueba/indica el mismo día que factura, y así evita tener que llenarlas a mano cada vez.
  const [ars, setArs] = useState<AseguradoraFormState>({
    ...EMPTY_ASEGURADORA_FORM,
    fechaAprobacion: todayIso(),
    fechaIndicacionReceta: todayIso(),
  })
  /** Bloque calculado por el servidor del borrador que se está editando — nunca se recalcula acá. */
  const arsServidor = esCoberturaCompleta(editingInvoice?.aseguradora) ? editingInvoice.aseguradora : null
  /** `Facturado` = bloque inmutable; el resto de los estados de un borrador son editables. */
  const arsSoloLectura = arsServidor?.estadoArs === 'Facturado'

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true
  const usaImpuestoDocumento = facturacionConfig?.usaImpuestoDocumento ?? true
  // ── Multimoneda (docs/tasks/64_multimoneda_completo.md §3.1) ──────────────
  const multimonedaHabilitada = facturacionConfig?.multimonedaHabilitada ?? false
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'
  const monedasHabilitadas = facturacionConfig?.monedasHabilitadas ?? ['DOP']
  /** Una factura con cobertura ARS no puede llevar impuestos (§3.7): se oculta el selector. */
  const mostrarImpuestoDocumento = usaImpuestoDocumento && !(esFarmacia && arsEnabled)

  // Búsqueda asistida de mostrador (vertical Farmacia) — docs/tasks/
  // PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §9. Sigue el texto tecleado en CUALQUIER fila del
  // buscador de artículos (ItemSelect es opt-in vía onQueryChange, no cambia para el resto de las
  // pantallas que lo usan) y muestra las sugerencias de equivalentes en un panel aparte, nunca
  // mezcladas con los resultados normales del buscador (§2 regla 4).
  const [busquedaAsistidaQuery, setBusquedaAsistidaQuery] = useState('')
  // Si está inactivo, se permite capturar un serial/lote nuevo al vender en vez de exigir que ya exista.
  const requiereSerialLoteCompra = facturacionConfig?.requiereSerialLoteCompra ?? false

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
  // ── Despacho a futuro (docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md) ─────
  const despachoHabilitado = facturacionConfig?.despachoHabilitado ?? false
  const despachoFuturoHabilitado = facturacionConfig?.despachoFuturoHabilitado ?? true
  const despachoConfirmarStockAsignaSeriales = facturacionConfig?.despachoConfirmarStockAsignaSeriales ?? false
  // Selector visible solo si despachoHabilitado && despachoFuturoHabilitado (§3.1). Cuando no está
  // visible, el valor efectivo es siempre "inmediato" (§3.2: omitido resuelve a futuro SOLO si
  // habilitado && permitido — en cualquier otro caso resuelve a inmediato).
  const mostrarSelectorDespachoFuturo = despachoHabilitado && despachoFuturoHabilitado
  const [despachoFuturo, setDespachoFuturo] = useState(false)
  const esInmediata = mostrarSelectorDespachoFuturo ? !despachoFuturo : true

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
      const res = await listItems({ barcode: code, limit: 1, branch })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      const existingIndex = items.findIndex((row) => row.itemCode === item.id)
      if (existingIndex !== -1) {
        updateItem(existingIndex, { qty: items[existingIndex].qty + 1 })
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

  // Al cambiar de sucursal, el almacén elegido en cada línea deja de ser válido.
  // En edición se ignora el cambio de sucursal que produce la propia hidratación del borrador,
  // para no borrar los almacenes que vienen en GET /invoices/:id.
  useEffect(() => {
    if (isEdit && !itemsHydratedRef.current) return
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
  // factura en edición, que ya vienen en la moneda con la que se guardaron originalmente.
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

  // Si solo hay una sucursal disponible, se selecciona sola y el select se bloquea.
  useEffect(() => {
    if (branchOptions.length === 1 && branch !== branchOptions[0]) setBranch(branchOptions[0])
  }, [branchOptions, branch])

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  function handleCustomerCreated(customer: Customer) {
    setShowCreateCustomer(false)
    setCustomerId(customer.id)
    setSelectedCustomer(customer)
    queryClient.invalidateQueries({ queryKey: ['customerSearch'] })
  }

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
    if (!selectedCustomer || !customerTouchedRef.current) return
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
    if (!esClienteOcasional || !customerTouchedRef.current) return
    if (clienteOcasionalRnc.trim()) {
      setNcfType('B01')
    } else {
      setNcfType('B02')
    }
  }, [esClienteOcasional, clienteOcasionalRnc])

  // ── Sugerir cédula/teléfono del paciente en el panel de ARS a partir del cliente de
  // "Información General" (vertical farmacia, factura con seguro). Es solo una sugerencia — igual
  // que la tasa de cambio (líneas ~354-359), nunca pisa un valor que el usuario ya haya escrito.
  useEffect(() => {
    if (!esFarmacia || !arsEnabled || !customerTouchedRef.current) return
    // El RNC de un cliente ocasional puede ser una cédula (11 dígitos) o un RNC de empresa (9
    // dígitos) — solo se sugiere cuando de verdad parece una cédula de persona física.
    const cedulaSugerida = esClienteOcasional
      ? (/^\d{11}$/.test(clienteOcasionalRnc.replace(/[-\s]/g, '')) ? clienteOcasionalRnc : '')
      : (selectedCustomer?.cedula ?? '')
    // No hay campo de teléfono para cliente ocasional en Información General.
    const telefonoSugerido = esClienteOcasional
      ? ''
      : (selectedCustomer?.telefonos?.[0]?.telefono ?? selectedCustomer?.phone ?? '')
    if (!cedulaSugerida && !telefonoSugerido) return
    setArs((prev) => {
      const cedula = prev.cedula || cedulaSugerida
      const telefonoPaciente = prev.telefonoPaciente || telefonoSugerido
      if (cedula === prev.cedula && telefonoPaciente === prev.telefonoPaciente) return prev
      return { ...prev, cedula, telefonoPaciente }
    })
  }, [esFarmacia, arsEnabled, selectedCustomer, esClienteOcasional, clienteOcasionalRnc])

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

  function handleInvoiceSaved(invoice: { id: string }, successMsg: string) {
    const formTabId = activeId
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['invoice', editId] })
    toast.success(successMsg)
    navigate(`/facturas/${invoice.id}`)
    // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
    // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
    if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
  }

  function handleInvoiceMutationError(err: { message?: string; code?: string; statusCode?: number }) {
      const msg = err?.message ?? ''
      // 400 del PATCH: el borrador dejó de serlo (ya sometido) o fue enviado a Caja —
      // docs/PROMPT_ERRORES_COMERCIALES_FRONTEND.md §4/§5.3 (`DOC_SUBMITTED_IMMUTABLE`). El
      // mensaje del backend ya es comercial y accionable: se muestra tal cual y se devuelve al
      // detalle, que es donde vive la acción de enmienda (Igualar con enmienda, B2B) cuando
      // corresponde — nunca se bifurca por texto (§2, antes hacía match contra "no está en
      // borrador"/"enmendar"/"caja", frágil ante cualquier cambio de redacción).
      if (isEdit && isApiErrorCode(err, ERROR_CODES.DOC_SUBMITTED_IMMUTABLE)) {
        toast.error(msg || 'Esta factura ya no se puede editar')
        navigate(`/facturas/${editId}`)
        return
      }
      if (isApiErrorCode(err, ERROR_CODES.BRANCH_REQUIRED)) {
        setBranchError(true)
        toast.error(msg || 'Selecciona una sucursal')
        return
      }
      if (isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) {
        toast.error(formatStockInsufficientMessage(err), { duration: 8000 })
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
      if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) { setPinModalOpen(true); return }
      if (isCostoCompraError(err)) { setCostPinModalOpen(true); return }
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
      toast.error(msg || (isEdit ? 'Error al guardar la factura' : 'Error al crear la factura'))
  }

  const createMutation = useMutation({
    mutationFn: (dto: CreateInvoiceDto) => createInvoice(dto),
    onSuccess: (invoice) => handleInvoiceSaved(invoice, 'Factura creada como borrador'),
    onError: handleInvoiceMutationError,
  })

  const updateMutation = useMutation({
    mutationFn: (dto: UpdateInvoiceDto) => updateInvoice(editId!, dto),
    onSuccess: (invoice) => handleInvoiceSaved(invoice, 'Cambios guardados'),
    onError: handleInvoiceMutationError,
  })

  /** Crea o edita según el modo de la pantalla — mismo body en ambos casos (factura completa). */
  function persistInvoice(dto: CreateInvoiceDto) {
    if (isEdit) updateMutation.mutate(dto)
    else createMutation.mutate(dto)
  }

  /** Reintenta la MISMA operación (crear o editar) con `pinOverride` embebido, tras el 400 de
   *  "no puede ser menor al costo de compra" — el backend verifica el PIN dentro de este mismo
   *  request, no hay un POST /auth/verify-admin-pin aparte. Deja que el 401 (PIN inválido/sin
   *  permisos) se propague tal cual para que el modal lo muestre y permita reintentar. */
  async function retryInvoiceWithPinOverride(pin: string, identidad: { usuario?: string; codigoTarjeta?: string }) {
    const dto = { ...buildInvoiceDto(), pinOverride: { pin, ...identidad } }
    const invoice = isEdit ? await updateInvoice(editId!, dto) : await createInvoice(dto)
    handleInvoiceSaved(invoice, isEdit ? 'Cambios guardados' : 'Factura creada como borrador')
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const isDirty = useDirtyCheck({
    customerId,
    esClienteOcasional,
    clienteOcasionalNombre,
    clienteOcasionalRnc,
    clienteOcasionalDireccion,
    dueDate,
    ncfType,
    items,
    notes,
    branch,
    department,
    taxesTemplate,
    arsEnabled,
    ars,
    currency,
    conversionRate,
  }, hydrationDone)
  useBeforeUnloadWarning(isDirty)

  // ── Hidratación del borrador en modo edición ─────────────────────────────
  // Fase 1: escalares (cliente, fechas, NCF, sucursal, depto, notas). Se corre una sola vez.
  useEffect(() => {
    if (!isEdit || !editingInvoice || scalarsHydratedRef.current) return
    scalarsHydratedRef.current = true
    const inv = editingInvoice
    setPostingDate((inv.postingDate ?? '').slice(0, 10) || todayIso())
    setDueDate((inv.dueDate ?? '').slice(0, 10))
    setNcfType((inv.ncfType || 'B02') as NcfType)
    setBranch(inv.branch ?? '')
    setDepartment(inv.department ?? '')
    setNotes(inv.notes ?? '')
    setCurrency(inv.currency ?? '')
    setConversionRate(inv.conversionRate ?? '')
    if (inv.esClienteOcasional) {
      setEsClienteOcasional(true)
      setClienteOcasionalNombre(inv.clienteOcasionalNombre ?? '')
      setClienteOcasionalRnc(inv.clienteOcasionalRnc ?? '')
      setClienteOcasionalDireccion(inv.clienteOcasionalDireccion ?? '')
    } else if (inv.customer) {
      setCustomerId(inv.customer)
      getCustomer(inv.customer).then(setSelectedCustomer).catch(() => {})
    }
    if (inv.aseguradora) {
      setArsEnabled(true)
      setArs(aseguradoraFormFromInvoice(inv.aseguradora))
    }
    // El impuesto del documento (taxesTemplate) no viene en GET /invoices/:id; si se deja sin tocar
    // el PATCH reusa el default de la compañía. El usuario puede re-seleccionarlo si aplica.
  }, [isEdit, editingInvoice])

  // Fase 2: líneas. Espera a tener los almacenes de la sucursal cargados para que el efecto que
  // limpia el almacén de cada fila al cambiar de sucursal no borre lo recién hidratado.
  useEffect(() => {
    if (!isEdit || !editingInvoice || !scalarsHydratedRef.current || itemsHydratedRef.current) return
    // Espera a que la sucursal hidratada esté aplicada (el efecto que limpia almacenes ya está
    // silenciado durante la hidratación, así que no hace falta esperar además a `branchWarehouses`).
    if (editingInvoice.branch && branch !== editingInvoice.branch) return
    itemsHydratedRef.current = true
    let cancelled = false
    ;(async () => {
      const rows: LineItem[] = await Promise.all(
        editingInvoice.items.map(async (it): Promise<LineItem> => {
          let cat: Item | undefined
          try {
            cat = await getItem(it.itemCode)
          } catch {
            // Sin catálogo la línea sigue siendo editable, solo pierde límites de descuento/stock.
          }
          const discountAmount = it.discountAmount ?? 0
          const discountPct = discountAmount > 0 ? 0 : (it.discountPct ?? 0)
          const discountMode: 'pct' | 'amount' = discountAmount > 0 ? 'amount' : 'pct'
          return {
            itemCode: it.itemCode,
            itemLabel: cat?.itemName ?? it.itemCode,
            itemType: cat?.type,
            description: it.description ?? cat?.internalDescription ?? cat?.itemName ?? '',
            qty: it.qty,
            rate: it.rate,
            amount: calcAmount(it.qty, it.rate, discountPct, discountAmount),
            discountPct,
            discountMode,
            discountAmount,
            salesTaxPct: cat?.salesTaxPct ?? 0,
            salesTaxTemplate: cat?.salesTaxTemplate ?? '',
            baseRate: it.rate,
            uom: it.uom || cat?.stockUom || 'Unidad',
            conversionFactor: 1,
            maxDiscountPct: cat?.allowsDiscount ? cat?.maxDiscountPct : undefined,
            autoDiscountPct: undefined,
            manualDiscountPct: discountMode === 'pct' ? discountPct : 0,
            allowsDiscount: cat?.allowsDiscount,
            warehouse: it.warehouse ?? '',
            _prices: cat?.prices,
            _stockByWarehouse: cat?.stockByWarehouse,
            ubicacion: it.ubicacion || undefined,
            porcientoTeoricoArs: it.porcientoTeoricoArs,
            montoAprobadoArs: it.montoAprobadoArs,
            lineaBloqueadaArs: it.lineaBloqueadaArs,
            montoPacienteArs: it.montoPacienteArs,
            porcientoRealArs: it.porcientoRealArs,
          }
        }),
      )
      if (!cancelled) {
        setItems(rows)
        setHydrationDone(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, editingInvoice, branch])

  // ── Line item helpers ─────────────────────────────────────────────────────
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
        return { ...item, warehouse, qty, amount, ubicacion: undefined, ubicacionError: undefined }
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

  async function selectCatalogItem(index: number, catalogItem: Item, opts?: { autoAddRow?: boolean }) {
    const autoAddRow = opts?.autoAddRow ?? true
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = index === prev.length - 1
      return prev.map((row, i) => {
        if (i !== index) return row
        const tier = selectedCustomer?.priceTier ?? defaultPriceTier ?? 'B'
        const baseRate = catalogItem.prices?.[tier] ?? catalogItem.standardRate ?? 0
        const rate = saleRate(baseRate)
        const autoDiscountPct = catalogItem.autoDiscount?.discountType === 'Discount Percentage' ? catalogItem.autoDiscount.discountPercentage : undefined
        // Sugerencia del % de descuento del cliente al agregar la línea — solo al agregarla, nunca
        // reescribe una línea que el usuario ya haya tocado. Sigue siendo editable por línea.
        const defaultManualPct = catalogItem.allowsDiscount && selectedCustomer?.descuentoDefaultPct && selectedCustomer.descuentoDefaultPct > 0
          ? selectedCustomer.descuentoDefaultPct
          : 0
        return {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          itemType: catalogItem.type,
          description: catalogItem.internalDescription ?? catalogItem.itemName,
          rate,
          baseRate,
           amount: calcAmount(row.qty, rate, (autoDiscountPct ?? 0) + defaultManualPct, 0),
          uom: catalogItem.stockUom ?? row.uom,
          conversionFactor: 1,
          maxDiscountPct: catalogItem.allowsDiscount ? catalogItem.maxDiscountPct : undefined,
          autoDiscountPct,
          discountPct: (autoDiscountPct ?? 0) + defaultManualPct,
          discountMode: 'pct',
          discountAmount: 0,
          manualDiscountPct: defaultManualPct,
          allowsDiscount: catalogItem.allowsDiscount,
          _prices: catalogItem.prices,
          salesTaxPct: catalogItem.salesTaxPct ?? 0,
          salesTaxTemplate: catalogItem.salesTaxTemplate ?? '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: catalogItem.stockByWarehouse,
          _comboComponents: undefined,
          componentTracking: undefined,
          ubicacion: undefined,
          ubicacionError: undefined,
        }
      })
    })
    if (autoAddRow && wasLastRow) addRow()
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, discountPct: 0, discountMode: 'pct', discountAmount: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', _comboComponents: undefined, componentTracking: undefined, ubicacion: undefined, ubicacionError: undefined })
  }

  function selectBundle(index: number, bundle: Bundle) {
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = index === prev.length - 1
      return prev.map((row, i) => {
        if (i !== index) return row
        const tier = selectedCustomer?.priceTier ?? defaultPriceTier ?? 'B'
        const baseRate = bundle.prices?.[tier] ?? 0
        const rate = saleRate(baseRate)
        // Solo aplica la sugerencia si la línea todavía no tiene un descuento manual (recién
        // agregada) — no pisa uno que el usuario ya haya tocado.
        const defaultManualPct = row.discountMode === 'pct' && !row.manualDiscountPct && selectedCustomer?.descuentoDefaultPct && selectedCustomer.descuentoDefaultPct > 0
          ? selectedCustomer.descuentoDefaultPct
          : row.manualDiscountPct
        return {
          ...row,
          itemCode: bundle.id,
          itemLabel: bundle.itemName,
          itemType: 'combo',
          description: bundle.itemName,
          rate,
          baseRate,
          manualDiscountPct: defaultManualPct,
          discountPct: row.discountMode === 'amount' ? row.discountPct : defaultManualPct,
          amount: row.discountMode === 'amount'
            ? calcAmount(row.qty, rate, 0, row.discountAmount)
            : calcAmount(row.qty, rate, defaultManualPct),
          uom: bundle.itemUom ?? '',
          conversionFactor: 1,
          maxDiscountPct: undefined,
          _prices: bundle.prices,
          salesTaxPct: 0,
          salesTaxTemplate: '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: undefined,
          _comboComponents: undefined,
          componentTracking: undefined,
          ubicacion: undefined,
          ubicacionError: undefined,
        }
      })
    })
    if (wasLastRow) addRow()

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
    // En edición no se re-tarifica al hidratar el cliente: se respetan los precios del borrador.
    if (!customerTouchedRef.current) return
    const tier = selectedCustomer?.priceTier ?? defaultPriceTier ?? 'B'
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
  }, [selectedCustomer?.priceTier, defaultPriceTier])

  function addRow() {
    if (!branch) {
      toast.error('Debe seleccionar una sucursal antes de agregar artículos.')
      return
    }
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, amount: 0, discountPct: 0, discountMode: 'pct', discountAmount: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', uom: 'Unidad', conversionFactor: 1, warehouse: '' }])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  // "Usar este" en el panel de equivalentes por composición — siempre agrega una línea NUEVA,
  // nunca reemplaza la que el usuario estaba escribiendo (§2 regla 1: elección explícita, nunca
  // una sustitución automática de lo que ya había en la factura).
  async function agregarEquivalenteComoLinea(equivalenteId: string) {
    if (!branch) {
      toast.error('Debe seleccionar una sucursal antes de agregar artículos.')
      return
    }
    const index = items.length
    try {
      const fullItem = await getItem(equivalenteId)
      addRow()
      await selectCatalogItem(index, fullItem, { autoAddRow: false })
    } catch {
      toast.error('No se pudo agregar el artículo equivalente')
    }
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

  // ── Cobertura ARS: armado del payload (§3.2/§3.3) ─────────────────────────
  const arsActiva = esFarmacia && arsEnabled
  /** 11 columnas base + las 5 de cobertura ARS — para los `colSpan` de las filas especiales. */
  const columnCount = (arsActiva ? 16 : 11) - (almacenVentaSucursal ? 1 : 0)

  /**
   * Campos ARS de una línea. Solo se envían si el usuario realmente los tocó: si NINGUNA línea
   * trae `montoAprobadoArs`/`lineaBloqueadaArs`, el servidor reparte la cobertura solo al
   * guardar — mandar ceros lo desactivaría y dejaría todo el importe a cargo del paciente (§3.3).
   */
  function arsLineaDto(i: LineItem) {
    if (!arsActiva) return {}
    return {
      porcientoTeoricoArs: i.porcientoTeoricoArs,
      montoAprobadoArs: i.montoAprobadoArs,
      lineaBloqueadaArs: i.lineaBloqueadaArs || undefined,
    }
  }

  /**
   * Bloque `aseguradora` del body. En edición, con el toggle apagado se envía `null` explícito
   * para QUITAR una cobertura que ya estaba en el borrador; al crear simplemente se omite (§3.1).
   */
  function arsBloqueDto() {
    if (!esFarmacia) return {}
    if (arsEnabled) return { aseguradora: aseguradoraFormToDto(ars) }
    return isEdit && editingInvoice?.aseguradora ? { aseguradora: null } : {}
  }

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
       if (ncfType === 'B01' && !clienteOcasionalRnc.trim()) {
         toast.error('El RNC es requerido para comprobante B01 (Crédito Fiscal)')
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
       if (ncfType === 'B01' && !selectedCustomer?.rnc) {
         toast.error('El cliente necesita RNC para comprobante B01 (Crédito Fiscal)')
         return
       }
     }

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i]
      const itemMax = item.maxDiscountPct && item.maxDiscountPct > 0 ? item.maxDiscountPct : 100
      const userMax = currentUser?.maxDiscountPct && currentUser.maxDiscountPct > 0 ? currentUser.maxDiscountPct : 100
      const priceLimit = maxDiscFromPrices(item.rate, item._prices)
      const effectiveLimit = Math.min(itemMax, userMax, priceLimit)
      // En modo monto fijo no replicamos la conversión monto→% que hace el backend para
      // comparar contra los topes — el backend valida y devuelve 400 si excede el límite.
      if (item.discountMode === 'pct' && item.discountPct > effectiveLimit) {
        toast.error(`Línea ${i + 1}: el descuento supera el límite de ${effectiveLimit}%`)
        return
      }
      // El chequeo real de stock físico al someter solo aplica a ventas inmediatas (§4.1 de
      // docs/tasks/PROMPT_DESPACHO_FUTURO_FRONTEND.md) — una venta a futuro no descuenta
      // inventario al someterse, así que no tiene sentido bloquear la creación por esto acá.
      const stockError = validateLineStock(item, stockMap)
      if (stockError && esInmediata) {
        toast.error(`Línea ${i + 1}: ${stockError}`)
        return
      }
      // Auto-asignación de seriales/lotes (§4.2): solo aplica a ventas inmediatas. Con el switch
      // activo, el backend elige el serial/lote al someter — no hace falta exigirlo acá.
      if (!(despachoConfirmarStockAsignaSeriales && esInmediata) && !isTrackingComplete(item)) {
        toast.error(`Línea ${i + 1}: selecciona las series/lotes de los componentes del combo antes de continuar`)
        return
      }
      // §3.7: "Línea N: la cobertura ARS (X) supera el importe de la línea (Y)".
      if (arsActiva && item.montoAprobadoArs != null && item.montoAprobadoArs > item.amount + 0.005) {
        toast.error(`Línea ${i + 1}: la cobertura ARS (${formatDOP(item.montoAprobadoArs)}) supera el importe de la línea (${formatDOP(item.amount)})`)
        return
      }
    }

    if (arsActiva) {
      const arsError = validarAseguradoraForm(ars, { customerId: esClienteOcasional ? undefined : customerId })
      if (arsError) {
        toast.error(arsError)
        return
      }
      // §3.7: "La cobertura ARS (X) no puede superar el total de la factura (Y)".
      const coberturaRD = ars.tipoCobertura === 'monto' ? Number(ars.valorCobertura) : 0
      if (coberturaRD > subtotal + 0.005) {
        toast.error(`La cobertura ARS (${formatDOP(coberturaRD)}) no puede superar el total de la factura (${formatDOP(subtotal)})`)
        return
      }
    }

persistInvoice(buildInvoiceDto())
   }

  /** Arma el body de creación/edición desde el estado actual del formulario — usado tanto en el
   *  submit normal como al reintentar con `pinOverride` (override de descuento y de costo). */
  function buildInvoiceDto(): CreateInvoiceDto {
    const itemsDto = items.filter((i) => i.itemCode).map((i) => ({
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
      ubicacion: i.ubicacion || undefined,
      componentTracking: i.componentTracking,
      ...arsLineaDto(i),
    }))

    return {
      ...(esClienteOcasional
        ? {
            clienteOcasionalNombre: clienteOcasionalNombre || undefined,
            clienteOcasionalRnc: clienteOcasionalRnc || undefined,
            clienteOcasionalDireccion: clienteOcasionalDireccion || undefined,
          }
        : { customer: customerId }),
      dueDate,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      ncfType,
      items: itemsDto,
      notes: notes || undefined,
      taxesTemplate: mostrarImpuestoDocumento ? (taxesTemplate || undefined) : undefined,
      currency: currency || undefined,
      conversionRate: currency && currency !== monedaBase && conversionRate !== '' ? conversionRate : undefined,
      despachoFuturo: mostrarSelectorDespachoFuturo ? despachoFuturo : undefined,
      ...arsBloqueDto(),
    } as CreateInvoiceDto
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
          <a className="page-back-link" onClick={() => navigate(isEdit ? `/facturas/${editId}` : '/facturas')}>
            <ArrowLeft size={14} /> {isEdit ? 'Factura' : 'Facturas'}
          </a>
          <h1 className="page-title"><span className="page-title-dot" />{isEdit ? 'Editar Factura' : 'Nueva Factura'}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton label="Actualizar" />
        </div>
      </div>

      {isEdit && loadingEditingInvoice && (
        <div className="inline-alert" style={{ marginBottom: 16 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Cargando borrador…
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="card">
          <div className="card-header navy-card-header">
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
                       customerTouchedRef.current = true
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

               {multimonedaHabilitada && (
                 <div className="ff-wrap">
                   <label className="ff-label" htmlFor="invoiceCurrency">Moneda</label>
                   <Select
                     value={currency}
                     onValueChange={(v) => { setCurrency(v); if (v === monedaBase || !v) setConversionRate('') }}
                     placeholder={selectedCustomer?.defaultCurrency ? `Del cliente (${selectedCustomer.defaultCurrency})` : `Automático (${monedaBase})`}
                   >
                     <SelectItem value="">
                       {selectedCustomer?.defaultCurrency ? `Del cliente (${selectedCustomer.defaultCurrency})` : `Automático (${monedaBase})`}
                     </SelectItem>
                     {(['DOP', 'USD', 'EUR'] as const).map((c) => (
                       <SelectItem key={c} value={c} disabled={!monedasHabilitadas.includes(c)}>
                         {c}{!monedasHabilitadas.includes(c) ? ' (habilítela primero en Monedas)' : ''}
                       </SelectItem>
                     ))}
                   </Select>
                   {currency && currency !== monedaBase && (
                     <div style={{ marginTop: 8 }}>
                       <label className="ff-label" htmlFor="invoiceConversionRate">
                         Tasa de cambio ({currency} → {monedaBase})
                       </label>
                       <input
                         id="invoiceConversionRate"
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
                     <input type="checkbox" checked={esClienteOcasional} onChange={(e) => { customerTouchedRef.current = true; setEsClienteOcasional(e.target.checked); if (e.target.checked) { setCustomerId(''); setSelectedCustomer(null); setSemaforo(null) } }} />
                     <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
                   </span>
                   Venta ocasional (cliente no registrado)
                   {esClienteOcasional && (
                     <FieldTooltip>Ingresa el nombre del cliente. Para Crédito Fiscal (B01), también se requiere el RNC.</FieldTooltip>
                   )}
                 </label>
               </div>

              {/* La fecha de la factura ya no la fija el cliente — el servidor siempre la asigna
                  con el momento real del request (evita el desfase cronológico con inventario que
                  rompía el submit con "insufficient stock"). En edición se muestra de solo
                  lectura, informativa. */}
              {isEdit && (
                <div className="ff-wrap">
                  <span className="ff-label">Fecha</span>
                  <span className="ff-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                    {formatDate(postingDate)}
                  </span>
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="dueDate">Fecha vencimiento</label>
                <DatePicker
                  id="dueDate"
                  className="ff-input"
                  value={dueDate}
                  onChange={setDueDate}
                  clearable
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

               {esClienteOcasional && (
                 <div className="ff-wrap">
                   <label className={`ff-label${ncfType === 'B01' ? ' ff-required' : ''}`} htmlFor="clienteOcasionalRnc">RNC o Cédula</label>
                   <input
                     id="clienteOcasionalRnc"
                     type="text"
                     className="ff-input"
                     value={clienteOcasionalRnc}
                     onChange={(e) => { customerTouchedRef.current = true; setClienteOcasionalRnc(e.target.value) }}
                     placeholder="132456785 o 00113918866"
                     required={ncfType === 'B01'}
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

              {usaDepartamentos && (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="department">Departamento</label>
                  <DepartmentSelect id="department" value={department} onChange={setDepartment} />
                </div>
              )}

              {usaImpuestoDocumento && !mostrarImpuestoDocumento && (
                <div className="ff-wrap">
                  <label className="ff-label">
                    Impuesto del Documento
                    <FieldTooltip>
                      No aplica: una factura con cobertura ARS no puede llevar impuestos (Ley 253-12).
                      Los medicamentos deben estar configurados como exentos de ITBIS en el catálogo.
                    </FieldTooltip>
                  </label>
                </div>
              )}
              {mostrarImpuestoDocumento && (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="taxesTemplate">
                    Impuesto del Documento
                    <FieldTooltip>Impuesto aplicado al total de la factura (ej. ITBIS 18%). Si no eliges ninguno, se usa el template marcado como default, si existe.</FieldTooltip>
                  </label>
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
                </div>
              )}
            </div>

            {semaforo?.semaforo === 'rojo' && (
              <div className="inline-alert inline-alert-warn" style={{ marginTop: 12 }}>
                El cliente ha excedido su límite de crédito ${(semaforo.pctUsado ?? 0).toFixed(1)}% utilizado).
                Considera revisar el saldo pendiente antes de emitir esta factura.
              </div>
            )}
          </div>
        </div>

        {esFarmacia && (
          <AseguradoraPanel
            enabled={arsEnabled}
            onEnabledChange={setArsEnabled}
            value={ars}
            onChange={setArs}
            submitted={submitted}
            customerId={esClienteOcasional ? undefined : customerId}
            readOnly={arsSoloLectura}
            footer={arsServidor ? <CoberturaArsResumen ars={arsServidor} /> : (
              <p className="ff-hint" style={{ margin: 0 }}>
                La cobertura en RD$, el reparto por línea y lo que queda a cargo del paciente los
                calcula el servidor al guardar el borrador.
              </p>
            )}
          />
        )}

        <div className="card">
          {hasAnyDiscount && (
            <div className="card-header" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={undoDiscounts}>
                <RotateCcw size={13} /> Deshacer descuentos
              </button>
            </div>
          )}
          <div className="items-table-wrap">
            <table className="items-table navy-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Artículo</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 72 }}>
                  Descuento
                  <Info size={11} style={{ marginLeft: 2, verticalAlign: 'middle', color: 'var(--text-tertiary)' }} />
                </th>
                  <th style={{ textAlign: 'right', width: 80 }}>Impuesto</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 56 }}>UDM</th>
                  {!almacenVentaSucursal && <th style={{ width: 140 }}>Almacén</th>}
                  <th style={{ width: 140 }}>Ubicación</th>
                  {arsActiva && (
                    <>
                      <th style={{ textAlign: 'right', width: 80 }} title="Peso de esta línea en el reparto automático de la cobertura. Vacío en todas = partes iguales.">
                        % teórico ARS
                      </th>
                      <th style={{ textAlign: 'right', width: 120 }}>Cobertura ARS</th>
                      <th style={{ width: 44, textAlign: 'center' }} title="Ajuste manual protegido: Recalcular no toca la línea.">🔒</th>
                      <th style={{ textAlign: 'right', width: 110 }}>Paciente</th>
                      <th style={{ textAlign: 'right', width: 72 }}>% real</th>
                    </>
                  )}
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                      No hay artículos. Agrega uno con el botón de abajo.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <Fragment key={index}>
                    <tr
                      ref={(el) => { rowRefs.current[index] = el }}
                      className={highlightedRow === index ? 'row-flash' : undefined}
                    >
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
                          onQueryChange={esFarmacia ? setBusquedaAsistidaQuery : undefined}
                        />
                      </td>
                      <td>
                        <input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" />
                      </td>
                      <td>
                        {(() => {
                          const stockError = validateLineStock(item, stockMap)
                          const info = item.itemCode && item.warehouse ? resolveDisponible(stockMap.get(item.itemCode), item.warehouse) : undefined
                          const invItem = item.itemCode && item.warehouse ? inventoryMap.get(`${item.itemCode}::${item.warehouse}`) : undefined
                          // "En pedido" es puramente informativo — nunca bloquea, no confundir con
                          // reservedStock (que sí resta de disponible y sí puede bloquear la venta).
                          const enPedido = invItem?.reservedQty ?? 0
                          return (
                            <>
                              <QtyInput className={`items-input${stockError ? ' items-input-error' : ''}`} value={item.qty} uom={item.uom} onChange={(v) => updateItem(index, { qty: v })} style={{ textAlign: 'right' }} />
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
                        <input className="items-input" type="number" min="0" step="0.01" value={round2(item.rate)} disabled style={{ textAlign: 'right' }} />
                      </td>
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
                            onChange={(v, factor) => {
                              updateItem(index, { uom: v, rate: saleRate(item.baseRate, factor), conversionFactor: factor })
                            }}
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
                            selectedLabel={branchWarehouses?.find((w) => w.id === item.warehouse)?.name ?? item.warehouse ?? ''}
                            placeholder="Almacén por defecto"
                            disabled={!item.itemCode}
                          />
                        </td>
                      )}
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
                      {arsActiva && (
                        <>
                          <td>
                            <input
                              className="items-input"
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={item.porcientoTeoricoArs ?? ''}
                              disabled={arsSoloLectura}
                              onChange={(e) => updateItem(index, {
                                porcientoTeoricoArs: e.target.value === '' ? undefined : Number(e.target.value),
                              })}
                            />
                          </td>
                          <td>
                            <input
                              className={`items-input${(item.montoAprobadoArs ?? 0) > item.amount + 0.005 ? ' items-input-error' : ''}`}
                              type="number"
                              min="0"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={item.montoAprobadoArs ?? ''}
                              disabled={arsSoloLectura}
                              placeholder="auto"
                              onChange={(e) => updateItem(index, {
                                montoAprobadoArs: e.target.value === '' ? undefined : Number(e.target.value),
                              })}
                            />
                            {(item.montoAprobadoArs ?? 0) > item.amount + 0.005 && (
                              <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                Supera el importe de la línea
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-size-icon-sm"
                              disabled={arsSoloLectura}
                              title={item.lineaBloqueadaArs ? 'Línea bloqueada: Recalcular no la toca' : 'Bloquear esta línea al recalcular'}
                              onClick={() => updateItem(index, { lineaBloqueadaArs: !item.lineaBloqueadaArs })}
                            >
                              {item.lineaBloqueadaArs
                                ? <Lock size={14} style={{ color: 'var(--color-brand)' }} />
                                : <LockOpen size={14} style={{ color: 'var(--text-tertiary)' }} />}
                            </button>
                          </td>
                          <td style={{ textAlign: 'right' }} className="td-muted">
                            {item.montoPacienteArs != null ? formatDOP(item.montoPacienteArs, { trimZeros: true }) : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }} className="td-muted">
                            {item.porcientoRealArs != null ? `${item.porcientoRealArs.toFixed(1)}%` : '—'}
                          </td>
                        </>
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
                    {item.itemType === 'combo' && item._comboComponents && item._comboComponents.length > 0 && (
                      <tr>
                        <td colSpan={columnCount} style={{ padding: '4px 12px 10px' }}>
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
                                    allowNew={!requiereSerialLoteCompra}
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

            {esFarmacia && (
              <BusquedaAsistidaPanel
                query={busquedaAsistidaQuery}
                onAgregar={(eq) => agregarEquivalenteComoLinea(eq.item.id)}
              />
            )}

            <div className="items-total-row navy-totals">
              {/* <div className="items-total-line">
                <span>Subtotal bruto</span>
                <span>{formatDOP(grossTotal)}</span>
              </div> */}
              {totalDiscount > 0 && (
                <div className="items-total-line">
                  <span>Descuento total</span>
                  <span>-{formatMoney(totalDiscount, currency || monedaBase)}</span>
                </div>
              )}
              <div className="items-total-line">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, currency || monedaBase)}</span>
              </div>
              {taxTotal > 0 && (
                <div className="items-total-line" style={{ fontSize: 13 }}>
                  <span>Impuesto</span>
                  <span>{formatMoney(taxTotal, currency || monedaBase)}</span>
                </div>
              )}
              <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, fontSize: 15 }}>
                <span>Total</span>
                <span>{formatMoney(total, currency || monedaBase)}</span>
              </div>
              {arsActiva && arsServidor && (
                <>
                  <div className="items-total-line" style={{ color: 'var(--color-brand)' }}>
                    <span>Cubre la ARS</span>
                    <span>-{formatDOP(arsServidor.montoCobertura)}</span>
                  </div>
                  <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                    <span>A cargo del paciente</span>
                    <span>{formatDOP(arsServidor.montoPaciente)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {mostrarSelectorDespachoFuturo && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header navy-card-header">
              <h2 className="card-title">Despacho</h2>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <p className="ff-hint" style={{ margin: 0 }}>
                {despachoFuturo
                  ? 'La factura no descontará inventario al someterse — la salida física se registra después con un Despacho.'
                  : 'La factura descontará inventario al someterse — se confirma que exista stock físico en el almacén de cada línea.'}
              </p>
            </div>
          </div>
        )}

        <div className="card">
          <div
            className="card-header navy-card-header"
            style={{ cursor: 'pointer' }}
            onClick={() => setNotesOpen((o) => !o)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="card-title">Notas Adicionales</h2>
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
                Agrega comentarios para aclarar datos de la factura, serán visibles PDF.
              </span>
            )}
          </div>
          {notesOpen && (
            <div className="card-body">
              <textarea
                className="ff-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones, términos de pago, instrucciones especiales..."
                rows={3}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(isEdit ? `/facturas/${editId}` : '/facturas')}
          >
            Cancelar
          </button>
          <button type="submit" className="btn btn-navy" disabled={isSaving}>
            {isSaving
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
        onAuthorized={(userId) => {
          client.defaults.headers.common['X-Admin-Pin'] = userId
          setPinModalOpen(false)
          persistInvoice(buildInvoiceDto())
        }}
        title="Autorización requerida"
        description="El descuento supera tu límite. Ingresa el PIN de un administrador."
      />

      <PinModal
        open={costPinModalOpen}
        onClose={() => setCostPinModalOpen(false)}
        onSubmitInline={retryInvoiceWithPinOverride}
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

      {trackingModalIndex != null && items[trackingModalIndex] && (
        <ComponentTrackingModal
          bundleName={items[trackingModalIndex].itemLabel ?? items[trackingModalIndex].itemCode}
          components={getTrackingRequirement(items[trackingModalIndex])}
          initial={items[trackingModalIndex].componentTracking}
          allowNew={!requiereSerialLoteCompra}
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
