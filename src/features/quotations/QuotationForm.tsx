import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useNavigate } from 'react-router-dom'
import { createQuotation, updateQuotation } from '@/shared/api/quotations'
import { listCustomers } from '@/shared/api/customers'
import type { CreateQuotationDto } from '@/shared/api/types'
import type { Item } from '@/shared/api/types'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { PinModal } from '@/components/shared/PinModal'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems } from '@/shared/api/catalog'
import { client } from '@/shared/api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  amount: number
  discountPct: number
  uom: string
}

interface QuotationFormProps {
  editId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultValidTill() {
  return format(addDays(new Date(), 15), 'yyyy-MM-dd')
}

const ITBIS_RATE = 0.18

function calcAmount(qty: number, rate: number, discountPct: number = 0) {
  const base = qty * rate
  const discount = base * (discountPct / 100)
  return Math.round((base - discount) * 100) / 100
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export default function QuotationForm({ editId }: QuotationFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [date, setDate] = useState(todayIso())
  const [validTill, setValidTill] = useState(defaultValidTill())
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [variantTemplate, setVariantTemplate] = useState<Item | null>(null)

  // ── Barcode scanner ───────────────────────────────────────────────────────
  useBarcodeScanner({
    onBarcode: async (code) => {
      const res = await listItems({ barcode: code, limit: 1 })
      const item = res.items?.[0]
      if (!item) { toast.error(`Código de barras no encontrado: ${code}`); return }
      addRow()
      setTimeout(() => selectCatalogItem(items.length, item), 0)
    },
  })

  // ── Customer search ──────────────────────────────────────────────────────

  const { data: customersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
    enabled: true,
  })

  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  // ── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (dto: CreateQuotationDto) => createQuotation(dto),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast.success('Cotización creada correctamente')
      navigate(`/cotizaciones/${quotation.id}`)
    },
    onError: (err: { message?: string }) => {
      handleError(err)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (dto: Partial<CreateQuotationDto>) => updateQuotation(editId!, dto),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['quotation', editId] })
      toast.success('Cotización actualizada')
      navigate(`/cotizaciones/${quotation.id}`)
    },
    onError: (err: { message?: string }) => {
      handleError(err)
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function submitDto() {
    const dto: CreateQuotationDto = {
      customer: customerId,
      date,
      validTill,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        discountPct: i.discountPct || undefined,
        uom: i.uom,
      })),
      notes: notes || undefined,
    }
    if (editId) updateMutation.mutate(dto)
    else createMutation.mutate(dto)
  }

  function handleError(err: { message?: string }) {
    const msg = err?.message ?? ''
    if (msg.toLowerCase().includes('máximo de descuento') || msg.toLowerCase().includes('máximo descuento')) {
      setPinModalOpen(true)
      return
    }
    toast.error(msg || 'Error al guardar la cotización')
  }

  // ── Line item helpers ────────────────────────────────────────────────────

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, ...patch }
        if ('qty' in patch || 'rate' in patch || 'discountPct' in patch) {
          updated.amount = calcAmount(updated.qty, updated.rate, updated.discountPct)
        }
        return updated
      }),
    )
  }

  function onVariantConfirm(selections: VariantSelection[]) {
    setItems((prev) => [
      ...prev,
      ...selections.map((s) => ({
        itemCode: s.item.id,
        itemLabel: s.item.itemName,
        description: s.item.description ?? s.item.itemName,
        qty: s.qty,
        rate: s.item.standardRate ?? 0,
        amount: calcAmount(s.qty, s.item.standardRate ?? 0, 0),
        discountPct: 0,
        uom: s.item.salesUom ?? s.item.stockUom ?? 'Unidad',
      })),
    ])
    setVariantTemplate(null)
  }

  function selectCatalogItem(index: number, catalogItem: Item) {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const rate = catalogItem.standardRate ?? 0
        return {
          ...row,
          itemCode: catalogItem.id,
          itemLabel: catalogItem.itemName,
          description: catalogItem.description ?? catalogItem.itemName,
          rate,
          amount: calcAmount(row.qty, rate, row.discountPct),
        }
      }),
    )
  }

  function clearCatalogItem(index: number) {
    updateItem(index, { itemCode: '', itemLabel: undefined, description: '', rate: 0, amount: 0, discountPct: 0 })
  }

  function addRow() {
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, amount: 0, discountPct: 0, uom: 'Unidad' }])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const itbis = Math.round(subtotal * ITBIS_RATE * 100) / 100
  const total = subtotal + itbis

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)

    if (!customerId) {
      toast.error('Selecciona un cliente')
      return
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un artículo')
      return
    }

    for (let i = 0; i < items.length; i++) {
      const row = items[i]
      const num = i + 1
      if (!row.qty || row.qty <= 0) {
        toast.error(`Artículo #${num}: la cantidad es requerida`)
        return
      }
      if (!row.rate || row.rate <= 0) {
        toast.error(`Artículo #${num}: el precio unitario es requerido`)
        return
      }
      if (!row.uom) {
        toast.error(`Artículo #${num}: la unidad (UDM) es requerida`)
        return
      }
    }

    submitDto()
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/cotizaciones')}>
            <ArrowLeft size={14} /> Cotizaciones
          </a>
          <h1 className="page-title">{editId ? 'Editar Cotización' : 'Nueva Cotización'}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* ── Información General ─────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Información General</h2>
          </div>
          <div className="card-body">
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="customer">Cliente</label>
                <SearchSelect
                  id="customer"
                  value={customerId}
                  onChange={(id, opt) => setCustomerId(id === '' ? '' : (opt?.value ?? id))}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={loadingCustomers}
                  placeholder="Buscar cliente…"
                  error={!customerId}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="date">Fecha</label>
                <input
                  id="date"
                  type="date"
                  className="ff-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="validTill">Válida hasta</label>
                <input
                  id="validTill"
                  type="date"
                  className="ff-input"
                  value={validTill}
                  onChange={(e) => setValidTill(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Artículos ───────────────────────────────────────────────────── */}
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
                  <th style={{ textAlign: 'right', width: 80 }}>Dto. %</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 72 }}>UDM</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                      No hay artículos. Agrega uno con el botón de abajo.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={index}>
                      {/* Artículo — SearchSelect por catálogo */}
                      <td style={{ minWidth: 200 }}>
                        <ItemSelect
                          value={item.itemCode}
                          selectedLabel={item.itemLabel}
                          onSelect={(catalogItem) => selectCatalogItem(index, catalogItem)}
                          onClear={() => clearCatalogItem(index)}
                          onVariantSelect={(t) => setVariantTemplate(t)}
                        />
                      </td>

                      {/* Descripción — editable, pre-llenada al seleccionar ítem */}
                      <td>
                        <input
                          className="items-input"
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder="Descripción del servicio o artículo"
                        />
                      </td>

                      <td>
                        <input
                          className={`items-input${submitted && (!item.qty || item.qty <= 0) ? ' items-input-error' : ''}`}
                          type="number"
                          min="0"
                          step="1"
                          value={item.qty}
                          onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })}
                          style={{ textAlign: 'right' }}
                        />
                      </td>

                      {/* Precio — editable, pre-llenado con standardRate del catálogo */}
                      <td>
                        <input
                          className={`items-input${submitted && (!item.rate || item.rate <= 0) ? ' items-input-error' : ''}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => updateItem(index, { rate: parseFloat(e.target.value) || 0 })}
                          style={{ textAlign: 'right' }}
                        />
                      </td>

                      {/* Descuento */}
                      <td>
                        <input
                          className="items-input"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={item.discountPct}
                          onChange={(e) => updateItem(index, { discountPct: parseFloat(e.target.value) || 0 })}
                          style={{ textAlign: 'right', width: 64 }}
                        />
                      </td>

                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>

                      <td>
                        <UomSelect
                          value={item.uom}
                          onChange={(v) => updateItem(index, { uom: v })}
                          itemCode={item.itemCode || undefined}
                          error={submitted && !item.uom}
                        />
                      </td>

                      <td>
                        <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeRow(index)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
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
            <div className="items-total-line">
                <span>Subtotal bruto</span>
                <span>{formatDOP(grossTotal)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="items-total-line" style={{ color: 'var(--text-danger)' }}>
                  <span>Descuento total</span>
                  <span>-{formatDOP(totalDiscount)}</span>
                </div>
              )}
            <div className="items-total-line">
              <span>Subtotal neto</span>
              <span>{formatDOP(subtotal)}</span>
            </div>
            <div className="items-total-line">
              <span>ITBIS (18%)</span>
              <span>{formatDOP(itbis)}</span>
            </div>
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                <span>Total</span>
                <span>{formatDOP(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Notas ───────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Notas</h2>
          </div>
          <div className="card-body">
            <textarea
              className="ff-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones comerciales, términos de entrega, observaciones..."
              rows={3}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/cotizaciones')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={15} />}
            Guardar Borrador
          </button>
        </div>
      </form>

      <PinModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onAuthorized={(userId) => { client.defaults.headers.common['X-Admin-Pin'] = userId; setPinModalOpen(false); submitDto() }}
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
    </div>
  )
}
