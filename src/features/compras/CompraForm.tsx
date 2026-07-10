import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createCompra, updateCompra, getCompra } from '@/shared/api/compras-gastos'
import { listSuppliers } from '@/shared/api/suppliers'
import { listWarehouses } from '@/shared/api/inventory'
import { listAlmacenes } from '@/shared/api/config'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import type { CreateCompraDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { TIPO_BIENES_606, FORMA_PAGO_606 } from '@/lib/constants'
import { Plus, Trash2, Info } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import type { Item } from '@/shared/api/types'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems } from '@/shared/api/catalog'
import { useAuthStore } from '@/stores/auth.store'

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

// ─── SerialBatchRow Sub-component ────────────────────────────────────────

function SerialBatchRow({
  item, idx, items, setItems, warehouses, updateItem, selectCatalogItem, clearCatalogItem, setVariantTemplate,
}: {
  item: ItemRow
  idx: number
  items: ItemRow[]
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>
  warehouses?: { name: string }[]
  updateItem: (idx: number, field: keyof ItemRow, value: string | number) => void
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
          <input
            className="items-input"
            type="number"
            min="0.001"
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
          <select
            className="items-input"
            value={item.warehouse}
            onChange={(e) => updateItem(idx, 'warehouse', e.target.value)}
          >
            <option value="">Almacén</option>
            {warehouses?.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
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

export default function CompraForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const isEdit = !!id
  const authUser = useAuthStore((s) => s.user)
  const defaultWh = authUser?.defaultWarehouse ?? ''

  const [supplierId, setSupplierId] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem(defaultWh)])
  const [branch, setBranch] = useState('')

  const [ncfProveedor, setNcfProveedor] = useState('')
  const [tipoBienes606, setTipoBienes606] = useState('')
  const [formaPago606, setFormaPago606] = useState('')
  const [tipoPago, setTipoPago] = useState<'Contado' | 'Crédito'>('Contado')
  const [retencionIsr, setRetencionIsr] = useState<number>(0)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)

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

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  const { isLoading: loadingEdit } = useQuery({
    queryKey: ['compra', id],
    queryFn: () => getCompra(id!),
    enabled: isEdit,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (data: any) => data,
  })

  const saveMutation = useMutation({
    mutationFn: (dto: CreateCompraDto) =>
      isEdit ? updateCompra(id!, dto) : createCompra(dto),
    onSuccess: (data) => {
      toast.success(isEdit ? 'Compra actualizada' : 'Compra creada')
      const updatedPrices = (data as any)?.updatedPrices
      if (updatedPrices && updatedPrices > 0) {
        toast.info(`Se actualizaron los precios de ${updatedPrices} artículo(s) (modo sobre costo)`)
      }
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      navigate(`/compras/${data.id}`)
    },
    onError: (error) => {
      const apiErr = error as { code?: string; message?: string; statusCode?: number }
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (ncfProveedor && !NCF_REGEX.test(ncfProveedor)) { toast.error('NCF inválido (formato: B/E seguido de 10 dígitos)'); return }

    // Clear previous line errors
    setItems((prev) => prev.map((i) => ({ ...i, lineError: undefined })))

    // Validate tracking data
    let hasTrackingError = false
    for (const item of items) {
      if (item.trackingType === 'serial') {
        if (item.serials.length !== Math.round(item.qty)) {
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
        const sum = item.batches.reduce((s, b) => s + b.qty, 0)
        if (Math.round(sum) !== Math.round(item.qty)) {
          hasTrackingError = true
          setItems((prev) => prev.map((r, idx) =>
            idx === items.indexOf(item) ? { ...r, lineError: `Suma de lotes (${sum}) debe ser igual a la cantidad (${item.qty})` } : r,
          ))
        }
      }
    }
    if (hasTrackingError) return

    const dto: CreateCompraDto = {
      supplier: supplierId,
      postingDate,
      dueDate: dueDate || undefined,
      branch: branch || undefined,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        warehouse: i.warehouse || undefined,
        uom: i.uom || undefined,
        ...(i.serials.length > 0 ? { serials: i.serials } : {}),
        ...(i.batches.length > 0 ? { batches: i.batches } : {}),
      })),
      ncfProveedor: ncfProveedor || undefined,
      tipoBienes606: tipoBienes606 || undefined,
      formaPago606: formaPago606 || undefined,
      tipoPago,
    }
    saveMutation.mutate(dto)
  }

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item) => {
    setItems((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      // Para compras usamos valuationRate (costo) si existe, si no standardRate
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
        serials: trackingType === 'serial' ? [] : [],
        batches: trackingType === 'batch' ? [] : [],
        purchaseTaxPct: catalogItem.purchaseTaxPct ?? 0,
        purchaseTaxTemplate: catalogItem.purchaseTaxTemplate ?? '',
      }
    }))
  }, [])

  const clearCatalogItem = useCallback((idx: number) => {
    setItems((prev) => prev.map((row, i) =>
      i === idx ? { ...row, itemCode: '', itemLabel: undefined, description: '', rate: 0, trackingType: 'none', serials: [], batches: [] } : row,
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
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
                    onChange={(id, opt) => setSupplierId(id === '' ? '' : (opt?.value ?? id))}
                    options={supplierOptions}
                    onSearch={setSupplierQuery}
                    loading={suppliersLoading}
                    placeholder="Buscar proveedor…"
                    error={!supplierId}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                  <input
                    type="date"
                    className="ff-input"
                    value={postingDate}
                    onChange={(e) => setPostingDate(e.target.value)}
                    required
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Fecha Vencimiento</label>
                  <input
                    type="date"
                    className="ff-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <select className="ff-select" value={branch} onChange={(e) => setBranch(e.target.value)}>
                    <option value="">Sin especificar</option>
                    {branchOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
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
                        updateItem={updateItem}
                        selectCatalogItem={selectCatalogItem}
                        clearCatalogItem={clearCatalogItem}
                        setVariantTemplate={setVariantTemplate}
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
                <label className="ff-label">Tipo de Bienes 606</label>
                <select
                  className="ff-select"
                  value={tipoBienes606}
                  onChange={(e) => setTipoBienes606(e.target.value)}
                >
                  <option value="">Seleccionar tipo</option>
                  {TIPO_BIENES_606.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Forma de Pago 606</label>
                <select
                  className="ff-select"
                  value={formaPago606}
                  onChange={(e) => setFormaPago606(e.target.value)}
                >
                  <option value="">Seleccionar forma</option>
                  {FORMA_PAGO_606.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Tipo de Pago</label>
                <select
                  className="ff-select"
                  value={tipoPago}
                  onChange={(e) => setTipoPago(e.target.value as 'Contado' | 'Crédito')}
                >
                  <option value="Contado">Contado</option>
                  <option value="Crédito">Crédito</option>
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Retención ISR (RD$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="ff-input"
                  value={retencionIsr}
                  onChange={(e) => setRetencionIsr(parseFloat(e.target.value) || 0)}
                />
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
    </div>
  )
}
