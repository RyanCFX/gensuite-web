import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createGasto } from '@/shared/api/compras-gastos'
import { listSuppliers } from '@/shared/api/suppliers'
import type { CreateGastoDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { TIPO_BIENES_606, FORMA_PAGO_606, NCF_TYPES_COMPRA, CATEGORIA_GASTO } from '@/lib/constants'
import { Plus, Trash2, Info, AlertCircle } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import type { Item } from '@/shared/api/types'

interface ItemRow {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  uom: string
}

function emptyItem(): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, uom: 'Nos' }
}

const NCF_REGEX = /^[BE]\d{10}$/
const B17_MAX = 50

export default function GastoForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [supplierId, setSupplierId] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  const [ncfProveedor, setNcfProveedor] = useState('')
  const [tipoComprobante, setTipoComprobante] = useState<string>('')
  const [tipoBienes606, setTipoBienes606] = useState('')
  const [formaPago606, setFormaPago606] = useState('')
  const [categoriaGasto, setCategoriaGasto] = useState<string>('')
  const [esDeducible, setEsDeducible] = useState(true)
  const [retencionItbis, setRetencionItbis] = useState(0)
  const [retencionIsr, setRetencionIsr] = useState(0)

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

  const saveMutation = useMutation({
    mutationFn: (dto: CreateGastoDto) => createGasto(dto),
    onSuccess: (data) => {
      toast.success('Gasto creado')
      queryClient.invalidateQueries({ queryKey: ['gastos'] })
      navigate(`/gastos/${data.id}`)
    },
    onError: () => toast.error('Error al guardar el gasto'),
  })

  const grandTotal = items.reduce((sum, i) => sum + i.qty * i.rate, 0)
  const ncfValid = !ncfProveedor || NCF_REGEX.test(ncfProveedor)
  const isB17 = tipoComprobante === 'B17'
  const b17Error = isB17 && grandTotal > B17_MAX

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item) => {
    setItems((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      return {
        ...row,
        itemCode: catalogItem.id,
        itemLabel: catalogItem.itemName,
        description: catalogItem.description ?? catalogItem.itemName,
        rate: catalogItem.standardRate ?? 0,
      }
    }))
  }, [])

  const clearCatalogItem = useCallback((idx: number) => {
    setItems((prev) => prev.map((row, i) =>
      i === idx ? { ...row, itemCode: '', itemLabel: undefined, description: '', rate: 0 } : row,
    ))
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (ncfProveedor && !NCF_REGEX.test(ncfProveedor)) { toast.error('NCF inválido (formato: B/E seguido de 10 dígitos)'); return }
    if (b17Error) { toast.error('Gastos Menores (B17) no pueden superar RD$50.00'); return }

    const dto: CreateGastoDto = {
      supplier: supplierId,
      postingDate,
      dueDate: dueDate || undefined,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        uom: i.uom || undefined,
      })),
      ncfProveedor: ncfProveedor || undefined,
      tipoComprobante: tipoComprobante as CreateGastoDto['tipoComprobante'] || undefined,
      tipoBienes606: tipoBienes606 || undefined,
      formaPago606: formaPago606 || undefined,
      categoriaGasto: categoriaGasto as CreateGastoDto['categoriaGasto'] || undefined,
      esDeducible,
    }
    saveMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Volver
      </button>

      <PageHeader title="Nuevo Gasto" description="Registra un gasto sin movimiento de inventario" />

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          {/* Header */}
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
                  <input type="date" className="ff-input" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} required />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Fecha Vencimiento</label>
                  <input type="date" className="ff-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Artículos / Conceptos</span>
              <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
                <Plus size={14} />Agregar
              </button>
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
                            placeholder="Buscar concepto…"
                          />
                        </td>
                        <td>
                          <input className="items-input" placeholder="Descripción" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                        </td>
                        <td>
                          <input className="items-input" type="number" min="0.001" step="0.001" style={{ textAlign: 'right' }} value={item.qty} onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td>
                          <input className="items-input" type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={item.rate} onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--icon-muted)' }} onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                            <Trash2 size={14} />
                          </button>
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
                    <span>Total</span>
                    <strong>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(grandTotal)}</strong>
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
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">NCF Proveedor</label>
                <input
                  className={`ff-input${!ncfValid ? ' ff-input-error' : ''}`}
                  placeholder="B13XXXXXXXXXX"
                  value={ncfProveedor}
                  onChange={(e) => setNcfProveedor(e.target.value.toUpperCase())}
                />
                {!ncfValid && <span className="ff-error">Formato inválido.</span>}
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Tipo Comprobante</label>
                <select
                  className={`ff-select${isB17 && b17Error ? ' ff-input-error' : ''}`}
                  value={tipoComprobante}
                  onChange={(e) => setTipoComprobante(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {NCF_TYPES_COMPRA.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Tipo de Bienes 606</label>
                <select className="ff-select" value={tipoBienes606} onChange={(e) => setTipoBienes606(e.target.value)}>
                  <option value="">Seleccionar tipo</option>
                  {TIPO_BIENES_606.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Forma de Pago 606</label>
                <select className="ff-select" value={formaPago606} onChange={(e) => setFormaPago606(e.target.value)}>
                  <option value="">Seleccionar forma</option>
                  {FORMA_PAGO_606.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Categoría de Gasto</label>
                <select className="ff-select" value={categoriaGasto} onChange={(e) => setCategoriaGasto(e.target.value)}>
                  <option value="">Seleccionar categoría</option>
                  {CATEGORIA_GASTO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Retención ITBIS (RD$)</label>
                <input type="number" min="0" step="0.01" className="ff-input" value={retencionItbis} onChange={(e) => setRetencionItbis(parseFloat(e.target.value) || 0)} />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Retención ISR (RD$)</label>
                <input type="number" min="0" step="0.01" className="ff-input" value={retencionIsr} onChange={(e) => setRetencionIsr(parseFloat(e.target.value) || 0)} />
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
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending || b17Error}>
              {saveMutation.isPending ? 'Guardando…' : 'Guardar Borrador'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
