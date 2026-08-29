import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { createCompra, updateCompra, getCompra } from '@/shared/api/compras-gastos'
import { listSuppliers, getSupplier } from '@/shared/api/suppliers'
import { listWarehouses } from '@/shared/api/inventory'
import { listAlmacenes, listImpuestosCompras, getCatalogosFiscales, getFacturacionConfig } from '@/shared/api/config'
import { listRetenciones } from '@/shared/api/retenciones'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import type { CreateCompraDto, Supplier, DistribucionCuentaDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Plus, Trash2, Info, UserPlus } from 'lucide-react'
import { SupplierQuickCreateModal } from '@/features/suppliers/SupplierQuickCreateModal'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { MultiSearchSelect } from '@/shared/ui/MultiSearchSelect'
import type { MultiSearchSelectOption } from '@/shared/ui/MultiSearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import type { Item } from '@/shared/api/types'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems, getItem } from '@/shared/api/catalog'
import type { TrackedComponent } from '@/components/shared/ComponentTrackingModal'
import { TrackedComponentEditor } from '@/components/shared/TrackedComponentEditor'
import type { ComponentTracking } from '@/shared/api/types'
import { useAuthStore } from '@/stores/auth.store'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { DistribucionCuentaEditor } from '@/components/shared/DistribucionCuentaEditor'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'

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
  purchaseTaxPct: number
  purchaseTaxTemplate: string
  lineError?: string
  /** Componentes del combo con tracking de serial/lote activo (solo si el artículo es un combo) */
  _comboComponents?: { itemCode: string; itemName?: string; trackingType: 'serial' | 'batch'; qtyPerCombo: number }[]
  componentTracking?: ComponentTracking[]
  /** Si tiene entradas, divide el monto de la línea (qty × rate) entre varias cuentas.
   *  No se puede combinar con seriales/lotes. */
  distribucionCuenta?: DistribucionCuentaDto[]
}

function emptyItem(defaultWh?: string): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, warehouse: defaultWh ?? '', uom: 'Nos', trackingType: 'none', serials: [], batches: [], purchaseTaxPct: 0, purchaseTaxTemplate: '' }
}

const NCF_REGEX = /^[BE]\d{10}$/
const SYSTEM_MANAGER_ROLE = 'System Manager'

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
      purchaseTaxPct: s.item.purchaseTaxPct ?? 0,
      purchaseTaxTemplate: s.item.purchaseTaxTemplate ?? '',
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

/** Requerimiento de seriales/lotes por componente, recalculado según la cantidad actual de la línea */
function getTrackingRequirement(row: ItemRow): TrackedComponent[] {
  return (row._comboComponents ?? []).map((c) => ({
    itemCode: c.itemCode,
    itemName: c.itemName,
    trackingType: c.trackingType,
    qtyNeeded: c.qtyPerCombo * row.qty,
    warehouse: row.warehouse || undefined,
  }))
}

function updateComponentTracking(
  idx: number,
  itemCode: string,
  patch: { serials?: string[]; batches?: { batchId: string; qty: number }[] },
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>,
) {
  setItems((prev) => prev.map((row, i) => {
    if (i !== idx) return row
    const others = (row.componentTracking ?? []).filter((t) => t.itemCode !== itemCode)
    return { ...row, componentTracking: [...others, { itemCode, ...patch }] }
  }))
}

// ─── SerialBatchRow Sub-component ────────────────────────────────────────

function SerialBatchRow({
  item, idx, items, setItems, warehouses, warehouseOptions, onWarehouseSearch, updateItem, selectCatalogItem, clearCatalogItem, setVariantTemplate, isReturn, allowNewTracking,
}: {
  item: ItemRow
  idx: number
  items: ItemRow[]
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>
  warehouses?: { id: string; name: string }[]
  warehouseOptions: SearchSelectOption[]
  onWarehouseSearch: (q: string) => void
  updateItem: (idx: number, field: keyof ItemRow, value: string | number) => void
  selectCatalogItem: (idx: number, catalogItem: Item) => void
  clearCatalogItem: (idx: number) => void
  setVariantTemplate: (t: Item | null) => void
  isReturn: boolean
  allowNewTracking: boolean
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
          <input
            className="items-input"
            type="number"
            // min="0.001"
            step="0.001"
            style={{ textAlign: 'right' }}
            value={item.qty}
            onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)}
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
            disabled={isReturn}
          />
        </td>
        <td style={{ textAlign: 'right' }}>
          {item.purchaseTaxPct > 0 ? (
            <span className="td-muted" style={{ fontSize: 12 }}>
              {item.purchaseTaxPct}%
            </span>
          ) : (
            <span className="td-muted" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
          )}
        </td>
        <td>
          <SearchSelect
            value={item.warehouse}
            onChange={(val) => updateItem(idx, 'warehouse', val)}
            options={warehouseOptions}
            onSearch={onWarehouseSearch}
            selectedLabel={warehouses?.find((w) => w.id === item.warehouse)?.name ?? ''}
            placeholder="Almacén"
            disabled={isReturn}
          />
        </td>
        <td>
          <UomSelect
            value={item.uom}
            disabled={isReturn}
            onChange={(v, factor) => {
              const newRate = Math.round(item.baseRate * factor * 10000) / 10000
              setItems(prev => prev.map((row, i) =>
                i === idx ? { ...row, uom: v, rate: newRate } : row,
              ))
            }}
            itemCode={item.itemCode || undefined}
          />
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

      {/* Dividir cuenta contable de la línea (opcional) */}
      {((item.distribucionCuenta && item.distribucionCuenta.length > 0) || item.trackingType === 'none') && (
      <tr className="tracking-row">
        <td colSpan={8} style={{ padding: '4px 8px 8px' }}>
          {item.distribucionCuenta && item.distribucionCuenta.length > 0 ? (
            <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
            <button
              type="button"
              className="btn btn-ghost btn-size-xs"
              onClick={() => setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, distribucionCuenta: [{ cuenta: '', monto: r.qty * r.rate }] } : r)))}
            >
              Dividir cuenta
            </button>
          )}
        </td>
      </tr>
      )}

      {/* Tracking row */}
      {(item.trackingType === 'serial' || item.trackingType === 'batch' || (item._comboComponents && item._comboComponents.length > 0)) && (
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

            {item._comboComponents && item._comboComponents.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Series/lotes de componentes del combo
                </span>
                {getTrackingRequirement(item).map((req) => {
                  const entry = item.componentTracking?.find((t) => t.itemCode === req.itemCode)
                  return (
                    <TrackedComponentEditor
                      key={req.itemCode}
                      component={req}
                      serials={entry?.serials ?? []}
                      onChangeSerials={(s) => updateComponentTracking(idx, req.itemCode, { serials: s }, setItems)}
                      batches={entry?.batches ?? []}
                      onChangeBatches={(b) => updateComponentTracking(idx, req.itemCode, { batches: b }, setItems)}
                      allowNew={allowNewTracking}
                    />
                  )
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export default function CompraForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()
  const isEdit = !!id
  const authUser = useAuthStore((s) => s.user)
  const defaultWh = authUser?.defaultWarehouse ?? ''

  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [esProveedorOcasional, setEsProveedorOcasional] = useState(false)
  const [proveedorOcasionalNombre, setProveedorOcasionalNombre] = useState('')
  const [proveedorOcasionalRnc, setProveedorOcasionalRnc] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem(defaultWh)])
  const [branch, setBranch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')
  const [taxesTemplate, setTaxesTemplate] = useState<string[]>([])
  const [retenciones, setRetenciones] = useState<string[]>([])
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [cuentaCxpOverride, setCuentaCxpOverride] = useState('')

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true
  const usaImpuestoDocumento = facturacionConfig?.usaImpuestoDocumento ?? true
  const requiereSerialLoteCompra = facturacionConfig?.requiereSerialLoteCompra ?? false

  const [ncfProveedor, setNcfProveedor] = useState('')
  const [billNo, setBillNo] = useState('')
  const [tipoBienes606, setTipoBienes606] = useState('')
  const [formaPago606, setFormaPago606] = useState('')
  const [tipoPago, setTipoPago] = useState<'Contado' | 'Crédito'>('Contado')
  const [tipoBienes606Touched, setTipoBienes606Touched] = useState(false)
  const [formaPago606Touched, setFormaPago606Touched] = useState(false)
  const [tipoPagoTouched, setTipoPagoTouched] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)

  // ── Barcode scanner ───────────────────────────────────────────────────────
  useBarcodeScanner({
    onBarcode: async (code) => {
      const res = await listItems({ barcode: code, limit: 1 })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      const targetIndex = items.length
      setItems((prev) => [...prev, emptyItem(defaultWh)])
      setTimeout(() => {
        selectCatalogItem(targetIndex, item, { autoAddRow: false })
        setItems((prev) => [...prev, emptyItem(defaultWh)])
      }, 0)
    },
  })

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [tipoBienes606Search, setTipoBienes606Search] = useState('')
  const tipoBienes606Options: SearchSelectOption[] = (catalogos?.tipoBienes606 ?? [])
    .filter((t) => !tipoBienes606Search || t.label.toLowerCase().includes(tipoBienes606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const [formaPago606Search, setFormaPago606Search] = useState('')
  const formaPago606Options: SearchSelectOption[] = (catalogos?.formaPago606 ?? [])
    .filter((f) => !formaPago606Search || f.label.toLowerCase().includes(formaPago606Search.toLowerCase()))
    .map((f) => ({ value: f.value, label: f.label }))

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

  function handleSupplierCreated(supplier: Supplier) {
    setShowCreateSupplier(false)
    setSupplierId(supplier.id)
    setSupplierName(supplier.supplierName)
    if (!tipoBienes606Touched && supplier.defaultTipoBienes606) setTipoBienes606(supplier.defaultTipoBienes606)
    if (!formaPago606Touched && supplier.defaultFormaPago606) setFormaPago606(supplier.defaultFormaPago606)
    if (!tipoPagoTouched && supplier.defaultTipoPagoProveedor) setTipoPago(supplier.defaultTipoPagoProveedor)
    queryClient.invalidateQueries({ queryKey: ['supplierSearch'] })
  }

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

  // ── Impuesto del documento (Purchase Taxes and Charges Template) ────────
  const { data: taxesTemplates } = useQuery({
    queryKey: ['impuestos-compras'],
    queryFn: listImpuestosCompras,
    staleTime: 5 * 60_000,
  })
  const impuestosOptions: MultiSearchSelectOption[] = useMemo(
    () => (taxesTemplates ?? []).map((t) => ({ id: String(t.id), label: t.title })),
    [taxesTemplates],
  )

  // ── Catálogos de retenciones (multiselect) ─────────────────────────────────
  const { data: retencionesData } = useQuery({
    queryKey: ['retenciones-all'],
    queryFn: () => listRetenciones({ limit: 100 }),
    staleTime: 5 * 60_000,
  })
  const retencionesOptions: MultiSearchSelectOption[] = useMemo(
    () => (retencionesData?.items ?? []).map((r) => ({ id: r.id, label: r.categoryName })),
    [retencionesData],
  )
  // Mapa id → etiqueta de retención, para el hint descriptivo.
  const retencionLabelMap = useMemo(
    () => new Map(retencionesOptions.map((r) => [r.id, r.label])),
    [retencionesOptions],
  )

  const { data: supplierDetail } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: !!supplierId && !esProveedorOcasional,
  })

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
      prev.length === 0 ? (s.impuestoComprasDefault?.map((d) => d.id) ?? []) : prev,
    )
    setRetenciones((prev) =>
      prev.length === 0 ? (s.retencionesDefault?.map((d) => d.id) ?? []) : prev,
    )
  }, [supplierDetail, esProveedorOcasional, tipoBienes606, formaPago606])
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

  // Igual que arriba, pero para impuestos (taxesTemplate / impuestoComprasDefault del proveedor).
  const impuestoComprasDefaultHint = supplierDetail?.impuestoComprasDefault ?? []
  const pendingImpuestosHint =
    taxesTemplate.length === 0 && impuestoComprasDefaultHint.length > 0
      ? `Los impuestos por defecto del proveedor${
          impuestoComprasDefaultHint.length > 0 ? `: ${impuestoComprasDefaultHint
            .map((d) => `${impuestosOptions.find((o) => o.id === d.id)?.label ?? d.id} (${d.tasa}%)`)
            .join(', ')}` : ''
        }.`
      : null

  const { data: compraData, isLoading: loadingEdit } = useQuery({
    queryKey: ['compra', id],
    queryFn: () => getCompra(id!),
    enabled: isEdit,
  })

  // Con Multipestañas, esta pantalla queda montada (KeepAlive) al cambiar de pestaña — al volver
  // a ella se re-consulta por si la compra cambió en el servidor mientras el usuario estaba en otra.
  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['compra', id] })
  }, [isEdit, id], true)

  useEffect(() => {
    if (!compraData) return
    setSupplierId(compraData.supplier)
    setSupplierName(compraData.supplierName ?? '')
    setEsProveedorOcasional(compraData.esProveedorOcasional ?? false)
    setProveedorOcasionalNombre(compraData.proveedorOcasionalNombre ?? '')
    setProveedorOcasionalRnc(compraData.proveedorOcasionalRnc ?? '')
    setPostingDate(compraData.postingDate.split('T')[0])
    setDueDate(compraData.dueDate?.split('T')[0] ?? '')
    setItems(
      compraData.items.map((ci) => ({
        itemCode: ci.itemCode,
        description: '',
        qty: ci.qty,
        rate: ci.rate,
        warehouse: ci.warehouse ?? '',
        uom: ci.uom ?? 'Nos',
        baseRate: ci.rate,
        trackingType: ((ci.serials?.length ?? 0) > 0 ? 'serial' : (ci.batches?.length ?? 0) > 0 ? 'batch' : 'none') as 'none' | 'serial' | 'batch',
        serials: ci.serials ?? [],
        batches: ci.batches ?? [],
        purchaseTaxPct: 0,
        purchaseTaxTemplate: '',
      })),
    )
    setBranch(compraData.branch ?? '')
    setDepartment(compraData.department ?? '')
    setNcfProveedor(compraData.ncfProveedor ?? '')
    setBillNo(compraData.billNo ?? '')
    setTipoBienes606(compraData.tipoBienes606 ?? '')
    setFormaPago606(compraData.formaPago606 ?? '')
    setTipoPago(compraData.tipoPago ?? 'Contado')
    setTaxesTemplate((compraData.taxesTemplate ?? compraData.impuestos ?? []).map((t) => t.id))
    setRetenciones((compraData.retenciones ?? []).map((r) => r.id))
    setCuentaCxpOverride(compraData.cuentaCxpOverride ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compraData])

  const isDirty = useDirtyCheck({
    supplierId,
    esProveedorOcasional,
    proveedorOcasionalNombre,
    proveedorOcasionalRnc,
    postingDate,
    dueDate,
    items,
    branch,
    department,
    taxesTemplate,
    retenciones,
    cuentaCxpOverride,
    ncfProveedor,
    billNo,
    tipoBienes606,
    formaPago606,
    tipoPago,
  }, !isEdit || !loadingEdit)
  useBeforeUnloadWarning(isDirty)

  const saveMutation = useMutation({
    mutationFn: (dto: CreateCompraDto) =>
      isEdit ? updateCompra(id!, dto) : createCompra(dto),
    onSuccess: (data) => {
      toast.success(isEdit ? 'Compra actualizada' : 'Compra creada')
      const updatedPrices = (data as any)?.updatedPrices
      if (updatedPrices && updatedPrices > 0) {
        toast.info(`Se actualizaron los precios de ${updatedPrices} artículo(s) (modo sobre costo)`)
      }
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      if (isEdit) queryClient.removeQueries({ queryKey: ['compra', id] })
      navigate(`/compras/${data.id}`)
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
      if (apiErr?.statusCode === 400 && apiErr?.message) {
        // Try to match inline errors to specific items by itemCode mention
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
        toast.error('Error al guardar la compra')
      }
    },
  })

  const ncfValid = !ncfProveedor || NCF_REGEX.test(ncfProveedor)
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.rate, 0)
  const taxTotal = items.reduce((sum, i) => sum + (i.qty * i.rate * i.purchaseTaxPct / 100), 0)
  const grandTotal = subtotal + taxTotal
  const isReturn = (compraData?.grandTotal ?? grandTotal) < 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (esProveedorOcasional) {
      if (!proveedorOcasionalNombre.trim()) { toast.error('Ingresa el nombre del proveedor ocasional'); return }
    } else if (!supplierId) {
      toast.error('Selecciona un proveedor')
      return
    }
    if (ncfProveedor && !NCF_REGEX.test(ncfProveedor)) { toast.error('NCF inválido (formato: B/E seguido de 10 dígitos)'); return }

    // Clear previous line errors
    setItems((prev) => prev.map((i) => ({ ...i, lineError: undefined })))

    // Validate tracking data — solo se exige capturar seriales/lotes si el flag "Requiere Serial/Lote al Comprar" está activo
    let hasTrackingError = false
    if (requiereSerialLoteCompra) {
      for (const item of items) {
        if (item.trackingType === 'serial') {
          if (item.serials.length === 0) {
            hasTrackingError = true
            setItems((prev) => prev.map((r, idx) =>
              idx === items.indexOf(item) ? { ...r, lineError: 'Debe capturar los seriales de este artículo (requerido por configuración)' } : r,
            ))
          } else if (item.serials.length !== Math.round(item.qty)) {
            hasTrackingError = true
            setItems((prev) => prev.map((r, idx) =>
              idx === items.indexOf(item) ? { ...r, lineError: `Debe capturar ${Math.round(item.qty)} serial(es) (ingresó ${item.serials.length})` } : r,
            ))
          }
          const dups = item.serials.filter((s, i, a) => a.indexOf(s) !== i)
          if (dups.length > 0) {
            hasTrackingError = true
            setItems((prev) => prev.map((r, idx) =>
              idx === items.indexOf(item) ? { ...r, lineError: `Seriales duplicados: ${[...new Set(dups)].join(', ')}` } : r,
            ))
          }
        }
        if (item.trackingType === 'batch') {
          if (item.batches.length === 0) {
            hasTrackingError = true
            setItems((prev) => prev.map((r, idx) =>
              idx === items.indexOf(item) ? { ...r, lineError: 'Debe capturar los lotes de este artículo (requerido por configuración)' } : r,
            ))
          } else {
            const sum = item.batches.reduce((s, b) => s + b.qty, 0)
            if (Math.round(sum) !== Math.round(item.qty)) {
              hasTrackingError = true
              setItems((prev) => prev.map((r, idx) =>
                idx === items.indexOf(item) ? { ...r, lineError: `Suma de lotes (${sum}) debe ser igual a la cantidad (${item.qty})` } : r,
              ))
            }
          }
        }
      }
    }
    if (hasTrackingError) return

    const dto: CreateCompraDto = {
      ...(esProveedorOcasional
        ? {
            proveedorOcasionalNombre: proveedorOcasionalNombre || undefined,
            proveedorOcasionalRnc: proveedorOcasionalRnc || undefined,
          }
        : { supplier: supplierId }),
      postingDate,
      dueDate: dueDate || undefined,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        warehouse: i.warehouse || undefined,
        uom: i.uom || undefined,
        ...(i.serials.length > 0 ? { serials: i.serials } : {}),
        ...(i.batches.length > 0 ? { batches: i.batches } : {}),
        ...(i.componentTracking && i.componentTracking.length > 0 ? { componentTracking: i.componentTracking } : {}),
        ...((i.distribucionCuenta ?? []).filter((d) => d.cuenta).length > 0
          ? { distribucionCuenta: i.distribucionCuenta!.filter((d) => d.cuenta) }
          : {}),
      })),
      ncfProveedor: ncfProveedor || undefined,
      billNo: billNo || undefined,
      tipoBienes606: tipoBienes606 || undefined,
      formaPago606: formaPago606 || undefined,
      tipoPago,
      taxesTemplate: usaImpuestoDocumento ? (taxesTemplate.length > 0 ? taxesTemplate : undefined) : undefined,
      retenciones: retenciones.length > 0 ? retenciones : undefined,
      cuentaCxpOverride: cuentaCxpOverride || undefined,
    }
    saveMutation.mutate(dto)
  }

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item, opts?: { autoAddRow?: boolean }) => {
    const autoAddRow = opts?.autoAddRow ?? true
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = idx === prev.length - 1
      return prev.map((row, i) => {
        if (i !== idx) return row
        // Para compras usamos valuationRate (costo) si existe, si no standardRate
        const baseRate = catalogItem.valuationRate ?? catalogItem.standardRate ?? 0
        const trackingType = catalogItem.trackingType ?? 'none'
        const newRow: ItemRow = {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          description: catalogItem.internalDescription ?? catalogItem.itemName,
          rate: baseRate,
          baseRate,
          uom: catalogItem.stockUom ?? row.uom,
          trackingType,
          serials: trackingType === 'serial' ? [] : [],
          batches: trackingType === 'batch' ? [] : [],
          purchaseTaxPct: catalogItem.purchaseTaxPct ?? 0,
          purchaseTaxTemplate: catalogItem.purchaseTaxTemplate ?? '',
          // No se puede combinar distribucionCuenta con seriales/lotes.
          distribucionCuenta: trackingType === 'none' ? row.distribucionCuenta : undefined,
        }
        // Detecta componentes del combo con tracking de serial/lote
        if (catalogItem.type === 'combo') {
          Promise.all(
            (catalogItem.components ?? []).map(async (c) => {
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
            if (tracked.length > 0) {
              setItems((prev) =>
                prev.map((row, i) =>
                  i === idx ? { ...row, _comboComponents: tracked } : row
                )
              )
            }
          })
        }
        return newRow
      })
    })
    if (autoAddRow && wasLastRow) setItems((prev) => [...prev, emptyItem(defaultWh)])
  }, [defaultWh])

  const clearCatalogItem = useCallback((idx: number) => {
    setItems((prev) => prev.map((row, i) =>
      i === idx ? { ...row, itemCode: '', itemLabel: undefined, description: '', rate: 0, trackingType: 'none', serials: [], batches: [], _comboComponents: undefined, componentTracking: undefined } : row,
    ))
  }, [])

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
        title={isEdit ? 'Editar Compra' : 'Nueva Compra'}
        description="Registra una compra de inventario"
      />

      {isReturn && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 0 }}>
          <Info size={16} />
          <span>Devolución a proveedor — los campos de información general, precio, almacén y UOM no pueden modificarse.</span>
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
                  <label className="ff-label">
                    {esProveedorOcasional ? 'Nombre del Vendedor' : <>Proveedor <span className="ff-required">*</span></>}
                  </label>
                  {esProveedorOcasional ? (
                    <input
                      className="ff-input"
                      value={proveedorOcasionalNombre}
                      onChange={(e) => setProveedorOcasionalNombre(e.target.value)}
                      placeholder="Nombre del proveedor ocasional"
                      disabled={isReturn}
                    />
                  ) : (
                    <SearchSelect
                      id="supplier"
                      value={supplierId}
                      selectedLabel={supplierName}
                      disabled={isReturn}
                      onChange={(id, opt) => {
                        const resolvedId = id === '' ? '' : (opt?.value ?? id)
                        setSupplierId(resolvedId)
                        setSupplierName(opt?.label ?? '')
                        const selected = suppliersData?.items.find((s) => s.id === resolvedId)
                        if (selected) {
                          if (!tipoBienes606Touched && selected.defaultTipoBienes606) setTipoBienes606(selected.defaultTipoBienes606)
                          if (!formaPago606Touched && selected.defaultFormaPago606) setFormaPago606(selected.defaultFormaPago606)
                          if (!tipoPagoTouched && selected.defaultTipoPagoProveedor) setTipoPago(selected.defaultTipoPagoProveedor)
                          if (selected.diasCredito) {
                            const base = new Date(postingDate || new Date().toISOString().split('T')[0])
                            base.setDate(base.getDate() + selected.diasCredito)
                            setDueDate(base.toISOString().split('T')[0])
                          }
                        }
                      }}
                      options={supplierOptions}
                      onSearch={setSupplierQuery}
                      loading={suppliersLoading}
                      placeholder="Buscar proveedor…"
                      error={!supplierId}
                      headerContent={
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-sm"
                          style={{ width: '100%', justifyContent: 'flex-start' }}
                          onClick={() => setShowCreateSupplier(true)}
                        >
                          <UserPlus size={14} /> Agregar proveedor
                        </button>
                      }
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
                      disabled={isReturn}
                    />
                    <p className="ff-hint">Se recomienda llenarlo — alimenta el reporte fiscal 606.</p>
                  </div>
                )}

                <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={esProveedorOcasional}
                      disabled={isReturn}
                      onChange={(e) => {
                        setEsProveedorOcasional(e.target.checked)
                        if (e.target.checked) {
                          setSupplierId('')
                          setSupplierName('')
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
                      Compra a un vendedor sin cuenta registrada. No se requiere RNC/Cédula.
                    </p>
                  )}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                  <DatePicker
                    className="ff-input"
                    value={postingDate}
                    onChange={setPostingDate}
                    disabled={isReturn}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Fecha Vencimiento</label>
                  <DatePicker
                    className="ff-input"
                    value={dueDate}
                    onChange={setDueDate}
                    disabled={isReturn}
                    clearable
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
                    disabled={isReturn}
                  />
                </div>

                {usaDepartamentos && (
                  <div className="ff-wrap">
                    <label className="ff-label">Departamento</label>
                    <DepartmentSelect value={department} onChange={setDepartment} placeholder="Buscar departamento…" disabled={isReturn} />
                  </div>
                )}

                </div>
            </div>

            {/* ── Impuestos y retenciones ── */}
            <div className="form-row form-row-3" style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 16, paddingTop: 16 }}>
              {usaImpuestoDocumento && (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="taxesTemplate">Impuesto del Documento</label>
                  <MultiSearchSelect
                    id="taxesTemplate"
                    value={taxesTemplate}
                    onChange={setTaxesTemplate}
                    options={impuestosOptions}
                    placeholder="Buscar plantilla…"
                    emptyLabel="No hay plantillas configuradas."
                    disabled={isReturn}
                  />
                  <p className="ff-hint">Si no eliges ninguno, se usa el template por defecto del proveedor o de la compañía.</p>
                  {pendingImpuestosHint && <p className="ff-hint">{pendingImpuestosHint}</p>}
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="retenciones">Retenciones</label>
                <MultiSearchSelect
                  id="retenciones"
                  value={retenciones}
                  onChange={setRetenciones}
                  options={retencionesOptions}
                  placeholder="Buscar retención…"
                  emptyLabel="No hay retenciones configuradas."
                  disabled={isReturn}
                />
                <p className="ff-hint">
                  El BFF calcula el monto de cada una a partir de la tasa configurada; si dejas la lista
                  vacía se usan las retenciones por defecto del proveedor.
                </p>
                {pendingRetencionesHint && <p className="ff-hint">{pendingRetencionesHint}</p>}
              </div>
            </div>
          </div>

          {/* Items */}
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
                      <th style={{ width: '8%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Precio</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Impuesto</th>
                      <th style={{ width: '14%' }}>Almacén</th>
                      <th style={{ width: '7%' }}>UOM</th>
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
                        selectCatalogItem={selectCatalogItem}
                        clearCatalogItem={clearCatalogItem}
                        setVariantTemplate={setVariantTemplate}
                        isReturn={isReturn}
                        allowNewTracking={!requiereSerialLoteCompra}
                      />
                    ))}
                  </tbody>
                </table>
                <div className="items-total-row">
                  <div className="items-total-line">
                    <span>Subtotal</span>
                    <span>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(subtotal)}</span>
                  </div>
                  {taxTotal > 0 && (
                    <div className="items-total-line" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                      <span>Impuesto</span>
                      <span>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(taxTotal)}</span>
                    </div>
                  )}
                  <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                    <span>Total</span>
                    <strong>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(grandTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 606 Section */}
          <div className="dgii-section">
            <div className="dgii-section-title">
              <Info size={14} />
              Información DGII (606)
            </div>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">NCF Proveedor</label>
                <input
                  className={`ff-input${!ncfValid ? ' ff-input-error' : ''}`}
                  placeholder="B01XXXXXXXXXX"
                  value={ncfProveedor}
                  onChange={(e) => setNcfProveedor(e.target.value.toUpperCase())}
                />
                {!ncfValid && (
                  <span className="ff-error">Formato inválido. Debe ser B o E seguido de 10 dígitos.</span>
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

              <div className="ff-wrap">
                <label className="ff-label">Tipo de Bienes 606</label>
                <SearchSelect
                  value={tipoBienes606}
                  onChange={(val) => { setTipoBienes606(val); setTipoBienes606Touched(true) }}
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
                  onChange={(val) => { setFormaPago606(val); setFormaPago606Touched(true) }}
                  options={formaPago606Options}
                  onSearch={setFormaPago606Search}
                  selectedLabel={catalogos?.formaPago606?.find((f) => f.value === formaPago606)?.label ?? formaPago606}
                  placeholder="Seleccionar forma"
                />
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

              <div className="ff-wrap">
                <label className="ff-label">Cuenta CxP (override)</label>
                <AccountSelect
                  value={cuentaCxpOverride}
                  onChange={setCuentaCxpOverride}
                  placeholder="Usar la cuenta CxP default del proveedor"
                  rootType="Liability"
                />
                <p className="ff-hint">
                  Solo si esta compra puntual debe ir a una cuenta CxP distinta a la default del
                  proveedor. Una devolución de compra solo puede aplicarse/reconciliarse contra
                  facturas que compartan la misma cuenta CxP.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando…' : 'Guardar Borrador'}
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

      {showCreateSupplier && (
        <SupplierQuickCreateModal
          onCreated={handleSupplierCreated}
          onClose={() => setShowCreateSupplier(false)}
        />
      )}
    </div>
  )
}
