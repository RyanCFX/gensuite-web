import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createQuotation, updateQuotation } from '@/shared/api/quotations'
import { listCustomers } from '@/shared/api/customers'
import type { CreateQuotationDto } from '@/shared/api/types'
import { formatDOP } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

interface LineItem {
  itemCode: string
  description: string
  qty: number
  rate: number
  amount: number
  uom: string
}

interface QuotationFormProps {
  editId?: string
}

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultValidTill() {
  return format(addDays(new Date(), 15), 'yyyy-MM-dd')
}

const ITBIS_RATE = 0.18

function calcAmount(qty: number, rate: number) {
  return Math.round(qty * rate * 100) / 100
}

export default function QuotationForm({ editId }: QuotationFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [date, setDate] = useState(todayIso())
  const [validTill, setValidTill] = useState(defaultValidTill())
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')

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

  const createMutation = useMutation({
    mutationFn: (dto: CreateQuotationDto) => createQuotation(dto),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast.success('Cotización creada correctamente')
      navigate(`/cotizaciones/${quotation.id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al crear la cotización')
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
      toast.error(err?.message ?? 'Error al actualizar la cotización')
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, ...patch }
        if ('qty' in patch || 'rate' in patch) {
          updated.amount = calcAmount(updated.qty, updated.rate)
        }
        return updated
      })
    )
  }

  function addRow() {
    setItems((prev) => [...prev, { itemCode: '', description: '', qty: 1, rate: 0, amount: 0, uom: 'Unidad' }])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  const itbis = Math.round(subtotal * ITBIS_RATE * 100) / 100
  const total = subtotal + itbis

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!customerId) {
      toast.error('Selecciona un cliente')
      return
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un artículo')
      return
    }

    const dto: CreateQuotationDto = {
      customer: customerId,
      date,
      validTill,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        uom: i.uom,
      })),
      notes: notes || undefined,
    }

    if (editId) {
      updateMutation.mutate(dto)
    } else {
      createMutation.mutate(dto)
    }
  }

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

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Artículos</h2>
          </div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                  <th style={{ width: 56 }}>UDM</th>
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
                      <td>
                        <input
                          className="items-input"
                          value={item.itemCode}
                          onChange={(e) => updateItem(index, { itemCode: e.target.value })}
                          placeholder="ITEM-001"
                        />
                      </td>
                      <td>
                        <input
                          className="items-input"
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder="Descripción"
                        />
                      </td>
                      <td>
                        <input
                          className="items-input"
                          type="number"
                          min="0"
                          step="1"
                          value={item.qty}
                          onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <input
                          className="items-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => updateItem(index, { rate: parseFloat(e.target.value) || 0 })}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                      <td>
                        <input
                          className="items-input"
                          value={item.uom}
                          onChange={(e) => updateItem(index, { uom: e.target.value })}
                          placeholder="Unidad"
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
                <span>Subtotal</span>
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
    </div>
  )
}
