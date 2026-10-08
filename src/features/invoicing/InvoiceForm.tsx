import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
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
import { client } from '@/shared/api/client'
import { lookupItems, getItemLookup } from '@/shared/api/catalog'
import { getFacturacionConfig } from '@/shared/api/config'
import type { CreateInvoiceDto, UpdateInvoiceDto, Customer, ClienteDetalle, SemaforoEntry, Item, ItemPrices, Bundle, ComponentTracking, ItemStock, MonedaCode, DimensionesLinea, ItemDimensionDeclarada } from '@/shared/api/types'
import { DimensionAxisCell, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { useDimensionesInventario } from '@/shared/hooks/useDimensionesInventario'
import { mergeLineasIguales } from '@/shared/lib/mergeLineasIguales'
import { getTasaVigente } from '@/shared/api/monedas'
import { ComponentTrackingModal } from '@/components/shared/ComponentTrackingModal'
import type { TrackedComponent } from '@/components/shared/ComponentTrackingModal'
import { TrackedComponentEditor } from '@/components/shared/TrackedComponentEditor'
import { formatDOP, formatMoney, round2, formatDate } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Minus, Trash2, Eye, Loader2, Info, UserPlus, Lock, LockOpen, ChevronDown, RotateCcw } from 'lucide-react'
import { CustomerQuickCreateModal } from '@/features/customers/CustomerQuickCreateModal'
import { ItemDetailModal } from '@/components/shared/ItemDetailModal'
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
import { focusLineQty, lineQtyId } from '@/lib/focusLineQty'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { useSucursalAlmacenes } from '@/shared/hooks/useSucursalAlmacenes'
import { getCachedUser } from '@/shared/api/storage'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { useItemsStock, resolveDisponible } from '@/shared/hooks/useItemsStock'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { formatStockInsufficientMessage, formatUomNotAllowedMessage } from '@/lib/stockAlerts'
import { esCreditoFiscal } from '@/lib/comprobantes'
import { isPinPrecioError } from '@/lib/pinOverride'
import { isPrecioCatalogoError, precioBloqueadoParaLinea } from '@/lib/precioCatalogo'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { DeliveryFormSection, EMPTY_DELIVERY_FORM } from '@/features/delivery/DeliveryFormSection'
import type { DeliveryFormValue } from '@/features/delivery/DeliveryFormSection'
import { esErrorDelivery } from '@/lib/deliveryErrors'
import { useOpcionesArray, useOpcionesLista } from '@/shared/hooks/useOpciones'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { getCatalogosFiscalesLookup, getItemUbicacionesLookup, getClienteDetalle, getClienteSemaforo, getStockSettingsLookup } from '@/shared/api/formularios'

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
  /** Precio escrito a mano por el operador (solo cuando el toggle correspondiente está activo).
   *  Los reprices automáticos (cambio de cliente/tier, moneda o UDM) no tocan estas líneas —
   *  igual que `manualDiscountPct` con los descuentos. Se limpia al elegir otro artículo. */
  precioManual?: boolean
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
  // ── Combinación de dimensión de inventario (docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md
  //    §0/§5/§7.1/§10). Solo aplica cuando el artículo elegido `usaDimensiones` (opt-in, la
  //    inmensa mayoría del catálogo no lo usa).
  /** `true` si el artículo de esta línea usa dimensiones — cacheado igual que `_prices`/etc. */
  _usaDimensiones?: boolean
  /** Ejes declarados por el artículo (`item.dimensiones`), para armar el selector sin otra llamada. */
  _itemDimensiones?: ItemDimensionDeclarada[]
  /** Combinación elegida para esta línea — clave = código de dimensión, valor = id del valor elegido. */
  dimensiones?: DimensionesLinea
  /** §10.2: `GET /invoices/:id` no devuelve la combinación de una línea ya guardada. Al hidratar una
   *  línea existente de un artículo con dimensiones, esto queda en `true` hasta que el usuario
   *  vuelva a elegir la combinación — bloquea el submit igual que si nunca se hubiera elegido. */
  _dimensionesPendientesReseleccion?: boolean
}

// Factura directa (sin despacho) no valida disponibilidad del lado del servidor antes de someter
// (docs/tasks/73_alertas_stock_disponible_reservado.md §4.2) — esta es la única barrera real
// contra prometer stock que ya está reservado para otro cliente (Apartado) o que simplemente no
// alcanza. Compara siempre contra `disponible` (físico − reservado), nunca contra el físico a secas.
function validateLineStock(row: LineItem, stockMap: Map<string, ItemStock>, allowNegativeStock?: boolean): string | undefined {
  // Tenant con "Permitir stock negativo" activo (Stock Settings) — ERPNext deja vender por
  // debajo de disponible, así que bloquear acá sería más estricto que el propio backend.
  if (allowNegativeStock) return undefined
  if (!row.warehouse || !row.itemCode || row.itemType === 'service' || row.itemType === 'combo') return undefined
  const info = resolveDisponible(stockMap.get(row.itemCode), row.warehouse)
  if (!info) return undefined // stock del artículo aún no cargado — no bloquear con datos incompletos
  // if (row.qty > info.disponible) {
  //   return info.reservedStock > 0
  //     ? `Solo hay ${info.disponible} disponibles de este artículo en ${row.warehouse} (${info.reservedStock} reservadas para otro cliente)`
  //     : `Stock insuficiente en ${row.warehouse}. Disponible: ${info.disponible}`
  // }
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

/** Fecha de vencimiento: nunca la elige el operador ni se envía al API — es puramente
 *  informativa para la vista. Regla de negocio:
 *  1. Cliente sin crédito (`hasCredit` false): vencimiento = fecha de la factura.
 *  2. Cliente con crédito: vencimiento = fecha de la factura + `creditDays`.
 *  Un cliente ocasional nunca tiene crédito. */
function computeDueDate(baseDate: Date, customer: ClienteDetalle | null, esClienteOcasional: boolean): string {
  // El detalle de formulario no trae `hasCredit`: con `creditDays` > 0 el cliente tiene crédito.
  if (!esClienteOcasional && customer?.creditDays) {
    return format(addDays(baseDate, customer.creditDays), 'yyyy-MM-dd')
  }
  return format(baseDate, 'yyyy-MM-dd')
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
    queryFn: () => getItemUbicacionesLookup(itemCode, warehouse),
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
  const [selectedCustomer, setSelectedCustomer] = useState<ClienteDetalle | null>(null)
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [esClienteOcasional, setEsClienteOcasional] = useState(false)
  const [clienteOcasionalNombre, setClienteOcasionalNombre] = useState('')
  const [clienteOcasionalRnc, setClienteOcasionalRnc] = useState('')
  const [clienteOcasionalDireccion, setClienteOcasionalDireccion] = useState('')
  const [ncfType, setNcfType] = useState<NcfType>('B02')
  // El usuario ya eligió un Tipo NCF a mano — los auto-efectos no deben pisarlo al
  // llegar tarde `facturacionConfig` o al limpiar el cliente.
  const ncfTouchedRef = useRef(false)
  const [items, setItems] = useState<LineItem[]>([])
  // Disponibilidad real (físico − reservado) por artículo — docs/tasks/73_alertas_stock_disponible_reservado.md.
  // Se usa en validateLineStock para bloquear el submit ANTES de que ERPNext rechace la venta, que
  // en Factura directa (sin despacho) no valida esto por su cuenta (§4.2 del prompt).
  const stockMap = useItemsStock(
    items.map((i) => (i.itemCode && i.itemType !== 'service' && i.itemType !== 'combo' ? i.itemCode : undefined)),
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

  /** Solo informativa — ver `computeDueDate`. En edición se basa en el `postingDate` real de la
   *  factura (fijo); al crear, en "hoy" (la fecha que el servidor le asignará al someter). */
  const dueDate = computeDueDate(
    isEdit && editingInvoice?.postingDate ? new Date(editingInvoice.postingDate) : new Date(),
    selectedCustomer,
    esClienteOcasional,
  )

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true
  // ── Multimoneda (docs/tasks/64_multimoneda_completo.md §3.1) ──────────────
  const multimonedaHabilitada = facturacionConfig?.multimonedaHabilitada ?? false
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'
  const monedasHabilitadas = facturacionConfig?.monedasHabilitadas ?? ['DOP']
  // Candados "Permitir Modificar Precio Libremente" (servicios/productos por separado) — con
  // el toggle correspondiente apagado, el precio de la línea debe ser exactamente uno de los
  // precios de catálogo (A/B/C). El input ya es de solo lectura salvo edición manual habilitada
  // (ver `updateManualRate`); acá solo se decide por línea según el tipo de artículo y se maneja
  // el 400 en `handleInvoiceMutationError` — no hay edición libre que reemplazar cuando bloquea.
  const bloqueoPrecioServicios = facturacionConfig?.permitirModificarPrecioServicios === false
  const bloqueoPrecioProductos = facturacionConfig?.permitirModificarPrecioProductos === false
  const algunBloqueoPrecio = bloqueoPrecioServicios || bloqueoPrecioProductos
  const precioBloqueadoPara = (itemType: string | undefined) =>
    precioBloqueadoParaLinea(itemType, facturacionConfig ?? undefined)

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

  // ── Delivery (§2.1 docs/tasks/PROMPT_DELIVERY_FRONTEND.md) ─────────────────
  // La sección (puerta §1 + precarga) vive en DeliveryFormSection; acá solo el valor,
  // el flag de error y las validaciones que bloquean el submit.
  const [delivery, setDelivery] = useState<DeliveryFormValue>(EMPTY_DELIVERY_FORM)
  const [direccionEntregaTouched, setDireccionEntregaTouched] = useState(false)
  const esDelivery = delivery.esDelivery
  const deliverySinDireccion = esDelivery && !delivery.direccionEntrega.trim()
  // Solo DOP: otra moneda explícita → 400 DELIVERY_MONEDA_NO_SOPORTADA.
  const deliveryMonedaInvalida = esDelivery && !!currency && currency !== monedaBase

  // ── Stock settings: define si los seriales/lotes se capturan inline en la fila (useSerialBatchFields)
  //    o vía diálogo emergente (ComponentTrackingModal). El catálogo es fijo, se cachea 1h.
  const { data: stockSettings } = useQuery({
    queryKey: ['stock-settings'],
    queryFn: getStockSettingsLookup,
  })
  const useInlineSerialBatch = stockSettings?.useSerialBatchFields === true

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
        updateItem(existingIndex, { qty: items[existingIndex].qty + 1 })
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

  // ── Customer search ───────────────────────────────────────────────────────

  // Viene en GET /config/facturacion (ya cargado arriba): sin consulta de catálogo aparte.
  const defaultPriceTier = facturacionConfig?.defaultPriceTier ?? 'B'

  const currentUserEmail = getCachedUser()?.email
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser', currentUserEmail],
    queryFn: () => getUsuario(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 15 * 60_000,
  })

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const isSystemManager = useIsSystemManager()
  const { data: myBranches, refetch: refetchMyBranches } = useQuery({
    queryKey: ['usuarioSucursales', currentUserEmail],
    queryFn: () => getUsuarioSucursales(currentUserEmail!),
    enabled: !!currentUserEmail,
  })
  const { data: allSucursales } = useOpcionesLista('sucursales', { limit: 100, enabled: isSystemManager})
  const branchOptions = useMemo(
    () => (isSystemManager ? (allSucursales?.items.map((s) => s.name) ?? []) : (myBranches?.branches ?? [])),
    [isSystemManager, allSucursales, myBranches],
  )


  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales', { type: 'venta' }],
    queryFn: () => getCatalogosFiscalesLookup({ type: 'venta' }),
  })

  const ncfTypeOptions: SearchSelectOption[] = useMemo(() => {
    const q = ncfTypeSearch.toLowerCase()
    return (catalogos?.ncfTypes ?? []).filter((t) => !q || t.label.toLowerCase().includes(q))
  }, [catalogos, ncfTypeSearch])

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  // docs/tasks/75_almacen_venta_confirmar_stock_uoms_permitidas.md §1.4 — si la sucursal tiene
  // almacén de venta configurado, TODA venta debe salir de ahí sin excepción: se oculta el
  // selector por línea y se fuerza ese almacén, en vez de dejar elegir y recién enterarse con el
  // 400 de SALE_WAREHOUSE_MISMATCH al someter.
  const { almacenVenta: almacenVentaSucursal, isFetched: sucursalFetched } = useSucursalAlmacenes(branch)

  // ── Almacenes de la sucursal seleccionada (para el selector por línea) ───
  // Solo se piden si hace falta el selector: con almacén de venta fijo en la sucursal se oculta.
  const { data: branchWarehouses } = useOpcionesArray('almacenes', {
    branch: branch,
    limit: 100,
    enabled: !!branch && sucursalFetched && !almacenVentaSucursal,
  })

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
  // factura en edición, que ya vienen en la moneda con la que se guardaron originalmente.
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
    // /opciones/clientes/:id/semaforo: el semáforo de ESTE cliente, sin permiso de Cobros.
    getClienteSemaforo(selectedCustomer.id)
      .then(setSemaforo)
      .catch(() => setSemaforo(null))
      .finally(() => setLoadingSemaforo(false))
  }, [selectedCustomer])

  // ── Default inicial desde el tenant (pantalla /facturas/nueva recién abierta) ──
  // Sin cliente seleccionado y sin venta ocasional, ninguno de los auto-efectos de
  // abajo corre (todos hacen early-return) y el select se quedaba en el 'B02'
  // hardcodeado del useState aunque `GET /config/facturacion` trajera otro valor
  // (p. ej. "E32"). Se aplica acá una sola vez al llegar la config; los efectos de
  // cliente/ocasional (declarados después) conservan la prioridad cuando apliquen,
  // y un cambio manual del usuario (ncfTouchedRef) nunca se pisa.
  useEffect(() => {
    if (isEdit) return
    if (selectedCustomer || esClienteOcasional) return
    const def = facturacionConfig?.ncfTipoVentaDefault
    if (!def) return
    if (ncfTouchedRef.current) return
    setNcfType(def)
  }, [isEdit, selectedCustomer, esClienteOcasional, facturacionConfig?.ncfTipoVentaDefault])

  // ── Auto-select NCF type based on customer (only for new customers) ───────
  // docs/tasks/81 §5 — el `ncfTypeDefault` del cliente (si tiene) gana sobre la heurística
  // histórica (gobierno → B15, con RNC → B01, resto → B02). Es solo prellenado: el usuario
  // puede cambiarlo libremente después.
  // docs/tasks/PROMPT_NCF_DEFAULT_REGIMENES_ESPECIALES_REDONDEO_FRONTEND.md §1.5 — orden de
  // prioridad: `Customer.ncfTypeDefault` > `FacturacionConfig.ncfTipoVentaDefault` > heurística.
  useEffect(() => {
    if (!selectedCustomer || !customerTouchedRef.current) return
    if (selectedCustomer.ncfTypeDefault) {
      setNcfType(selectedCustomer.ncfTypeDefault)
    } else if (facturacionConfig?.ncfTipoVentaDefault) {
      setNcfType(facturacionConfig.ncfTipoVentaDefault)
    } else if (selectedCustomer.isGovernment) {
      setNcfType('B15')
    } else if (selectedCustomer.rnc) {
      setNcfType('B01')
    } else {
      setNcfType('B02')
    }
  }, [selectedCustomer, facturacionConfig?.ncfTipoVentaDefault])

  // La búsqueda de clientes (list) puede no traer `ncfTypeDefault` — se enriquece con el
  // detalle completo para que el prellenado de arriba aplique igual en ese caso.
  useEffect(() => {
    if (isEdit || !customerId || esClienteOcasional) return
    if (selectedCustomer?.id === customerId && selectedCustomer.ncfTypeDefault) return
    let cancelled = false
    getClienteDetalle(customerId)
      .then((full) => {
        if (cancelled) return
        setSelectedCustomer((prev) => (prev?.id === customerId ? { ...prev, ...full } : full))
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  // ── Auto-select NCF type for ocasional customers ────────────────────────
  // docs/tasks/PROMPT_NCF_DEFAULT_REGIMENES_ESPECIALES_REDONDEO_FRONTEND.md §1.5 — el default
  // del tenant (`ncfTipoVentaDefault`) gana sobre la heurística (con RNC → B01, resto → B02).
  useEffect(() => {
    if (!esClienteOcasional || !customerTouchedRef.current) return
    if (facturacionConfig?.ncfTipoVentaDefault) {
      setNcfType(facturacionConfig.ncfTipoVentaDefault)
      return
    }
    if (clienteOcasionalRnc.trim()) {
      setNcfType('B01')
    } else {
      setNcfType('B02')
    }
  }, [esClienteOcasional, clienteOcasionalRnc, facturacionConfig?.ncfTipoVentaDefault])

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
      if (isPinPrecioError(err)) { setCostPinModalOpen(true); return }
      // Candado "Permitir Modificar Precio Libremente" apagado — el rate no es A/B/C. Sin PIN
      // que lo salve: el mensaje del backend ya es comercial y se muestra tal cual, con
      // duración larga para que el operador lo lea completo.
      if (isPrecioCatalogoError(err)) { toast.error(msg, { duration: 10000 }); return }
      // Delivery (§2.1/§9): mostrar el mensaje del backend (incluye códigos entre
      // corchetes desde ERPNext). La dirección faltante además marca el campo.
      if (esErrorDelivery(err, 'DELIVERY_DIRECCION_REQUERIDA')) {
        setDireccionEntregaTouched(true)
        toast.error(msg || 'La venta con delivery requiere la dirección de entrega', { duration: 8000 })
        document.getElementById('direccionEntrega')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      if (esErrorDelivery(
        err,
        'DELIVERY_NO_HABILITADO',
        'DELIVERY_REQUIERE_DESPACHO_FUTURO',
        'DELIVERY_MONEDA_NO_SOPORTADA',
        'DELIVERY_RESERVA_FALLIDA',
        'DELIVERY_ARTICULO_INACTIVO',
        'DELIVERY_PERIODO_CERRADO',
      )) {
        toast.error(msg || 'No se pudo guardar la venta con delivery', { duration: 8000 })
        return
      }
      if (msg.toLowerCase().includes('no tienes acceso a la sucursal')) {
        refetchMyBranches()
        toast.error(`${msg} Tus sucursales asignadas se actualizaron, vuelve a intentar.`)
        return
      }
      if (tryResolveUbicacionAmbiguity(msg)) return
      // docs/tasks/PROMPT_NCF_DEFAULT_REGIMENES_ESPECIALES_REDONDEO_FRONTEND.md §2.4 — tenant sin
      // catálogo RD provisionado al someter B14/E44. No es un error del formulario: se muestra
      // el mensaje del backend (ya invita a contactar soporte) con duración larga.
      if (msg.includes('ITBIS Exento')) {
        toast.error(msg || 'Tenant sin catálogo RD provisionado — contacte a soporte', { duration: 10000 })
        return
      }
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
   *  "no puede ser menor al costo de compra" o "por debajo del precio mínimo" (docs/tasks/81 §1) —
   *  el backend verifica el PIN dentro de este mismo request, no hay un POST /auth/verify-admin-pin
   *  aparte. Deja que el 401 (PIN inválido/sin permisos) se propague tal cual para que el modal lo
   *  muestre y permita reintentar. */
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
    ncfType,
    items,
    notes,
    branch,
    department,
    arsEnabled,
    ars,
    currency,
    conversionRate,
    delivery,
  }, hydrationDone)
  useBeforeUnloadWarning(isDirty)

  // ── Hidratación del borrador en modo edición ─────────────────────────────
  // Fase 1: escalares (cliente, fechas, NCF, sucursal, depto, notas). Se corre una sola vez.
  useEffect(() => {
    if (!isEdit || !editingInvoice || scalarsHydratedRef.current) return
    scalarsHydratedRef.current = true
    const inv = editingInvoice
    setNcfType((inv.ncfType || 'B02') as NcfType)
    setBranch(inv.branch ?? '')
    setDepartment(inv.department ?? '')
    setNotes(inv.notes ?? '')
    setCurrency(inv.currency ?? '')
    setConversionRate(inv.conversionRate ?? '')
    // Delivery: el GET trae el bloque anidado `delivery` (§2.3).
    setDelivery({
      esDelivery: inv.delivery?.esDelivery ?? false,
      direccionEntrega: inv.delivery?.direccion ?? '',
      telefonoEntrega: inv.delivery?.telefono ?? '',
      referenciaEntrega: inv.delivery?.referencia ?? '',
    })
    setDireccionEntregaTouched(false)
    if (inv.esClienteOcasional) {
      setEsClienteOcasional(true)
      setClienteOcasionalNombre(inv.clienteOcasionalNombre ?? '')
      setClienteOcasionalRnc(inv.clienteOcasionalRnc ?? '')
      setClienteOcasionalDireccion(inv.clienteOcasionalDireccion ?? '')
    } else if (inv.customer) {
      setCustomerId(inv.customer)
      getClienteDetalle(inv.customer).then(setSelectedCustomer).catch(() => {})
    }
    if (inv.aseguradora) {
      setArsEnabled(true)
      setArs(aseguradoraFormFromInvoice(inv.aseguradora))
    }
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
            cat = await getItemLookup(it.itemCode)
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
            maxDiscountPct: cat?.allowsDiscount ? (cat?.maxDiscountPct ?? undefined) : undefined,
            autoDiscountPct: undefined,
            manualDiscountPct: discountMode === 'pct' ? discountPct : 0,
            allowsDiscount: cat?.allowsDiscount ?? undefined,
            warehouse: it.warehouse ?? '',
            _prices: cat?.prices,
            _stockByWarehouse: cat?.stockByWarehouse ?? undefined,
            ubicacion: it.ubicacion || undefined,
            _usaDimensiones: cat?.usaDimensiones,
            _itemDimensiones: cat?.dimensiones,
            // A diferencia de lo que originalmente documentaba §10.2, GET /invoices/:id SÍ trae
            // la combinación de la línea (confirmado en vivo 2026-09-27) — se usa directamente.
            // Solo queda "pendiente de reselección" si, por algún motivo, viene incompleta.
            dimensiones: it.dimensiones,
            _dimensionesPendientesReseleccion: cat?.usaDimensiones && !combinacionCompleta(cat.dimensiones ?? [], it.dimensiones ?? {}) ? true : undefined,
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
          precioManual: undefined,
           amount: calcAmount(row.qty, rate, (autoDiscountPct ?? 0) + defaultManualPct, 0),
          uom: catalogItem.stockUom ?? row.uom,
          conversionFactor: 1,
          maxDiscountPct: catalogItem.allowsDiscount ? (catalogItem.maxDiscountPct ?? undefined) : undefined,
          autoDiscountPct,
          discountPct: (autoDiscountPct ?? 0) + defaultManualPct,
          discountMode: 'pct',
          discountAmount: 0,
          manualDiscountPct: defaultManualPct,
          allowsDiscount: catalogItem.allowsDiscount ?? undefined,
          _prices: catalogItem.prices,
          salesTaxPct: catalogItem.salesTaxPct ?? 0,
          salesTaxTemplate: catalogItem.salesTaxTemplate ?? '',
          warehouse: defaultWarehouse(),
          _stockByWarehouse: catalogItem.stockByWarehouse ?? undefined,
          _comboComponents: undefined,
          componentTracking: undefined,
          ubicacion: undefined,
          ubicacionError: undefined,
          _usaDimensiones: catalogItem.usaDimensiones,
          _itemDimensiones: catalogItem.dimensiones,
          dimensiones: undefined,
          _dimensionesPendientesReseleccion: undefined,
        }
      })
    })
    // El picker puede no traer `dimensiones` — solo el detalle las garantiza (§4.3). Si faltan,
    // se completan para habilitar la columna de dimensión.
    if (!catalogItem.dimensiones || catalogItem.dimensiones.length === 0) {
      try {
        const detail = await getItemLookup(catalogItem.id)
        if (detail?.usaDimensiones && detail.dimensiones?.length) {
          setItems((prev) => prev.map((row, i) =>
            i === index && row.itemCode === catalogItem.id && !(row._itemDimensiones?.length)
              ? { ...row, _usaDimensiones: true, _itemDimensiones: detail.dimensiones }
              : row,
          ))
        }
      } catch {}
    }
    if (autoAddRow && wasLastRow) addRow()
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, amount: 0, precioManual: undefined, discountPct: 0, discountMode: 'pct', discountAmount: 0, manualDiscountPct: 0, salesTaxPct: 0, salesTaxTemplate: '', _comboComponents: undefined, componentTracking: undefined, ubicacion: undefined, ubicacionError: undefined, _usaDimensiones: undefined, _itemDimensiones: undefined, dimensiones: undefined, _dimensionesPendientesReseleccion: undefined })
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
          precioManual: undefined,
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
          // Un combo/bundle nunca usa dimensiones (§0: es una cosa o la otra, nunca ambas).
          _usaDimensiones: undefined,
          _itemDimensiones: undefined,
          dimensiones: undefined,
          _dimensionesPendientesReseleccion: undefined,
        }
      })
    })
    if (wasLastRow) addRow()

    // Detecta componentes del combo con tracking de serial/lote — solo aplica a facturación directa.
    Promise.all(
      (bundle.components ?? []).map(async (c) => {
        try {
          const item = await getItemLookup(c.itemCode)
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
          maxDiscountPct: s.item.allowsDiscount ? (s.item.maxDiscountPct ?? undefined) : undefined,
          autoDiscountPct: s.item.autoDiscount?.discountType === 'Discount Percentage' ? s.item.autoDiscount.discountPercentage : undefined,
          manualDiscountPct: 0,
          allowsDiscount: s.item.allowsDiscount ?? undefined,
          _prices: s.item.prices,
          warehouse: defaultWarehouse(),
          _stockByWarehouse: s.item.stockByWarehouse ?? undefined,
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
      const fullItem = await getItemLookup(equivalenteId)
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
  // docs/tasks/PROMPT_NCF_DEFAULT_REGIMENES_ESPECIALES_REDONDEO_FRONTEND.md §2 — B14/E44
  // (Régimen Especial) se somete siempre sin ITBIS: el preview fuerza el impuesto a 0 para
  // que coincida con lo que el backend va a someter. Al cambiar a otro NCF, el cálculo
  // normal se restaura solo. Los impuestos configurados se siguen mandando tal cual (§2.2.3).
  const esRegimenEspecial = ncfType === 'B14' || ncfType === 'E44'
  const taxTotal = esRegimenEspecial
    ? 0
    : items.reduce((s, i) => s + (i.amount * i.salesTaxPct / 100), 0)
  const total = subtotal + taxTotal

  // ── Cobertura ARS: armado del payload (§3.2/§3.3) ─────────────────────────
  const arsActiva = esFarmacia && arsEnabled

  // ── Columnas condicionales de la tabla de líneas ──────────────────────────
  // Código: ancho según el código más largo presente, para no reservar espacio de más por
  // defecto ni depender de que el usuario lo redimensione a mano.
  const codigoAutoWidth = Math.min(160, Math.max(60, Math.max(0, ...items.map((i) => i.itemCode?.length ?? 0)) * 7.5 + 28))

  // Dimensión: una columna por cada eje que declare AL MENOS un artículo de la factura (no todas
  // las dimensiones del catálogo del tenant), a la derecha de "Artículo".
  const dimensionCodes = Array.from(new Set(items.flatMap((i) => i._itemDimensiones?.map((d) => d.dimension) ?? [])))
  const { etiquetaDe: dimensionEtiquetaDe } = useDimensionesInventario({ enabled: items.some((i) => i._usaDimensiones) })

  // Ubicación: solo si algún artículo tiene más de una ubicación asignada en su almacén — con 0 o
  // 1 no hay nada real que elegir (mismo criterio que `LineUbicacionCell` para ocultar la celda).
  const ubicacionQueries = useQueries({
    queries: items.map((i) => ({
      queryKey: ['item-ubicaciones', i.itemCode, i.warehouse],
      queryFn: () => getItemUbicacionesLookup(i.itemCode, i.warehouse!),
      enabled: !!i.itemCode && !!i.warehouse,
    })),
  })
  const showUbicacionColumn = ubicacionQueries.some((q) => (q.data?.items?.length ?? 0) > 1)

  // Descuento: solo si algún artículo agregado acepta descuento.
  const showDescuentoColumn = items.some((i) => i.itemCode && i.allowsDiscount !== false)

  const itemsColumnDefs: { key: string; width: number }[] = [
    { key: 'articulo', width: 220 },
    ...dimensionCodes.map((code) => ({ key: `dim:${code}`, width: 140 })),
    { key: 'cant', width: 80 },
    { key: 'udm', width: 100 },
    { key: 'precio', width: 120 },
    ...(showDescuentoColumn ? [{ key: 'descuento', width: 140 }] : []),
    { key: 'itbis', width: 80 },
    { key: 'subtotal', width: 120 },
    ...(!almacenVentaSucursal ? [{ key: 'almacen', width: 160 }] : []),
    ...(showUbicacionColumn ? [{ key: 'ubicacion', width: 140 }] : []),
    ...(arsActiva ? [
      { key: 'pctTeorico', width: 100 },
      { key: 'coberturaArs', width: 130 },
      { key: 'lock', width: 50 },
      { key: 'paciente', width: 120 },
      { key: 'pctReal', width: 90 },
    ] : []),
    { key: 'actions', width: 70 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(itemsColumnDefs)
  /** Columnas totales visibles, incluyendo "Código" (que se maneja aparte por su ancho
   *  automático) — para los `colSpan` de las filas especiales de la tabla. */
  const columnCount = itemsColumnDefs.length + 1

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
       if (esCreditoFiscal(ncfType) && !clienteOcasionalRnc.trim()) {
         toast.error('El RNC es requerido para comprobante B01/E31 (Crédito Fiscal)')
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
        if (esCreditoFiscal(ncfType) && !selectedCustomer?.rnc) {
          toast.error('El cliente necesita RNC para comprobante B01/E31 (Crédito Fiscal)')
          return
        }
      }

      // Delivery (§2.1): dirección obligatoria en la práctica; el BFF responde
      // 400 DELIVERY_DIRECCION_REQUERIDA. Solo DOP.
      if (esDelivery) {
        if (deliveryMonedaInvalida) {
          toast.error(`Delivery solo admite la moneda de la compañía (${monedaBase})`)
          return
        }
        if (deliverySinDireccion) {
          setDireccionEntregaTouched(true)
          toast.error('La venta con delivery requiere la dirección de entrega')
          document.getElementById('direccionEntrega')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
      const stockError = validateLineStock(item, stockMap, stockSettings?.allowNegativeStock)
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
      // Combinación de dimensión de inventario (§5/§7.1): obligatoria para TODA línea de un
      // artículo con `usaDimensiones`, incluso una línea hidratada de una edición que todavía no
      // se volvió a seleccionar (§10.2) — en ese caso `dimensiones` está vacío y esto la atrapa igual.
      if (item._usaDimensiones && item._itemDimensiones && !combinacionCompleta(item._itemDimensiones, item.dimensiones ?? {})) {
        toast.error(`Línea ${i + 1}: selecciona la dimensión completa para ${item.itemLabel ?? item.itemCode} antes de continuar`)
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
    // §5.1: fusiona líneas del mismo artículo con la MISMA combinación exacta antes de armar el
    // payload, sumando la cantidad — evita que el servidor devuelva un único error de "stock
    // insuficiente" sobre la suma sin que el usuario entienda por qué (líneas sin dimensiones o de
    // artículos que no las usan nunca se fusionan por esta vía, mergeLineasIguales es idempotente
    // para ellas).
    const merged = mergeLineasIguales(items.filter((i) => i.itemCode), {
      getItemCode: (r) => r.itemCode,
      getDimensiones: (r) => r.dimensiones,
      sumQty: (base, extra) => {
        const qty = base.qty + extra.qty
        const amount = base.discountMode === 'amount'
          ? calcAmount(qty, base.rate, 0, base.discountAmount)
          : calcAmount(qty, base.rate, base.discountPct)
        return { ...base, qty, amount }
      },
    })
    const itemsDto = merged.map((i) => ({
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
      // ⚠️ §0.4/§7.1/§10.1: se reenvía SIEMPRE que la línea la tenga, en cada creación y en cada
      // PUT de edición — nunca depender de la conservación heurística (frágil) del backend.
      ...(i.dimensiones && Object.keys(i.dimensiones).length > 0 ? { dimensiones: i.dimensiones } : {}),
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
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      ncfType,
      items: itemsDto,
      notes: notes || undefined,
      taxesTemplate: undefined,
      currency: currency || undefined,
      conversionRate: currency && currency !== monedaBase && conversionRate !== '' ? conversionRate : undefined,
      // Delivery fuerza despacho a futuro: con el switch encendido se oculta el toggle y
      // se manda `true` (si el selector está visible); nunca `false` con delivery (§2.1).
      despachoFuturo: esDelivery
        ? (mostrarSelectorDespachoFuturo ? true : undefined)
        : (mostrarSelectorDespachoFuturo ? despachoFuturo : undefined),
      ...(esDelivery
        ? {
            esDelivery: true,
            direccionEntrega: delivery.direccionEntrega.trim(),
            telefonoEntrega: delivery.telefonoEntrega.trim() || undefined,
            referenciaEntrega: delivery.referenciaEntrega.trim().slice(0, 500) || undefined,
          }
        : {}),
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
                   <OpcionesSelect recurso="clientes" id="customer" selectedLabel={selectedCustomer?.customerName} value={customerId} onChange={(val, _opt) => {
                       customerTouchedRef.current = true
                       setCustomerId(val)
                       if (!val) {
                         setSelectedCustomer(null)
                         setSemaforo(null)
                       } else {
                         // /opciones no trae los datos comerciales: se cargan con el detalle (efecto en [customerId]).
                         setSelectedCustomer(null)
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
                     } minChars={2} />
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
                    {editingInvoice?.postingDate ? formatDate(editingInvoice.postingDate) : ''}
                  </span>
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="dueDate">Fecha vencimiento</label>
                <DatePicker
                  id="dueDate"
                  className="ff-input"
                  value={dueDate}
                  onChange={() => {}}
                  disabled
                />
              </div>

<div className="ff-wrap">
                 <label className="ff-label" htmlFor="ncfType">Tipo NCF</label>
                 <SearchSelect
                   id="ncfType"
                   value={ncfType}
                   selectedLabel={(catalogos?.ncfTypes ?? []).find((t) => t.value === ncfType)?.label ?? ''}
                   onChange={(val) => { ncfTouchedRef.current = true; setNcfType((val || 'B02') as NcfType) }}
                   options={ncfTypeOptions}
                   onSearch={setNcfTypeSearch}
                   className="ff-select"
                 />
                 {esCreditoFiscal(ncfType) && !selectedCustomer?.rnc && !esClienteOcasional && (
                   <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                     B01/E31 requiere RNC del cliente
                   </p>
                 )}
                  {esCreditoFiscal(ncfType) && esClienteOcasional && (
                    <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                      B01/E31 requiere RNC del cliente ocasional
                    </p>
                  )}
                  {(ncfType === 'B14' || ncfType === 'E44') && (
                    <p className="ff-hint" style={{ color: 'var(--text-secondary)' }}>
                      Este tipo de comprobante (Régimen Especial de Tributación) se emite siempre sin
                      ITBIS — cualquier impuesto configurado se ignora.
                    </p>
                  )}
                </div>

               {esClienteOcasional && (
                 <div className="ff-wrap">
                   <label className={`ff-label${esCreditoFiscal(ncfType) ? ' ff-required' : ''}`} htmlFor="clienteOcasionalRnc">RNC o Cédula</label>
                   <input
                     id="clienteOcasionalRnc"
                     type="text"
                     className="ff-input"
                     value={clienteOcasionalRnc}
                     onChange={(e) => { customerTouchedRef.current = true; setClienteOcasionalRnc(e.target.value) }}
                     placeholder="132456785 o 00113918866"
                     required={esCreditoFiscal(ncfType)}
                   />
                 </div>
               )}

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="branch">Sucursal</label>
                <OpcionesSelect recurso="sucursales" id="branch" value={branch} onChange={(val) => { setBranch(val); setBranchError(false) }} placeholder="Sin especificar" error={!branch || branchError} disabled={branchOptions.length === 1} className="ff-select" selectedLabel={branch} />
                {branchError && <p className="ff-hint" style={{ color: 'var(--color-danger)' }}>Debes seleccionar una sucursal para continuar</p>}
              </div>

              {usaDepartamentos && (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="department">Departamento</label>
                  <DepartmentSelect id="department" value={department} onChange={setDepartment} />
                </div>
              )}

            </div>

            {semaforo?.semaforo === 'rojo' && (
              <div className="inline-alert inline-alert-warn" style={{ marginTop: 12 }}>
                El cliente ha excedido su límite de crédito ${(semaforo.pctUsado ?? 0).toFixed(1)}% utilizado).
                Considera revisar el saldo pendiente antes de emitir esta factura.
              </div>
            )}
            {/* Delivery fuerza despacho a futuro: con el switch encendido se oculta
                este toggle (§2.1). */}
            {mostrarSelectorDespachoFuturo && !esDelivery && (
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
                    ? 'La factura no descontará inventario al someterse — la salida física se registra después con un Despacho.'
                    : 'La factura descontará inventario al someterse — se confirma que exista stock físico en el almacén de cada línea.'}
                </p>
              </div>
            )}
            <DeliveryFormSection
              value={delivery}
              onChange={(v) => {
                setDelivery(v)
                if (!v.esDelivery) setDireccionEntregaTouched(false)
              }}
              clienteOcasional={esClienteOcasional}
              direccionOcasional={clienteOcasionalDireccion}
              customerId={customerId}
              monedaBase={monedaBase}
              currencyActual={currency}
              direccionError={direccionEntregaTouched}
            />
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
            <table className="items-table navy-table items-table-resizable">
              <colgroup>
                <col style={{ width: codigoAutoWidth }} />
                {itemsColumnDefs.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th>
                    Código
                  </th>
                  <th>
                    Artículo
                    <span className="col-resize-handle" onMouseDown={startResize('articulo')} />
                  </th>
                  {dimensionCodes.map((code) => (
                    <th key={code}>
                      {dimensionEtiquetaDe(code)}
                      <span className="col-resize-handle" onMouseDown={startResize(`dim:${code}`)} />
                    </th>
                  ))}
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
                  {showDescuentoColumn && (
                    <th style={{ textAlign: 'right' }}>
                      Descuento
                      <Info size={11} style={{ marginLeft: 2, verticalAlign: 'middle', color: 'var(--text-tertiary)' }} />
                      <span className="col-resize-handle" onMouseDown={startResize('descuento')} />
                    </th>
                  )}
                  <th style={{ textAlign: 'right' }}>
                    ITBIS
                    <span className="col-resize-handle" onMouseDown={startResize('itbis')} />
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    Subtotal
                    <span className="col-resize-handle" onMouseDown={startResize('subtotal')} />
                  </th>
                  {!almacenVentaSucursal && (
                    <th>
                      Almacén
                      <span className="col-resize-handle" onMouseDown={startResize('almacen')} />
                    </th>
                  )}
                  {showUbicacionColumn && (
                    <th>
                      Ubicación
                      <span className="col-resize-handle" onMouseDown={startResize('ubicacion')} />
                    </th>
                  )}
                  {arsActiva && (
                    <>
                      <th style={{ textAlign: 'right' }} title="Peso de esta línea en el reparto automático de la cobertura. Vacío en todas = partes iguales.">
                        % teórico ARS
                        <span className="col-resize-handle" onMouseDown={startResize('pctTeorico')} />
                      </th>
                      <th style={{ textAlign: 'right' }}>
                        Cobertura ARS
                        <span className="col-resize-handle" onMouseDown={startResize('coberturaArs')} />
                      </th>
                      <th style={{ textAlign: 'center' }} title="Ajuste manual protegido: Recalcular no toca la línea.">
                        🔒
                        <span className="col-resize-handle" onMouseDown={startResize('lock')} />
                      </th>
                      <th style={{ textAlign: 'right' }}>
                        Paciente
                        <span className="col-resize-handle" onMouseDown={startResize('paciente')} />
                      </th>
                      <th style={{ textAlign: 'right' }}>
                        % real
                        <span className="col-resize-handle" onMouseDown={startResize('pctReal')} />
                      </th>
                    </>
                  )}
                  <th />
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
                          onQueryChange={esFarmacia ? setBusquedaAsistidaQuery : undefined}
                        />
                      </td>

                      {/* Dimensión — una celda por eje declarado por ALGÚN artículo de la factura
                          (§0/§5/§7.1/§10); vacía si este artículo no declara ese eje. */}
                      {dimensionCodes.map((code) => (
                        <td key={code}>
                          {item.itemCode && item._usaDimensiones && item._itemDimensiones?.some((d) => d.dimension === code) ? (
                            <>
                              <DimensionAxisCell
                                itemDimensiones={item._itemDimensiones}
                                codigo={code}
                                value={item.dimensiones ?? {}}
                                onChange={(next) => updateItem(index, { dimensiones: next, _dimensionesPendientesReseleccion: undefined })}
                              />
                              {item._dimensionesPendientesReseleccion && code === dimensionCodes.find((c) => item._itemDimensiones?.some((d) => d.dimension === c)) && (
                                <span style={{ fontSize: 11, color: 'var(--color-warning)', display: 'block', whiteSpace: 'normal', maxWidth: 160 }}>
                                  Vuelva a seleccionar la dimensión antes de guardar
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>
                      ))}

                      <td>
                        {(() => {
                          const stockError = validateLineStock(item, stockMap, stockSettings?.allowNegativeStock)
                          const info = item.itemCode && item.warehouse ? resolveDisponible(stockMap.get(item.itemCode), item.warehouse) : undefined
                          return (
                            <>
                              <QtyInput id={lineQtyId(index)} className={`items-input${stockError ? ' items-input-error' : ''}`} value={item.qty} uom={item.uom} onChange={(v) => updateItem(index, { qty: v })} style={{ textAlign: 'right' }} />
                              {stockError ? (
                                <span style={{ fontSize: 11, color: 'red', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  {stockError}
                                </span>
                              ) : info && info.reservedStock > 0 ? (
                                <span style={{ fontSize: 11, color: 'var(--warning-text)', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
                                  Disponible: {info.disponible} ({info.reservedStock} reservadas para otro cliente)
                                </span>
                              ) : null}
                            </>
                          )
                        })()}
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
                              direction="sale"
                            />
                        )}
                      </td>
                      <td title={precioBloqueadoPara(item.itemType) ? 'Precio de catálogo — la edición manual está deshabilitada para este tipo de artículo' : 'Precio editable — los pisos de costo/mínimo se validan al guardar'}>
                        <input
                          className="items-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={precioBloqueadoPara(item.itemType) ? round2(item.rate) : (item.rate ?? '')}
                          disabled={precioBloqueadoPara(item.itemType)}
                          onChange={(e) => updateManualRate(index, e.target.value)}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                       {showDescuentoColumn && (
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
                       )}
                       <td style={{ textAlign: 'right' }}>
                         {esRegimenEspecial ? (
                           <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                         ) : item.salesTaxPct > 0 ? (
                           <span className="td-muted" style={{ fontSize: 12 }}>
                             {item.salesTaxPct}%
                           </span>
                         ) : (
                           <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                         )}
                       </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.amount, currency || monedaBase, { trimZeros: true })}</td>
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
                      {showUbicacionColumn && (
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
                      )}
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
                      <td onClick={(e) => e.stopPropagation()} className="actions-cell" style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
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
              {arsActiva && arsServidor && (
                <>
                  <div className="items-total-line" style={{ fontSize: 16, justifyContent: 'flex-end', gap: 24 }}>
                    <span style={{ textAlign: 'right' }}>Cubre la ARS</span>
                    <span style={{ textAlign: 'left', minWidth: 170 }}>-{formatDOP(arsServidor.montoCobertura)}</span>
                  </div>
                  <div className="items-total-line" style={{ fontSize: 16, justifyContent: 'flex-end', gap: 24 }}>
                    <span style={{ textAlign: 'right' }}>A cargo del paciente</span>
                    <span style={{ textAlign: 'left', minWidth: 170 }}>{formatDOP(arsServidor.montoPaciente)}</span>
                  </div>
                </>
              )}
            </div>
        </div>
        </div>

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
