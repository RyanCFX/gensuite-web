import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createCompra, updateCompra, getCompra } from '@/shared/api/compras-gastos'
import { listSuppliers } from '@/shared/api/suppliers'
import { listWarehouses } from '@/shared/api/inventory'
import { listImpuestosCompras } from '@/shared/api/config'
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
}

function emptyItem(): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, baseRate: 0, warehouse: '', uom: 'Nos' }
}

const NCF_REGEX = /^[BE]\d{10}$/

function onVariantConfirm(
  selections: VariantSelection[],
  setItems: React.Dispatch<React.SetStateAction<ItemRow[]>>,
) {
  setItems((prev) => [
    ...prev,
    ...selections.map((s) => ({
      itemCode: s.item.id,
      itemLabel: s.item.itemName,
      description: s.item.description ?? s.item.itemName,
      qty: s.qty,
      rate: s.item.valuationRate ?? s.item.standardRate ?? 0,
      baseRate: s.item.valuationRate ?? s.item.standardRate ?? 0,
      warehouse: '',
      uom: s.item.purchaseUom ?? s.item.stockUom ?? 'Nos',
    })),
  ])
}

export default function CompraForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const isEdit = !!id

  const [supplierId, setSupplierId] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  const [ncfProveedor, setNcfProveedor] = useState('')
  const [tipoBienes606, setTipoBienes606] = useState('')
  const [formaPago606, setFormaPago606] = useState('')
  const [tipoPago, setTipoPago] = useState<'Contado' | 'Crédito'>('Contado')
  const [retencionItbis, setRetencionItbis] = useState<number>(0)
  const [retencionIsr, setRetencionIsr] = useState<number>(0)
  const [taxesAndCharges, setTaxesAndCharges] = useState<string>('')
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)

  // ── Barcode scanner ───────────────────────────────────────────────────────
  useBarcodeScanner({
    onBarcode: async (code) => {
      const res = await listItems({ barcode: code, limit: 1 })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      setItems((prev) => [...prev, emptyItem()])
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

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const { data: taxTemplates } = useQuery({
    queryKey: ['impuestos-compras'],
    queryFn: listImpuestosCompras,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (taxTemplates && !taxesAndCharges) {
      const def = taxTemplates.find((t) => t.isDefault)
      if (def) setTaxesAndCharges(def.id)
    }
  }, [taxTemplates])

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
    onError: () => toast.error('Error al guardar la compra'),
  })

  const ncfValid = !ncfProveedor || NCF_REGEX.test(ncfProveedor)
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.rate, 0)
  const selectedTemplate = taxTemplates?.find((t) => t.id === taxesAndCharges) ?? null
  const taxRate = selectedTemplate
    ? selectedTemplate.taxes
        .filter((l) => l.chargeType === 'On Net Total')
        .reduce((s, l) => s + l.rate, 0) / 100
    : 0
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100
  const grandTotal = subtotal + taxAmount
  const taxLabel = selectedTemplate
    ? selectedTemplate.taxes[0]?.description || selectedTemplate.title
    : ''
  const taxPct = Math.round(taxRate * 100)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (ncfProveedor && !NCF_REGEX.test(ncfProveedor)) { toast.error('NCF inválido (formato: B/E seguido de 10 dígitos)'); return }

    const dto: CreateCompraDto = {
      supplier: supplierId,
      postingDate,
      dueDate: dueDate || undefined,
      taxesAndCharges: taxesAndCharges || undefined,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        warehouse: i.warehouse || undefined,
        uom: i.uom || undefined,
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
      return {
        ...row,
        itemCode: catalogItem.id,
        itemLabel: catalogItem.itemName,
        description: catalogItem.description ?? catalogItem.itemName,
        rate: baseRate,
        baseRate,
        uom: catalogItem.purchaseUom ?? catalogItem.stockUom ?? row.uom,
      }
    }))
  }, [])

  const clearCatalogItem = useCallback((idx: number) => {
    setItems((prev) => prev.map((row, i) =>
      i === idx ? { ...row, itemCode: '', itemLabel: undefined, description: '', rate: 0 } : row,
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
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
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
                      <th style={{ width: '14%' }}>Almacén</th>
                      <th style={{ width: '7%' }}>UOM</th>
                      <th style={{ width: '40px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ minWidth: 180 }}>
                          <ItemSelect
                            value={item.itemCode}
                            selectedLabel={item.itemLabel}
                            onSelect={(catalogItem) => selectCatalogItem(idx, catalogItem)}
                            onClear={() => clearCatalogItem(idx)}
                            onVariantSelect={(t) => setVariantTemplate(t)}
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
                    ))}
                  </tbody>
                </table>
                <div className="items-total-row">
                  {/* Tax template selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Plantilla de impuesto</span>
                    <select
                      className="ff-select"
                      style={{ fontSize: 12, padding: '3px 8px', flex: 1 }}
                      value={taxesAndCharges}
                      onChange={(e) => setTaxesAndCharges(e.target.value)}
                    >
                      <option value="">— Sin impuesto —</option>
                      {taxTemplates?.map((t) => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="items-total-line">
                    <span>Subtotal</span>
                    <span>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(subtotal)}</span>
                  </div>
                  {taxesAndCharges && taxAmount > 0 && (
                    <div className="items-total-line">
                      <span>{taxLabel} ({taxPct}%)</span>
                      <span>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(taxAmount)}</span>
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
                <label className="ff-label">Retención ITBIS (RD$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="ff-input"
                  value={retencionItbis}
                  onChange={(e) => setRetencionItbis(parseFloat(e.target.value) || 0)}
                />
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
