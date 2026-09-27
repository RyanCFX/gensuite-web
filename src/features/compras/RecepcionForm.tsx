import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { createPurchaseReceipt, updatePurchaseReceipt, getPurchaseReceipt } from '@/shared/api/purchase-receipt'
import { listSuppliers } from '@/shared/api/suppliers'
import { listWarehouses } from '@/shared/api/inventory'
import { listAlmacenes, getFacturacionConfig } from '@/shared/api/config'
import { getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import type { CreatePurchaseReceiptDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Plus, Trash2, Save, Loader2, Info } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import type { Item, DimensionesLinea, ItemDimensionDeclarada } from '@/shared/api/types'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems, getItem } from '@/shared/api/catalog'
import { SeleccionarOrdenCompraModal } from '@/components/shared/SeleccionarOrdenCompraModal'
import type { OrdenCompraImportLine } from '@/components/shared/SeleccionarOrdenCompraModal'
import { useAuthStore } from '@/stores/auth.store'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'

interface ItemRow {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  /** Precio base al stockUom — se usa para recalcular al cambiar UOM */
  baseRate: number
  warehouse: string
  uom: string
  trackingType: 'none' | 'serial' | 'batch'
  serials: string[]
  batches: { batchId: string; expiryDate?: string; qty: number }[]
  lineError?: string
  /** Enlace manual (caso excepcional) a una línea de Orden de Compra — ver SeleccionarOrdenCompraModal. */
  ordenCompra?: string
  ordenCompraItem?: string
  /** Combinación de dimensión de inventario elegida para esta línea (docs/tasks/
   *  PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §5). */
  dimensiones?: DimensionesLinea
  /** Dimensiones que el artículo de esta línea declara — ver misma nota en CompraForm.tsx. */
  itemDimensionesDeclaradas?: ItemDimensionDeclarada[]
}

function emptyItem(defaultWh?: string): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, warehouse: defaultWh ?? '', uom: 'Nos', trackingType: 'none', serials: [], batches: [] }
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
    const fusionable = tieneCombinacion
      && row.trackingType === 'none'
      && !row.ordenCompra
    if (fusionable) {
      const existente = result.find((r) =>
        r.itemCode === row.itemCode
        && r.warehouse === row.warehouse
        && r.uom === row.uom
        && r.rate === row.rate
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

function onVariantConfirm(
  selections: VariantSelection[],
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>,
) {
  setItems((prev) => [
    ...prev,
    ...selections.map((s) => ({
      itemCode: s.item.id,
      itemLabel: s.item.itemName,
      description: s.item.internalDescription ?? s.item.itemName,
      qty: s.qty,
      rate: s.item.valuationRate ?? s.item.standardRate ?? 0,
      baseRate: s.item.valuationRate ?? s.item.standardRate ?? 0,
      warehouse: '',
      uom: s.item.stockUom ?? 'Nos',
      trackingType: s.item.trackingType ?? 'none',
      serials: [],
      batches: [],
    })),
  ])
}

// ─── Serial / Batch Row Helpers ──────────────────────────────────────────

function addSerial(idx: number, val: string, setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>) {
  const trimmed = val.trim()
  if (!trimmed) return
  setItems((prev) => prev.map((row, i) =>
    i === idx && !row.serials.includes(trimmed)
      ? { ...row, serials: [...row.serials, trimmed] }
      : row,
  ))
}

function removeSerial(idx: number, serial: string, setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>) {
  setItems((prev) => prev.map((row, i) =>
    i === idx ? { ...row, serials: row.serials.filter((s) => s !== serial) } : row,
  ))
}

function addBatch(idx: number, setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>) {
  setItems((prev) => prev.map((row, i) =>
    i === idx ? { ...row, batches: [...row.batches, { batchId: '', expiryDate: '', qty: 0 }] } : row,
  ))
}

function updateBatch(idx: number, batchIdx: number, field: string, value: string | number, setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>) {
  setItems((prev) => prev.map((row, i) =>
    i === idx ? {
      ...row,
      batches: row.batches.map((b, bi) => bi === batchIdx ? { ...b, [field]: value } : b),
    } : row,
  ))
}

function removeBatch(idx: number, batchIdx: number, setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>) {
  setItems((prev) => prev.map((row, i) =>
    i === idx ? { ...row, batches: row.batches.filter((_, bi) => bi !== batchIdx) } : row,
  ))
}

// ─── SerialBatchRow Sub-component ────────────────────────────────────────

function SerialBatchRow({
  item, idx, items, setItems, warehouses, warehouseOptions, onWarehouseSearch, updateItem, updateDimensiones, selectCatalogItem, clearCatalogItem, setVariantTemplate,
}: {
  item: ItemRow
  idx: number
  items: ItemRow[]
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>
  warehouses?: { id: string; name: string }[]
  warehouseOptions: SearchSelectOption[]
  onWarehouseSearch: (q: string) => void
  updateItem: (idx: number, field: keyof ItemRow, value: string | number) => void
  updateDimensiones: (idx: number, value: DimensionesLinea) => void
  selectCatalogItem: (idx: number, catalogItem: Item) => void
  clearCatalogItem: (idx: number) => void
  setVariantTemplate: (t: Item | null) => void
}) {
  const serialInputRef = useRef<HTMLInputElement>(null)
  const [serialInput, setSerialInput] = useState('')
  const serialBuf = useRef({ time: 0, val: '' })
  const serialReady = item.trackingType === 'serial' && item.serials.length < Math.round(item.qty)

  function handleSerialKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const now = Date.now()
    if (e.key === 'Enter') {
      e.preventDefault()
      const val = serialBuf.current.val || serialInput
      if (val.length >= 1) {
        addSerial(idx, val, setItems)
        setSerialInput('')
        serialBuf.current = { time: 0, val: '' }
      }
      return
    }
    // barcode-style fast input detection
    if (now - serialBuf.current.time < 80) {
      serialBuf.current.val += e.key
    } else {
      serialBuf.current.val = e.key
    }
    serialBuf.current.time = now
  }

  function handleSerialPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    if (pasted.includes('\n') || pasted.includes(',')) {
      e.preventDefault()
      const parts = pasted.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      setItems((prev) => prev.map((row, i) =>
        i === idx
          ? { ...row, serials: [...new Set([...row.serials, ...parts])] }
          : row,
      ))
      setSerialInput('')
    }
  }

  const batchSum = item.batches.reduce((s, b) => s + Number(b.qty || 0), 0)

  return (
    <>
      <tr>
        <td style={{ minWidth: 180 }}>
          <ItemSelect
            value={item.itemCode}
            selectedLabel={item.itemLabel}
            onSelect={(catalogItem) => selectCatalogItem(idx, catalogItem)}
            onClear={() => clearCatalogItem(idx)}
            onVariantSelect={(t) => setVariantTemplate(t)}
            typeFilter="product"
          />
        </td>
        <td>
          <input
            className="items-input"
            placeholder="Descripción"
            value={item.description}
            onChange={(e) => updateItem(idx, 'description', e.target.value)}
          />
        </td>
        <td>
          <QtyInput
            className="items-input"
            style={{ textAlign: 'right' }}
            value={item.qty}
            uom={item.uom}
            onChange={(v) => updateItem(idx, 'qty', v)}
          />
        </td>
        <td>
          <input
            className="items-input"
            type="number"
            min="0"
            step="0.01"
            style={{ textAlign: 'right' }}
            value={item.rate}
            onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
          />
        </td>
        <td>
          <SearchSelect
            value={item.warehouse}
            onChange={(val) => updateItem(idx, 'warehouse', val)}
            options={warehouseOptions}
            onSearch={onWarehouseSearch}
            selectedLabel={warehouses?.find((w) => w.id === item.warehouse)?.name ?? ''}
            placeholder="Almacén"
          />
        </td>
        <td>
          <UomSelect
            value={item.uom}
            onChange={(v, factor) => {
              const newRate = Math.round(item.baseRate * factor * 10000) / 10000
              setItems(prev => prev.map((row, i) =>
                i === idx ? { ...row, uom: v, rate: newRate } : row,
              ))
            }}
            itemCode={item.itemCode || undefined}
          />
        </td>
        <td>
          {item.itemDimensionesDeclaradas && item.itemDimensionesDeclaradas.length > 0 && (
            <CombinacionDimensionSelector
              itemDimensiones={item.itemDimensionesDeclaradas}
              value={item.dimensiones ?? {}}
              onChange={(v) => updateDimensiones(idx, v)}
              compact
            />
          )}
        </td>
        <td style={{ textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost btn-size-icon-sm"
            style={{ color: 'var(--icon-muted)' }}
            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
            disabled={items.length === 1}
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>

      {/* Tracking row */}
      {(item.trackingType === 'serial' || item.trackingType === 'batch') && (
        <tr className="tracking-row">
          <td colSpan={8} style={{ padding: '4px 8px 8px' }}>
            {item.lineError && (
              <div style={{ color: 'red', fontSize: 12, marginBottom: 4 }}>{item.lineError}</div>
            )}

            {item.trackingType === 'serial' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Seriales: {item.serials.length}/{Math.round(item.qty)}
                  </span>
                  {serialReady && (
                    <>
                      <input
                        ref={serialInputRef}
                        className="ff-input"
                        style={{ width: 180, fontSize: 12, padding: '3px 6px' }}
                        placeholder="Escanear o escribir serial…"
                        value={serialInput}
                        onChange={(e) => setSerialInput(e.target.value)}
                        onKeyDown={handleSerialKeyDown}
                        onPaste={handleSerialPaste}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-size-xs"
                        onClick={() => {
                          if (serialInput.trim()) {
                            addSerial(idx, serialInput, setItems)
                            setSerialInput('')
                            serialBuf.current = { time: 0, val: '' }
                            serialInputRef.current?.focus()
                          }
                        }}
                      >
                        Agregar
                      </button>
                    </>
                  )}
                  {!serialReady && item.serials.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Completado</span>
                  )}
                </div>
                {item.serials.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {item.serials.map((s, si) => (
                      <span
                        key={si}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                          fontSize: 11, padding: '1px 6px', borderRadius: 4,
                          background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                        }}
                      >
                        {s}
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-icon-xs"
                          style={{ color: 'var(--icon-muted)', padding: 0, lineHeight: 1 }}
                          onClick={() => removeSerial(idx, s, setItems)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {item.trackingType === 'batch' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Lotes: {batchSum}/{Math.round(item.qty)}
                  </span>
                  {batchSum !== Math.round(item.qty) && (
                    <span style={{ fontSize: 11, color: 'var(--danger)' }}>
                      (debe sumar {Math.round(item.qty)})
                    </span>
                  )}
                  {batchSum === Math.round(item.qty) && item.batches.length > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Completado</span>
                  )}
                </div>
                {item.batches.length > 0 && (
                  <table className="items-table" style={{ fontSize: 11, margin: 0, width: 'auto' }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 120 }}>Lote</th>
                        <th style={{ width: 100 }}>Vencimiento (MM/AAAA)</th>
                        <th style={{ width: 70 }}>Cantidad</th>
                        <th style={{ width: 30 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {item.batches.map((b, bi) => (
                        <tr key={bi}>
                          <td>
                            <input
                              className="items-input"
                              style={{ fontSize: 11, padding: '2px 4px' }}
                              placeholder="N° lote"
                              value={b.batchId}
                              onChange={(e) => updateBatch(idx, bi, 'batchId', e.target.value, setItems)}
                            />
                          </td>
                          <td>
                            <input
                              className="items-input"
                              style={{ fontSize: 11, padding: '2px 4px' }}
                              placeholder="MM/AAAA"
                              value={b.expiryDate ?? ''}
                              onChange={(e) => updateBatch(idx, bi, 'expiryDate', e.target.value, setItems)}
                            />
                          </td>
                          <td>
                            <input
                              className="items-input"
                              type="number"
                              min="0"
                              step="1"
                              style={{ fontSize: 11, padding: '2px 4px', textAlign: 'right' }}
                              value={b.qty || ''}
                              onChange={(e) => updateBatch(idx, bi, 'qty', parseInt(e.target.value) || 0, setItems)}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-size-icon-xs"
                              style={{ color: 'var(--icon-muted)' }}
                              onClick={() => removeBatch(idx, bi, setItems)}
                            >
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-size-xs"
                    onClick={() => addBatch(idx, setItems)}
                  >
                    + Agregar lote
                  </button>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function RecepcionForm() {
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
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [supplierDeliveryNote, setSupplierDeliveryNote] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem(defaultWh)])
  const [branch, setBranch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)
  const [showEnlazarOrden, setShowEnlazarOrden] = useState(false)

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true

  // ── Barcode scanner ───────────────────────────────────────────────────────
  useBarcodeScanner({
    onBarcode: async (code) => {
      const res = await listItems({ barcode: code, limit: 1 })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      setItems((prev) => [...prev, emptyItem(defaultWh)])
      setTimeout(() => selectCatalogItem(items.length, item), 0)
    },
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

  // Sin sucursal elegida: todos los almacenes del tenant (comportamiento actual).
  // Con sucursal elegida: solo los almacenes de esa sucursal.
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

  // Si solo hay un almacén disponible, se autoselecciona en las líneas que no tengan uno.
  useEffect(() => {
    if (warehouses?.length !== 1) return
    const onlyId = warehouses[0].id
    setItems((prev) => prev.map((row) => (row.warehouse ? row : { ...row, warehouse: onlyId })))
  }, [warehouses])

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const isSystemManager = useIsSystemManager()
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

  const { data: receiptData, isLoading: loadingEdit } = useQuery({
    queryKey: ['purchase-receipt', id],
    queryFn: () => getPurchaseReceipt(id!),
    enabled: isEdit,
  })

  // Con Multipestañas, esta pantalla queda montada (KeepAlive) al cambiar de pestaña — al volver
  // a ella se re-consulta por si la recepción cambió en el servidor mientras el usuario estaba en otra.
  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['purchase-receipt', id] })
  }, [isEdit, id], true)

  useEffect(() => {
    if (!receiptData) return
    setSupplierId(receiptData.supplier)
    setSupplierName(receiptData.supplierName ?? '')
    setPostingDate(receiptData.postingDate.split('T')[0])
    setSupplierDeliveryNote(receiptData.supplierDeliveryNote ?? '')
    setItems(
      receiptData.items.map((ri) => ({
        itemCode: ri.itemCode,
        itemLabel: ri.itemName,
        description: ri.itemName ?? '',
        qty: ri.qty,
        rate: ri.rate,
        warehouse: ri.warehouse ?? '',
        uom: ri.uom ?? 'Nos',
        baseRate: ri.rate,
        // El BFF no devuelve serials/batches en el detalle del receipt — si el
        // borrador tenía tracking, el usuario deberá volver a capturarlos al editar.
        trackingType: 'none' as const,
        serials: [],
        batches: [],
      })),
    )
    setBranch(receiptData.branch ?? '')
    setDepartment(receiptData.department ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptData])

  // A diferencia de lo que originalmente documentaba §10.2, GET /compras/purchase-receipt/:id SÍ
  // ecoa la combinación elegida por línea (confirmado en vivo 2026-09-27) — ver misma nota en
  // CompraForm.tsx.
  useEffect(() => {
    if (!receiptData) return
    let cancelled = false
    Promise.all(receiptData.items.map((ri) => getItem(ri.itemCode).catch(() => null))).then((catalogItems) => {
      if (cancelled) return
      setItems((prev) => prev.map((row, idx) => {
        const catalogItem = catalogItems[idx]
        const ri = receiptData.items[idx]
        return catalogItem?.usaDimensiones
          ? { ...row, itemDimensionesDeclaradas: catalogItem.dimensiones, dimensiones: ri?.dimensiones ?? row.dimensiones }
          : row
      }))
    })
    return () => { cancelled = true }
  }, [receiptData])

  const isDirty = useDirtyCheck({
    supplierId,
    postingDate,
    supplierDeliveryNote,
    items,
    branch,
    department,
  }, !isEdit || !loadingEdit)
  useBeforeUnloadWarning(isDirty)

  const saveMutation = useMutation({
    mutationFn: (dto: CreatePurchaseReceiptDto) =>
      isEdit ? updatePurchaseReceipt(id!, dto) : createPurchaseReceipt(dto),
    onSuccess: (data) => {
      toast.success(isEdit ? 'Recepción actualizada' : 'Recepción creada')
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['purchase-receipts'] })
      if (isEdit) queryClient.removeQueries({ queryKey: ['purchase-receipt', id] })
      navigate(`/compras/recepciones/${data.id}`)
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
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
      if (isApiErrorCode(error, ERROR_CODES.ALMACEN_COMPRA_NO_CONFIGURADO)) {
        toast.error(
          apiErr?.message || 'Configura el almacén de compras en la sucursal o en el proveedor antes de continuar',
          {
            duration: 10000,
            action: supplierId
              ? { label: 'Ver proveedor', onClick: () => navigate(`/proveedores/${supplierId}/editar`) }
              : { label: 'Ver sucursales', onClick: () => navigate('/config/sucursales') },
          },
        )
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
        toast.error('Error al guardar la recepción')
      }
    },
  })

  const grandTotal = items.reduce((sum, i) => sum + i.qty * i.rate, 0)

  // Red de seguridad — ver misma nota en CompraForm.tsx.
  const lineasRequierenReingresoDimension = isEdit && items.some(
    (i) => (i.itemDimensionesDeclaradas?.length ?? 0) > 0 && !combinacionCompleta(i.itemDimensionesDeclaradas ?? [], i.dimensiones ?? {}),
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }

    // Clear previous line errors
    setItems((prev) => prev.map((i) => ({ ...i, lineError: undefined })))

    let hasError = false
    for (const item of items) {
      const idx = items.indexOf(item)
      if (item.qty <= 0 || item.rate <= 0) {
        hasError = true
        setItems((prev) => prev.map((r, i) => i === idx ? { ...r, lineError: 'Cantidad y precio deben ser mayores a cero' } : r))
        continue
      }
      if (item.trackingType === 'serial') {
        if (item.serials.length !== Math.round(item.qty)) {
          hasError = true
          setItems((prev) => prev.map((r, i) =>
            i === idx ? { ...r, lineError: `Debe capturar ${Math.round(item.qty)} serial(es) (ingresó ${item.serials.length})` } : r,
          ))
        }
        const dups = item.serials.filter((s, i, a) => a.indexOf(s) !== i)
        if (dups.length > 0) {
          hasError = true
          setItems((prev) => prev.map((r, i) =>
            i === idx ? { ...r, lineError: `Seriales duplicados: ${[...new Set(dups)].join(', ')}` } : r,
          ))
        }
      }
      if (item.trackingType === 'batch') {
        const sum = item.batches.reduce((s, b) => s + b.qty, 0)
        if (Math.round(sum) !== Math.round(item.qty)) {
          hasError = true
          setItems((prev) => prev.map((r, i) =>
            i === idx ? { ...r, lineError: `Suma de lotes (${sum}) debe ser igual a la cantidad (${item.qty})` } : r,
          ))
        }
      }
    }
    if (hasError) return

    const dto: CreatePurchaseReceiptDto = {
      supplier: supplierId,
      postingDate,
      supplierDeliveryNote: supplierDeliveryNote || undefined,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      items: mergeIdenticalDimensionLines(items).map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        warehouse: i.warehouse || undefined,
        uom: i.uom || undefined,
        ...(i.serials.length > 0 ? { serials: i.serials } : {}),
        ...(i.batches.length > 0 ? { batches: i.batches } : {}),
        ...(i.ordenCompra && i.ordenCompraItem ? { ordenCompra: i.ordenCompra, ordenCompraItem: i.ordenCompraItem } : {}),
        // Siempre se reenvía en cada guardado — este endpoint tampoco conserva la combinación de
        // una línea no tocada en el PUT (§6.2/§10.1).
        ...(i.dimensiones && Object.keys(i.dimensiones).length > 0 ? { dimensiones: i.dimensiones } : {}),
      })),
    }
    saveMutation.mutate(dto)
  }

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }, [])

  const updateDimensiones = useCallback((idx: number, value: DimensionesLinea) => {
    setItems((prev) => prev.map((row, i) => i === idx ? { ...row, dimensiones: value } : row))
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item) => {
    setItems((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      const baseRate = catalogItem.valuationRate ?? catalogItem.standardRate ?? 0
      const trackingType = catalogItem.trackingType ?? 'none'
      return {
        ...row,
        itemCode: catalogItem.id,
        itemLabel: catalogItem.itemName,
        description: catalogItem.internalDescription ?? catalogItem.itemName,
        rate: baseRate,
        baseRate,
        uom: catalogItem.stockUom ?? row.uom,
        trackingType,
        serials: [],
        batches: [],
        // Un artículo nuevo en la fila implica una combinación nueva.
        itemDimensionesDeclaradas: catalogItem.usaDimensiones ? catalogItem.dimensiones : undefined,
        dimensiones: undefined,
      }
    }))
  }, [])

  const clearCatalogItem = useCallback((idx: number) => {
    setItems((prev) => prev.map((row, i) =>
      i === idx ? { ...row, itemCode: '', itemLabel: undefined, description: '', rate: 0, trackingType: 'none', serials: [], batches: [], itemDimensionesDeclaradas: undefined, dimensiones: undefined } : row,
    ))
  }, [])

  // Enlace manual (caso excepcional) a una Orden de Compra — trae sus líneas pendientes de
  // recibir como filas nuevas, marcadas con ordenCompra/ordenCompraItem (ver §3 del doc de
  // Solicitud/Orden de Compra). El camino normal sigue siendo /compras/ordenes/:id/recibir.
  async function handleImportOrdenLines(
    lines: OrdenCompraImportLine[],
    orden: { id: string; supplier: string; supplierName: string },
  ) {
    if (supplierId && supplierId !== orden.supplier) {
      toast.error(`Esta orden es del proveedor ${orden.supplierName}, distinto al proveedor ya seleccionado`)
      return
    }
    if (!supplierId) {
      setSupplierId(orden.supplier)
      setSupplierName(orden.supplierName)
    }

    const startIndex = items.length
    setItems((prev) => [...prev, ...lines.map(() => emptyItem(defaultWh))])

    const catalogItems = await Promise.all(lines.map((l) => getItem(l.itemCode).catch(() => null)))

    setItems((prev) => prev.map((row, idx) => {
      const li = idx - startIndex
      if (li < 0 || li >= lines.length) return row
      const line = lines[li]
      const catalogItem = catalogItems[li]
      const trackingType = catalogItem?.trackingType ?? 'none'
      return {
        ...row,
        itemCode: line.itemCode,
        itemLabel: catalogItem?.itemName ?? line.description,
        description: catalogItem?.internalDescription ?? line.description ?? catalogItem?.itemName ?? '',
        qty: line.qty,
        rate: line.rate,
        baseRate: line.rate,
        uom: line.uom || catalogItem?.stockUom || row.uom,
        warehouse: line.warehouse || row.warehouse,
        trackingType,
        ordenCompra: line.ordenCompra,
        ordenCompraItem: line.ordenCompraItem,
        itemDimensionesDeclaradas: catalogItem?.usaDimensiones ? catalogItem.dimensiones : undefined,
      }
    }))
    setItems((prev) => [...prev, emptyItem(defaultWh)])
    toast.success(`${lines.length} artículo(s) traído(s) de la orden ${orden.id}`)
  }

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
        title={isEdit ? 'Editar Recepción' : 'Nueva Recepción de Mercancía'}
        description="Registra la mercancía recibida — sin datos fiscales, esos se capturan al facturar"
        action={<RecargarButton label="Actualizar" />}
      />

      {lineasRequierenReingresoDimension && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 0 }}>
          <Info size={16} />
          <span>Esta recepción tiene línea(s) con un artículo que usa combinación de dimensión de inventario sin una combinación completa. Selecciónala en la columna «Combinación» antes de guardar, o esa línea será rechazada.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header fields */}
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
                    onChange={(id, opt) => {
                      const resolvedId = id === '' ? '' : (opt?.value ?? id)
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
                  <DatePicker
                    className="ff-input"
                    value={postingDate}
                    onChange={setPostingDate}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Remisión del Proveedor</label>
                  <input
                    className="ff-input"
                    placeholder="Número de remisión/guía (opcional)"
                    value={supplierDeliveryNote}
                    onChange={(e) => setSupplierDeliveryNote(e.target.value)}
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

          {/* Items */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Artículos</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-size-sm"
                  onClick={() => setShowEnlazarOrden(true)}
                  title="Traer los artículos pendientes de una Orden de Compra existente"
                >
                  Enlazar Orden de Compra
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-size-sm"
                  onClick={() => setItems((prev) => [...prev, emptyItem(defaultWh)])}
                >
                  <Plus size={14} />
                  Agregar
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="items-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>Artículo</th>
                      <th>Descripción</th>
                      <th style={{ width: '9%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '13%', textAlign: 'right' }}>Costo Estimado</th>
                      <th style={{ width: '16%' }}>Almacén</th>
                      <th style={{ width: '8%' }}>UOM</th>
                      <th style={{ width: '12%' }}>Combinación</th>
                      <th style={{ width: '40px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <SerialBatchRow
                        key={idx}
                        item={item}
                        idx={idx}
                        items={items}
                        setItems={setItems}
                        warehouses={warehouses}
                        warehouseOptions={warehouseSelectOptions}
                        onWarehouseSearch={setWarehouseSearch}
                        updateItem={updateItem}
                        updateDimensiones={updateDimensiones}
                        selectCatalogItem={selectCatalogItem}
                        clearCatalogItem={clearCatalogItem}
                        setVariantTemplate={setVariantTemplate}
                      />
                    ))}
                  </tbody>
                </table>
                <div className="items-total-row">
                  <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                    <span>Total Estimado</span>
                    <strong>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(grandTotal)}</strong>
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

      {variantTemplate && (
        <VariantsModal
          templateItem={variantTemplate}
          onConfirm={(selections) => {
            onVariantConfirm(selections, setItems)
            setVariantTemplate(null)
          }}
          onClose={() => setVariantTemplate(null)}
        />
      )}

      <SeleccionarOrdenCompraModal
        open={showEnlazarOrden}
        onClose={() => setShowEnlazarOrden(false)}
        mode="recepcion"
        onImport={handleImportOrdenLines}
      />
    </div>
  )
}
