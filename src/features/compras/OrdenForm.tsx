import { useState, useCallback, useEffect, useMemo, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { createOrdenCompra, updateOrdenCompra, getOrdenCompra } from '@/shared/api/ordenes-compra'
import { listSuppliers } from '@/shared/api/suppliers'
import { listWarehouses } from '@/shared/api/inventory'
import { listAlmacenes, getFacturacionConfig, listImpuestosCompras } from '@/shared/api/config'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import type { CreateOrdenCompraDto, Item, DimensionesLinea, ItemDimensionDeclarada } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { getItem } from '@/shared/api/catalog'
import { Plus, Trash2, Save, Loader2, Info } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { useAuthStore } from '@/stores/auth.store'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'

const SYSTEM_MANAGER_ROLE = 'System Manager'

interface ItemRow {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  discountPct: number
  warehouse: string
  uom: string
  lineError?: string
  /** Combinación de dimensión de inventario elegida para esta línea (docs/tasks/
   *  PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §5). */
  dimensiones?: DimensionesLinea
  /** Dimensiones que el artículo de esta línea declara — ver misma nota en CompraForm.tsx. */
  itemDimensionesDeclaradas?: ItemDimensionDeclarada[]
}

function emptyItem(defaultWh?: string): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, discountPct: 0, warehouse: defaultWh ?? '', uom: 'Nos' }
}

/** `true` si dos combinaciones de dimensión son exactamente iguales — ver misma función en
 *  CompraForm.tsx (§5.1). */
function dimensionesIguales(a?: DimensionesLinea, b?: DimensionesLinea): boolean {
  const ea = Object.entries(a ?? {})
  const eb = Object.entries(b ?? {})
  if (ea.length !== eb.length) return false
  return ea.every(([k, v]) => (b ?? {})[k] === v)
}

/** Fusiona líneas del mismo artículo con la misma combinación de dimensión exacta en una sola,
 *  sumando la cantidad (§5.1) — justo antes de someter, sin tocar el estado de la UI. */
function mergeIdenticalDimensionLines(rows: ItemRow[]): ItemRow[] {
  const result: ItemRow[] = []
  for (const row of rows) {
    const tieneCombinacion = row.dimensiones && Object.keys(row.dimensiones).length > 0
    if (tieneCombinacion) {
      const existente = result.find((r) =>
        r.itemCode === row.itemCode
        && r.warehouse === row.warehouse
        && r.uom === row.uom
        && r.rate === row.rate
        && r.discountPct === row.discountPct
        && dimensionesIguales(r.dimensiones, row.dimensiones),
      )
      if (existente) {
        existente.qty += row.qty
        continue
      }
    }
    result.push({ ...row })
  }
  return result
}

export default function OrdenForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()
  const isEdit = !!id
  const authUser = useAuthStore((s) => s.user)
  const defaultWh = authUser?.defaultWarehouse ?? ''

  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [scheduleDate, setScheduleDate] = useState('')
  const [currency, setCurrency] = useState('DOP')
  const [conversionRate, setConversionRate] = useState(1)
  const [taxesTemplate, setTaxesTemplate] = useState('')
  const [taxesTemplateSearch, setTaxesTemplateSearch] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem(defaultWh)])
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

  const { data: taxesTemplates } = useQuery({
    queryKey: ['impuestos-compras'],
    queryFn: listImpuestosCompras,
    staleTime: 5 * 60_000,
  })
  const taxesTemplateOptions: SearchSelectOption[] = (taxesTemplates ?? [])
    .filter((t) => !taxesTemplateSearch || t.title.toLowerCase().includes(taxesTemplateSearch.toLowerCase()))
    .map((t) => ({ value: String(t.id), label: t.title }))

  const { data: warehousesAll } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
    enabled: !branch,
  })
  const { data: warehousesForBranch } = useQuery({
    queryKey: ['almacenes', { branch }],
    queryFn: () => listAlmacenes({ branch }),
    enabled: !!branch,
  })
  const warehouses = branch ? warehousesForBranch : warehousesAll

  const warehouseSelectOptions: SearchSelectOption[] = useMemo(() => {
    const q = warehouseSearch.toLowerCase()
    return (warehouses ?? [])
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => ({ value: w.id, label: w.name }))
  }, [warehouses, warehouseSearch])

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const { data: currentUserDetail } = useQuery({
    queryKey: ['currentUser', authUser?.email],
    queryFn: () => getUsuario(authUser!.email),
    enabled: !!authUser?.email,
    staleTime: 5 * 60_000,
  })
  const isSystemManager = currentUserDetail?.roles?.includes(SYSTEM_MANAGER_ROLE) ?? false
  const { data: myBranches, refetch: refetchMyBranches } = useQuery({
    queryKey: ['usuarioSucursales', authUser?.email],
    queryFn: () => getUsuarioSucursales(authUser!.email),
    enabled: !!authUser?.email,
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
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  const { data: ordenData, isLoading: loadingEdit } = useQuery({
    queryKey: ['orden-compra', id],
    queryFn: () => getOrdenCompra(id!),
    enabled: isEdit,
  })

  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['orden-compra', id] })
  }, [isEdit, id], true)

  useEffect(() => {
    if (!ordenData) return
    setSupplierId(ordenData.supplier)
    setSupplierName(ordenData.supplierName ?? '')
    setTransactionDate(ordenData.transactionDate.split('T')[0])
    setScheduleDate(ordenData.scheduleDate?.split('T')[0] ?? '')
    setCurrency(ordenData.currency ?? 'DOP')
    setConversionRate(ordenData.conversionRate ?? 1)
    setItems(
      ordenData.items.map((oi) => ({
        itemCode: oi.itemCode,
        itemLabel: oi.itemName,
        description: oi.itemName ?? '',
        qty: oi.qty,
        rate: oi.rate,
        discountPct: 0,
        warehouse: oi.warehouse ?? '',
        uom: oi.uom || 'Nos',
      })),
    )
    setBranch(ordenData.branch ?? '')
    setDepartment(ordenData.department ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenData])

  // GET /compras/ordenes/:id tampoco ecoa la combinación elegida por línea (§10.2) — al editar
  // solo podemos saber si el artículo de cada línea USA dimensiones (re-consultando el catálogo)
  // para mostrarle el selector y obligarlo a reingresarla antes de guardar.
  useEffect(() => {
    if (!ordenData) return
    let cancelled = false
    Promise.all(ordenData.items.map((oi) => getItem(oi.itemCode).catch(() => null))).then((catalogItems) => {
      if (cancelled) return
      setItems((prev) => prev.map((row, idx) => {
        const catalogItem = catalogItems[idx]
        return catalogItem?.usaDimensiones
          ? { ...row, itemDimensionesDeclaradas: catalogItem.dimensiones }
          : row
      }))
    })
    return () => { cancelled = true }
  }, [ordenData])

  const isDirty = useDirtyCheck({
    supplierId,
    transactionDate,
    scheduleDate,
    currency,
    conversionRate,
    taxesTemplate,
    items,
    branch,
    department,
  }, !isEdit || !loadingEdit)
  useBeforeUnloadWarning(isDirty)

  const saveMutation = useMutation({
    mutationFn: (dto: CreateOrdenCompraDto) =>
      isEdit ? updateOrdenCompra(id!, dto) : createOrdenCompra(dto),
    onSuccess: (data) => {
      toast.success(isEdit ? 'Orden actualizada' : 'Orden creada')
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] })
      if (isEdit) queryClient.removeQueries({ queryKey: ['orden-compra', id] })
      navigate(`/compras/ordenes/${data.id}`)
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (error) => {
      const apiErr = error as { code?: string; message?: string; statusCode?: number }
      if (isApiErrorCode(error, ERROR_CODES.BRANCH_REQUIRED)) {
        setBranchError(true)
        toast.error(apiErr?.message || 'Selecciona una sucursal')
        return
      }
      if (apiErr?.message?.toLowerCase().includes('no tienes acceso a la sucursal')) {
        refetchMyBranches()
        toast.error(`${apiErr.message} Tus sucursales asignadas se actualizaron, vuelve a intentar.`)
        return
      }
      if (apiErr?.statusCode === 400 && apiErr?.message) {
        const msg = apiErr.message
        let matched = false
        setItems((prev) => prev.map((row) => {
          if (row.itemCode && msg.includes(row.itemCode)) {
            matched = true
            return { ...row, lineError: msg }
          }
          return row
        }))
        if (!matched) toast.error(msg)
      } else {
        toast.error('Error al guardar la orden de compra')
      }
    },
  })

  const grandTotal = items.reduce((sum, i) => sum + i.qty * i.rate * (1 - (i.discountPct || 0) / 100), 0)

  // Ver misma nota en CompraForm.tsx (§10.2, opción (b)).
  const lineasRequierenReingresoDimension = isEdit && items.some(
    (i) => (i.itemDimensionesDeclaradas?.length ?? 0) > 0 && !combinacionCompleta(i.itemDimensionesDeclaradas ?? [], i.dimensiones ?? {}),
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (!transactionDate) { toast.error('Ingresa la fecha'); return }

    setItems((prev) => prev.map((i) => ({ ...i, lineError: undefined })))

    let hasError = false
    for (const item of items) {
      const idx = items.indexOf(item)
      if (!item.itemCode || item.qty <= 0 || item.rate <= 0) {
        hasError = true
        setItems((prev) => prev.map((r, i) => i === idx ? { ...r, lineError: 'Artículo, cantidad y precio son obligatorios (mayores a cero)' } : r))
      }
    }
    if (hasError) return

    const dto: CreateOrdenCompraDto = {
      supplier: supplierId,
      transactionDate,
      scheduleDate: scheduleDate || undefined,
      currency: currency || undefined,
      conversionRate: currency !== 'DOP' ? conversionRate : undefined,
      taxesTemplate: taxesTemplate || undefined,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      items: mergeIdenticalDimensionLines(items).filter((i) => i.itemCode).map((i) => ({
        itemCode: i.itemCode,
        description: i.description || undefined,
        qty: i.qty,
        rate: i.rate,
        discountPct: i.discountPct || undefined,
        uom: i.uom || undefined,
        warehouse: i.warehouse || undefined,
        // Siempre se reenvía en cada guardado — este endpoint tampoco conserva la combinación de
        // una línea no tocada en el PUT (§6.3/§10.1). Viaja homónima a la recepción/factura
        // generada desde esta línea salvo que el usuario la corrija explícitamente al recibir.
        ...(i.dimensiones && Object.keys(i.dimensiones).length > 0 ? { dimensiones: i.dimensiones } : {}),
      })),
    }
    saveMutation.mutate(dto)
  }

  const updateItem = useCallback((idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item) => {
    setItems((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      return {
        ...row,
        itemCode: catalogItem.id,
        itemLabel: catalogItem.itemName,
        description: catalogItem.internalDescription ?? catalogItem.itemName,
        rate: catalogItem.valuationRate ?? catalogItem.standardRate ?? 0,
        uom: catalogItem.stockUom ?? row.uom,
        // Un artículo nuevo en la fila implica una combinación nueva.
        itemDimensionesDeclaradas: catalogItem.usaDimensiones ? catalogItem.dimensiones : undefined,
        dimensiones: undefined,
      }
    }))
  }, [])

  const clearCatalogItem = useCallback((idx: number) => {
    updateItem(idx, { itemCode: '', itemLabel: undefined, description: '', rate: 0, itemDimensionesDeclaradas: undefined, dimensiones: undefined })
  }, [updateItem])

  if (isEdit && loadingEdit) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block', marginBottom: 16 }} />
        <span className="skeleton-box" style={{ height: 256, width: '100%', display: 'block' }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Volver
      </button>

      <PageHeader
        title={isEdit ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}
        description="El pedido formal a un proveedor específico, con precios"
        action={<RecargarButton label="Actualizar" />}
      />

      {lineasRequierenReingresoDimension && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 0 }}>
          <Info size={16} />
          <span>Esta orden tiene línea(s) con un artículo que usa combinación de dimensión de inventario, pero el sistema no puede recuperar la combinación con la que se guardaron originalmente. Vuelve a seleccionarla en la columna «Combinación» antes de guardar, o esa línea será rechazada.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Información General</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label">Proveedor <span className="ff-required">*</span></label>
                  <SearchSelect
                    id="supplier"
                    value={supplierId}
                    selectedLabel={supplierName}
                    onChange={(sid, opt) => {
                      const resolvedId = sid === '' ? '' : (opt?.value ?? sid)
                      setSupplierId(resolvedId)
                      setSupplierName(opt?.label ?? '')
                    }}
                    options={supplierOptions}
                    onSearch={setSupplierQuery}
                    loading={suppliersLoading}
                    placeholder="Buscar proveedor…"
                    error={!supplierId}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                  <DatePicker className="ff-input" value={transactionDate} onChange={setTransactionDate} />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Fecha de Entrega Esperada</label>
                  <DatePicker className="ff-input" value={scheduleDate} onChange={setScheduleDate} clearable min={transactionDate} />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Moneda</label>
                  <input className="ff-input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="DOP" />
                </div>

                {currency !== 'DOP' && (
                  <div className="ff-wrap">
                    <label className="ff-label">Tasa de Cambio <span className="ff-required">*</span></label>
                    <input
                      className="ff-input"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={conversionRate}
                      onChange={(e) => setConversionRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                )}

                <div className="ff-wrap">
                  <label className="ff-label">Impuesto del Documento</label>
                  <SearchSelect
                    value={taxesTemplate}
                    onChange={setTaxesTemplate}
                    options={taxesTemplateOptions}
                    onSearch={setTaxesTemplateSearch}
                    selectedLabel={taxesTemplates?.find((t) => String(t.id) === taxesTemplate)?.title ?? ''}
                    placeholder="Usar default del proveedor/compañía"
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <SearchSelect
                    value={branch}
                    onChange={(val) => { setBranch(val); setBranchError(false) }}
                    options={branchSelectOptions}
                    onSearch={setBranchSearch}
                    selectedLabel={branch}
                    placeholder="Sin especificar"
                    error={branchError}
                  />
                </div>

                {usaDepartamentos && (
                  <div className="ff-wrap">
                    <label className="ff-label">Departamento</label>
                    <DepartmentSelect value={department} onChange={setDepartment} placeholder="Buscar departamento…" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Artículos</span>
              <button
                type="button"
                className="btn btn-secondary btn-size-sm"
                onClick={() => setItems((prev) => [...prev, emptyItem(defaultWh)])}
              >
                <Plus size={14} />
                Agregar
              </button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="items-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>Artículo</th>
                      <th>Descripción</th>
                      <th style={{ width: '9%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Precio</th>
                      <th style={{ width: '8%', textAlign: 'right' }}>Desc. %</th>
                      <th style={{ width: '14%' }}>Almacén</th>
                      <th style={{ width: '8%' }}>UOM</th>
                      <th style={{ width: '12%' }}>Combinación</th>
                      <th style={{ width: '40px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <Fragment key={idx}>
                        <tr>
                          <td>
                            <ItemSelect
                              value={item.itemCode}
                              selectedLabel={item.itemLabel}
                              onSelect={(catalogItem) => selectCatalogItem(idx, catalogItem)}
                              onClear={() => clearCatalogItem(idx)}
                              typeFilter="product"
                            />
                          </td>
                          <td>
                            <input
                              className="items-input"
                              value={item.description}
                              onChange={(e) => updateItem(idx, { description: e.target.value })}
                              placeholder="Descripción"
                            />
                          </td>
                          <td>
                            <QtyInput
                              className="items-input"
                              style={{ textAlign: 'right' }}
                              value={item.qty}
                              uom={item.uom}
                              onChange={(v) => updateItem(idx, { qty: v })}
                            />
                          </td>
                          <td>
                            <input
                              className="items-input"
                              type="number"
                              min="0"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={item.rate || ''}
                              onChange={(e) => updateItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                          <td>
                            <input
                              className="items-input"
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={item.discountPct || ''}
                              onChange={(e) => updateItem(idx, { discountPct: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                          <td>
                            <SearchSelect
                              value={item.warehouse}
                              onChange={(val) => updateItem(idx, { warehouse: val })}
                              options={warehouseSelectOptions}
                              onSearch={setWarehouseSearch}
                              selectedLabel={warehouses?.find((w) => w.id === item.warehouse)?.name ?? ''}
                              placeholder="Almacén"
                              className="items-input"
                            />
                          </td>
                          <td>
                            <UomSelect
                              value={item.uom}
                              itemCode={item.itemCode || undefined}
                              onChange={(v) => updateItem(idx, { uom: v })}
                              className="items-input"
                            />
                          </td>
                          <td>
                            {item.itemDimensionesDeclaradas && item.itemDimensionesDeclaradas.length > 0 && (
                              <CombinacionDimensionSelector
                                itemDimensiones={item.itemDimensionesDeclaradas}
                                value={item.dimensiones ?? {}}
                                onChange={(v) => updateItem(idx, { dimensiones: v })}
                                compact
                              />
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-size-icon-sm"
                              disabled={items.length === 1}
                              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {item.lineError && (
                          <tr>
                            <td colSpan={9} style={{ color: 'var(--error-text)', fontSize: 12, paddingTop: 0 }}>
                              {item.lineError}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                <div className="items-total-row">
                  <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                    <span>Total</span>
                    <strong>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: currency || 'DOP' }).format(grandTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" className="btn btn-navy" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                : <Save size={15} />}
              Guardar Borrador
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
