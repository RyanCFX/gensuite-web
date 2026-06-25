import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createPedido, updatePedido, getPedido } from '@/shared/api/pedidos'
import { listCustomers } from '@/shared/api/customers'
import { getQuotation } from '@/shared/api/quotations'
import type { Item } from '@/shared/api/types'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { formatDOP } from '@/lib/formatters'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { VariantsModal } from '@/components/shared/VariantsModal'
import type { VariantSelection } from '@/components/shared/VariantsModal'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { listItems } from '@/shared/api/catalog'

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

function todayIso() { return format(new Date(), 'yyyy-MM-dd') }
function defaultDelivery() { return format(addDays(new Date(), 7), 'yyyy-MM-dd') }
const ITBIS_RATE = 0.18
function calcAmount(qty: number, rate: number, discountPct: number = 0) {
  const base = qty * rate; const discount = base * (discountPct / 100)
  return Math.round((base - discount) * 100) / 100
}

export default function PedidoForm() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const quotationId = searchParams.get('quotation')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [transactionDate, setTransactionDate] = useState(todayIso())
  const [deliveryDate, setDeliveryDate] = useState(defaultDelivery())
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loaded, setLoaded] = useState(false)
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

  // Load quotation data
  useEffect(() => {
    if (!quotationId || loaded || isEdit) return
    setLoaded(true)
    getQuotation(quotationId).then((q) => {
      setCustomerId(q.customer)
      setTransactionDate(todayIso())
      setItems(q.items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        amount: i.amount,
        discountPct: (i as any).discountPct ?? 0,
        uom: i.uom,
      })))
      setNotes(q.notes ?? '')
    }).catch(() => toast.error('Error al cargar la cotización'))
  }, [quotationId, loaded, isEdit])

  // Load existing pedido
  const { data: existing } = useQuery({
    queryKey: ['pedido', id],
    queryFn: () => getPedido(id!),
    enabled: isEdit,
  })
  useEffect(() => {
    if (!existing || loaded) return
    setCustomerId(existing.customer)
    setTransactionDate(existing.transactionDate)
    setDeliveryDate(existing.deliveryDate ?? defaultDelivery())
    setItems(existing.items.map((i) => ({
      itemCode: i.itemCode,
      description: i.description,
      qty: i.qty,
      rate: i.rate,
      amount: i.amount,
      discountPct: (i as any).discountPct ?? 0,
      uom: i.uom ?? 'Unidad',
    })))
    setNotes(existing.notes ?? '')
    setLoaded(true)
  }, [existing])

  const { data: customersData } = useQuery({
    queryKey: ['customerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({ value: c.id, label: c.customerName, sublabel: c.rnc ?? c.cedula }))

  const createMutation = useMutation({
    mutationFn: () => createPedido({
      customer: customerId,
      transactionDate,
      deliveryDate: deliveryDate || undefined,
      items: items.map((i) => ({ itemCode: i.itemCode, qty: i.qty, rate: i.rate, discountPct: i.discountPct || undefined })),
      quotation: quotationId || undefined,
    }),
    onSuccess: (p) => { queryClient.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Pedido creado'); navigate(`/pedidos/${p.id}`) },
    onError: () => toast.error('Error al crear el pedido'),
  })
  const updateMutation = useMutation({
    mutationFn: () => updatePedido(id!, {
      customer: customerId,
      transactionDate,
      deliveryDate: deliveryDate || undefined,
      items: items.map((i) => ({ itemCode: i.itemCode, qty: i.qty, rate: i.rate, discountPct: i.discountPct || undefined })),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pedidos'] }); queryClient.invalidateQueries({ queryKey: ['pedido', id] }); toast.success('Pedido actualizado'); navigate(`/pedidos/${id}`) },
    onError: () => toast.error('Error al actualizar el pedido'),
  })
  const isPending = createMutation.isPending || updateMutation.isPending

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item
      const updated = { ...item, ...patch }
      if ('qty' in patch || 'rate' in patch || 'discountPct' in patch) updated.amount = calcAmount(updated.qty, updated.rate, updated.discountPct)
      return updated
    }))
  }
  function selectCatalogItem(index: number, catalogItem: Item) {
    setItems((prev) => prev.map((row, i) => {
      if (i !== index) return row
      const rate = catalogItem.standardRate ?? 0
      return { ...row, itemCode: catalogItem.id, itemLabel: catalogItem.itemName, description: catalogItem.description ?? catalogItem.itemName, rate, amount: calcAmount(row.qty, rate, row.discountPct) }
    }))
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

  function addRow() { setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, amount: 0, discountPct: 0, uom: 'Unidad' }]) }
  function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)) }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const itbis = Math.round(subtotal * ITBIS_RATE * 100) / 100
  const total = subtotal + itbis

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!customerId) { toast.error('Selecciona un cliente'); return }
    if (items.length === 0) { toast.error('Agrega al menos un artículo'); return }
    for (let i = 0; i < items.length; i++) {
      const row = items[i]; const num = i + 1
      if (!row.qty || row.qty <= 0) { toast.error(`Artículo #${num}: la cantidad es requerida`); return }
      if (!row.rate || row.rate <= 0) { toast.error(`Artículo #${num}: el precio unitario es requerido`); return }
    }
    if (isEdit) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/pedidos')}><ArrowLeft size={14} /> Pedidos</a>
          <h1 className="page-title">{isEdit ? 'Editar Pedido' : 'Nuevo Pedido'}</h1>
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="card">
          <div className="card-header"><h2 className="card-title">Información General</h2></div>
          <div className="card-body">
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Cliente</label>
                <SearchSelect value={customerId} onChange={(id) => setCustomerId(id)} options={customerOptions} onSearch={setCustomerQuery} loading={false} placeholder="Buscar cliente…" error={submitted && !customerId} />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Fecha</label>
                <input type="date" className="ff-input" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} required />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Entrega estimada</label>
                <input type="date" className="ff-input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">Artículos</h2></div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Artículo</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 72 }}>UDM</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>No hay artículos.</td></tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={index}>
                      <td><ItemSelect value={item.itemCode} selectedLabel={item.itemLabel} onSelect={(ci) => selectCatalogItem(index, ci)} onClear={() => updateItem(index, { itemCode: '', itemLabel: undefined, description: '', rate: 0, amount: 0, discountPct: 0 })} onVariantSelect={(t) => setVariantTemplate(t)} /></td>
                      <td><input className="items-input" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Descripción" /></td>
                      <td><input className={`items-input${submitted && (!item.qty || item.qty <= 0) ? ' items-input-error' : ''}`} type="number" min="0" step="1" value={item.qty} onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} /></td>
                      <td><input className={`items-input${submitted && (!item.rate || item.rate <= 0) ? ' items-input-error' : ''}`} type="number" min="0" step="0.01" value={item.rate} onChange={(e) => updateItem(index, { rate: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right' }} /></td>
                      <td><input className="items-input" type="number" min="0" max="100" step="0.1" value={item.discountPct} onChange={(e) => updateItem(index, { discountPct: parseFloat(e.target.value) || 0 })} style={{ textAlign: 'right', width: 56 }} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                      <td><UomSelect value={item.uom} onChange={(v) => updateItem(index, { uom: v })} itemCode={item.itemCode || undefined} /></td>
                      <td><button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeRow(index)}><Trash2 size={13} /></button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}><Plus size={14} /> Agregar artículo</button>
            </div>
            <div className="items-total-row">
              <div className="items-total-line"><span>Subtotal bruto</span><span>{formatDOP(grossTotal)}</span></div>
              {totalDiscount > 0 && <div className="items-total-line" style={{ color: 'var(--text-danger)' }}><span>Descuento total</span><span>-{formatDOP(totalDiscount)}</span></div>}
              <div className="items-total-line"><span>Subtotal neto</span><span>{formatDOP(subtotal)}</span></div>
              <div className="items-total-line"><span>ITBIS (18%)</span><span>{formatDOP(itbis)}</span></div>
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}><span>Total</span><span>{formatDOP(total)}</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">Notas</h2></div>
          <div className="card-body">
            <textarea className="ff-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones, condiciones de entrega…" rows={3} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/pedidos')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            Guardar Borrador
          </button>
        </div>
      </form>

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
