import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { toast } from 'sonner'
import { addDays, format as formatDateFns } from 'date-fns'
import { useTabs } from '@/contexts/TabsContext'
import { createGasto, updateGasto, getGasto } from '@/shared/api/compras-gastos'
import { listSuppliers, getSupplier } from '@/shared/api/suppliers'
import type { CreateGastoDto, DistribucionCuentaDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { getCatalogosFiscales, getFacturacionConfig, getCuentasEmpresa, listImpuestosCompras } from '@/shared/api/config'
import { getCuenta } from '@/shared/api/cuentas'
import { CATEGORIA_GASTO } from '@/lib/constants'
import { listRetenciones } from '@/shared/api/retenciones'
import { Plus, Trash2, Pencil, Info, AlertCircle, AlertTriangle } from 'lucide-react'
import { Modal } from '@/shared/ui/Modal'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { MultiSearchSelect } from '@/shared/ui/MultiSearchSelect'
import type { MultiSearchSelectOption } from '@/shared/ui/MultiSearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import type { Item, CuentaPorPagar } from '@/shared/api/types'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import { getUser } from '@/shared/api/storage'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { QtyInput } from '@/shared/ui/QtyInput'
import { DatePicker } from '@/shared/ui/DatePicker'
import { DistribucionCuentaEditor } from '@/components/shared/DistribucionCuentaEditor'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'

const SYSTEM_MANAGER_ROLE = 'System Manager'

interface ItemRow {
  itemCode: string
  itemLabel?: string
  itemType?: 'product' | 'service' | 'combo'
  description: string
  qty: number
  rate: number
  uom: string
  // ── Ítem ad-hoc (sin catálogo) — ver GastoItemDto. Exactamente uno de itemCode/isAdHoc+titulo. ──
  isAdHoc?: boolean
  titulo?: string
  /** Cuenta contable a debitar por esta línea — si se omite, usa la cuenta de gasto default del
   *  Item (ítems de catálogo) o es requerida (ítems ad-hoc). Ignorada si `distribucionCuenta` trae entradas. */
  cuentaAlterna?: string
  /** Cuenta contable configurada en el concepto de Cuentas por Pagar seleccionado — ausente en
   *  ítems ad-hoc. Se usa para mostrar (solo lectura) qué cuenta aplicará a la línea. */
  cuentaConcepto?: string
  tipoBienes606Linea?: string
  tipoGastoFiscal?: 'Bienes' | 'Servicios' | ''
  impuestosLinea?: string[]
  retencionesLinea?: string[]
  /** Si tiene entradas, divide el monto de la línea (qty × rate) entre varias cuentas — ignora
   *  `cuentaAlterna` de esta misma línea. */
  distribucionCuenta?: DistribucionCuentaDto[]
}

function emptyItem(): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, uom: 'Nos' }
}

function emptyAdHocItem(): ItemRow {
  return {
    itemCode: '',
    description: '',
    qty: 1,
    rate: 0,
    uom: 'Nos',
    isAdHoc: true,
    titulo: '',
    cuentaAlterna: '',
    tipoBienes606Linea: '',
    tipoGastoFiscal: '',
    impuestosLinea: [],
    retencionesLinea: [],
  }
}

const NCF_REGEX = /^[BE]\d{10}$/
const B17_MAX = 50

/** Muestra (solo lectura) la cuenta contable que aplicará a una línea de concepto de Cuentas
 *  por Pagar: la cuenta configurada en el concepto o, si no tiene una, la cuenta de gastos por
 *  defecto de la Empresa. Ya no es editable por línea — para desviarse de esta cuenta hay que
 *  usar "Dividir" y repartir el monto entre las cuentas deseadas. */
function ItemCuentaContableText({ accountId }: { accountId?: string }) {
  const { data: cuenta, isLoading: loadingCuenta } = useQuery({
    queryKey: ['cuenta', accountId],
    queryFn: () => getCuenta(accountId!),
    enabled: !!accountId,
    staleTime: 5 * 60_000,
  })

  if (loadingCuenta) {
    return <span className="td-muted" style={{ fontSize: 12 }}>Cargando…</span>
  }
  if (!cuenta) {
    return <span className="td-muted" style={{ fontSize: 12 }}>Sin cuenta configurada</span>
  }
  return (
    <span style={{ fontSize: 12 }}>
      {cuenta.accountNumber ? `${cuenta.accountNumber} - ` : ''}{cuenta.accountName}
    </span>
  )
}

export default function GastoForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id } = useParams<{ id?: string }>()
  const { multiTab, activeId, closeTab } = useTabs()
  const isEdit = !!id

  const [supplierId, setSupplierId] = useState('')
  const [supplierLabel, setSupplierLabel] = useState('')
  const [esProveedorOcasional, setEsProveedorOcasional] = useState(false)
  const [proveedorOcasionalNombre, setProveedorOcasionalNombre] = useState('')
  const [proveedorOcasionalRnc, setProveedorOcasionalRnc] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  // Una vez que el usuario edita "Fecha Vencimiento" a mano dejamos de recalcularla
  // automáticamente al cambiar de proveedor.
  const [dueDateTouched, setDueDateTouched] = useState(false)
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  const [ncfProveedor, setNcfProveedor] = useState('')
  const [billNo, setBillNo] = useState('')
  const [tipoComprobante, setTipoComprobante] = useState<string>('')
  const [tipoBienes606, setTipoBienes606] = useState('')
  const [formaPago606, setFormaPago606] = useState('')
  const [tipoPago, setTipoPago] = useState<'Contado' | 'Crédito'>('Contado')
  const [tipoPagoTouched, setTipoPagoTouched] = useState(false)
  const [taxesTemplate, setTaxesTemplate] = useState<string[]>([])
  const [categoriaGasto, setCategoriaGasto] = useState<string>('')
  const [esDeducible, setEsDeducible] = useState(true)
  // retenciones aplicadas al gasto (ids de config/retenciones). El BFF calcula el monto de cada
  // una a partir de la tasa del proveedor / template; si se omite, se usan las retenciones por
  // defecto del proveedor.
  const [retenciones, setRetenciones] = useState<string[]>([])
  const [branch, setBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [cuentaCxpOverride, setCuentaCxpOverride] = useState('')

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true

  const { data: cuentasEmpresa } = useQuery({
    queryKey: ['cuentas-empresa'],
    queryFn: getCuentasEmpresa,
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
  const { data: myBranches } = useQuery({
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
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  // Si solo hay una sucursal disponible, se selecciona sola y el select se bloquea.
  useEffect(() => {
    if (branchOptions.length === 1 && branch !== branchOptions[0]) setBranch(branchOptions[0])
  }, [branchOptions, branch])

  const { data: gastoData, isLoading: loadingEdit } = useQuery({
    queryKey: ['gasto', id],
    queryFn: () => getGasto(id!),
    enabled: isEdit,
  })

  // Con Multipestañas, esta pantalla queda montada (KeepAlive) al cambiar de pestaña — al volver
  // a ella se re-consulta por si el gasto cambió en el servidor mientras el usuario estaba en otra.
  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['gasto', id] })
  }, [isEdit, id], true)

  // Precarga del formulario al editar un gasto en Draft.
  /* eslint-disable react-hooks/set-state-in-effect -- sincroniza el form local
     con la data del servidor una sola vez, cuando llega la respuesta de edición */
  useEffect(() => {
    if (!gastoData) return
    if (gastoData.status !== 'draft') {
      toast.error('Solo se pueden editar gastos en borrador')
      navigate(`/gastos/${gastoData.id}`, { replace: true })
      return
    }

    // Extraer y mostrar el mensaje del servidor (ej. cambio automático de cuenta contable)
    const rawMsg = (gastoData as { message?: string }).message
    setServerMessage(rawMsg ?? null)

    setSupplierId(gastoData.supplier)
    setSupplierLabel(gastoData.supplierName)
    setEsProveedorOcasional(gastoData.esProveedorOcasional ?? false)
    setProveedorOcasionalNombre(gastoData.proveedorOcasionalNombre ?? '')
    setProveedorOcasionalRnc(gastoData.proveedorOcasionalRnc ?? '')
    setPostingDate(gastoData.postingDate.split('T')[0])
    setDueDate(gastoData.dueDate ? gastoData.dueDate.split('T')[0] : '')
    setDueDateTouched(true)
    const hasAdHocItems = gastoData.items.some((i) => !i.itemCode)
    setItems(
      gastoData.items.length > 0
        ? gastoData.items.map((i) =>
            i.itemCode
              ? {
                  itemCode: i.itemCode,
                  itemLabel: i.itemName,
                  description: i.description ?? '',
                  qty: i.qty,
                  rate: i.rate,
                  uom: i.uom ?? 'Nos',
                  cuentaAlterna: i.cuentaAlterna ?? '',
                }
              : {
                  ...emptyAdHocItem(),
                  titulo: i.itemName ?? '',
                  description: i.descripcion ?? '',
                  qty: i.qty,
                  rate: i.rate,
                  cuentaAlterna: i.cuentaAlterna ?? '',
                  tipoBienes606Linea: i.tipoBienes606 ?? '',
                  tipoGastoFiscal: i.tipoGastoFiscal ?? '',
                },
          )
        : [emptyItem()],
    )
    setCuentaCxpOverride(gastoData.cuentaCxpOverride ?? '')
    if (hasAdHocItems) {
      toast.info('Este gasto tiene ítems sin catálogo (ad-hoc). Sus impuestos/retenciones de línea no se guardan de forma individual — si necesitas conservarlos, vuelve a seleccionarlos antes de guardar.')
    }
    setNcfProveedor(gastoData.ncfProveedor ?? '')
    setBillNo(gastoData.billNo ?? '')
    setTipoComprobante(gastoData.tipoComprobante ?? '')
    setTipoBienes606(gastoData.tipoBienes606 ?? '')
    setFormaPago606(gastoData.formaPago606 ?? '')
    setTipoPago(gastoData.tipoPago ?? 'Contado')
    setTipoPagoTouched(true)
    setTaxesTemplate((gastoData.taxesTemplate ?? []).map((t) => t.id))
    setRetenciones((gastoData.retenciones ?? []).map((r) => r.id))
    setCategoriaGasto(gastoData.categoriaGasto ?? '')
    setEsDeducible(gastoData.esDeducible ?? true)
    setBranch(gastoData.branch ?? '')
    setDepartment(gastoData.department ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gastoData])
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [tipoComprobanteSearch, setTipoComprobanteSearch] = useState('')
  const tipoComprobanteOptions: SearchSelectOption[] = (catalogos?.ncfTypesCompra ?? [])
    .filter((t) => !tipoComprobanteSearch || t.label.toLowerCase().includes(tipoComprobanteSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const [tipoBienes606Search, setTipoBienes606Search] = useState('')
  const tipoBienes606Options: SearchSelectOption[] = (catalogos?.tipoBienes606 ?? [])
    .filter((t) => !tipoBienes606Search || t.label.toLowerCase().includes(tipoBienes606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const [formaPago606Search, setFormaPago606Search] = useState('')
  const formaPago606Options: SearchSelectOption[] = (catalogos?.formaPago606 ?? [])
    .filter((f) => !formaPago606Search || f.label.toLowerCase().includes(formaPago606Search.toLowerCase()))
    .map((f) => ({ value: f.value, label: f.label }))

  // Impuesto del documento — mismo template/catálogo que usa Compras (config/impuestos-compras).
  const { data: taxesTemplates } = useQuery({
    queryKey: ['impuestos-compras'],
    queryFn: listImpuestosCompras,
    staleTime: 5 * 60_000,
  })

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
    enabled: true,
  })

  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
    sublabel: s.rnc ?? s.cedula,
  }))

  const { data: supplierDetail } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: !!supplierId && !esProveedorOcasional,
  })

  // ── Catálogos de impuestos y retenciones (multiselect) ────────────────────────
  const { data: retencionesData } = useQuery({
    queryKey: ['retenciones-all'],
    queryFn: () => listRetenciones({ limit: 100 }),
    staleTime: 5 * 60_000,
  })
  const retencionesOptions: MultiSearchSelectOption[] = useMemo(
    () => (retencionesData?.items ?? []).map((r) => ({ id: r.id, label: r.categoryName })),
    [retencionesData],
  )
  const impuestosOptions: MultiSearchSelectOption[] = useMemo(
    () => (taxesTemplates ?? []).map((t) => ({ id: String(t.id), label: t.title })),
    [taxesTemplates],
  )
  // Mapa id → etiqueta de retención, para el hint descriptivo.
  const retencionLabelMap = useMemo(
    () => new Map(retencionesOptions.map((r) => [r.id, r.label])),
    [retencionesOptions],
  )

  // Al resolver el proveedor, pre-llenamos los campos 606 e impuestos/retenciones que trae.
  // No sobre-escribimos valores que el usuario ya haya definido (ni en modo edición desde el
  // draft). Cada vez que se cambie de proveedor, los defaults del nuevo proveedor se aplican.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const s = supplierDetail
    if (!s || esProveedorOcasional) return

    if (!tipoBienes606 && s.defaultTipoBienes606) setTipoBienes606(s.defaultTipoBienes606)
    if (!formaPago606 && s.defaultFormaPago606) setFormaPago606(s.defaultFormaPago606)

    setTaxesTemplate((prev) =>
      prev.length === 0 ? (s.impuestoGastosDefault?.map((d) => d.id) ?? []) : prev,
    )
    setRetenciones((prev) =>
      prev.length === 0 ? (s.retencionesDefault?.map((d) => d.id) ?? []) : prev,
    )

    if (!dueDateTouched && s.diasCredito) {
      setDueDate(formatDateFns(addDays(new Date(), s.diasCredito), 'yyyy-MM-dd'))
    }

    if (!tipoPagoTouched) {
      // Sin días de crédito, no se le puede facturar a crédito — se auto-selecciona Contado
      // sin importar el default del proveedor.
      if (!s.diasCredito) setTipoPago('Contado')
      else if (s.defaultTipoPagoProveedor) setTipoPago(s.defaultTipoPagoProveedor)
    }
  }, [supplierDetail, esProveedorOcasional, tipoBienes606, formaPago606, dueDateTouched, tipoPagoTouched])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Hint: cuando el usuario no dejó ninguna retención pero el proveedor tiene defaults,
  // mostramos cuáles se aplicarían (con su tasa) para que quede explícito.
  const retencionesDefaultHint = supplierDetail?.retencionesDefault ?? []
  const pendingRetencionesHint =
    retenciones.length === 0 && retencionesDefaultHint.length > 0
      ? `Los retenciones por defecto del proveedor${
          retencionesDefaultHint.length > 0 ? `: ${retencionesDefaultHint
            .map((d) => `${retencionLabelMap.get(d.id) ?? d.id} (${d.tasa}%)`)
            .join(', ')}` : ''
        }.`
      : null

  // Igual que arriba, pero para impuestos (taxesTemplate / impuestoGastosDefault del proveedor).
  const impuestoGastosDefaultHint = supplierDetail?.impuestoGastosDefault ?? []
  const pendingImpuestosHint =
    taxesTemplate.length === 0 && impuestoGastosDefaultHint.length > 0
      ? `Los impuestos por defecto del proveedor${
          impuestoGastosDefaultHint.length > 0 ? `: ${impuestoGastosDefaultHint
            .map((d) => `${impuestosOptions.find((o) => o.id === d.id)?.label ?? d.id} (${d.tasa}%)`)
            .join(', ')}` : ''
        }.`
      : null

  // Un ítem ad-hoc con impuestos/retenciones propios + impuestos/retenciones de documento se
  // suman por separado (el de documento se calcula sobre el total, que ya incluye la línea
  // ad-hoc) — advertimos para evitar duplicar el cálculo sin querer.
  const hasAdHocConItemLevelTax = items.some(
    (i) => i.isAdHoc && ((i.impuestosLinea?.length ?? 0) > 0 || (i.retencionesLinea?.length ?? 0) > 0),
  )
  const showDuplicateTaxWarning = hasAdHocConItemLevelTax && (taxesTemplate.length > 0 || retenciones.length > 0)

  const saveMutation = useMutation({
    mutationFn: (dto: CreateGastoDto) => (isEdit ? updateGasto(id!, dto) : createGasto(dto)),
    onSuccess: (data) => {
      toast.success(isEdit ? 'Gasto actualizado' : 'Gasto creado')
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['gastos'] })
      if (isEdit) queryClient.removeQueries({ queryKey: ['gasto', id] })
      navigate(`/gastos/${data.id}`)
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (error) => {
      if (isApiErrorCode(error, ERROR_CODES.BRANCH_REQUIRED)) {
        setBranchError(true)
        toast.error((error as { message?: string })?.message ?? 'Selecciona una sucursal')
        return
      }
      const apiErr = error as { message?: string }
      toast.error(apiErr?.message ?? 'Error al guardar el gasto')
    },
  })

  const subtotal = items.reduce((sum, i) => sum + i.qty * i.rate, 0)

  // Vista previa de impuestos: suma de rates de las líneas de los templates seleccionados.
  // El BFF recalcula exactamente al someter; aquí es solo una estimación para el usuario.
  const impuestoRate = ((taxesTemplates ?? []).filter((t) => taxesTemplate.includes(String(t.id)))
    .reduce((sum, t) => sum + (t.taxes?.reduce((s, l) => s + (l.rate ?? 0), 0) ?? 0), 0))
  const impuestoAmount = (impuestoRate / 100) * subtotal

  // Vista previa de retenciones: suma de las tasas del proveedor para las retenciones seleccionadas.
  const retencionRate = retenciones
    .reduce((sum, id) => sum + (supplierDetail?.retencionesDefault?.find((d) => d.id === id)?.tasa ?? 0), 0)
  const retencionAmount = (retencionRate / 100) * subtotal

  const grandTotal = subtotal + impuestoAmount - retencionAmount
  const ncfValid = !ncfProveedor || NCF_REGEX.test(ncfProveedor)
  const isB17 = tipoComprobante === 'B17'
  const b17Error = isB17 && grandTotal > B17_MAX

  const isDirty = useDirtyCheck({
    supplierId,
    supplierLabel,
    esProveedorOcasional,
    proveedorOcasionalNombre,
    proveedorOcasionalRnc,
    postingDate,
    dueDate,
    items,
    ncfProveedor,
    billNo,
    tipoComprobante,
    tipoBienes606,
    formaPago606,
    taxesTemplate,
    categoriaGasto,
    esDeducible,
    retenciones,
    branch,
    department,
    cuentaCxpOverride,
  }, !loadingEdit)
  useBeforeUnloadWarning(isDirty)

  const currency = (v: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(v)

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }, [])

  // ── Modal de datos fiscales del ítem ad-hoc (cuenta, 606, impuestos/retenciones de línea) ──
  // Título, descripción, qty y precio se editan en línea en la tabla, igual que un ítem de
  // catálogo — el modal solo cubre los campos que no caben ahí.
  const [adHocModal, setAdHocModal] = useState<{ idx: number; draft: ItemRow } | null>(null)

  const openAdHocCreate = useCallback(() => {
    setItems((prev) => {
      const next = [...prev, emptyAdHocItem()]
      setAdHocModal({ idx: next.length - 1, draft: next[next.length - 1] })
      return next
    })
  }, [])
  const openAdHocEdit = useCallback((idx: number) => setAdHocModal({ idx, draft: { ...items[idx] } }), [items])
  const closeAdHocModal = useCallback(() => setAdHocModal(null), [])
  const updateAdHocDraft = useCallback(<K extends keyof ItemRow>(field: K, value: ItemRow[K]) => {
    setAdHocModal((prev) => prev ? { ...prev, draft: { ...prev.draft, [field]: value } } : prev)
  }, [])
  const saveAdHocModal = useCallback(() => {
    setAdHocModal((prev) => {
      if (!prev) return prev
      const { idx, draft } = prev
      if (!draft.cuentaAlterna) { toast.error('Selecciona una cuenta contable'); return prev }
      setItems((rows) => rows.map((row, i) => (i === idx ? { ...row, ...draft } : row)))
      return null
    })
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item) => {
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = idx === prev.length - 1
      return prev.map((row, i) => {
        if (i !== idx) return row
        return {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          itemType: catalogItem.type,
          description: catalogItem.internalDescription ?? catalogItem.itemName,
          rate: catalogItem.standardRate ?? 0,
          // Los servicios no se venden por cantidad — se fija en 1.
          qty: catalogItem.type === 'service' ? 1 : row.qty,
        }
      })
    })
    if (wasLastRow) setItems((prev) => [...prev, emptyItem()])
  }, [])

  // Un concepto de catalog/cuentas-por-pagar no tiene precio propio — se registra en $0 y el
  // usuario captura el monto real, igual que hoy hace con cualquier renglón de gasto.
  const selectCuentaPorPagar = useCallback((idx: number, concepto: CuentaPorPagar) => {
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = idx === prev.length - 1
      return prev.map((row, i) => {
        if (i !== idx) return row
        return {
          ...row,
          itemCode: concepto.id,
          itemLabel: concepto.titulo,
          itemType: 'service',
          description: concepto.descripcion ?? concepto.titulo,
          rate: 0,
          qty: 1,
          cuentaConcepto: concepto.cuenta,
        }
      })
    })
    if (!tipoBienes606 && concepto.claseFiscal) setTipoBienes606(concepto.claseFiscal)
    if (wasLastRow) setItems((prev) => [...prev, emptyItem()])
  }, [tipoBienes606])

  const clearCatalogItem = useCallback((idx: number) => {
    setItems((prev) => prev.map((row, i) =>
      i === idx
        ? { ...row, itemCode: '', itemLabel: undefined, itemType: undefined, description: '', rate: 0, qty: 1, cuentaConcepto: undefined }
        : row,
    ))
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (esProveedorOcasional) {
      if (!proveedorOcasionalNombre.trim()) { toast.error('Ingresa el nombre del proveedor ocasional'); return }
    } else if (!supplierId) {
      toast.error('Selecciona un proveedor')
      return
    }
    if (ncfProveedor && !NCF_REGEX.test(ncfProveedor)) { toast.error('NCF inválido (formato: B/E seguido de 10 dígitos)'); return }
    // La regla B17 y los campos 606 requeridos se validan al Someter, no al
    // guardar el borrador — un Draft debe poder guardarse siempre.

    // Filas sin itemCode ni título (ej. una fila agregada y luego vaciada) se ignoran — mismo
    // criterio que aplica el backend, para dar feedback inmediato sin esperar el POST.
    const validItems = items.filter((i) => i.itemCode || (i.isAdHoc && i.titulo?.trim()))
    if (validItems.length === 0) {
      toast.error('Agrega al menos un artículo con itemCode o un ítem sin catálogo con título')
      return
    }
    const invalidAdHoc = validItems.find((i) =>
      i.isAdHoc && !i.cuentaAlterna && (i.distribucionCuenta ?? []).filter((d) => d.cuenta).length === 0,
    )
    if (invalidAdHoc) {
      toast.error('Todo ítem sin catálogo requiere una cuenta contable (única o dividida)')
      return
    }

    const dto: CreateGastoDto = {
      ...(esProveedorOcasional
        ? {
            proveedorOcasionalNombre: proveedorOcasionalNombre || undefined,
            proveedorOcasionalRnc: proveedorOcasionalRnc || undefined,
          }
        : { supplier: supplierId }),
      postingDate,
      dueDate: dueDate || undefined,
      items: validItems.map((i) =>
        i.isAdHoc
          ? {
              titulo: i.titulo!.trim(),
              descripcion: i.description || undefined,
              qty: i.qty > 0 ? i.qty : undefined,
              rate: i.rate,
              tipoBienes606: i.tipoBienes606Linea || undefined,
              tipoGastoFiscal: (i.tipoGastoFiscal || undefined) as 'Bienes' | 'Servicios' | undefined,
              impuestos: i.impuestosLinea && i.impuestosLinea.length > 0 ? i.impuestosLinea : undefined,
              retenciones: i.retencionesLinea && i.retencionesLinea.length > 0 ? i.retencionesLinea : undefined,
              ...((i.distribucionCuenta ?? []).filter((d) => d.cuenta).length > 0
                ? { distribucionCuenta: i.distribucionCuenta!.filter((d) => d.cuenta) }
                : { cuentaAlterna: i.cuentaAlterna! }),
            }
          : {
              itemCode: i.itemCode,
              description: i.description,
              qty: i.qty,
              rate: i.rate,
              uom: i.uom || undefined,
              ...((i.distribucionCuenta ?? []).filter((d) => d.cuenta).length > 0
                ? { distribucionCuenta: i.distribucionCuenta!.filter((d) => d.cuenta) }
                : { cuentaAlterna: i.cuentaAlterna || undefined }),
            },
      ),
      cuentaCxpOverride: cuentaCxpOverride || undefined,
      ncfProveedor: ncfProveedor || undefined,
      billNo: billNo || undefined,
      tipoComprobante: tipoComprobante as CreateGastoDto['tipoComprobante'] || undefined,
      tipoBienes606: tipoBienes606 || undefined,
      formaPago606: formaPago606 || undefined,
      tipoPago,
      categoriaGasto: categoriaGasto as CreateGastoDto['categoriaGasto'] || undefined,
      esDeducible,
      retenciones: retenciones.length > 0 ? retenciones : undefined,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      taxesTemplate: taxesTemplate.length > 0 ? taxesTemplate : undefined,
    }
    saveMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Volver
      </button>

      <PageHeader
        title={isEdit ? 'Editar Gasto' : 'Nuevo Gasto'}
        description="Registra un gasto sin movimiento de inventario"
      />

      {isEdit && serverMessage && (
        <div className="inline-alert inline-alert-info">
          <AlertTriangle size={16} />
          <span dangerouslySetInnerHTML={{ __html: serverMessage }} />
        </div>
      )}

      {isEdit && loadingEdit ? (
        <span className="skeleton-box" style={{ height: 256, width: '100%', display: 'block' }} />
      ) : (
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Información General</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label">
                    {esProveedorOcasional ? 'Nombre del Vendedor' : <>Proveedor <span className="ff-required">*</span></>}
                  </label>
                  {esProveedorOcasional ? (
                    <input
                      className="ff-input"
                      value={proveedorOcasionalNombre}
                      onChange={(e) => setProveedorOcasionalNombre(e.target.value)}
                      placeholder="Nombre del proveedor ocasional"
                    />
                  ) : (
                    <SearchSelect
                      id="supplier"
                      value={supplierId}
                      selectedLabel={supplierLabel}
                      onChange={(newId, opt) => { setSupplierId(newId === '' ? '' : (opt?.value ?? newId)); setSupplierLabel(opt?.label ?? '') }}
                      options={supplierOptions}
                      onSearch={setSupplierQuery}
                      loading={suppliersLoading}
                      placeholder="Buscar proveedor…"
                      error={!supplierId}
                    />
                  )}
                </div>
                {esProveedorOcasional && (
                  <div className="ff-wrap">
                    <label className="ff-label" htmlFor="proveedorOcasionalRnc">RNC/Cédula (opcional)</label>
                    <input
                      id="proveedorOcasionalRnc"
                      className="ff-input"
                      value={proveedorOcasionalRnc}
                      onChange={(e) => setProveedorOcasionalRnc(e.target.value)}
                      placeholder="RNC/Cédula del vendedor"
                    />
                    <p className="ff-hint">Se recomienda llenarlo — alimenta el reporte fiscal 606.</p>
                  </div>
                )}
                <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={esProveedorOcasional}
                      onChange={(e) => {
                        setEsProveedorOcasional(e.target.checked)
                        if (e.target.checked) {
                          setSupplierId('')
                          setSupplierLabel('')
                          // Un proveedor ocasional nunca tiene términos de crédito.
                          if (!tipoPagoTouched) setTipoPago('Contado')
                        } else {
                          setProveedorOcasionalNombre('')
                          setProveedorOcasionalRnc('')
                        }
                      }}
                    />
                    Proveedor ocasional (sin registrar)
                  </label>
                  {esProveedorOcasional && (
                    <p className="ff-hint" style={{ marginTop: 4 }}>
                      Gasto a un vendedor sin cuenta registrada. No se requiere RNC/Cédula.
                    </p>
                  )}
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                  <DatePicker value={postingDate} onChange={setPostingDate} error={!postingDate} />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Fecha Vencimiento</label>
                  <DatePicker
                    value={dueDate}
                    onChange={(v) => { setDueDate(v); setDueDateTouched(true) }}
                    clearable
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal <span className="ff-required">*</span></label>
                  <SearchSelect
                    id="branch"
                    value={branch}
                    selectedLabel={branch}
                    error={!branch || branchError}
                    onChange={(val) => { setBranch(val); setBranchError(false) }}
                    options={branchSelectOptions}
                    onSearch={setBranchSearch}
                    placeholder="Sin especificar"
                    disabled={branchOptions.length === 1}
                  />
                  {branchError && <span className="ff-error">Debes seleccionar una sucursal para continuar</span>}
                </div>
                {usaDepartamentos && (
                  <div className="ff-wrap">
                    <label className="ff-label">Departamento</label>
                    <DepartmentSelect id="department" value={department} onChange={setDepartment} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Artículos / Conceptos</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-size-sm" onClick={openAdHocCreate}>
                  <Plus size={14} />Ítem sin catálogo
                </button>
                <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
                  <Plus size={14} />Agregar
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="items-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>Artículo / Concepto</th>
                      <th>Descripción</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Precio</th>
                      <th style={{ width: '18%' }}>Cuenta contable</th>
                      <th style={{ width: '64px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ minWidth: 180 }}>
                          {item.isAdHoc ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="badge badge-info" style={{ flexShrink: 0 }}>Sin catálogo</span>
                              <input
                                className="items-input"
                                placeholder="Título del ítem…"
                                value={item.titulo ?? ''}
                                onChange={(e) => updateItem(idx, 'titulo', e.target.value)}
                              />
                            </div>
                          ) : (
                            <ItemSelect
                              value={item.itemCode}
                              selectedLabel={item.itemLabel}
                              onSelect={(catalogItem) => selectCatalogItem(idx, catalogItem)}
                              onClear={() => clearCatalogItem(idx)}
                              placeholder="Buscar concepto de gasto…"
                              excludeItems
                              includeCuentasPorPagar
                              onSelectCuentaPorPagar={(concepto) => selectCuentaPorPagar(idx, concepto)}
                            />
                          )}
                        </td>
                        <td>
                          <input className="items-input" placeholder="Descripción" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                        </td>
                        <td>
                          {!item.isAdHoc && item.itemType === 'service' ? (
                            <span className="td-muted" style={{ display: 'block', textAlign: 'right' }}>—</span>
                          ) : (
                            <QtyInput className="items-input" style={{ textAlign: 'right' }} value={item.qty} uom={item.uom} onChange={(v) => updateItem(idx, 'qty', v)} />
                          )}
                        </td>
                        <td>
                          <input className="items-input" type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={item.rate} onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td style={{ minWidth: 200 }}>
                          {item.isAdHoc ? (
                            <span className="td-muted" style={{ fontSize: 12 }}>
                              {item.cuentaAlterna || 'Definir en "Editar" →'}
                            </span>
                          ) : item.distribucionCuenta && item.distribucionCuenta.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <DistribucionCuentaEditor
                                rows={item.distribucionCuenta}
                                onChange={(rows) => setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, distribucionCuenta: rows } : r)))}
                                targetAmount={item.qty * item.rate}
                                targetLabel="de la línea"
                              />
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-xs"
                                style={{ alignSelf: 'flex-start' }}
                                onClick={() => setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, distribucionCuenta: undefined } : r)))}
                              >
                                Usar una sola cuenta
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <ItemCuentaContableText accountId={item.cuentaConcepto || cuentasEmpresa?.defaultExpenseAccount} />
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-xs"
                                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                                onClick={() => setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, distribucionCuenta: [{ cuenta: '', monto: r.qty * r.rate }] } : r)))}
                              >
                                Dividir
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            {item.isAdHoc && (
                              <button type="button" className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--icon-muted)' }} onClick={() => openAdHocEdit(idx)}>
                                <Pencil size={14} />
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--icon-muted)' }} onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {b17Error && (
                  <div style={{ padding: '12px 16px' }}>
                    <div className="inline-alert inline-alert-error">
                      <AlertCircle size={16} />
                      Gastos Menores no pueden superar RD$50.00. Total actual: {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(grandTotal)}
                    </div>
                  </div>
                )}

                <div className="items-total-row">
                  <div className="items-total-line">
                    <span>Subtotal</span>
                    <span>{currency(subtotal)}</span>
                  </div>
                  {impuestoAmount > 0 && (
                    <div className="items-total-line" style={{ color: 'var(--text-secondary)' }}>
                      <span>Impuesto ({impuestoRate.toFixed(2)}%)</span>
                      <span>+ {currency(impuestoAmount)}</span>
                    </div>
                  )}
                  {retencionAmount > 0 && (
                    <div className="items-total-line" style={{ color: 'var(--text-secondary)' }}>
                      <span>Retenciones ({retencionRate.toFixed(2)}%)</span>
                      <span>- {currency(retencionAmount)}</span>
                    </div>
                  )}
                  <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                    <span>Total</span>
                    <strong>{currency(grandTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DGII + Gasto info */}
          <div className="dgii-section">
            <div className="dgii-section-title">
              <Info size={14} />
              Información DGII y Clasificación
            </div>

            {/* ── Comprobante fiscal ── */}
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">
                  {esProveedorOcasional ? 'NCF Proveedor (opcional)' : <>NCF Proveedor <span className="ff-required">*</span></>}
                </label>
                <input
                  className={`ff-input${!ncfValid ? ' ff-input-error' : ''}`}
                  placeholder="B13XXXXXXXXXX"
                  value={ncfProveedor}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase()
                    setNcfProveedor(val)
                    if (val.length >= 3) {
                      setTipoComprobante(val.slice(0, 3))
                    } else {
                      setTipoComprobante('')
                    }
                  }}
                />
                {!ncfValid && <span className="ff-error">Formato inválido.</span>}
                {esProveedorOcasional && !ncfProveedor && (
                  <p className="ff-hint">Déjelo en blanco para que el sistema genere el comprobante automáticamente al someter.</p>
                )}
              </div>

              <div className="ff-wrap">
                <label className="ff-label">N° Factura del Proveedor</label>
                <input
                  className="ff-input"
                  placeholder="N° de factura del vendedor"
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                />
              </div>

              {esProveedorOcasional && !ncfProveedor && (
                <div className="ff-wrap">
                  <label className="ff-label">Tipo Comprobante</label>
                  <SearchSelect
                    value={tipoComprobante}
                    onChange={setTipoComprobante}
                    options={tipoComprobanteOptions}
                    onSearch={setTipoComprobanteSearch}
                    selectedLabel={catalogos?.ncfTypesCompra?.find((t) => t.value === tipoComprobante)?.label ?? ''}
                    placeholder="Seleccionar"
                    error={isB17 && b17Error}
                  />
                  <p className="ff-hint">Tipo de comprobante a generar automáticamente al someter.</p>
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label">Cuenta CxP (override)</label>
                <AccountSelect
                  value={cuentaCxpOverride}
                  onChange={setCuentaCxpOverride}
                  placeholder="Usar la cuenta CxP default del proveedor"
                  rootType="Liability"
                />
                <p className="ff-hint">
                  Solo si este gasto puntual debe ir a una cuenta CxP distinta a la default del
                  proveedor. Una devolución de compra solo puede aplicarse/reconciliarse contra
                  facturas que compartan la misma cuenta CxP.
                </p>
              </div>
            </div>

            {/* ── Clasificación 606 ── */}
            <div className="form-row form-row-3" style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 16, paddingTop: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Bienes 606</label>
                <SearchSelect
                  value={tipoBienes606}
                  onChange={setTipoBienes606}
                  options={tipoBienes606Options}
                  onSearch={setTipoBienes606Search}
                  selectedLabel={catalogos?.tipoBienes606?.find((t) => t.value === tipoBienes606)?.label ?? tipoBienes606}
                  placeholder="Seleccionar tipo"
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Forma de Pago 606</label>
                <SearchSelect
                  value={formaPago606}
                  onChange={setFormaPago606}
                  options={formaPago606Options}
                  onSearch={setFormaPago606Search}
                  selectedLabel={catalogos?.formaPago606?.find((f) => f.value === formaPago606)?.label ?? formaPago606}
                  placeholder="Seleccionar forma"
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Categoría de Gasto</label>
                <Select value={categoriaGasto} onValueChange={setCategoriaGasto} placeholder="Seleccionar categoría">
                  {CATEGORIA_GASTO.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </Select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Tipo de Pago</label>
                <Select
                  value={tipoPago}
                  onValueChange={(val) => { setTipoPago(val as 'Contado' | 'Crédito'); setTipoPagoTouched(true) }}
                >
                  <SelectItem value="Contado">Contado</SelectItem>
                  <SelectItem value="Crédito">Crédito</SelectItem>
                </Select>
              </div>
            </div>

            {/* ── Impuestos y retenciones ── */}
            {showDuplicateTaxWarning && (
              <div className="inline-alert inline-alert-error" style={{ marginTop: 16 }}>
                <AlertCircle size={16} />
                Tienes un ítem sin catálogo con impuestos/retenciones propios Y además impuestos/retenciones a nivel de documento —
                si son de la misma categoría, se aplican ambos por separado y el monto puede quedar duplicado. Evita repetirlos.
              </div>
            )}
            <div className="form-row form-row-3" style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 16, paddingTop: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="taxesTemplate">Impuesto del Documento</label>
                <MultiSearchSelect
                  id="taxesTemplate"
                  value={taxesTemplate}
                  onChange={setTaxesTemplate}
                  options={impuestosOptions}
                  placeholder="Buscar plantilla…"
                  emptyLabel="No hay plantillas configuradas."
                />
                <p className="ff-hint">Si no eliges ninguno, se usa el template por defecto del proveedor o de la compañía.</p>
                {pendingImpuestosHint && <p className="ff-hint">{pendingImpuestosHint}</p>}
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="retenciones">Retenciones</label>
                <MultiSearchSelect
                  id="retenciones"
                  value={retenciones}
                  onChange={setRetenciones}
                  options={retencionesOptions}
                  placeholder="Buscar retención…"
                  emptyLabel="No hay retenciones configuradas."
                />
                <p className="ff-hint">
                  El BFF calcula el monto de cada una a partir de la tasa configurada; si dejas la lista
                  vacía se usan las retenciones por defecto del proveedor.
                </p>
                {pendingRetencionesHint && <p className="ff-hint">{pendingRetencionesHint}</p>}
              </div>

              <div className="ff-wrap" style={{ justifyContent: 'flex-end' }}>
                <label className="ff-check-wrap">
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={esDeducible}
                    onChange={(e) => setEsDeducible(e.target.checked)}
                  />
                  <span className="ff-label">Es deducible fiscalmente</span>
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Guardar Borrador'}
            </button>
          </div>
        </div>
      </form>
      )}

      <Modal
        open={!!adHocModal}
        onClose={closeAdHocModal}
        title="Datos Fiscales del Ítem sin Catálogo"
        subtitle="Cuenta contable, clasificación e impuestos/retenciones de esta línea — independientes del documento. Título, descripción, cantidad y precio se editan directamente en la tabla."
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeAdHocModal}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={saveAdHocModal}>Guardar</button>
          </>
        }
      >
        {adHocModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">Cuenta Contable <span className="ff-required">*</span></label>
                <AccountSelect
                  value={adHocModal.draft.cuentaAlterna ?? ''}
                  onChange={(val) => updateAdHocDraft('cuentaAlterna', val)}
                  ledgerOnly
                  error={!adHocModal.draft.cuentaAlterna}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Bienes 606 (línea)</label>
                <SearchSelect
                  value={adHocModal.draft.tipoBienes606Linea ?? ''}
                  onChange={(val) => updateAdHocDraft('tipoBienes606Linea', val)}
                  options={tipoBienes606Options}
                  onSearch={setTipoBienes606Search}
                  selectedLabel={catalogos?.tipoBienes606?.find((t) => t.value === adHocModal.draft.tipoBienes606Linea)?.label ?? adHocModal.draft.tipoBienes606Linea}
                  placeholder="Seleccionar tipo"
                />
                <p className="ff-hint">Informativo — el reporte 606 solo usa la clasificación de cabecera del documento.</p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Gasto Fiscal</label>
                <Select
                  value={adHocModal.draft.tipoGastoFiscal ?? ''}
                  onValueChange={(val) => updateAdHocDraft('tipoGastoFiscal', val as 'Bienes' | 'Servicios' | '')}
                  placeholder="Seleccionar"
                >
                  <SelectItem value="Bienes">Bienes</SelectItem>
                  <SelectItem value="Servicios">Servicios</SelectItem>
                </Select>
              </div>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label">Impuestos de esta línea</label>
                <MultiSearchSelect
                  value={adHocModal.draft.impuestosLinea ?? []}
                  onChange={(val) => updateAdHocDraft('impuestosLinea', val)}
                  options={impuestosOptions}
                  placeholder="Buscar plantilla…"
                  emptyLabel="No hay plantillas configuradas."
                />
                <p className="ff-hint">Independiente del impuesto del documento — si lo dejas vacío, esta línea no lleva impuesto.</p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Retenciones de esta línea</label>
                <MultiSearchSelect
                  value={adHocModal.draft.retencionesLinea ?? []}
                  onChange={(val) => updateAdHocDraft('retencionesLinea', val)}
                  options={retencionesOptions}
                  placeholder="Buscar retención…"
                  emptyLabel="No hay retenciones configuradas."
                />
                <p className="ff-hint">Independiente de las retenciones del documento — si la dejas vacía, esta línea no lleva retención.</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
